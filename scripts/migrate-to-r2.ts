/**
 * Chuyển toàn bộ ảnh trong thư mục local lên Cloudflare R2 và đổi key trong CSDL sang cách đặt tên mới.
 *
 * Chạy trong thư mục dự án (nơi có file .env):
 *   node --env-file=.env --import tsx scripts/migrate-to-r2.ts --dry-run     (xem trước, không đụng gì)
 *   node --env-file=.env --import tsx scripts/migrate-to-r2.ts               (chạy thật)
 *   node --env-file=.env --import tsx scripts/migrate-to-r2.ts --help
 *
 * File này chỉ NỐI các phần với thế giới thật (CSDL, thư mục local, R2). Phần lập kế hoạch và thực thi nằm ở
 * migrate-plan.ts và migrate-exec.ts để test được. Không import file có "server-only" (lib/db.ts, lib/storage/index.ts).
 * Không bao giờ in mật khẩu CSDL hay khóa R2. Không xóa file nào ở thư mục cũ.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { getEnv, getR2Config, type R2Config } from "../lib/env";
import { R2Storage } from "../lib/storage/r2";
import type { StorageDriver } from "../lib/storage/types";
import { HELP, missingR2Vars, parseCliArgs, type CliArgs } from "./migrate-args";
import { migrate, type DbUpdater } from "./migrate-exec";
import { countDerivedFiles, createFsSource } from "./migrate-fs";
import { buildPlan, type PlanInput, type TableName } from "./migrate-plan";
import { formatDryRunReport, formatRunReport, makeRedactor } from "./migrate-report";

type Db = InstanceType<typeof PrismaClient>;

/** Đích ghi dùng cho dry-run: bất kỳ lời gọi nào cũng là lỗi lập trình, để chắc chắn dry-run không chạm R2. */
const blockedDest: StorageDriver = {
  put: async () => {
    throw new Error("dry-run không được ghi lên R2.");
  },
  get: async () => {
    throw new Error("dry-run không được gọi R2.");
  },
  exists: async () => {
    throw new Error("dry-run không được gọi R2.");
  },
  delete: async () => {
    throw new Error("dry-run không được gọi R2.");
  },
};
const blockedDb: DbUpdater = {
  updateRow: async () => {
    throw new Error("dry-run không được ghi CSDL.");
  },
};

function prismaUpdater(db: Db): DbUpdater {
  return {
    async updateRow(table: TableName, rowId: string, expected, data) {
      const where = { id: rowId, ...expected };
      switch (table) {
        case "materials":
          return (await db.material.updateMany({ where, data })).count > 0;
        case "logos":
          return (await db.logo.updateMany({ where, data })).count > 0;
        case "generated_images":
          return (await db.generatedImage.updateMany({ where, data })).count > 0;
        default:
          throw new Error(`Bảng ${table} giữ nguyên key, không cần cập nhật CSDL.`);
      }
    },
  };
}

