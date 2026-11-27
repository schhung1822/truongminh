import "server-only";
import { z } from "zod";
import type { ZaloBotTask, ZaloContact } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { DEFAULT_VARIANTS, MAX_VARIANTS } from "@/lib/design/assign";
import { AUTO_SHEET_LAYOUT, MAX_STYLE_REF_PINS } from "@/lib/image-options";
import { runAutoCatalogAnalysis, startAutoCatalogSession, USABLE_MATERIAL } from "@/lib/jobs/auto";
import { createAllMaterialsSession, createCatalogSession } from "@/lib/jobs/create";
import { createDesignSession, createDirectDesignSession } from "@/lib/jobs/design";
import { assertQuota, getQuotaInfo } from "@/lib/jobs/limits";
import { compareSessionImages } from "@/lib/jobs/order";
import { runPinDesignAnalysis, startPinDesignSession } from "@/lib/jobs/pin-design";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { shared } from "@/lib/jobs/throttle";
import { answerWithKnowledge, ChatError } from "@/lib/knowledge";
import { createLogoFromBuffer, LogoError } from "@/lib/logos/create";
import { canEditCustomer } from "@/lib/permissions";
import { fetchPinJpeg } from "@/lib/pinterest/pin-image";
import { getSettings } from "@/lib/settings";
import { countSheetTasks } from "@/lib/sheets/split";
import { getStorage } from "@/lib/storage";
import { getChatClient } from "../index";
import type { ZaloSettings } from "../settings";
import { fold, preview } from "../text";
import { loadCustomerHistory, type CustomerHistory } from "./history";
import { resolvePicks, type CatalogImageCells } from "./parse";
import { confirmQuestion, HISTORY_AI_MATERIALS, needsConfirm, planFromHistory, rankMaterials, whyMaterial, type PendingPlan, type PlanExec } from "./plan";
import { clip, refFor, resolveRef, type RefType, type ToolSpec } from "./protocol";
import { startTaskWatch } from "./tasks";
import type { Thread } from "./thread";

/**
 * Bộ công cụ của trợ lý Zalo (docs/DECISIONS.md D129). Mỗi công cụ là một hàm chạy dưới QUYỀN của tài khoản web gắn với
 * người ra lệnh: quyền sửa khách, hạn mức lượt, giới hạn số ảnh đều do các hàm nghiệp vụ sẵn có kiểm tra, không phó mặc cho AI.
 *
 * Kết quả một công cụ là một trong ba dạng:
 *  - data: dữ liệu đưa lại cho AI đọc rồi quyết định bước tiếp;
 *  - final: câu do MÁY CHỦ viết gửi thẳng người ra lệnh và kết thúc lượt (dùng cho mọi việc có con số: số ảnh, số lượt,
 *    câu hỏi xác nhận), để AI không thể nói sai con số; chuỗi rỗng = kết thúc mà không nói thêm (nơi khác sẽ báo);
 *  - error: câu báo cho AI biết vì sao không làm được, để nó sửa tham số hoặc hỏi lại người ra lệnh.
 */
export type ToolOutcome = { data: unknown } | { final: string } | { error: string };

export type ToolCtx = {
  /** tài khoản web chịu trách nhiệm (gắn với người ra lệnh ở Quản trị > Zalo > Nhân viên và lệnh) */
  user: SessionUser;
  staff: ZaloContact;
  /** cuộc chat đang nhắn (nhóm hoặc chat riêng với bot): kết quả gửi về đây */
  chat: ZaloContact;
  isGroup: boolean;
  settings: ZaloSettings;
  thread: Thread;
  /** tên nhóm Zalo do quản trị viên đặt (null nếu là chat riêng hoặc nhóm chưa đặt tên) */
  groupName: string | null;
  /** ảnh gần nhất gửi lên cuộc chat trong 24 giờ (dùng làm logo mới) */
  logoMsg: { id: string; mediaPath: string | null } | null;
  /** phiên catalog gần nhất bot đã làm trong cuộc chat này */
  lastCatalog: ZaloBotTask | null;
  /** gửi một tin chữ vào cuộc chat; `usage` = số token AI đã dùng cho lượt này (ghi kèm tin để thống kê) */
  say: (text: string, usage?: { promptTokens: number; completionTokens: number }) => Promise<unknown>;
};

type ToolDef<A> = ToolSpec & { schema: z.ZodType<A>; run: (ctx: ToolCtx, args: A) => Promise<ToolOutcome> };

/* ---------- Tiện ích chung ---------- */

const clean = (v: string | null | undefined, max = 150) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const day = (d: Date) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const ref = (ctx: ToolCtx, type: RefType, id: string, label: string) => refFor(ctx.thread.state, type, id, label);
const text = (max: number) => z.string().trim().max(max);
/** AI hay đưa một chuỗi thay cho mảng một phần tử, hoặc số dạng chữ: nhận cả hai. */
const list = <T extends z.ZodType>(item: T, max: number) => z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(item).max(max));
const variantsArg = z.coerce.number().int().min(1).max(MAX_VARIANTS).optional();

/* ---------- Ngữ cảnh của cuộc chat ---------- */

const LOGO_MAX_AGE_MS = 24 * 3600_000;

export function lastCatalogTask(chatId: string) {
  return db.zaloBotTask.findFirst({ where: { chatId, kind: "CATALOG" }, orderBy: { createdAt: "desc" } });
}

