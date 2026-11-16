// Chạy: npm run db:seed. An toàn khi chạy lại nhiều lần (không ghi đè dữ liệu đã có).
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT } from "../lib/prompts/defaults";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });

// Prompt mặc định nằm ở lib/prompts/defaults.ts (dùng chung với script cập nhật prompt). Admin chỉnh trong trang Prompt.
const CATALOG_PROMPT = DEFAULT_CATALOG_PROMPT;
const DESIGN_PROMPT = DEFAULT_DESIGN_PROMPT;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  imageModel: "gpt-image-2-5-sunburst-image-to-image",
  defaultResolution: "2K",
  dailyLimitPerSale: 60,
  workshopName: "Xưởng in Trường Minh",
  footerNote: "",
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
