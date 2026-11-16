// Chạy: npm run db:seed. An toàn khi chạy lại nhiều lần (không ghi đè dữ liệu đã có).
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const CATALOG_PROMPT = `Create one product-sample sheet as a strict grid of {{cols}} columns and {{rows}} rows, equal cells, thin white gutters, plain white background.
Reference image 1 is the customer's logo. Reproduce it exactly: same shapes, proportions, letters and colors. Do not redraw, restyle or add anything to it.
Reference images 2 onward are material samples from our workshop. Each cell shows the logo produced on one material, photographed straight-on, same scale and lighting in every cell.
Cells, in reading order (left to right, top to bottom):
{{materials_list}}
The material in each cell must match its reference image exactly (texture, color, finish, thickness). Do not mix materials between cells.
Do not write any text, numbers or captions in the image.`;

// Bản khởi đầu do kỹ sư soạn, brief chưa cung cấp prompt thiết kế. Admin chỉnh trong trang Prompt.
const DESIGN_PROMPT = `Create one realistic product mockup of the customer's logo applied to: {{product_type}}.
Reference image 1 is the customer's logo. Reproduce it exactly: same shapes, proportions, letters and colors. Do not redraw, restyle or add anything to it.
Reference image 2 is a material sample from our workshop. The product must be made of this exact material (texture, color, finish, thickness) and the logo must appear on it the same way it appears in the sample (same printing or engraving technique).
Design style: {{design_style}}
Extra notes from the sales team: {{note}}
Do not write any text, numbers or captions in the image apart from the logo itself.`;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  imageModel: "gpt-image-2-5-flare-image-to-image",
  defaultResolution: "2K",
  dailyLimitPerSale: 60,
  workshopName: "Xưởng in logo",
  footerNote: "Ảnh mô phỏng, màu sắc thực tế có thể chênh lệch",
  labelMode: "overlay",
};

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";
  if (!email || !password) throw new Error("Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD phải có ít nhất 8 ký tự");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} đã có, giữ nguyên (không đổi mật khẩu).`);
  } else {
    await db.user.create({
      data: { email, name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`Đã tạo tài khoản admin: ${email}`);
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: {},
    });
  }

  for (const [kind, body] of [
    ["CATALOG", CATALOG_PROMPT],
    ["DESIGN", DESIGN_PROMPT],
  ] as const) {
    const count = await db.promptTemplate.count({ where: { kind } });
    if (count === 0) {
      await db.promptTemplate.create({
        data: { kind, version: 1, body, isActive: true, note: "Bản khởi đầu" },
      });
      console.log(`Đã tạo prompt ${kind} phiên bản 1.`);
    }
  }
  console.log("Seed xong.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
