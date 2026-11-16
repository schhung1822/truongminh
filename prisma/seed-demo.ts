// Tạo DỮ LIỆU MẪU để thử web: 12 chất liệu giả (ảnh vẽ bằng code) và 2 trang mẫu.
// Chạy: npm run db:seed-demo. Chạy lại an toàn (bỏ qua mã đã có). KHÔNG dùng trên VPS thật.
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import sharp from "sharp";
import { PrismaClient } from "../generated/prisma/client";
import { composeReference, processMaterialImage } from "../lib/imaging/material-images";
import { LocalStorage } from "../lib/storage/local";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });
const storage = new LocalStorage(process.env.STORAGE_DIR ?? "./storage");

const DEMO = [
  ["DEMO-01", "Vải bố trắng", "Vải", "In UV", "#f1ede4"],
  ["DEMO-02", "Vải canvas xám", "Vải", "In UV", "#9a9a98"],
  ["DEMO-03", "Vải nỉ đỏ", "Vải", "In chuyển nhiệt", "#b3262e"],
  ["DEMO-04", "Vải lụa xanh", "Vải", "In UV", "#2d5d8a"],
  ["DEMO-05", "Mica trong", "Nhựa", "Khắc laser", "#cfe6ee"],
  ["DEMO-06", "Mica đen bóng", "Nhựa", "In UV", "#1c1c1f"],
  ["DEMO-07", "Nhựa PP trắng", "Nhựa", "In UV", "#f7f7f7"],
  ["DEMO-08", "Inox xước", "Kim loại", "Khắc laser", "#b8bcc2"],
  ["DEMO-09", "Nhôm vàng", "Kim loại", "Khắc laser", "#d4a83a"],
  ["DEMO-10", "Gỗ sồi", "Gỗ", "Khắc laser", "#c89a5b"],
  ["DEMO-11", "Gỗ óc chó", "Gỗ", "Khắc laser", "#5a3a26"],
  ["DEMO-12", "Da bò nâu", "Da", "Khắc laser", "#7a4a2b"],
] as const;

function swatch(color: string, variant: 1 | 2): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
    <defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(${variant === 1 ? 35 : -20})">
      <rect width="24" height="24" fill="${color}"/><rect width="3" height="24" fill="#000" fill-opacity="0.12"/></pattern></defs>
    <rect width="900" height="900" fill="url(#p)"/>
    ${variant === 2 ? `<circle cx="450" cy="450" r="300" fill="#fff" fill-opacity="0.18"/><circle cx="450" cy="450" r="300" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="6"/>` : ""}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const stamp = Date.now();
  const created: string[] = [];

  for (const [i, [code, name, groupName, printTech, color]] of DEMO.entries()) {
    if (await db.material.findUnique({ where: { code } })) continue;
    const l1 = await processMaterialImage(await swatch(color, 1));
    const l2 = await processMaterialImage(await swatch(color, 2));
    const ref = await composeReference(l1.buffer, l2.buffer);

    const m = await db.material.create({
      data: {
        code,
        name,
        groupName,
        printTech,
        descHuman: `Chất liệu mẫu để thử: ${name}.`,
        descAi: `${name} surface, color ${color}, matte finish, logo appears ${printTech === "Khắc laser" ? "engraved" : "printed flat"}.`,
        sortOrder: i + 1,
      },
    });
    const k1 = `materials/${m.id}/layer1-${stamp}.${l1.ext}`;
    const k2 = `materials/${m.id}/layer2-${stamp}.${l2.ext}`;
    const kr = `materials/${m.id}/reference-${stamp}.${ref.ext}`;
    await storage.put(k1, l1.buffer);
    await storage.put(k2, l2.buffer);
    await storage.put(kr, ref.buffer);
    await db.material.update({
      where: { id: m.id },
      data: { layer1Path: k1, layer2Path: k2, referencePath: kr, referenceUpdatedAt: new Date() },
    });
    created.push(code);
  }
  console.log(created.length ? `Đã tạo ${created.length} chất liệu mẫu.` : "Chất liệu mẫu đã có sẵn.");

  if ((await db.sheet.count()) === 0) {
    const mats = await db.material.findMany({ where: { code: { startsWith: "DEMO-" } }, orderBy: { code: "asc" } });
    const make = async (name: string, groupName: string, list: typeof mats) => {
      const sheet = await db.sheet.create({ data: { name, groupName, cols: 2, rows: 5, aspectRatio: "2:3", resolution: "2K" } });
      await db.sheetMaterial.createMany({ data: list.map((m, position) => ({ sheetId: sheet.id, materialId: m.id, position })) });
    };
    await make("Trang demo 1 (10 chất liệu)", "Demo", mats.slice(0, 10));
    await make("Trang demo 2 (2 chất liệu)", "Demo", mats.slice(10, 12));
    console.log("Đã tạo 2 trang mẫu demo.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
