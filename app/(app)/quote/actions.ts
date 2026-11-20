"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  compareMaterials,
  deleteDraftQuote,
  listQuotes,
  quoteForUser,
  saveQuote,
  setQuoteStatus,
  type Actor,
  type QuoteRequest,
  type QuoteResponse,
} from "@/lib/quoting/store";
import { ENGRAVE_LEVELS } from "@/lib/quoting/types";
import type { AdminQuoteView, SaleQuoteView } from "@/lib/quoting/view";
import { unionQuantities } from "./format";

/**
 * Các Server Action của công cụ báo giá. Mọi action đều gọi requireUser() ở máy chủ và chỉ đi qua lớp
 * lib/quoting/store.ts: store tự trả đúng góc nhìn theo vai (sale không bao giờ nhận giá vốn).
 * Ở đây KHÔNG tự truy vấn thông số máy, cấu hình giá hay giá tấm, và không tự tính giá.
 */

const MAX_MM = 100_000;
const GENERIC_ERROR = "Chưa tính được báo giá do lỗi hệ thống. Vui lòng thử lại, nếu vẫn lỗi hãy báo quản trị viên.";
const BAD_INPUT = "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại kích thước, mức khắc và số lượng.";

const idSchema = z.string().trim().min(1).max(60);
const requestSchema = z.object({
  logoId: idSchema,
  materialId: idSchema,
  widthMm: z.number().positive().max(MAX_MM),
  heightMm: z.number().positive().max(MAX_MM).nullish(),
  engraveLevel: z.enum(ENGRAVE_LEVELS),
  quantities: z.array(z.number().int().min(1).max(10_000_000)).max(12).optional(),
});

const calcSchema = requestSchema.extend({
  /** true = tính cả các mốc chuẩn của xưởng cùng với các số lượng tùy chọn */
  includeStandard: z.boolean().optional(),
});

const compareSchema = requestSchema.omit({ materialId: true }).extend({
  materialIds: z.array(idSchema).min(1).max(4),
});

const saveSchema = requestSchema.extend({
  sessionId: idSchema.nullish(),
  note: z.string().max(2000).nullish(),
});

const statusSchema = z.enum(["DRAFT", "SENT", "WON"]);

function actorOf(user: { id: string; role: Actor["role"] }): Actor {
  return { id: user.id, role: user.role };
}

function toRequest(p: z.infer<typeof requestSchema>): QuoteRequest {
  return {
    logoId: p.logoId,
    materialId: p.materialId,
    widthMm: p.widthMm,
    heightMm: p.heightMm ?? null,
    engraveLevel: p.engraveLevel,
    quantities: p.quantities && p.quantities.length > 0 ? p.quantities : undefined,
  };
}

function fail(e: unknown): { error: string } {
  console.error("quote action lỗi:", e);
  return { error: GENERIC_ERROR };
}

/* ---------- Tính giá ---------- */

export type CalculateResult = { error: string } | { data: QuoteResponse; quantities: number[] | null };

export async function calculateQuoteAction(input: unknown): Promise<CalculateResult> {
  const user = await requireUser();
  const parsed = calcSchema.safeParse(input);
  if (!parsed.success) return { error: BAD_INPUT };
  const actor = actorOf(user);
  try {
    const req = toRequest(parsed.data);
    let quantities = req.quantities ?? null;

    // "Thêm số lượng khác": lấy các mốc chuẩn từ chính kết quả của máy chủ rồi gộp với số lượng tùy chọn
    if (quantities && parsed.data.includeStandard) {
      const base = await quoteForUser(actor, { ...req, quantities: undefined }, { suggest: false });
      if ("error" in base) return base;
      if (base.view.ok) {
        quantities = unionQuantities([base.view.lines.map((l) => l.quantity), quantities]);
        if (quantities.length > 12) return { error: "Tổng số mốc số lượng tối đa là 12. Hãy bớt số lượng tùy chọn." };
      }
    }

    const res = await quoteForUser(actor, { ...req, quantities: quantities ?? undefined });
    if ("error" in res) return res;
    return { data: res, quantities };
  } catch (e) {
    return fail(e);
  }
}

