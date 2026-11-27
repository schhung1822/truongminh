/**
 * Đồng bộ dữ liệu CHẤT LIỆU giữa hai máy dùng chung kho ảnh R2 nhưng CSDL riêng (ví dụ máy dev → máy chủ). Xem D128.
 *
 * Vì sao cần: sửa chất liệu ở máy này (thay ảnh, đổi chỗ hai lớp) sinh file ảnh mới và xóa file cũ trong kho. CSDL của máy
 * kia vẫn trỏ tới file cũ nên tạo ảnh báo lỗi "không còn trong kho ảnh". Chép các DÒNG chất liệu sang là hết: file ảnh mới
 * đã nằm sẵn trong kho chung.
 *
 * Chạy trong thư mục dự án (nơi có file .env):
 *   Máy có dữ liệu đúng :  node --env-file=.env --import tsx scripts/sync-materials.ts export [file]
 *   Máy cần cập nhật    :  node --env-file=.env --import tsx scripts/sync-materials.ts import [file]           (chỉ IN kế hoạch)
 *                          node --env-file=.env --import tsx scripts/sync-materials.ts import [file] --apply   (ghi vào CSDL)
 *   Tùy chọn khi import :  --with-stock      lấy cả thông số tấm và giá theo file (mặc định giữ của máy này)
 *                          --disable-broken  tắt các chất liệu đang bật mà ảnh tham chiếu không có trong kho của máy này
 * File mặc định: backups/chat-lieu.json (thư mục backups không đưa lên git). File có giá tấm: đừng gửi cho người ngoài.
 *
 * Chất liệu khớp theo MÃ. Không xóa chất liệu, không xóa file ảnh nào. Trang mẫu (bộ chất liệu) không được đồng bộ.
 * Không import file có "server-only" (lib/db.ts, lib/storage/index.ts). Không in mật khẩu CSDL hay khóa R2.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client";
import { getEnv, getR2Config } from "../lib/env";
import { LocalStorage } from "../lib/storage/local";
import { R2Storage } from "../lib/storage/r2";
import type { StorageDriver } from "../lib/storage/types";
import {
  buildSyncPlan,
  DATA_FIELDS,
  EXPORT_VERSION,
  formatPlan,
  imageKeysOf,
  STOCK_FIELDS,
  type CurrentMaterial,
  type CurrentOption,
  type MaterialData,
  type MaterialsExport,
  type StockData,
  type SyncPlan,
} from "./sync-materials-plan";

type Db = InstanceType<typeof PrismaClient>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

const DEFAULT_FILE = "backups/chat-lieu.json";
const OPTION_TYPES = ["BASE_MATERIAL", "TECHNIQUE", "SURFACE_FINISH", "SURFACE_PATTERN", "COLOR_FAMILY", "STYLE_TAG", "SERIES"] as const;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const fileSchema = z.object({
  version: z.literal(EXPORT_VERSION, `File không đúng phiên bản (cần ${EXPORT_VERSION}). Xuất lại bằng bản mã mới nhất.`),
  exportedAt: z.string(),
  options: z.array(z.object({ type: z.enum(OPTION_TYPES), value: z.string().min(1).max(60), label: z.string().min(1).max(100), sortOrder: z.number().int(), isActive: z.boolean() })),
  materials: z.array(z.object({ code: z.string().min(1).max(191), data: z.record(z.string(), scalar), stock: z.record(z.string(), scalar), styleTags: z.array(z.string().min(1).max(60)) })),
});

/* ---------- Đọc CSDL ---------- */

/** Giá trị cột để so sánh và ghi file: ngày giờ thành chuỗi ISO, số thập phân (giá) thành số, trống thành null. */
function plain(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return Number(v); // Decimal của Prisma
}

async function loadMaterials(db: Db | Tx): Promise<CurrentMaterial[]> {
  const rows = await db.material.findMany({ include: { styleTags: { select: { value: true } } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  return rows.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      id: row.id,
      code: row.code,
      data: Object.fromEntries(DATA_FIELDS.map((f) => [f, plain(r[f])])) as MaterialData,
      stock: Object.fromEntries(STOCK_FIELDS.map((f) => [f, plain(r[f])])) as StockData,
      styleTags: row.styleTags.map((t) => t.value).sort(),
    };
  });
}

async function loadOptions(db: Db | Tx): Promise<CurrentOption[]> {
  const rows = await db.materialOption.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { value: "asc" }] });
  return rows.map((o) => ({ id: o.id, type: o.type, value: o.value, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive }));
}

/* ---------- Kho ảnh của máy này ---------- */

function openStorage(): { storage: StorageDriver; label: string } {
  const env = getEnv();
  if (env.STORAGE_DRIVER === "r2") {
    const r2 = getR2Config(env);
    if (!r2) throw new Error('STORAGE_DRIVER="r2" nhưng thiếu R2_* trong .env');
    return { storage: new R2Storage(r2), label: `Cloudflare R2, bucket ${r2.bucket} (${r2.publicUrl})` };
  }
  const root = path.resolve(env.STORAGE_DIR);
  return { storage: new LocalStorage(root), label: `thư mục ${root}` };
}