async function loadPlanInput(db: Db, args: CliArgs): Promise<PlanInput> {
  const only = new Set(args.only);
  const input: PlanInput = {};
  if (only.has("materials")) {
    input.materials = await db.material.findMany({
      select: { id: true, code: true, layer1Path: true, layer2Path: true, referencePath: true, productPhotoPath: true },
      orderBy: { code: "asc" },
    });
  }
  if (only.has("logos")) {
    const logos = await db.logo.findMany({
      select: { id: true, originalPath: true, normalizedPath: true, brand: { select: { customerId: true } } },
      orderBy: { createdAt: "asc" },
    });
    input.logos = logos.map((l) => ({ id: l.id, customerId: l.brand.customerId, originalPath: l.originalPath, normalizedPath: l.normalizedPath }));
  }
  if (only.has("images")) {
    const images = await db.generatedImage.findMany({
      where: { OR: [{ originalPath: { not: null } }, { finalPath: { not: null } }] },
      select: { id: true, originalPath: true, finalPath: true, createdAt: true, session: { select: { logo: { select: { brandId: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    input.images = images.map((i) => ({ id: i.id, brandId: i.session.logo.brandId, createdAt: i.createdAt, originalPath: i.originalPath, finalPath: i.finalPath }));
  }
  if (only.has("zalo")) {
    input.zaloMessages = await db.zaloMessage.findMany({ where: { mediaPath: { not: null } }, select: { id: true, mediaPath: true }, orderBy: { createdAt: "asc" } });
    input.zaloAssets = await db.zaloAsset.findMany({ select: { id: true, path: true }, orderBy: { createdAt: "asc" } });
  }
  return input;
}

/** Thông tin kết nối R2 từ .env; nếu thiếu thì báo rõ thiếu biến nào. */
function requireR2Config(): R2Config {
  const missing = missingR2Vars(process.env);
  if (missing.length > 0) {
    throw new Error(`Chạy thật cần cấu hình R2 trong .env, đang thiếu hoặc để trống: ${missing.join(", ")}.
Điền đủ rồi chạy lại, hoặc thêm --dry-run để chỉ xem trước (không cần R2).`);
  }
  const cfg = getR2Config(getEnv());
  if (!cfg) throw new Error("Cấu hình R2 trong .env chưa đủ (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).");
  return cfg;
}

function secretsFromEnv(): (string | undefined)[] {
  const url = process.env.DATABASE_URL;
  let password: string | undefined;
  try {
    password = url ? decodeURIComponent(new URL(url).password) : undefined;
  } catch {
    password = undefined;
  }
  return [url, password, process.env.R2_SECRET_ACCESS_KEY, process.env.R2_ACCESS_KEY_ID];
}

async function run(args: CliArgs, out: (line: string) => void): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL (chạy với --env-file=.env trong thư mục dự án).");

  const sourceDir = path.resolve(args.source ?? process.env.STORAGE_DIR ?? "./storage");
  const st = await fs.stat(sourceDir).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`Thư mục nguồn không tồn tại: ${sourceDir}\nChỉ đúng thư mục ảnh cũ bằng --source <thư mục> (hoặc đặt STORAGE_DIR trong .env).`);

  // Chạy thật: kiểm tra cấu hình R2 và kết nối TRƯỚC khi đụng vào CSDL, để lỗi cấu hình dừng ngay chứ không rải ra từng file.
  let dest: StorageDriver = blockedDest;
  if (!args.dryRun) {
    dest = new R2Storage(requireR2Config());
    try {
      await dest.exists("migrate-probe/does-not-exist");
    } catch (e) {
      throw new Error(`Không kết nối được R2 (kiểm tra R2_ACCOUNT_ID, khóa API, tên bucket, quyền Object Read & Write): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  out(args.dryRun ? "Chế độ DRY-RUN: không gọi R2, không ghi CSDL." : "Chế độ CHẠY THẬT: tải ảnh lên R2 và cập nhật key trong CSDL.");
  out(`Thư mục nguồn: ${sourceDir}`);
  out(`Nhóm: ${args.only.join(", ")}  |  song song: ${args.concurrency}${args.limit ? `  |  --limit ${args.limit} dòng mỗi nhóm` : ""}`);

  const db = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    const input = await loadPlanInput(db, args);
    const plan = buildPlan(input, { only: args.only, limit: args.limit });
    out(`Kế hoạch: ${plan.ops.length} file cần chuyển, ${plan.alreadyNew.length} file đã ở key mới (bỏ qua), ${plan.warnings.length} cảnh báo.`);

    const source = createFsSource(sourceDir);
    const results = await migrate(
      plan.ops,
      { readSource: source.readSource, statSource: source.statSource, dest, db: args.dryRun ? blockedDb : prismaUpdater(db), log: out },
      { dryRun: args.dryRun, concurrency: args.concurrency, onProgress: args.dryRun ? undefined : (done, total) => out(`  đã xử lý ${done}/${total}`) },
    );

    const derived = await countDerivedFiles(sourceDir);
    out("");
    const lines = args.dryRun ? formatDryRunReport(plan, results, { source: sourceDir, derived }) : formatRunReport(plan, results, { source: sourceDir, derived });
    for (const l of lines) out(l);
    return results.some((r) => r.status === "failed" || r.status === "stale") ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 2;
    return;
  }
  if (parsed.help) {
    console.log(HELP);
    return;
  }
  const redact = makeRedactor(secretsFromEnv());
  const out = (line: string) => console.log(redact(line));
  for (const n of parsed.notes) out(n);
  try {
    process.exitCode = await run(parsed.args, out);
  } catch (e) {
    console.error(redact(`LỖI: ${e instanceof Error ? e.message : String(e)}`));
    process.exitCode = 1;
  }
}

void main();