/** Lấy tỉ lệ khung bao thật và cảnh báo của logo trước khi sale tính giá (không trả con số giá nào). */
export type ProbeResult = { error: string } | { ratio: number; warnings: string[]; fallbackRect: boolean; backgroundRemoved: boolean };

export async function probeLogoAction(logoId: string, materialId: string): Promise<ProbeResult> {
  const user = await requireUser();
  const parsed = z.object({ logoId: idSchema, materialId: idSchema }).safeParse({ logoId, materialId });
  if (!parsed.success) return { error: BAD_INPUT };
  try {
    const res = await quoteForUser(
      actorOf(user),
      { logoId: parsed.data.logoId, materialId: parsed.data.materialId, widthMm: 100, engraveLevel: "KHONG_KHAC", quantities: [1] },
      { suggest: false },
    );
    if ("error" in res) return res;
    // chỉ lấy thông tin về logo, bỏ hết phần giá
    return { ratio: res.logo.ratio, warnings: res.logo.warnings, fallbackRect: res.logo.fallbackRect, backgroundRemoved: res.logo.backgroundRemoved };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- So sánh chất liệu ---------- */

export type CompareItem = { materialId: string; materialLabel: string; view: SaleQuoteView | AdminQuoteView };
export type CompareResult = { error: string } | { items: CompareItem[] };

export async function compareMaterialsAction(input: unknown): Promise<CompareResult> {
  const user = await requireUser();
  const parsed = compareSchema.safeParse(input);
  if (!parsed.success) return { error: BAD_INPUT };
  try {
    const { materialIds, ...rest } = parsed.data;
    const res = await compareMaterials(actorOf(user), {
      logoId: rest.logoId,
      widthMm: rest.widthMm,
      heightMm: rest.heightMm ?? null,
      engraveLevel: rest.engraveLevel,
      quantities: rest.quantities && rest.quantities.length > 0 ? rest.quantities : undefined,
      materialIds,
    });
    if ("error" in res) return res;
    return { items: res };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Lưu và quản lý ---------- */

export type SaveResult = { error: string } | { id: string };

export async function saveQuoteAction(input: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: BAD_INPUT };
  try {
    let sessionId: string | null = parsed.data.sessionId ?? null;
    if (sessionId) {
      const s = await db.consultSession.findUnique({ where: { id: sessionId }, select: { id: true } });
      if (!s) return { error: "Không tìm thấy phiên tư vấn để gắn báo giá." };
      sessionId = s.id;
    }
    const res = await saveQuote(actorOf(user), { ...toRequest(parsed.data), sessionId, note: parsed.data.note ?? null });
    return res;
  } catch (e) {
    return fail(e);
  }
}

export type QuoteListItem = {
  id: string;
  status: "DRAFT" | "SENT" | "WON";
  materialLabel: string;
  logoWidthMm: number;
  perSheet: number;
  firstUnitPrice: number | null;
  createdByName: string;
  createdAtText: string;
};

export async function listLogoQuotesAction(logoId: string): Promise<{ error: string } | { items: QuoteListItem[] }> {
  await requireUser();
  const parsed = idSchema.safeParse(logoId);
  if (!parsed.success) return { items: [] };
  try {
    const rows = await listQuotes({ logoId: parsed.data, limit: 20 });
    const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        materialLabel: r.materialLabel,
        logoWidthMm: r.logoWidthMm,
        perSheet: r.perSheet,
        firstUnitPrice: r.firstUnitPrice,
        createdByName: r.createdByName,
        createdAtText: fmt.format(r.createdAt),
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setQuoteStatusAction(id: string, status: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return { error: BAD_INPUT };
  try {
    return await setQuoteStatus(actorOf(user), parsedId.data, parsedStatus.data);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteQuoteAction(id: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: BAD_INPUT };
  try {
    return await deleteDraftQuote(actorOf(user), parsedId.data);
  } catch (e) {
    return fail(e);
  }
}