/** Các key KHÔNG có trong kho (kiểm 8 file một lúc). Key sai dạng cũng coi như không có. */
async function findMissing(storage: StorageDriver, keys: string[]): Promise<Set<string>> {
  const missing = new Set<string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, keys.length) }, async () => {
      while (next < keys.length) {
        const key = keys[next++];
        let ok = false;
        try {
          ok = await storage.exists(key);
        } catch (e) {
          if (!(e instanceof Error && e.message === "Đường dẫn file không hợp lệ.")) throw e; // lỗi kết nối, sai khóa R2...: dừng hẳn
        }
        if (!ok) missing.add(key);
      }
    }),
  );
  return missing;
}

/* ---------- Xuất ---------- */

async function runExport(db: Db, file: string): Promise<void> {
  const [materials, options] = await Promise.all([loadMaterials(db), loadOptions(db)]);
  const out: MaterialsExport = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    // id là của riêng từng máy (hai máy khớp nhau theo mã), không đưa vào file
    options: options.map((o) => ({ type: o.type, value: o.value, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive })),
    materials: materials.map((m) => ({ code: m.code, data: m.data, stock: m.stock, styleTags: m.styleTags })),
  };
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, JSON.stringify(out, null, 2), "utf8");
  const active = materials.filter((m) => m.data.isActive === true).length;
  console.log(`Đã xuất ${materials.length} chất liệu (${active} đang bật) và ${options.length} mục phân loại ra: ${path.resolve(file)}`);
  console.log("Chép file này sang máy cần cập nhật (cùng đường dẫn trong thư mục dự án), rồi chạy lệnh import ở đó.");
  console.log("File có thông số tấm và giá: đừng gửi cho người ngoài.");
}

/* ---------- Nhập ---------- */

