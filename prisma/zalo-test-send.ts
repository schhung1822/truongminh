// Gửi thử vào nhóm Zalo: một tin chữ, các ảnh đã tạo của một khách, và một file PDF. Chạy một lần để xem bot gửi được.
// Chạy: npx tsx --conditions=react-server prisma/zalo-test-send.ts "<tên khách>"
import "dotenv/config";
import { db } from "../lib/db";
import { buildPdf } from "../lib/export/build";
import { compareSessionImages } from "../lib/jobs/order";
import { getStorage } from "../lib/storage";
import { getZaloClient } from "../lib/zalo";
import { deliverImage } from "../lib/zalo/send";

async function main() {
  const customerName = process.argv[2] ?? "Nextgency";
  const client = getZaloClient();
  if (!client) throw new Error("Chưa cấu hình ZALO_BOT_TOKEN.");
  const group = await db.zaloGroup.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!group) throw new Error("Chưa có nhóm Zalo nào đang bật.");
  console.log(`Nhóm: ${group.name}`);

  const text = await client.sendMessage(group.chatId, `Tin thử từ hệ thống ảnh mẫu in logo Trường Minh: sắp gửi ảnh đã tạo của khách ${customerName} và một file PDF.`);
  console.log("Đã gửi tin chữ:", text?.message_id ?? "ok");

  const images = await db.generatedImage.findMany({
    where: { status: "SUCCESS", retries: { none: {} }, finalPath: { not: null }, session: { logo: { brand: { customer: { name: customerName } } } } },
    select: { id: true, finalPath: true, materialId: true, variantIndex: true, createdAt: true, sheet: { select: { sortOrder: true } }, sessionId: true },
  });
  images.sort((a, b) => (a.sessionId === b.sessionId ? compareSessionImages(a, b) : a.createdAt.getTime() - b.createdAt.getTime()));
  console.log(`Ảnh của ${customerName}: ${images.length}`);

  let sent = 0;
  for (const img of images) {
    const r = await deliverImage(img.id, { id: group.id, chatId: group.chatId }, { force: true });
    console.log(`  ảnh ${img.id.slice(0, 8)}: ${r.outcome}${r.outcome === "failed" ? " - " + r.error : ""}`);
    if (r.outcome === "sent") sent++;
    if (r.outcome === "failed" && r.stop) break;
  }

  if (images.length > 0) {
    const storage = getStorage();
    const pdf = await buildPdf(await Promise.all(images.map((i) => storage.get(i.finalPath!))), `Ảnh mẫu ${customerName}`);
    const f = await client.sendFile({ chatId: group.chatId, data: pdf, fileName: `Anh mau ${customerName}.pdf`, caption: `File PDF ${images.length} ảnh mẫu của ${customerName}` });
    console.log("Đã gửi file PDF:", f?.message_id ?? "ok", `(${Math.round(pdf.length / 1024)} KB)`);
  }
  console.log(`Xong: ${sent}/${images.length} ảnh đã gửi.`);
}

main()
  .catch((e) => {
    console.error("LỖI:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
