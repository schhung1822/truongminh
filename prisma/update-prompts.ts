// Đưa prompt mặc định MỚI NHẤT vào làm phiên bản mới và dùng ngay (bản cũ vẫn giữ lịch sử, quay lại được ở trang Prompt).
// Chạy: npm run db:update-prompts. Nếu bản đang dùng đã giống mặc định thì không làm gì.
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT } from "../lib/prompts/defaults";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });

async function main() {
  for (const [kind, body] of [
    ["CATALOG", DEFAULT_CATALOG_PROMPT],
    ["DESIGN", DEFAULT_DESIGN_PROMPT],
  ] as const) {
    const active = await db.promptTemplate.findFirst({ where: { kind, isActive: true } });
    if (active && active.body.trim() === body.trim()) {
      console.log(`Prompt ${kind}: bản đang dùng (phiên bản ${active.version}) đã là mặc định mới nhất, bỏ qua.`);
      continue;
    }
    const max = await db.promptTemplate.aggregate({ where: { kind }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    await db.$transaction([
      db.promptTemplate.updateMany({ where: { kind }, data: { isActive: false } }),
      db.promptTemplate.create({
        data: {
          kind,
          version,
          body,
          isActive: true,
          note: "Tấm mỏng đúng độ dày thật 0,3-0,5 mm: không vẻ tấm bảng kim loại, không mép vát, không bóng đổ; viền trang trí của logo là nét khắc phẳng (D134). Giữ nguyên phần còn lại của D113, D114",
        },
      }),
    ]);
    console.log(`Prompt ${kind}: đã tạo phiên bản ${version} và dùng ngay (bản cũ ${active ? active.version : "-"} vẫn giữ trong lịch sử).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