async function readExport(file: string): Promise<MaterialsExport> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new Error(`Không đọc được file ${path.resolve(file)}. Chạy lệnh export ở máy có dữ liệu đúng rồi chép file sang đây.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("File không phải JSON hợp lệ (có thể bị cắt khi chép).");
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) throw new Error(`File không đúng định dạng: ${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`);
  const seen = new Set<string>();
  const materials = parsed.data.materials.map((m) => {
    if (seen.has(m.code)) throw new Error(`File có hai chất liệu cùng mã "${m.code}".`);
    seen.add(m.code);
    const data = Object.fromEntries(DATA_FIELDS.map((f) => [f, m.data[f] ?? null])) as MaterialData;
    for (const f of ["name", "groupName", "printTech", "descHuman"] as const) if (typeof data[f] !== "string") throw new Error(`Chất liệu ${m.code} trong file thiếu cột bắt buộc "${f}".`);
    for (const f of ["isActive", "needsReview"] as const) if (typeof data[f] !== "boolean") throw new Error(`Chất liệu ${m.code} trong file thiếu cột bắt buộc "${f}".`);
    if (typeof data.sortOrder !== "number") throw new Error(`Chất liệu ${m.code} trong file thiếu cột bắt buộc "sortOrder".`);
    const stock = Object.fromEntries(STOCK_FIELDS.map((f) => [f, m.stock[f] ?? null])) as StockData;
    if (typeof stock.allowRotate !== "boolean") stock.allowRotate = true;
    return { code: m.code, data, stock, styleTags: [...new Set(m.styleTags)].sort() };
  });
  return { ...parsed.data, materials };
}

/** Đổi dữ liệu trong file về kiểu CSDL cần (ngày giờ). */
function toDb(values: Partial<MaterialData> | Partial<StockData>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  if ("referenceUpdatedAt" in out) out.referenceUpdatedAt = typeof out.referenceUpdatedAt === "string" ? new Date(out.referenceUpdatedAt) : null;
  return out;
}

async function applyPlan(tx: Tx, plan: SyncPlan): Promise<void> {
  for (const op of plan.optionOps) {
    if (op.kind === "create") await tx.materialOption.create({ data: op.option as never }); // "type" đã được kiểm theo danh sách loại ở fileSchema
    else await tx.materialOption.update({ where: { id: op.id }, data: { label: op.option.label, sortOrder: op.option.sortOrder, isActive: op.option.isActive } });
  }
  for (const op of plan.materialOps) {
    if (op.kind === "create") {
      await tx.material.create({ data: { code: op.code, ...toDb(op.data), ...toDb(op.stock), styleTags: { create: op.styleTags.map((value) => ({ value })) } } as never });
      continue;
    }
    const data = { ...toDb(op.data), ...(op.stock ? toDb(op.stock) : {}), ...(op.imagesChanged ? { kieRefUrl: null, kieRefExpiresAt: null } : {}) };
    if (Object.keys(data).length > 0) await tx.material.update({ where: { id: op.id }, data: data as never });
    if (op.styleTags) {
      await tx.materialStyleTag.deleteMany({ where: { materialId: op.id } });
      if (op.styleTags.length > 0) await tx.materialStyleTag.createMany({ data: op.styleTags.map((value) => ({ materialId: op.id, value })) });
    }
  }
}

/**
 * Sau khi (giả sử) áp dụng kế hoạch: chất liệu ĐANG BẬT nào có ảnh tham chiếu không nằm trong kho của máy này? Các chất liệu
 * đó sẽ làm hỏng mọi ảnh có chúng (kể cả khi AI tự chọn), nên phải báo ra.
 */
async function brokenAfter(storage: StorageDriver, current: CurrentMaterial[], plan: SyncPlan): Promise<string[]> {
  const final = new Map(current.map((m) => [m.code, { active: m.data.isActive === true, ref: m.data.referencePath as string | null }]));
  for (const op of plan.materialOps) {
    const before = final.get(op.code);
    final.set(op.code, {
      active: "isActive" in op.data ? op.data.isActive === true : (before?.active ?? false),
      ref: "referencePath" in op.data ? (op.data.referencePath as string | null) : (before?.ref ?? null),
    });
  }
  const active = [...final].filter(([, m]) => m.active && m.ref).map(([code, m]) => ({ code, ref: m.ref! }));
  const missing = await findMissing(storage, [...new Set(active.map((m) => m.ref))]);
  return active.filter((m) => missing.has(m.ref)).map((m) => m.code).sort();
}

async function runImport(db: Db, file: string, flags: { apply: boolean; withStock: boolean; disableBroken: boolean }): Promise<void> {
  const data = await readExport(file);
  const { storage, label } = openStorage();
  console.log(`File            : ${path.resolve(file)} (xuất lúc ${data.exportedAt}, ${data.materials.length} chất liệu)`);
  console.log(`Kho ảnh máy này : ${label}`);

  const [current, currentOptions, missingKeys] = await Promise.all([loadMaterials(db), loadOptions(db), findMissing(storage, imageKeysOf(data))]);
  const plan = buildSyncPlan({ file: data, current, currentOptions, missingKeys, withStock: flags.withStock });
  const broken = await brokenAfter(storage, current, plan);

  if (flags.apply) {
    await db.$transaction(
      async (tx) => {
        await applyPlan(tx, plan);
        if (flags.disableBroken && broken.length > 0) await tx.material.updateMany({ where: { code: { in: broken } }, data: { isActive: false } });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  console.log("");
  console.log(formatPlan(plan, { applied: flags.apply, withStock: flags.withStock }));
  if (broken.length > 0) {
    const what = flags.disableBroken ? (flags.apply ? "ĐÃ TẮT" : "sẽ tắt") : "CÒN BẬT";
    console.log(`\nChất liệu đang bật mà ảnh tham chiếu không có trong kho của máy này (${what}): ${broken.join(", ")}`);
    if (!flags.disableBroken) console.log("  Ảnh nào có các chất liệu này sẽ tạo lỗi. Tải lại ảnh của chúng ở Quản trị > Chất liệu, hoặc chạy lại với --disable-broken để tắt chúng.");
  } else {
    console.log(`\nSau khi đồng bộ, mọi chất liệu đang bật đều có ảnh tham chiếu trong kho của máy này.`);
  }
  console.log(flags.apply ? "\nĐÃ GHI vào CSDL. Không cần khởi động lại web; ảnh lỗi cũ thì bấm Tạo lại." : "\nĐây mới là CHẠY THỬ, chưa ghi gì. Thấy đúng thì chạy lại lệnh này kèm --apply.");
}

/* ---------- Dòng lệnh ---------- */

const HELP = `Đồng bộ dữ liệu chất liệu giữa hai máy dùng chung kho ảnh.
  export [file]                 xuất chất liệu của máy này ra file (mặc định ${DEFAULT_FILE})
  import [file]                 so với file và IN kế hoạch, chưa ghi gì
  import [file] --apply         ghi vào CSDL của máy này
  --with-stock                  lấy cả thông số tấm và giá theo file (mặc định giữ của máy này)
  --disable-broken              tắt chất liệu đang bật mà ảnh tham chiếu không có trong kho của máy này`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const unknown = [...flags].filter((f) => !["--apply", "--with-stock", "--disable-broken", "--help"].includes(f));
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }
  if (!command || !["export", "import"].includes(command) || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Tùy chọn lạ: ${unknown.join(", ")}\n`);
    console.log(HELP);
    process.exit(1);
  }
  const file = args.slice(1).find((a) => !a.startsWith("--")) ?? DEFAULT_FILE;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL (chạy với --env-file=.env trong thư mục dự án).");

  const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    if (command === "export") await runExport(db, file);
    else await runImport(db, file, { apply: flags.has("--apply"), withStock: flags.has("--with-stock"), disableBroken: flags.has("--disable-broken") });
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("LỖI:", e instanceof Error ? e.message : e);
  process.exit(1);
});
