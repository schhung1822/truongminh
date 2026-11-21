/**
 * Kiểm tra kho ảnh: mọi ảnh mà CSDL nhắc tới có nằm đúng chỗ không (thư mục trên máy chủ, hoặc bucket R2 khi STORAGE_DRIVER="r2").
 * Chạy trong thư mục dự án (cùng nơi có file .env):   node --env-file=.env --import tsx deploy/check-storage.ts
 * Chỉ ĐỌC, không sửa gì. Không in mật khẩu.
 */
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { getR2Config, getEnv } from "../lib/env";
import { R2Storage } from "../lib/storage/r2";

const exists = async (p: string) => {
  try {
    await fs.access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

async function countFiles(dir: string, limit = 200_000): Promise<number> {
  let n = 0;
  const walk = async (d: string) => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (n >= limit) return;
      if (e.isDirectory()) await walk(path.join(d, e.name));
      else n++;
    }
  };
  await walk(dir);
  return n;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL (chạy với --env-file=.env trong thư mục dự án).");
  const useR2 = process.env.STORAGE_DRIVER === "r2";
  const r2cfg = useR2 ? getR2Config(getEnv()) : null;
  if (useR2 && !r2cfg) throw new Error('STORAGE_DRIVER="r2" nhưng thiếu R2_* trong .env');
  const r2 = r2cfg ? new R2Storage(r2cfg) : null;
  const root = path.resolve(process.env.STORAGE_DIR || "./storage");
  console.log("Thư mục làm việc hiện tại :", process.cwd());
  console.log("Web sẽ tìm ảnh ở          :", r2cfg ? `Cloudflare R2, bucket ${r2cfg.bucket} (${r2cfg.publicUrl})` : root);
  console.log("Người dùng đang chạy      :", os.userInfo().username);

  const rootOk = await exists(root);
  if (!r2) console.log("Thư mục đó có tồn tại không:", rootOk ? "có" : "KHÔNG");
  if (!r2 && rootOk) {
    const w = await fs.access(root, constants.W_OK).then(() => true, () => false);
    console.log("Ghi được vào thư mục đó   :", w ? "có" : "KHÔNG (web không lưu được ảnh mới, cần chown/chmod)");
    const subs = (await fs.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    console.log("Thư mục con               :", subs.join(", ") || "(trống)");
    console.log("Tổng số file              :", await countFiles(root));
  }

  const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  type Ref = { table: string; column: string; keys: string[] };
  const refs: Ref[] = [];
  const add = (table: string, column: string, keys: (string | null)[]) => refs.push({ table, column, keys: [...new Set(keys.filter((k): k is string => !!k))] });

  const materials = await db.material.findMany({ select: { layer1Path: true, layer2Path: true, productPhotoPath: true, referencePath: true } });
  add("chất liệu", "ảnh lớp 1", materials.map((m) => m.layer1Path));
  add("chất liệu", "ảnh lớp 2", materials.map((m) => m.layer2Path));
  add("chất liệu", "ảnh sản phẩm", materials.map((m) => m.productPhotoPath));
  add("chất liệu", "ảnh ghép (gửi AI)", materials.map((m) => m.referencePath));
  const logos = await db.logo.findMany({ select: { originalPath: true, normalizedPath: true } });
  add("logo", "file gốc", logos.map((l) => l.originalPath));
  add("logo", "file chuẩn hóa", logos.map((l) => l.normalizedPath));
  const images = await db.generatedImage.findMany({ select: { originalPath: true, finalPath: true } });
  add("ảnh đã tạo", "ảnh gốc", images.map((i) => i.originalPath));
  add("ảnh đã tạo", "ảnh thành phẩm", images.map((i) => i.finalPath));
  add("tin Zalo", "ảnh khách gửi", (await db.zaloMessage.findMany({ where: { mediaPath: { not: null } }, select: { mediaPath: true } })).map((m) => m.mediaPath));
  add("tư liệu Zalo", "file", (await db.zaloAsset.findMany({ select: { path: true } })).map((a) => a.path));
  await db.$disconnect();

  // nơi khác ảnh có thể đã bị giải nén nhầm vào
  const alternatives = [
    path.join(root, "storage"), // storage/storage/...
    path.resolve(process.cwd(), "data", "storage"),
    path.resolve(os.homedir(), "storage"),
    path.resolve(process.cwd(), "..", "storage"),
  ].filter((p) => p !== root);

  let totalMissing = 0;
  let totalKeys = 0;
  console.log("\nĐối chiếu CSDL với thư mục ảnh:");
  for (const r of refs) {
    if (r.keys.length === 0) continue;
    const missing: string[] = [];
    for (const k of r.keys) if (!(r2 ? await r2.exists(k).catch(() => false) : await exists(path.join(root, ...k.split("/"))))) missing.push(k);
    totalKeys += r.keys.length;
    totalMissing += missing.length;
    const mark = missing.length === 0 ? "đủ " : "THIẾU";
    console.log(`  [${mark}] ${r.table} / ${r.column}: ${r.keys.length - missing.length}/${r.keys.length} file có`);
    if (missing.length > 0) console.log(`           ví dụ thiếu: ${missing.slice(0, 3).join(" | ")}`);
    if (missing.length > 0 && !r2) {
      for (const alt of alternatives) {
        const k = missing[0];
        if (await exists(path.join(alt, ...k.split("/")))) {
          console.log(`           >>> Ảnh này lại có ở ${alt}: có vẻ đã giải nén nhầm chỗ. Chuyển thư mục đó về ${root}`);
          break;
        }
      }
    }
  }
  console.log(`\nKết luận: ${totalKeys - totalMissing}/${totalKeys} ảnh CSDL nhắc tới đang có trong thư mục ảnh.`);
  if (totalMissing === 0) console.log("Thư mục ảnh đủ. Nếu trình duyệt vẫn không hiện ảnh, xem nhật ký:  pm2 logs truongminh --lines 80  (tìm ENOENT, EACCES hoặc 401/403 ở /api/files).");
  else if (!rootOk) console.log("Thư mục ảnh chưa có ở chỗ web tìm. Giải nén gói ảnh vào đúng thư mục, hoặc đặt STORAGE_DIR trong .env trỏ tới nơi đã giải nén, rồi  pm2 restart truongminh.");
}

main().catch((e) => {
  console.error("LỖI:", e instanceof Error ? e.message : e);
  process.exit(1);
});
