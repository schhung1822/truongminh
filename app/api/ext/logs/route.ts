import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateExt, extError } from "@/lib/ext/auth";

const TYPES = ["SELECTOR_BROKEN", "CHECKPOINT", "SCAN_FAIL"] as const;

const bodySchema = z.object({
  type: z.string().transform((s) => s.trim().toUpperCase()).pipe(z.enum(TYPES, "Loại sự kiện không hợp lệ.")),
  detail: z.record(z.string(), z.unknown()).nullish(),
});

/** Nhật ký chi tiết tối đa bấy nhiêu ký tự (JSON), phòng extension gửi quá nhiều. */
const MAX_DETAIL_CHARS = 4000;

/**
 * Extension báo sự kiện bất thường (mục 7.6): `selector_broken` (Facebook đổi giao diện), `checkpoint` (bị yêu cầu xác minh / hạn chế),
 * `scan_fail`. Khi nhận `checkpoint`, nick chuyển sang RESTRICTED và hệ thống ngừng giao việc cho tới khi quản trị viên bật lại.
 */
export async function POST(request: Request) {
  const auth = await authenticateExt(request);
  if (!auth.ok) return auth.response;
  const { account, token } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return extError(400, "BAD_REQUEST", "Dữ liệu không phải JSON hợp lệ.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return extError(400, "BAD_REQUEST", parsed.error.issues[0].message);

  const raw = parsed.data.detail ? JSON.stringify(parsed.data.detail) : null;
  const detail = raw === null ? undefined : raw.length > MAX_DETAIL_CHARS ? { truncated: true, preview: raw.slice(0, MAX_DETAIL_CHARS) } : (parsed.data.detail as object);
  await db.extLog.create({ data: { tokenId: token.id, type: parsed.data.type, detail } });

  let restricted = false;
  if (parsed.data.type === "CHECKPOINT" && account.status === "ACTIVE") {
    await db.fbAccount.update({ where: { id: account.id }, data: { status: "RESTRICTED" } });
    restricted = true;
  }
  return Response.json({ ok: true, account_restricted: restricted || account.status === "RESTRICTED" }, { headers: { "Cache-Control": "no-store" } });
}
