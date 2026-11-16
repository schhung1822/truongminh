// Tạo vài KIỂU THIẾT KẾ khởi đầu nếu bảng còn trống (admin sửa/xóa/thêm ở Quản trị > Kiểu thiết kế).
// Chạy: npm run db:seed-styles. An toàn khi chạy lại (đã có kiểu nào thì không làm gì).
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const STYLES = [
  {
    name: "Tối giản hiện đại",
    description:
      "Minimalist modern product photo: clean white-to-light-grey studio background, soft diffused daylight, a single product centred with generous negative space, subtle soft shadow, crisp and sharp focus.",
  },
  {
    name: "Sang trọng cao cấp",
    description:
      "Premium luxury product photo: dark charcoal or deep navy background, dramatic low-key lighting with soft rim highlights, elegant reflections on a dark glossy surface, rich contrast, high-end brand campaign look.",
  },
  {
    name: "Trẻ trung năng động",
    description:
      "Playful youthful product photo: bright pastel colourful backdrop, bold flat colour blocks, cheerful high-key lighting, product slightly tilted with a dynamic composition and a few simple geometric props.",
  },
  {
    name: "Mộc mạc thủ công",
    description:
      "Rustic handcrafted product photo: warm natural wood table, linen cloth and dried leaves as props, soft warm window light, cosy artisan workshop atmosphere, shallow depth of field.",
  },
];

async function main() {
  if ((await db.designStyle.count()) > 0) {
    console.log("Đã có kiểu thiết kế, không thêm.");
    return;
  }
  for (const [i, s] of STYLES.entries()) {
    await db.designStyle.create({ data: { ...s, sortOrder: i + 1 } });
  }
  console.log(`Đã thêm ${STYLES.length} kiểu thiết kế khởi đầu.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