/** Ảnh gần nhất trong cuộc chat (trong 24 giờ) dùng làm logo. */
export function latestLogoMessage(contactId: string) {
  return db.zaloMessage.findFirst({
    where: { contactId, direction: "IN", kind: "IMAGE", mediaPath: { not: null }, createdAt: { gte: new Date(Date.now() - LOGO_MAX_AGE_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, mediaPath: true },
  });
}

/** Các ảnh catalog đã xong của một phiên, theo thứ tự hiển thị, kèm số ảnh và các ô (số ô theo chiều đọc). */
export async function catalogImagesOf(sessionId: string): Promise<CatalogImageCells[]> {
  const rows = await db.generatedImage.findMany({
    where: { sessionId, kind: "SHEET", status: "SUCCESS", retries: { none: {} } },
    select: { id: true, materialId: true, variantIndex: true, createdAt: true, layoutSnapshot: true, sheet: { select: { sortOrder: true } } },
  });
  rows.sort(compareSessionImages);
  return rows.map((r, i) => {
    const snap = r.layoutSnapshot as unknown as LayoutSnapshot;
    return { imageNumber: snap.imageNumber ?? i + 1, cells: snap.cells.map((c) => ({ materialId: c.materialId, code: c.code, name: c.name })) };
  });
}

/* ---------- Tìm khách ---------- */

type FoundCustomer = {
  id: string;
  name: string;
  owner: { name: string };
  brands: { id: string; name: string; logos: { id: string; note: string | null; createdAt: Date; _count: { sessions: number } }[] }[];
};

const squash = (s: string) => fold(s).replace(/\s+/g, " ").trim();

/** Điểm khớp của một khách với chữ cần tìm: khớp đúng tên > đúng tên thương hiệu > bắt đầu bằng > có chứa. 0 = không khớp. */
function matchScore(c: FoundCustomer, q: string): number {
  let best = 0;
  const name = squash(c.name);
  if (name === q) best = 100;
  else if (name.startsWith(q)) best = 60;
  else if (name.includes(q)) best = 30;
  for (const b of c.brands) {
    const bn = squash(b.name);
    if (bn === q) best = Math.max(best, 90);
    else if (bn.startsWith(q)) best = Math.max(best, 50);
    else if (bn.includes(q)) best = Math.max(best, 25);
  }
  return best;
}

async function searchCustomers(query: string): Promise<{ customer: FoundCustomer; score: number }[]> {
  const q = squash(query);
  if (!q) return [];
  // Số khách của một xưởng chỉ vài trăm: đọc hết rồi so khớp bỏ dấu ở đây cho chắc (CSDL so chữ "đ" với "d" là khác nhau).
  const rows = await db.customer.findMany({
    take: 3000,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      owner: { select: { name: true } },
      brands: { select: { id: true, name: true, logos: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, note: true, createdAt: true, _count: { select: { sessions: true } } } } } },
    },
  });
  return rows
    .map((customer) => ({ customer, score: matchScore(customer, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function describeCustomer(ctx: ToolCtx, c: FoundCustomer, q: string) {
  // thương hiệu khớp chữ cần tìm đứng trước
  const brands = [...c.brands].sort((a, b) => Number(squash(b.name).includes(q)) - Number(squash(a.name).includes(q)));
  return {
    ma: ref(ctx, "K", c.id, c.name),
    ten: c.name,
    phu_trach: c.owner.name,
    thuong_hieu: brands.slice(0, 6).map((b) => ({
      ma: ref(ctx, "T", b.id, b.name),
      ten: b.name,
      logo: b.logos.map((l) => ({ ma: ref(ctx, "L", l.id, `logo ${b.name}`), ...(l.note ? { ghi_chu: preview(l.note, 50) } : {}), ngay_tai: day(l.createdAt), so_phien: l._count.sessions })),
    })),
  };
}

const timKhach: ToolDef<{ ten: string }> = {
  name: "tim_khach",
  usage: "ten*",
  description: "Tìm khách theo tên khách hoặc tên thương hiệu (không cần dấu). Trả về khách, thương hiệu, logo kèm mã.",
  schema: z.object({ ten: text(100).min(1) }),
  async run(ctx, args) {
    const q = squash(args.ten);
    const found = await searchCustomers(args.ten);
    if (ctx.isGroup) {
      // Trong nhóm có thể có khách đọc: chỉ nhận khi tên khớp ĐÚNG một khách, không bao giờ liệt kê khách khác ra nhóm.
      const exact = found.filter((f) => f.score >= 90);
      if (exact.length !== 1) return { error: `Trong nhóm chỉ tra được khi tên khớp đúng một khách hoặc thương hiệu (đang khớp ${exact.length}). Không nêu tên khách nào khác; nhờ người ra lệnh nhắn riêng bot để tra, hoặc gõ đúng tên đầy đủ.` };
      return { data: { so_ket_qua: 1, khach: [describeCustomer(ctx, exact[0].customer, q)] } };
    }
    if (found.length === 0) return { data: { so_ket_qua: 0, ghi_chu: "Không thấy khách hay thương hiệu nào tên như vậy. Hỏi lại tên, hoặc nếu là khách mới thì cần ảnh logo để tạo." } };
    // có kết quả khớp đúng tên thì chỉ lấy các kết quả đó, khỏi bắt người ra lệnh chọn giữa những cái na ná
    const exact = found.filter((f) => f.score >= 90);
    const shown = (exact.length > 0 ? exact : found).slice(0, 5);
    return {
      data: {
        so_ket_qua: shown.length,
        khach: shown.map((f) => describeCustomer(ctx, f.customer, q)),
        ...(exact.length === 0 && found.length > shown.length ? { ghi_chu: `Còn ${found.length - shown.length} khách khác cũng khớp; nhờ người ra lệnh nói rõ tên hơn.` } : {}),
      },
    };
  },
};

/* ---------- Lịch sử khách ---------- */

const looksLikeCode = (raw: string) => /^[A-Za-z]\d+$/.test(raw.trim());

/**
 * AI đưa một cái TÊN vào chỗ cần mã (đỡ một lượt tra): tìm đúng MỘT khách khớp tên đó. Trong nhóm phải khớp đúng tên khách
 * hoặc thương hiệu, và câu báo lỗi không bao giờ nêu tên khách nào (nhóm có thể có khách đọc).
 */
async function customerByName(ctx: ToolCtx, name: string): Promise<{ customer: FoundCustomer } | { error: string }> {
  const found = await searchCustomers(name);
  const exact = found.filter((f) => f.score >= 90);
  const hit = exact.length === 1 ? exact[0] : !ctx.isGroup && found.length === 1 ? found[0] : null;
  if (!hit) {
    const n = ctx.isGroup ? exact.length : found.length;
    if (n === 0) return { error: `Không có khách hay thương hiệu nào tên "${name}"${ctx.isGroup ? " (trong nhóm phải gõ đúng tên đầy đủ)" : ""}. Hỏi lại người ra lệnh tên đúng.` };
    return { error: `Tên "${name}" khớp ${n} khách. Ra lệnh tim_khach để xem các khách đó rồi hỏi người ra lệnh chọn ai.` };
  }
  describeCustomer(ctx, hit.customer, squash(name)); // cấp mã cho khách, thương hiệu, logo vừa nhận ra
  return { customer: hit.customer };
}

/** Tham số "logo": mã L…, hoặc tên thương hiệu / tên khách khi tên đó dẫn tới đúng MỘT logo. */
async function resolveLogo(ctx: ToolCtx, raw: string): Promise<{ id: string; label: string } | { error: string }> {
  const l = resolveRef(ctx.thread.state, raw, "L");
  if (!("error" in l) || looksLikeCode(raw)) return l; // mã đúng, hoặc trông như mã nhưng mã đó không có
  const who = await customerByName(ctx, raw);
  if ("error" in who) return who;
  const logosOf = (brands: FoundCustomer["brands"]) => brands.flatMap((b) => b.logos.map((x) => ({ id: x.id, brand: b.name })));
  const all = logosOf(who.customer.brands);
  const ofBrand = logosOf(who.customer.brands.filter((b) => squash(b.name) === squash(raw)));
  const pick = ofBrand.length === 1 ? ofBrand[0] : all.length === 1 ? all[0] : null;
  if (pick) return { id: pick.id, label: `logo ${pick.brand}` };
  if (all.length === 0) return { error: `Khách ${who.customer.name} chưa có logo nào trong hệ thống.` };
  return { error: `"${raw}" có ${all.length} logo, cần hỏi người ra lệnh làm logo nào rồi dùng mã: ${all.slice(0, 8).map((x) => `${ref(ctx, "L", x.id, `logo ${x.brand}`)} (${x.brand})`).join(", ")}.` };
}

/** Từ tham số "khach" / "logo" (mã hoặc tên) ra khách hàng và (nếu có) logo đang nói tới. */
async function resolveCustomer(ctx: ToolCtx, args: { khach?: string; logo?: string }): Promise<{ customerId: string; logoId: string | null } | { error: string }> {
  if (args.logo) {
    const l = await resolveLogo(ctx, args.logo);
    if ("error" in l) return l;
    const row = await db.logo.findUnique({ where: { id: l.id }, select: { brand: { select: { customerId: true } } } });
    if (!row) return { error: "Logo này không còn trong hệ thống." };
    return { customerId: row.brand.customerId, logoId: l.id };
  }
  if (args.khach) {
    const name = args.khach;
    const k = resolveRef(ctx.thread.state, name, "K");
    if (!("error" in k)) return { customerId: k.id, logoId: null };
    if (looksLikeCode(name)) return k;
    const who = await customerByName(ctx, name);
    if ("error" in who) return who;
    // tên trùng đúng một thương hiệu chỉ có một logo: lấy luôn logo đó làm trọng tâm
    const brands = who.customer.brands.filter((b) => squash(b.name) === squash(name));
    return { customerId: who.customer.id, logoId: brands.length === 1 && brands[0].logos.length === 1 ? brands[0].logos[0].id : null };
  }
  return { error: 'Cần "khach" (mã K… hoặc tên) hoặc "logo" (mã L… hoặc tên thương hiệu).' };
}

function describeHistory(ctx: ToolCtx, h: CustomerHistory) {
  const ranked = rankMaterials(h.signals);
  const logoName = new Map(h.logos.map((l) => [l.id, l.brandName]));
  return {
    khach: h.customer.name,
    logo: h.logos.slice(0, 6).map((l) => ({ ma: ref(ctx, "L", l.id, `logo ${l.brandName}`), thuong_hieu: l.brandName, ...(l.note ? { ghi_chu: preview(l.note, 50) } : {}) })),
    chat_lieu_tung_ung: ranked.slice(0, 8).map((m) => ({ ma_chat_lieu: m.code, ten: m.name, ly_do: whyMaterial(m) })),
    mau_pinterest_da_thich: h.favoritePins.slice(0, 6).map((p) => ({ ma: ref(ctx, "M", p.id, p.title), tieu_de: preview(p.title, 60), board: p.boardName })),
    phien_gan_day: h.sessions.slice(0, 6).map((s) => ({
      ma: ref(ctx, "P", s.id, `${s.type === "CATALOG" ? "catalog" : "thiết kế"} ${logoName.get(s.logoId) ?? ""} ${day(s.createdAt)}`),
      loai: s.type === "CATALOG" ? "catalog chất liệu" : "thiết kế",
      thuong_hieu: logoName.get(s.logoId) ?? null,
      ngay: day(s.createdAt),
      ...(s.productType ? { san_pham: s.productType } : {}),
      so_anh_da_xong: s.images,
      ...(s.materialCodes.length ? { chat_lieu: s.materialCodes } : {}),
    })),
    san_pham_gan_nhat: h.lastProductType,
  };
}

const xemLichSu: ToolDef<{ khach?: string; logo?: string }> = {
  name: "xem_lich_su",
  usage: "khach: mã K hoặc tên | logo: mã L",
  description: "Lịch sử một khách: chất liệu từng ưng, mẫu Pinterest đã thích, các phiên ảnh gần đây (kèm mã P). Dùng để TRẢ LỜI câu hỏi về lịch sử; muốn tạo ảnh theo lịch sử thì ra thẳng lệnh tao_theo_lich_su.",
  schema: z.object({ khach: text(20).optional(), logo: text(20).optional() }),
  async run(ctx, args) {
    const who = await resolveCustomer(ctx, args);
    if ("error" in who) return who;
    const h = await loadCustomerHistory(who.customerId, who.logoId);
    if (!h) return { error: "Khách này không còn trong hệ thống." };
    return { data: describeHistory(ctx, h) };
  },
};

/* ---------- Xác nhận trước khi tốn lượt ---------- */

/** Lập xong kế hoạch: cần xác nhận thì lưu lại rồi hỏi, không thì chạy luôn. Hạn mức được kiểm tra ngay để khỏi hỏi suông. */
async function planOrRun(ctx: ToolCtx, plan: Omit<PendingPlan, "createdAt">, opts: { inferred: boolean; allMaterials?: boolean }): Promise<ToolOutcome> {
  const quotaError = await assertQuota(ctx.user, plan.tasks);
  if (quotaError) return { final: `${plan.summary}\nNhưng chưa làm được: ${quotaError}` };
  const full: PendingPlan = { ...plan, createdAt: new Date().toISOString() };
  if (!needsConfirm({ tasks: plan.tasks, ...opts })) {
    ctx.thread.pending = null;
    return { final: await executePlan(ctx, full.exec) };
  }
  ctx.thread.pending = full;
  const quota = await getQuotaInfo(ctx.user);
  return { final: confirmQuestion(full, quota ? quota.left : null) };
}

/* ---------- Tạo theo lịch sử ---------- */

type HistoryArgs = { khach?: string; logo?: string; san_pham?: string; so_phuong_an?: number; ghi_chu?: string };

const taoTheoLichSu: ToolDef<HistoryArgs> = {
  name: "tao_theo_lich_su",
  usage: "khach: mã K hoặc tên khách/thương hiệu | logo: mã L, san_pham, so_phuong_an=1, ghi_chu",
  description: "Tạo ảnh thiết kế theo các mẫu khách TỪNG ƯNG: tự xem lịch sử, soạn kế hoạch rồi tự hỏi xác nhận. san_pham (móc khóa, tem nhãn...) bỏ trống = lấy loại của lần trước.",
  schema: z.object({ khach: text(20).optional(), logo: text(20).optional(), san_pham: text(200).optional(), so_phuong_an: variantsArg, ghi_chu: text(1000).optional() }),
  async run(ctx, args) {
    const who = await resolveCustomer(ctx, args);
    if ("error" in who) return who;
    const h = await loadCustomerHistory(who.customerId, who.logoId);
    if (!h) return { error: "Khách này không còn trong hệ thống." };

    let logo = who.logoId ? h.logos.find((l) => l.id === who.logoId) : undefined;
    if (!logo) {
      if (h.logos.length === 0) return { error: `Khách ${h.customer.name} chưa có logo nào trong hệ thống. Nhờ người ra lệnh gửi ảnh logo rồi dùng tao_catalog.` };
      if (h.logos.length > 1) {
        const options = h.logos.slice(0, 8).map((l) => `${ref(ctx, "L", l.id, `logo ${l.brandName}`)}: ${l.brandName}${l.note ? ` (${preview(l.note, 40)})` : ""}, tải ${day(l.createdAt)}`);
        return { error: `Khách ${h.customer.name} có ${h.logos.length} logo, cần hỏi người ra lệnh làm logo nào rồi gọi lại với "logo": ${options.join("; ")}` };
      }
      logo = h.logos[0];
    }
    // logo vừa được chốt từ mã khách: đọc lại lịch sử lấy logo này làm trọng tâm (dấu vết của chính logo này được ưu tiên)
    const focus = who.logoId === logo.id ? h : ((await loadCustomerHistory(who.customerId, logo.id)) ?? h);
    const ranked = rankMaterials(focus.signals);
    const plan = planFromHistory(ranked, focus.favoritePins.map((p) => p.id), MAX_STYLE_REF_PINS);
    if (plan.kind === "none") {
      return { data: { khong_co_lich_su: true, khach: h.customer.name, ma_logo: ref(ctx, "L", logo.id, `logo ${logo.brandName}`), goi_y: "Khách chưa từng chọn chất liệu, chưa có báo giá và chưa thích mẫu Pinterest nào. Có thể đề nghị để AI chọn chất liệu hợp logo (tao_catalog với kieu ai_chon)." } };
    }
    const productType = clean(args.san_pham, 200) ?? clean(focus.lastProductType, 200);
    if (!productType) return { error: `Đã thấy lịch sử của ${h.customer.name} nhưng chưa biết làm sản phẩm gì. Hỏi người ra lệnh loại sản phẩm (móc khóa, tem nhãn, bảng tên...) rồi gọi lại tao_theo_lich_su kèm san_pham.` };
    const variants = args.so_phuong_an ?? 1;
    const note = clean(args.ghi_chu, 1000) ?? "";
    const head = `Khách ${h.customer.name} (thương hiệu ${logo.brandName})`;

    if (plan.kind === "materials") {
      const tasks = plan.materials.length * variants;
      const liked = plan.materials.map((m) => `${m.code} ${m.name} (${whyMaterial(m)})`).join(", ");
      const pins = plan.pinIds.length ? ` và đã thích ${plan.pinIds.length} mẫu Pinterest` : "";
      const style = plan.pinIds.length ? ", lấy phong cách theo các mẫu Pinterest đó" : "";
      return planOrRun(
        ctx,
        {
          exec: { kind: "design_direct", logoId: logo.id, materialIds: plan.materials.map((m) => m.materialId), pinIds: plan.pinIds, productType, variants, note },
          tasks,
          summary: `${head} từng ưng: ${liked}${pins}. Em sẽ tạo ${tasks} ảnh thiết kế ${productType} với ${plan.materials.length} chất liệu đó, mỗi chất liệu ${variants} phương án${style}.`,
        },
        { inferred: true },
      );
    }
    const tasks = HISTORY_AI_MATERIALS * variants;
    return planOrRun(
      ctx,
      {
        exec: { kind: "design_pins", logoId: logo.id, pinIds: plan.pinIds, materialCount: HISTORY_AI_MATERIALS, productType, variants, note },
        tasks,
        summary: `${head} chưa từng chọn chất liệu nào nhưng đã thích ${plan.pinIds.length} mẫu Pinterest. Em sẽ để AI chọn ${HISTORY_AI_MATERIALS} chất liệu hợp logo và các mẫu đó, rồi tạo ${tasks} ảnh thiết kế ${productType}.`,
      },
      { inferred: true },
    );
  },
};

/* ---------- Thiết kế với chất liệu chỉ định ---------- */

type DesignArgs = { logo: string; chat_lieu: string[]; mau: string[]; san_pham: string; so_phuong_an?: number; ghi_chu?: string };

const taoThietKe: ToolDef<DesignArgs> = {
  name: "tao_thiet_ke",
  usage: "logo*: mã L hoặc tên thương hiệu, chat_lieu*[mã chất liệu], san_pham*, mau[mã M], so_phuong_an=1, ghi_chu",
  description: "Tạo ảnh thiết kế cho một logo đã có với các chất liệu người ra lệnh nêu rõ bằng mã (không cần catalog trước); mau = mẫu Pinterest làm phong cách.",
  schema: z.object({ logo: text(20), chat_lieu: list(text(60).min(1), 10), mau: list(text(20), MAX_STYLE_REF_PINS), san_pham: text(200).min(1), so_phuong_an: variantsArg, ghi_chu: text(1000).optional() }),
  async run(ctx, args) {
    const l = await resolveLogo(ctx, args.logo);
    if ("error" in l) return l;
    if (args.chat_lieu.length === 0) return { error: "Thiếu chat_lieu: cần ít nhất một mã chất liệu. Người ra lệnh chưa nêu thì hỏi lại, hoặc dùng tao_theo_lich_su / tao_catalog." };
    const all = await db.material.findMany({ where: USABLE_MATERIAL, select: { id: true, code: true, name: true } });
    const byCode = new Map(all.map((m) => [squash(m.code), m]));
    const picked = args.chat_lieu.map((code) => ({ code, hit: byCode.get(squash(code)) }));
    const unknown = picked.filter((p) => !p.hit).map((p) => p.code);
    if (unknown.length > 0) return { error: `Không có chất liệu đang bật nào mang mã: ${unknown.join(", ")}. Hỏi lại người ra lệnh mã đúng.` };
    const materials = [...new Map(picked.map((p) => [p.hit!.id, p.hit!])).values()];
    const pinIds: string[] = [];
    for (const m of args.mau) {
      const r = resolveRef(ctx.thread.state, m, "M");
      if ("error" in r) return r;
      pinIds.push(r.id);
    }
    const variants = args.so_phuong_an ?? 1;
    const tasks = materials.length * variants;
    return planOrRun(
      ctx,
      {
        exec: { kind: "design_direct", logoId: l.id, materialIds: materials.map((m) => m.id), pinIds, productType: args.san_pham, variants, note: clean(args.ghi_chu, 1000) ?? "" },
        tasks,
        summary: `Em sẽ tạo ${tasks} ảnh thiết kế ${args.san_pham} cho ${l.label} với chất liệu ${materials.map((m) => m.code).join(", ")}, mỗi chất liệu ${variants} phương án${pinIds.length ? `, theo phong cách ${pinIds.length} mẫu Pinterest` : ""}.`,
      },
      { inferred: false },
    );
  },
};

/* ---------- Catalog ---------- */

type CatalogArgs = { logo?: string; khach?: string; thuong_hieu?: string; kieu?: "ai_chon" | "bo_mac_dinh" | "trang_mau" | "tat_ca"; trang_mau: string[] };

/** Ước tính số lượt của một lần làm catalog (bằng số tác vụ AI; chế độ chất lượng cao tốn nhiều hơn). */
async function catalogTasks(mode: "ai" | "sheets" | "all", sheetIds: string[]): Promise<number> {
  const settings = await getSettings();
  const quality = settings.qualityDefault;
  if (mode === "sheets") {
    const sheets = await db.sheet.findMany({ where: { id: { in: sheetIds } }, select: { cols: true, rows: true, materials: { where: { material: USABLE_MATERIAL }, select: { id: true } } } });
    return sheets.reduce((n, s) => n + countSheetTasks(s.materials.length, s.cols, s.rows, quality), 0);
  }
  const usable = await db.material.count({ where: USABLE_MATERIAL });
  const count = mode === "ai" ? Math.min(settings.autoMaterialCount, usable) : usable;
  return countSheetTasks(count, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows, quality);
}

const taoCatalog: ToolDef<CatalogArgs> = {
  name: "tao_catalog",
  usage: "logo: mã L hoặc tên thương hiệu, khach: tên, thuong_hieu: tên, kieu, trang_mau[tên]",
  description: "Tạo catalog (đặt logo lên các mẫu chất liệu). Có logo thì dùng logo đó; bỏ trống logo = lấy ảnh vừa gửi làm logo MỚI, kèm khach và thuong_hieu (trong nhóm, khach bỏ trống = tên nhóm). kieu: \"ai_chon\" (mặc định, AI chọn chất liệu hợp logo) | \"bo_mac_dinh\" | \"trang_mau\" | \"tat_ca\".",
  schema: z.object({
    logo: text(20).optional(),
    khach: text(150).optional(),
    thuong_hieu: text(150).optional(),
    kieu: z.enum(["ai_chon", "bo_mac_dinh", "trang_mau", "tat_ca"]).optional(),
    trang_mau: list(text(100), 10),
  }),
  async run(ctx, args) {
    const kieu = args.kieu ?? (args.trang_mau.length ? "trang_mau" : "ai_chon");
    const mode = kieu === "ai_chon" ? "ai" : kieu === "tat_ca" ? "all" : "sheets";

    let sheetIds: string[] = [];
    let sheetNames = "";
    if (mode === "sheets") {
      const sheets = await db.sheet.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, isDefault: true } });
      const wanted = args.trang_mau.map(squash).filter(Boolean);
      const chosen = kieu === "trang_mau" ? sheets.filter((s) => wanted.some((w) => squash(s.name).includes(w) || w.includes(squash(s.name)))) : sheets.filter((s) => s.isDefault);
      const have = sheets.map((s) => s.name).join(", ") || "(chưa có)";
      if (chosen.length === 0) return { error: kieu === "trang_mau" ? `Không có trang mẫu nào tên như vậy. Đang có: ${have}.` : `Chưa có trang mẫu mặc định. Đang có: ${have}. Hỏi người ra lệnh dùng trang nào, hoặc dùng kieu ai_chon.` };
      sheetIds = chosen.map((s) => s.id);
      sheetNames = chosen.map((s) => s.name).join(", ");
    }
    const what = mode === "ai" ? "AI chọn các chất liệu hợp logo nhất" : mode === "all" ? "TẤT CẢ chất liệu đang bật" : `trang mẫu ${sheetNames}`;
    const tasks = await catalogTasks(mode, sheetIds);
    if (tasks === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu để làm catalog." };

    if (args.logo) {
      const l = await resolveLogo(ctx, args.logo);
      if ("error" in l) return ctx.logoMsg ? { error: `${l.error} Nếu đây là logo MỚI (ảnh vừa gửi trong cuộc chat) thì bỏ trống "logo", đưa "khach" và "thuong_hieu".` } : l;
      const exec: PlanExec = mode === "ai" ? { kind: "catalog_ai", logoId: l.id } : mode === "all" ? { kind: "catalog_all", logoId: l.id } : { kind: "catalog_sheets", logoId: l.id, sheetIds };
      return planOrRun(ctx, { exec, tasks, summary: `Em sẽ tạo catalog cho ${l.label}: ${what}.` }, { inferred: false, allMaterials: mode === "all" });
    }

    // logo mới: lấy ảnh vừa gửi trong cuộc chat
    if (!ctx.logoMsg?.mediaPath) return { error: "Chưa có logo: cuộc chat không có ảnh nào gửi lên trong 24 giờ qua. Nhờ người ra lệnh gửi ảnh logo (kèm tag bot nếu ở trong nhóm), hoặc tìm khách có sẵn bằng tim_khach rồi đưa mã L…." };
    const customerName = clean(args.khach) ?? ctx.groupName ?? clean(args.thuong_hieu);
    const brandName = clean(args.thuong_hieu) ?? customerName;
    if (!customerName || !brandName) return { error: "Logo mới này của khách hàng và thương hiệu nào? Hỏi người ra lệnh tên khách và tên thương hiệu rồi gọi lại tao_catalog kèm khach, thuong_hieu." };
    const existing = await db.customer.findFirst({ where: { name: customerName }, include: { owner: { select: { name: true } } } });
    if (existing && !canEditCustomer(ctx.user, existing)) return { error: `Khách "${existing.name}" do ${existing.owner.name} phụ trách nên ${ctx.user.name} không thêm logo vào được. Báo người ra lệnh nhờ ${existing.owner.name} hoặc quản trị viên làm.` };
    if (await db.zaloBotTask.findFirst({ where: { chatId: ctx.chat.chatId, kind: "CATALOG", status: "RUNNING", imageMessageId: ctx.logoMsg.id }, select: { id: true } })) {
      return { final: "Em đang làm catalog cho logo này rồi ạ, xong em gửi ngay." };
    }
    return planOrRun(
      ctx,
      {
        exec: { kind: "catalog_new_logo", imageMessageId: ctx.logoMsg.id, customerName, brandName, mode, sheetIds },
        tasks,
        summary: `Em sẽ lưu ảnh vừa gửi làm logo của "${brandName}" (khách ${customerName}) rồi tạo catalog: ${what}.`,
      },
      { inferred: false, allMaterials: mode === "all" },
    );
  },
};

type PickArgs = { chon: { anh?: number | null; o: number[] }[]; ma: string[]; san_pham: string; so_phuong_an?: number; ghi_chu?: string };

const taoThietKeTuCatalog: ToolDef<PickArgs> = {
  name: "tao_thiet_ke_tu_catalog",
  usage: "chon*[{\"anh\",\"o\"[]}], ma[mã chất liệu], san_pham*, so_phuong_an=2, ghi_chu",
  description: "Thiết kế từ các ô chọn trên catalog gần nhất của cuộc chat: \"ảnh 2 số 3, 5 và ảnh 4 số 1\" → chon = [{\"anh\":2,\"o\":[3,5]},{\"anh\":4,\"o\":[1]}]; không nói ảnh nào thì anh = null.",
  schema: z.object({
    chon: list(z.object({ anh: z.coerce.number().int().nullish(), o: list(z.coerce.number().int(), 30) }), 20),
    ma: list(text(60), 20),
    san_pham: text(200).min(1),
    so_phuong_an: variantsArg,
    ghi_chu: text(1000).optional(),
  }),
  async run(ctx, args) {
    const last = ctx.lastCatalog;
    if (!last) return { error: "Cuộc chat này chưa có catalog nào do bot làm. Muốn thiết kế cho logo đã có thì dùng tao_thiet_ke (kèm mã chất liệu) hoặc tao_theo_lich_su; chưa có gì thì làm catalog trước." };
    const images = await catalogImagesOf(last.sessionId);
    if (images.length === 0) return { final: last.status === "RUNNING" ? "Catalog gần nhất còn đang tạo, xong em gửi rồi anh/chị chọn mẫu nhé." : "Catalog gần nhất chưa có ảnh nào tạo xong để chọn ạ." };
    const picked = resolvePicks(images, args.chon.map((c) => ({ image: c.anh ?? null, cells: c.o })), args.ma);
    if (!picked.ok) return { final: picked.error };
    const variants = args.so_phuong_an ?? DEFAULT_VARIANTS;
    const tasks = picked.materials.length * variants;
    return planOrRun(
      ctx,
      {
        exec: { kind: "design_catalog", parentSessionId: last.sessionId, materialIds: picked.materials.map((m) => m.materialId), productType: args.san_pham, variants, note: clean(args.ghi_chu, 1000) ?? "" },
        tasks,
        summary: `Em sẽ thiết kế ${args.san_pham} từ ${picked.materials.length} chất liệu (${picked.materials.map((m) => m.code).join(", ")}), mỗi chất liệu ${variants} phương án.`,
      },
      { inferred: false },
    );
  },
};

/* ---------- Chạy một kế hoạch đã chốt ---------- */

async function startTask(ctx: ToolCtx, kind: "CATALOG" | "DESIGN", sessionId: string, extra: { logoId: string | null; imageMessageId?: string | null; resend?: boolean }) {
  const task = await db.zaloBotTask.create({
    data: { chatId: ctx.chat.chatId, chatType: ctx.isGroup ? "GROUP" : "PRIVATE", kind, sessionId, userId: ctx.user.id, logoId: extra.logoId, imageMessageId: extra.imageMessageId ?? null, resend: extra.resend ?? false },
  });
  startTaskWatch(task.id);
}

async function brandOf(logoId: string): Promise<string> {
  const l = await db.logo.findUnique({ where: { id: logoId }, select: { brand: { select: { name: true, customer: { select: { name: true } } } } } });
  return l ? `"${l.brand.name}" (${l.brand.customer.name})` : "logo này";
}

const DONE_TAIL = "Xong em gửi lại ngay đây.";

/**
 * Chạy đúng kế hoạch đã chốt (ngay, hoặc sau khi người ra lệnh xác nhận). Trả về câu báo cho người ra lệnh: đã bắt đầu, hoặc
 * lý do chưa làm được (hết lượt, thiếu trang mẫu...) do chính các hàm nghiệp vụ trả về.
 */
export async function executePlan(ctx: ToolCtx, exec: PlanExec): Promise<string> {
  const { user } = ctx;
  switch (exec.kind) {
    case "catalog_ai": {
      const r = await startAutoCatalogSession(user, { logoId: exec.logoId, decideBadge: true });
      if (!r.sessionId) return r.error ?? "Em chưa bắt đầu được việc này.";
      await startTask(ctx, "CATALOG", r.sessionId, { logoId: exec.logoId });
      void runAutoCatalogAnalysis(r.sessionId); // AI đọc logo 30-60 giây rồi mới có ảnh; chạy nền, không bao giờ ném lỗi
      return `Dạ em nhận rồi ạ. AI đang xem logo ${await brandOf(exec.logoId)} để chọn chất liệu hợp rồi tạo catalog, khoảng vài phút. ${DONE_TAIL}`;
    }
    case "catalog_sheets":
    case "catalog_all": {
      const r = exec.kind === "catalog_all" ? await createAllMaterialsSession(user, { logoId: exec.logoId }) : await createCatalogSession(user, { logoId: exec.logoId, sheetIds: exec.sheetIds });
      if (!r.sessionId) return r.error ?? "Em chưa tạo được catalog.";
      await startTask(ctx, "CATALOG", r.sessionId, { logoId: exec.logoId });
      const count = await db.generatedImage.count({ where: { sessionId: r.sessionId } });
      return `Dạ em nhận rồi ạ. Đang tạo catalog cho ${await brandOf(exec.logoId)}: ${count} ảnh, khoảng vài phút. ${DONE_TAIL}`;
    }
    case "catalog_new_logo": {
      const msg = await db.zaloMessage.findUnique({ where: { id: exec.imageMessageId }, select: { mediaPath: true } });
      if (!msg?.mediaPath) return "Em không còn thấy ảnh logo vừa gửi. Anh/chị gửi lại ảnh logo giúp em.";
      let customer = await db.customer.findFirst({ where: { name: exec.customerName } });
      if (customer && !canEditCustomer(user, customer)) return `Khách "${customer.name}" do người khác phụ trách nên ${user.name} chưa thêm logo vào được.`;
      customer ??= await db.customer.create({ data: { name: exec.customerName, ownerId: user.id, createdById: user.id } });
      const brand =
        (await db.brand.findFirst({ where: { customerId: customer.id, name: exec.brandName } })) ??
        (await db.brand.create({ data: { customerId: customer.id, name: exec.brandName, createdById: user.id } }));
      // dùng lại logo nếu lệnh trước đã tạo từ đúng ảnh này cho đúng thương hiệu này
      let logoId: string | null = null;
      const prev = await db.zaloBotTask.findFirst({ where: { imageMessageId: exec.imageMessageId, logoId: { not: null } }, orderBy: { createdAt: "desc" }, select: { logoId: true } });
      if (prev?.logoId && (await db.logo.findFirst({ where: { id: prev.logoId, brandId: brand.id }, select: { id: true } }))) logoId = prev.logoId;
      if (!logoId) {
        try {
          logoId = (await createLogoFromBuffer({ userId: user.id, brandId: brand.id, file: await getStorage().get(msg.mediaPath), note: "Nhận từ Zalo" })).logo.id;
        } catch (e) {
          return e instanceof LogoError && e.userFault ? `Ảnh này em không dùng làm logo được (${e.message}) Anh/chị gửi lại file logo khác giúp em.` : "Em không lưu được logo, anh/chị thử lại sau nhé.";
        }
      }
      refFor(ctx.thread.state, "L", logoId, `logo ${brand.name}`); // để các lệnh sau trong mạch này gọi được logo vừa tạo
      const r =
        exec.mode === "ai"
          ? await startAutoCatalogSession(user, { logoId, decideBadge: true })
          : exec.mode === "all"
            ? await createAllMaterialsSession(user, { logoId })
            : await createCatalogSession(user, { logoId, sheetIds: exec.sheetIds });
      if (!r.sessionId) return r.error ?? "Em chưa tạo được catalog.";
      await startTask(ctx, "CATALOG", r.sessionId, { logoId, imageMessageId: exec.imageMessageId });
      if (exec.mode === "ai") {
        void runAutoCatalogAnalysis(r.sessionId);
        return `Dạ em nhận rồi ạ. Em đã lưu logo của "${brand.name}" (${customer.name}); AI đang xem logo để chọn chất liệu hợp rồi tạo catalog, khoảng vài phút. ${DONE_TAIL}`;
      }
      const count = await db.generatedImage.count({ where: { sessionId: r.sessionId } });
      return `Dạ em nhận rồi ạ. Đang tạo catalog cho "${brand.name}" (${customer.name}): ${count} ảnh, khoảng vài phút. ${DONE_TAIL}`;
    }
    case "design_catalog": {
      const r = await createDesignSession(user, { parentSessionId: exec.parentSessionId, materialIds: exec.materialIds, productType: exec.productType, variants: exec.variants, note: exec.note });
      if (!r.sessionId) return r.error ?? "Em chưa tạo được ảnh thiết kế.";
      const parent = await db.consultSession.findUnique({ where: { id: exec.parentSessionId }, select: { logoId: true } });
      await startTask(ctx, "DESIGN", r.sessionId, { logoId: parent?.logoId ?? null });
      return `Dạ em nhận rồi ạ. Đang thiết kế ${exec.productType}: ${exec.materialIds.length * exec.variants} ảnh. ${DONE_TAIL}`;
    }
    case "design_direct": {
      const r = await createDirectDesignSession(user, { logoId: exec.logoId, materialIds: exec.materialIds, productType: exec.productType, variants: exec.variants, note: exec.note, styleRefPinIds: exec.pinIds });
      if (!r.sessionId) return r.error ?? "Em chưa tạo được ảnh thiết kế.";
      await startTask(ctx, "DESIGN", r.sessionId, { logoId: exec.logoId });
      return `Dạ em nhận rồi ạ. Đang thiết kế ${exec.productType} cho ${await brandOf(exec.logoId)}: ${exec.materialIds.length * exec.variants} ảnh. ${DONE_TAIL}`;
    }
    case "design_pins": {
      const r = await startPinDesignSession(user, { logoId: exec.logoId, pinIds: exec.pinIds, productType: exec.productType, materialCount: exec.materialCount, variants: exec.variants, note: exec.note });
      if (!r.sessionId) return r.error ?? "Em chưa bắt đầu được việc này.";
      await startTask(ctx, "DESIGN", r.sessionId, { logoId: exec.logoId });
      void runPinDesignAnalysis(r.sessionId);
      return `Dạ em nhận rồi ạ. AI đang chọn chất liệu theo các mẫu khách thích rồi thiết kế ${exec.productType} cho ${await brandOf(exec.logoId)}, khoảng vài phút. ${DONE_TAIL}`;
    }
  }
}

const xacNhan: ToolDef<Record<string, never>> = {
  name: "xac_nhan",
  usage: "",
  description: "Người ra lệnh ĐỒNG Ý việc đang chờ xác nhận: chạy đúng việc đó.",
  schema: z.object({}),
  async run(ctx) {
    const p = ctx.thread.pending;
    if (!p) return { error: "Không có việc nào đang chờ xác nhận. Muốn tạo ảnh thì ra lệnh tạo ảnh tương ứng." };
    ctx.thread.pending = null;
    return { final: await executePlan(ctx, p.exec) };
  },
};

const huy: ToolDef<Record<string, never>> = {
  name: "huy",
  usage: "",
  description: "Người ra lệnh KHÔNG làm việc đang chờ xác nhận nữa.",
  schema: z.object({}),
  async run(ctx) {
    if (!ctx.thread.pending) return { error: "Không có việc nào đang chờ xác nhận." };
    ctx.thread.pending = null;
    return { final: "Dạ, em bỏ việc đó rồi ạ." };
  },
};

/* ---------- Gửi lại, tiến độ, hạn mức, hỏi kỹ thuật ---------- */

const guiLaiAnh: ToolDef<{ phien: string }> = {
  name: "gui_lai_anh",
  usage: "phien*: mã P",
  description: "Gửi lại vào cuộc chat các ảnh ĐÃ XONG của một phiên cũ (không tạo mới, không tốn lượt).",
  schema: z.object({ phien: text(20) }),
  async run(ctx, args) {
    const p = resolveRef(ctx.thread.state, args.phien, "P");
    if ("error" in p) return p;
    const session = await db.consultSession.findUnique({ where: { id: p.id }, select: { id: true, type: true, logoId: true, _count: { select: { images: { where: { status: "SUCCESS", retries: { none: {} } } } } } } });
    if (!session) return { error: "Phiên này không còn trong hệ thống." };
    if (session._count.images === 0) return { error: "Phiên này chưa có ảnh nào tạo xong để gửi lại." };
    await startTask(ctx, session.type === "CATALOG" ? "CATALOG" : "DESIGN", session.id, { logoId: session.logoId, resend: true });
    return { final: "" }; // phần giao kết quả (tasks.ts) tự báo "Xong rồi ạ..." rồi gửi ảnh
  },
};

const MAX_PINS_PER_SEND = 6;

const guiMauPinterest: ToolDef<{ mau: string[] }> = {
  name: "gui_mau_pinterest",
  usage: "mau*[mã M]",
  description: "Gửi vào cuộc chat ảnh các mẫu Pinterest (ví dụ mẫu khách đã thích), tối đa 6.",
  schema: z.object({ mau: list(text(20), MAX_PINS_PER_SEND) }),
  async run(ctx, args) {
    if (args.mau.length === 0) return { error: "Thiếu mau: cần ít nhất một mã M… (lấy từ xem_lich_su)." };
    const ids: string[] = [];
    for (const m of args.mau) {
      const r = resolveRef(ctx.thread.state, m, "M");
      if ("error" in r) return r;
      ids.push(r.id);
    }
    const pins = await db.pinterestPin.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, pinterestPinId: true, sourceImageUrl: true, board: { select: { name: true } } } });
    const client = await getChatClient(ctx.chat.chatId);
    if (!client) return { error: "Bot của cuộc chat này đang tắt nên chưa gửi ảnh được." };
    let sent = 0;
    let lastError = "";
    for (const id of ids) {
      const pin = pins.find((p) => p.id === id);
      if (!pin) continue;
      try {
        const image = await fetchPinJpeg(pin.sourceImageUrl);
        await shared().zaloSend(async () => {
          await client.sendPhoto({ chatId: ctx.chat.chatId, image, fileName: `pinterest-${pin.pinterestPinId}.jpg`, caption: clip(`Mẫu ${sent + 1}: ${pin.title || pin.board.name}`, 300) });
          await new Promise((r) => setTimeout(r, ctx.settings.sendGapMs));
        });
        sent++;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    if (sent === 0) return { error: `Không gửi được mẫu nào (${clip(lastError, 150)}).` };
    return { data: { da_gui: sent, tong: ids.length, ...(sent < ids.length ? { loi: clip(lastError, 150) } : {}) } };
  },
};

const tienDo: ToolDef<Record<string, never>> = {
  name: "tien_do",
  usage: "",
  description: "Việc tạo ảnh bot đang làm trong cuộc chat này (\"xong chưa\").",
  schema: z.object({}),
  async run(ctx) {
    const chatId = ctx.chat.chatId;
    const running = await db.zaloBotTask.findMany({ where: { chatId, status: { in: ["RUNNING", "DELIVERING"] } }, orderBy: { createdAt: "desc" }, take: 5 });
    if (running.length === 0) {
      const last = await db.zaloBotTask.findFirst({ where: { chatId }, orderBy: { createdAt: "desc" } });
      return { final: last ? `Em không có việc nào đang chạy. Việc gần nhất (${last.kind === "CATALOG" ? "catalog" : "thiết kế"}): ${last.status === "DONE" ? "đã gửi xong" : "không hoàn tất"}${last.summary ? ` (${last.summary})` : ""}.` : "Em chưa nhận việc nào trong cuộc chat này." };
    }
    const lines: string[] = [];
    for (const t of running) {
      const [done, total] = await Promise.all([
        db.generatedImage.count({ where: { sessionId: t.sessionId, retries: { none: {} }, status: { in: ["SUCCESS", "FAILED"] } } }),
        db.generatedImage.count({ where: { sessionId: t.sessionId, retries: { none: {} } } }),
      ]);
      lines.push(total === 0 ? `• ${t.kind === "CATALOG" ? "Catalog" : "Thiết kế"}: AI đang chọn chất liệu` : `• ${t.kind === "CATALOG" ? "Catalog" : "Thiết kế"}: ${done}/${total} ảnh đã xong`);
    }
    return { final: `Em đang làm:\n${lines.join("\n")}\nXong em gửi lại ngay.` };
  },
};

const hanMuc: ToolDef<Record<string, never>> = {
  name: "han_muc",
  usage: "",
  description: "Hôm nay người ra lệnh đã dùng và còn bao nhiêu lượt tạo ảnh.",
  schema: z.object({}),
  async run(ctx) {
    const q = await getQuotaInfo(ctx.user);
    return { final: q ? `Hôm nay ${ctx.user.name} đã dùng ${q.used}/${q.limit} lượt tạo ảnh, còn ${q.left} lượt.` : `Tài khoản quản trị của ${ctx.user.name} không giới hạn lượt tạo ảnh.` };
  },
};

const hoiKienThuc: ToolDef<{ cau_hoi: string }> = {
  name: "hoi_kien_thuc",
  usage: "cau_hoi*",
  description: "Trả lời câu hỏi kỹ thuật hoặc thông tin về xưởng (độ dày, cắt/khắc được không, chất liệu nào hợp, chính sách...) theo kho kiến thức.",
  schema: z.object({ cau_hoi: text(1500).min(1) }),
  async run(ctx, args) {
    const recent = await db.zaloMessage.findMany({ where: { contactId: ctx.chat.id, failed: false, createdAt: { gt: ctx.chat.contextResetAt ?? new Date(0) } }, orderBy: { createdAt: "desc" }, take: 8 });
    const lines = recent.reverse().filter((m) => m.text).map((m) => `- ${m.author === "CONTACT" ? "Người trong nhóm" : "Bot"}: ${preview(m.text, 200)}`);
    const who = `Người hỏi là nhân viên ${ctx.staff.displayName}.`;
    const context = lines.length ? `Tin nhắn gần đây trong cuộc chat (để hiểu bối cảnh):\n${lines.join("\n")}\n\n${who}` : who;
    try {
      // vai SALE_ASSISTANT: được đọc kiến thức CÔNG KHAI và NỘI BỘ (nhân viên đã ghép nối), không bao giờ đọc ADMIN_ONLY
      const r = await answerWithKnowledge({ role: "SALE_ASSISTANT", model: ctx.settings.chatModel, question: args.cau_hoi, context, userId: ctx.user.id });
      return { final: r.text || "Em chưa có câu trả lời cho câu này trong tài liệu của xưởng." };
    } catch (e) {
      return { final: `Em chưa trả lời được lúc này (${e instanceof ChatError ? e.message : "lỗi mạng"}). Anh/chị thử lại sau nhé.` };
    }
  },
};

/* ---------- Danh sách công cụ ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mỗi công cụ có kiểu tham số riêng; kiểu được kiểm bằng schema lúc chạy
const TOOLS: ToolDef<any>[] = [timKhach, xemLichSu, taoTheoLichSu, taoThietKe, taoCatalog, taoThietKeTuCatalog, xacNhan, huy, guiLaiAnh, guiMauPinterest, tienDo, hanMuc, hoiKienThuc];

export const TOOL_SPECS: ToolSpec[] = TOOLS.map(({ name, usage, description }) => ({ name, usage, description }));
export const TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));

/** Chạy một công cụ theo tên với tham số AI đưa. Tham số sai kiểu hay công cụ ném lỗi đều thành `error` cho AI, không làm sập lượt. */
export async function runTool(ctx: ToolCtx, name: string, rawArgs: Record<string, unknown>): Promise<ToolOutcome> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Không có lệnh "${name}".` };
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Tham số của ${name} chưa đúng (${issue.path.join(".") || "args"}: ${issue.message}). Xem lại mô tả tham số của lệnh.` };
  }
  try {
    return await tool.run(ctx, parsed.data);
  } catch (e) {
    console.error(`Zalo agent: công cụ ${name} lỗi:`, e);
    return { error: "Chương trình gặp lỗi máy chủ khi chạy lệnh này. Báo người ra lệnh thử lại sau ít phút." };
  }
}
