import { db } from "@/lib/db";

/** Để Docker/Caddy biết web còn sống và nối được CSDL. Không trả thông tin nhạy cảm. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
