import { after } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { syncSession } from "@/lib/jobs/process";
import { isValidSignature } from "@/lib/providers/kie-webhook";

const MAX_SKEW_SECONDS = 10 * 60; // chống phát lại: chỉ nhận callback có dấu thời gian trong vòng 10 phút

/**
 * Callback tùy chọn từ kie.ai khi tác vụ xong. Chữ ký KHÔNG bao phủ nội dung, nên ta không tin nội dung:
 * callback chỉ dùng như một "tín hiệu" để hỏi lại kie.ai ngay (Get Task Details là nguồn đúng duy nhất).
 * Hệ thống vẫn chạy đúng chỉ với polling nếu callback không bao giờ tới.
 */
export async function POST(request: Request) {
  const env = getEnv();
  if (!env.KIE_CALLBACK_ENABLED || !env.KIE_CALLBACK_SECRET) {
    return Response.json({ error: "Callback chưa được bật." }, { status: 404 });
  }

  const timestamp = request.headers.get("x-webhook-timestamp");
  const signature = request.headers.get("x-webhook-signature");
  if (!timestamp || !signature) return Response.json({ error: "Thiếu chữ ký." }, { status: 401 });

  let body: { data?: { taskId?: string; task_id?: string } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const taskId = body.data?.taskId ?? body.data?.task_id;
  if (!taskId) return Response.json({ error: "Thiếu taskId." }, { status: 400 });

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    return Response.json({ error: "Dấu thời gian không hợp lệ." }, { status: 401 });
  }
  if (!isValidSignature(taskId, timestamp, signature, env.KIE_CALLBACK_SECRET)) {
    return Response.json({ error: "Chữ ký không đúng." }, { status: 401 });
  }

  // Trả lời ngay, xử lý sau
  after(async () => {
    const image = await db.generatedImage.findFirst({ where: { taskId, status: "PROCESSING" } });
    if (!image) return;
    // bỏ khoảng chờ giữa các lần hỏi để hỏi kie.ai ngay lúc này
    await db.generatedImage.updateMany({ where: { id: image.id, status: "PROCESSING" }, data: { lastPolledAt: null } });
    await syncSession(image.sessionId);
  });
  return Response.json({ status: "received" });
}
