import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logoKey, materialKey, mockupKey } from "../lib/storage/keys";
import type { PutOptions, StorageDriver } from "../lib/storage/types";
import { DEFAULT_CONCURRENCY, missingR2Vars, parseCliArgs } from "./migrate-args";
import { migrate, type DbUpdater, type MigrateDeps, type OpResult } from "./migrate-exec";
import { countDerivedFiles, createFsSource } from "./migrate-fs";
import {
  buildPlan,
  isNewStyleKey,
  type ImageRow,
  type LogoRow,
  type MaterialRow,
  type MigrationOp,
  type Plan,
  type TableName,
  type ZaloAssetRow,
  type ZaloMessageRow,
} from "./migrate-plan";
import { formatBytes, formatDryRunReport, formatRunReport, formatTable, makeRedactor, summarize } from "./migrate-report";

// ---------- ảnh thật nhỏ để thử nén ----------
let PNG: Buffer;
let JPG: Buffer;
beforeAll(async () => {
  const base = { create: { width: 16, height: 16, channels: 3 as const, background: "#cc3300" } };
  PNG = await sharp(base).png().toBuffer();
  JPG = await sharp(base).jpeg().toBuffer();
});

const isWebp = (b: Buffer) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";

// ---------- dữ liệu mẫu (kiểu cũ) ----------
type MatRow = MaterialRow & { kieRefUrl: string | null; kieRefExpiresAt: Date | null };
type LogoDbRow = LogoRow & { kieUrl: string | null; kieExpiresAt: Date | null };

const mat = (id: string, over: Partial<MatRow> = {}): MatRow => ({
  id,
  code: `Gỗ Óc Chó ${id}`,
  layer1Path: `materials/${id}/layer1-1794808813682.jpg`,
  layer2Path: `materials/${id}/layer2-1794808813682.jpg`,
  referencePath: `materials/${id}/reference-1794808813682.jpg`,
  productPhotoPath: null,
  kieRefUrl: "https://kie.example/old-ref.jpg",
  kieRefExpiresAt: new Date("2030-01-01"),
  ...over,
});
const logo = (id: string, over: Partial<LogoDbRow> = {}): LogoDbRow => ({
  id,
  customerId: `cust-${id}`,
  originalPath: `logos/${id}/original.jpg`,
  normalizedPath: `logos/${id}/normalized.png`,
  kieUrl: "https://kie.example/old-logo.png",
  kieExpiresAt: new Date("2030-01-01"),
  ...over,
});
const img = (id: string, over: Partial<ImageRow> = {}): ImageRow => ({
  id,
  brandId: `brand-${id}`,
  createdAt: new Date(2026, 10, 5, 12),
  originalPath: `images/s1/${id}-original.png`,
  finalPath: `images/s1/${id}-final.jpg`,
  ...over,
});
const zmsg = (id: string, mediaPath: string | null): ZaloMessageRow => ({ id, mediaPath });
const zasset = (id: string, p: string): ZaloAssetRow => ({ id, path: p });

// ---------- isNewStyleKey ----------
describe("isNewStyleKey", () => {
  it("nhận đúng key do keys.ts tạo ra", () => {
    for (let i = 0; i < 30; i++) {
      expect(isNewStyleKey("materials", materialKey("Mã VL-01 Đặc biệt", "layer1"))).toBe(true);
      expect(isNewStyleKey("materials", materialKey("abc", "layer2"))).toBe(true);
      expect(isNewStyleKey("materials", materialKey("abc", "reference"))).toBe(true);
      expect(isNewStyleKey("images", mockupKey("cmwiyd7pb0001s86syw4a075n", new Date(2026, 0, 31)))).toBe(true);
      expect(isNewStyleKey("logos", logoKey("cust1", "png"))).toBe(true);
      expect(isNewStyleKey("logos", logoKey("cust1", "jpeg"))).toBe(true);
      expect(isNewStyleKey("logos", logoKey("cust1", "xyz"))).toBe(true); // đuôi lạ thành .bin
    }
  });

  it("key kiểu cũ thì không phải key mới", () => {
    expect(isNewStyleKey("materials", "materials/cmwiutrvu0004k46sf6i0g8e8/layer1-1794808813682.jpg")).toBe(false);
    expect(isNewStyleKey("materials", "materials/abc/layer1-1794808813682.webp")).toBe(false); // dấu thời gian 13 chữ số của kiểu cũ, dù đã là .webp
    expect(isNewStyleKey("images", "images/s1/i1-final.jpg")).toBe(false);
    expect(isNewStyleKey("images", "images/s1/i1-original.png")).toBe(false);
    expect(isNewStyleKey("logos", "logos/cmwiy1qja000m9o6ssa5ay29z/original.png")).toBe(false);
    expect(isNewStyleKey("logos", "logos/cmwiy1qja000m9o6ssa5ay29z/normalized.png")).toBe(false);
  });

  it("chặt chẽ về độ dài, đuôi, tháng và nhóm", () => {
    expect(isNewStyleKey("materials", "materials/abc/layer1-abcdefghij.jpg")).toBe(false); // sai đuôi
    expect(isNewStyleKey("materials", "materials/abc/layer3-abcdefghij.webp")).toBe(false); // sai vai trò
    expect(isNewStyleKey("materials", "materials/abc/layer1-ABCDEFGHIJ.webp")).toBe(false); // chữ hoa
    expect(isNewStyleKey("materials", "materials/abc/layer1-abcdefghijk.webp")).toBe(false); // 11 ký tự
    expect(isNewStyleKey("images", "mockups/b1/2026-13/abcdefghij012345.webp")).toBe(false); // tháng 13
    expect(isNewStyleKey("images", "mockups/b1/2026-11/abcdefghij01234.webp")).toBe(false); // 15 ký tự
    expect(isNewStyleKey("images", "mockups/b1/2026-11/abcdefghij0123456.webp")).toBe(false); // 17 ký tự
    expect(isNewStyleKey("images", "mockups/b1/2026-11/abcdefghij012345.webp")).toBe(true);
    expect(isNewStyleKey("images", "mockups/b1/2026-11/abcdefghij012345-thumb.webp")).toBe(false); // ảnh thu nhỏ không phải key ảnh
    expect(isNewStyleKey("logos", "logos/c1/abcdefghij012345.png")).toBe(true);
    expect(isNewStyleKey("logos", "logos/c1/abcdefghij01234.png")).toBe(false);
    expect(isNewStyleKey("logos", "logos/c1/abcdefghij012345-ai-v2.png")).toBe(false);
    // key của nhóm này không được tính là key mới của nhóm khác
    expect(isNewStyleKey("images", materialKey("abc", "layer1"))).toBe(false);
    expect(isNewStyleKey("logos", mockupKey("b1"))).toBe(false);
  });

  it("nhóm zalo giữ key cũ nên không bao giờ là 'key mới'", () => {
    expect(isNewStyleKey("zalo", "zalo/c1/8509291697620.jpg")).toBe(false);
    expect(isNewStyleKey("zalo", "zalo-assets/a1.mp4")).toBe(false);
  });
});

// ---------- lập kế hoạch ----------
describe("buildPlan", () => {
  const input = () => ({
    materials: [mat("m1")],
    logos: [logo("l1")],
    images: [img("i1")],
    zaloMessages: [zmsg("zm1", "zalo/c1/111.jpg")],
    zaloAssets: [zasset("za1", "zalo-assets/clip.mp4")],
  });

  it("đủ 4 nhóm, key mới đúng mẫu và không trùng nhau", () => {
    const plan = buildPlan(input());
    expect(plan.rows).toEqual({ materials: 1, logos: 1, images: 1, zalo: 2 });
    expect(plan.ops).toHaveLength(3 + 2 + 2 + 2);
    for (const o of plan.ops) {
      if (o.kind === "zalo") continue;
      expect(isNewStyleKey(o.kind, o.newKey)).toBe(true);
      expect(o.newKey).not.toBe(o.oldKey);
    }
    const nonZalo = plan.ops.filter((o) => o.kind !== "zalo").map((o) => o.newKey);
    expect(new Set(nonZalo).size).toBe(nonZalo.length);
  });

  it("materials: key theo mã chất liệu và vai trò, nén WebP", () => {
    const ops = buildPlan(input(), { only: ["materials"] }).ops;
    expect(ops.map((o) => [o.table, o.column, o.transform])).toEqual([
      ["materials", "layer1Path", "webp"],
      ["materials", "layer2Path", "webp"],
      ["materials", "referencePath", "webp"],
    ]);
    expect(ops[0].newKey).toMatch(/^materials\/go-oc-cho-m1\/layer1-[a-z0-9]{10}\.webp$/);
    expect(ops[1].newKey).toMatch(/^materials\/go-oc-cho-m1\/layer2-[a-z0-9]{10}\.webp$/);
    expect(ops[2].newKey).toMatch(/^materials\/go-oc-cho-m1\/reference-[a-z0-9]{10}\.webp$/);
    expect(ops[0].oldKey).toBe("materials/m1/layer1-1794808813682.jpg");
    expect(ops.every((o) => o.rowId === "m1")).toBe(true);
  });

  it("logos: customerId đúng, giữ đuôi gốc cho file gốc và png cho bản chuẩn hóa, sao chép nguyên văn", () => {
    const ops = buildPlan({ logos: [logo("l1", { customerId: "custX", originalPath: "logos/l1/original.webp" }), logo("l2", { originalPath: "logos/l2/original.jpeg" })] }, { only: ["logos"] }).ops;
    expect(ops).toHaveLength(4);
    expect(ops.every((o) => o.transform === "copy" && o.table === "logos")).toBe(true);
    expect(ops[0]).toMatchObject({ rowId: "l1", column: "originalPath", oldKey: "logos/l1/original.webp" });
    expect(ops[0].newKey).toMatch(/^logos\/custX\/[a-z0-9]{16}\.webp$/);
    expect(ops[1]).toMatchObject({ column: "normalizedPath" });
    expect(ops[1].newKey).toMatch(/^logos\/custX\/[a-z0-9]{16}\.png$/);
    expect(ops[2].newKey).toMatch(/^logos\/cust-l2\/[a-z0-9]{16}\.jpg$/); // jpeg -> jpg như logoKey
  });

  it("images: brandId và tháng theo ngày tạo, nén WebP, ảnh gốc và ảnh hoàn thiện khác key", () => {
    const ops = buildPlan({ images: [img("i1", { brandId: "brandZ", createdAt: new Date(2026, 2, 9, 10) })] }, { only: ["images"] }).ops;
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.transform === "webp" && o.table === "generated_images")).toBe(true);
    expect(ops[0]).toMatchObject({ column: "originalPath", oldKey: "images/s1/i1-original.png" });
    expect(ops[1]).toMatchObject({ column: "finalPath", oldKey: "images/s1/i1-final.jpg" });
    for (const o of ops) expect(o.newKey).toMatch(/^mockups\/brandZ\/2026-03\/[a-z0-9]{16}\.webp$/);
    expect(ops[0].newKey).not.toBe(ops[1].newKey);
  });

  it("images: chỉ xử lý dòng có đường dẫn; dòng chỉ có một đường dẫn thì chỉ một thao tác", () => {
    const plan = buildPlan({ images: [img("i1", { originalPath: null, finalPath: null }), img("i2", { originalPath: null })] });
    expect(plan.rows.images).toBe(1);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ rowId: "i2", column: "finalPath" });
  });

  it("zalo: giữ nguyên key, sao chép nguyên văn", () => {
    const ops = buildPlan(input(), { only: ["zalo"] }).ops;
    expect(ops).toEqual([
      { kind: "zalo", table: "zalo_messages", rowId: "zm1", column: "mediaPath", oldKey: "zalo/c1/111.jpg", newKey: "zalo/c1/111.jpg", transform: "copy" },
      { kind: "zalo", table: "zalo_assets", rowId: "za1", column: "path", oldKey: "zalo-assets/clip.mp4", newKey: "zalo-assets/clip.mp4", transform: "copy" },
    ]);
  });

  it("zalo: cùng một key chỉ sao chép một lần; key mockup/logo/chất liệu (tin bot gửi ảnh thành phẩm) coi như đã ở dạng mới", () => {
    const mk = mockupKey("b1");
    const plan = buildPlan({ zaloMessages: [zmsg("a", "zalo/c1/1.jpg"), zmsg("b", "zalo/c1/1.jpg"), zmsg("c", mk), zmsg("d", null)] });
    expect(plan.ops.map((o) => o.rowId)).toEqual(["a"]);
    expect(plan.alreadyNew.map((n) => n.key)).toEqual([mk]);
  });

  it("bỏ qua key đã ở dạng mới (chạy lại), chỉ làm phần còn lại của dòng", () => {
    const l1 = materialKey("m1", "layer1");
    const plan = buildPlan({
      materials: [mat("m1", { layer1Path: l1 }), mat("m2", { layer1Path: materialKey("m2", "layer1"), layer2Path: materialKey("m2", "layer2"), referencePath: materialKey("m2", "reference") })],
      logos: [logo("l1", { originalPath: logoKey("c1", "png"), normalizedPath: logoKey("c1", "png") })],
      images: [img("i1", { originalPath: mockupKey("b1"), finalPath: mockupKey("b1") })],
    });
    expect(plan.ops.map((o) => `${o.rowId}.${o.column}`)).toEqual(["m1.layer2Path", "m1.referencePath"]);
    expect(plan.alreadyNew).toHaveLength(1 + 3 + 2 + 2);
    expect(plan.rows).toMatchObject({ materials: 2, logos: 1, images: 1 });
  });

  it("productPhotoPath: không chuyển, không đoán; chỉ cảnh báo", () => {
    const plan = buildPlan({ materials: [mat("m1", { layer1Path: null, layer2Path: null, referencePath: null, productPhotoPath: "materials/m1/product-1.jpg" })] });
    expect(plan.ops).toHaveLength(0);
    expect(plan.rows.materials).toBe(1);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatchObject({ column: "productPhotoPath", key: "materials/m1/product-1.jpg" });
    expect(plan.warnings[0].message).toContain("productPhotoPath");
  });

  it("--only chỉ lập kế hoạch cho nhóm được chọn", () => {
    const plan = buildPlan(input(), { only: ["logos", "images"] });
    expect(new Set(plan.ops.map((o) => o.kind))).toEqual(new Set(["logos", "images"]));
    expect(plan.rows.materials).toBe(0);
  });

  it("--limit: tối đa N dòng còn việc mỗi nhóm; dòng đã xong không tính vào N", () => {
    const rows = [
      mat("m0", { layer1Path: materialKey("m0", "layer1"), layer2Path: materialKey("m0", "layer2"), referencePath: materialKey("m0", "reference") }), // đã xong
      mat("m1"),
      mat("m2"),
      mat("m3"),
    ];
    const plan = buildPlan({ materials: rows, logos: [logo("l1"), logo("l2")] }, { limit: 2 });
    expect([...new Set(plan.ops.filter((o) => o.kind === "materials").map((o) => o.rowId))]).toEqual(["m1", "m2"]);
    expect([...new Set(plan.ops.filter((o) => o.kind === "logos").map((o) => o.rowId))]).toEqual(["l1", "l2"]);
    expect(plan.limited).toBe(true);
    expect(buildPlan({ materials: rows }, { limit: 10 }).limited).toBe(false);
  });

  it("mỗi lần lập kế hoạch cho ra key khác (ngẫu nhiên) nhưng luôn đúng mẫu", () => {
    const a = buildPlan({ images: [img("i1")] }).ops[0].newKey;
    const b = buildPlan({ images: [img("i1")] }).ops[0].newKey;
    expect(a).not.toBe(b);
  });
});

// ---------- thực thi với đối tượng giả ----------
type World = {
  src: Map<string, Buffer>;
  r2: Map<string, { data: Buffer; contentType?: string }>;
  calls: { put: string[]; exists: string[]; get: string[]; delete: string[]; read: string[]; stat: string[]; update: { table: TableName; rowId: string }[] };
  /** key mới mà put sẽ báo lỗi */
  failPut: Set<string>;
  /** key mới mà put báo thành công nhưng thực ra không lưu (để thử bước kiểm tra tồn tại) */
  ghost: Set<string>;
  failDb: Set<string>;
  tables: { materials: MatRow[]; logos: LogoDbRow[]; images: ImageRow[]; zaloMessages: ZaloMessageRow[]; zaloAssets: ZaloAssetRow[] };
  deps: MigrateDeps;
  plan: () => Plan;
};

function createWorld(tables: World["tables"], sources: Record<string, Buffer>): World {
  const src = new Map(Object.entries(sources));
  const r2 = new Map<string, { data: Buffer; contentType?: string }>();
  const calls: World["calls"] = { put: [], exists: [], get: [], delete: [], read: [], stat: [], update: [] };
  const failPut = new Set<string>();
  const ghost = new Set<string>();
  const failDb = new Set<string>();

  const dest: StorageDriver = {
    async put(key: string, data: Buffer, opts?: PutOptions) {
      calls.put.push(key);
      if (failPut.has(key)) throw new Error(`R2 từ chối ${key}`);
      if (!ghost.has(key)) r2.set(key, { data, contentType: opts?.contentType });
    },
    async get(key: string) {
      calls.get.push(key);
      const f = r2.get(key);
      if (!f) throw new Error("không có");
      return f.data;
    },
    async exists(key: string) {
      calls.exists.push(key);
      return r2.has(key);
    },
    async delete(key: string) {
      calls.delete.push(key);
      r2.delete(key);
    },
  };

  const rowsOf = (t: TableName): ({ id: string } & Record<string, unknown>)[] => {
    const map = { materials: tables.materials, logos: tables.logos, generated_images: tables.images, zalo_messages: tables.zaloMessages, zalo_assets: tables.zaloAssets };
    return map[t] as unknown as ({ id: string } & Record<string, unknown>)[];
  };
  const db: DbUpdater = {
    async updateRow(table, rowId, expected, data) {
      calls.update.push({ table, rowId });
      if (failDb.has(rowId)) throw new Error("mất kết nối CSDL");
      const row = rowsOf(table).find((r) => r.id === rowId);
      if (!row) return false;
      if (Object.entries(expected).some(([col, v]) => row[col] !== v)) return false;
      Object.assign(row, data);
      return true;
    },
  };

  const deps: MigrateDeps = {
    async readSource(key) {
      calls.read.push(key);
      return src.get(key) ?? null;
    },
    async statSource(key) {
      calls.stat.push(key);
      const b = src.get(key);
      return b ? { size: b.length } : null;
    },
    dest,
    db,
  };

  return {
    src,
    r2,
    calls,
    failPut,
    ghost,
    failDb,
    tables,
    deps,
    plan: () => buildPlan({ materials: tables.materials, logos: tables.logos, images: tables.images, zaloMessages: tables.zaloMessages, zaloAssets: tables.zaloAssets }),
  };
}

const opOf = (ops: MigrationOp[], rowId: string, column: string) => ops.find((o) => o.rowId === rowId && o.column === column)!;
const statusOf = (results: OpResult[], rowId: string, column: string) => results.find((r) => r.op.rowId === rowId && r.op.column === column)!.status;

/** Thế giới đầy đủ 4 nhóm, mọi file nguồn đều có. */
function fullWorld(): World {
  const tables: World["tables"] = {
    materials: [mat("m1")],
    logos: [logo("l1")],
    images: [img("i1")],
    zaloMessages: [zmsg("zm1", "zalo/c1/111.jpg")],
    zaloAssets: [zasset("za1", "zalo-assets/clip.mp4")],
  };
  return createWorld(tables, {
    "materials/m1/layer1-1794808813682.jpg": JPG,
    "materials/m1/layer2-1794808813682.jpg": JPG,
    "materials/m1/reference-1794808813682.jpg": JPG,
    "logos/l1/original.jpg": JPG,
    "logos/l1/normalized.png": PNG,
    "images/s1/i1-original.png": PNG,
    "images/s1/i1-final.jpg": JPG,
    "zalo/c1/111.jpg": JPG,
    "zalo-assets/clip.mp4": Buffer.from("video-bytes"),
  });
}

const RUN = { dryRun: false, concurrency: 3 } as const;

describe("migrate (chạy thật)", () => {
  it("chuyển cả 4 nhóm, cập nhật CSDL sang key mới và xóa URL kie.ai cũ", async () => {
    const w = fullWorld();
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, RUN);
    expect(results.every((r) => r.status === "migrated")).toBe(true);

    const m = w.tables.materials[0];
    for (const col of ["layer1Path", "layer2Path", "referencePath"] as const) {
      expect(isNewStyleKey("materials", m[col]!)).toBe(true);
      expect(w.r2.has(m[col]!)).toBe(true);
    }
    expect(m.kieRefUrl).toBeNull();
    expect(m.kieRefExpiresAt).toBeNull();

    const l = w.tables.logos[0];
    expect(isNewStyleKey("logos", l.originalPath)).toBe(true);
    expect(l.originalPath).toMatch(/^logos\/cust-l1\/[a-z0-9]{16}\.jpg$/);
    expect(l.normalizedPath).toMatch(/^logos\/cust-l1\/[a-z0-9]{16}\.png$/);
    expect(l.kieUrl).toBeNull();
    expect(l.kieExpiresAt).toBeNull();

    const i = w.tables.images[0];
    expect(i.originalPath).toMatch(/^mockups\/brand-i1\/2026-11\/[a-z0-9]{16}\.webp$/);
    expect(i.finalPath).toMatch(/^mockups\/brand-i1\/2026-11\/[a-z0-9]{16}\.webp$/);
    expect(i.originalPath).not.toBe(i.finalPath);
  });

  it("logo sao chép nguyên byte (đúng định dạng và loại nội dung), ảnh mockup và chất liệu đã thành WebP", async () => {
    const w = fullWorld();
    const plan = w.plan();
    await migrate(plan.ops, w.deps, RUN);

    const l = w.tables.logos[0];
    const orig = w.r2.get(l.originalPath)!;
    expect(orig.data.equals(JPG)).toBe(true);
    expect(orig.contentType).toBe("image/jpeg");
    const norm = w.r2.get(l.normalizedPath)!;
    expect(norm.data.equals(PNG)).toBe(true);
    expect(norm.contentType).toBe("image/png");

    const i = w.tables.images[0];
    for (const key of [i.originalPath!, i.finalPath!]) {
      const f = w.r2.get(key)!;
      expect(isWebp(f.data)).toBe(true);
      expect(f.contentType).toBe("image/webp");
      expect((await sharp(f.data).metadata()).format).toBe("webp");
    }
    const m = w.tables.materials[0];
    expect(isWebp(w.r2.get(m.layer1Path!)!.data)).toBe(true);
    expect(w.r2.get(m.referencePath!)!.contentType).toBe("image/webp");
  });

  it("nhóm zalo giữ nguyên key, sao chép nguyên byte, CSDL không đổi và không bị gọi", async () => {
    const w = fullWorld();
    const plan = w.plan();
    await migrate(plan.ops, w.deps, RUN);
    expect(w.tables.zaloMessages[0].mediaPath).toBe("zalo/c1/111.jpg");
    expect(w.tables.zaloAssets[0].path).toBe("zalo-assets/clip.mp4");
    expect(w.r2.get("zalo/c1/111.jpg")!.data.equals(JPG)).toBe(true);
    expect(w.r2.get("zalo/c1/111.jpg")!.contentType).toBe("image/jpeg");
    expect(w.r2.get("zalo-assets/clip.mp4")!.data.toString()).toBe("video-bytes");
    expect(w.r2.get("zalo-assets/clip.mp4")!.contentType).toBe("video/mp4");
    expect(w.calls.update.some((u) => u.table === "zalo_messages" || u.table === "zalo_assets")).toBe(false);
  });

  it("mỗi dòng ghi CSDL đúng một lần (gộp các cột)", async () => {
    const w = fullWorld();
    await migrate(w.plan().ops, w.deps, RUN);
    expect(w.calls.update.map((u) => `${u.table}:${u.rowId}`).sort()).toEqual(["generated_images:i1", "logos:l1", "materials:m1"]);
  });

  it("CSDL chỉ được cập nhật khi upload thành công; lỗi một file không dừng các file khác", async () => {
    const tables: World["tables"] = { materials: [mat("m1"), mat("m2")], logos: [logo("l1")], images: [img("i1")], zaloMessages: [], zaloAssets: [] };
    const w = createWorld(tables, {
      "materials/m1/layer1-1794808813682.jpg": JPG,
      "materials/m1/layer2-1794808813682.jpg": JPG,
      "materials/m1/reference-1794808813682.jpg": JPG,
      "materials/m2/layer1-1794808813682.jpg": JPG,
      "materials/m2/layer2-1794808813682.jpg": JPG,
      "materials/m2/reference-1794808813682.jpg": JPG,
      "logos/l1/original.jpg": JPG,
      "logos/l1/normalized.png": PNG,
      "images/s1/i1-original.png": PNG,
      "images/s1/i1-final.jpg": JPG,
    });
    const plan = w.plan();
    const badLayer1 = opOf(plan.ops, "m2", "layer1Path");
    const badFinal = opOf(plan.ops, "i1", "finalPath");
    const ghostRef = opOf(plan.ops, "m2", "referencePath");
    w.failPut.add(badLayer1.newKey);
    w.failPut.add(badFinal.newKey);
    w.ghost.add(ghostRef.newKey);

    const results = await migrate(plan.ops, w.deps, RUN);

    expect(statusOf(results, "m2", "layer1Path")).toBe("failed");
    expect(results.find((r) => r.op === badLayer1)!.error).toContain("R2 từ chối");
    expect(statusOf(results, "m2", "referencePath")).toBe("failed"); // put "thành công" nhưng không thấy file
    expect(results.find((r) => r.op === ghostRef)!.error).toContain("không thấy file");
    expect(statusOf(results, "i1", "finalPath")).toBe("failed");

    // cột lỗi giữ key cũ; cột thành công cùng dòng vẫn được cập nhật
    const m2 = tables.materials[1];
    expect(m2.layer1Path).toBe("materials/m2/layer1-1794808813682.jpg");
    expect(m2.referencePath).toBe("materials/m2/reference-1794808813682.jpg");
    expect(isNewStyleKey("materials", m2.layer2Path!)).toBe(true);
    const i1 = tables.images[0];
    expect(i1.finalPath).toBe("images/s1/i1-final.jpg");
    expect(isNewStyleKey("images", i1.originalPath!)).toBe(true);
    // các dòng khác không bị ảnh hưởng
    expect(tables.materials[0].layer1Path).toBe(opOf(plan.ops, "m1", "layer1Path").newKey);
    expect(isNewStyleKey("logos", tables.logos[0].originalPath)).toBe(true);
    // key đã đặt cho cột lỗi không được ghi vào CSDL
    const dbKeys = JSON.stringify(tables);
    expect(dbKeys).not.toContain(badLayer1.newKey);
    expect(dbKeys).not.toContain(badFinal.newKey);
    expect(dbKeys).not.toContain(ghostRef.newKey);
  });

  it("thiếu file nguồn: bỏ qua, ghi nhận 'missing', không đụng CSDL dòng đó", async () => {
    const tables: World["tables"] = { materials: [mat("m1", { layer2Path: null, referencePath: null })], logos: [logo("l1")], images: [], zaloMessages: [zmsg("zm1", "zalo/c1/gone.jpg")], zaloAssets: [] };
    const w = createWorld(tables, { "logos/l1/original.jpg": JPG, "logos/l1/normalized.png": PNG }); // thiếu ảnh chất liệu và file zalo
    const before = JSON.stringify(tables.materials);
    const results = await migrate(w.plan().ops, w.deps, RUN);
    expect(statusOf(results, "m1", "layer1Path")).toBe("missing");
    expect(statusOf(results, "zm1", "mediaPath")).toBe("missing");
    expect(JSON.stringify(tables.materials)).toBe(before);
    expect(w.calls.update.map((u) => u.table)).toEqual(["logos"]);
    expect(w.calls.put).toHaveLength(2); // chỉ hai file logo
    expect(results.filter((r) => r.status === "missing").every((r) => !r.error)).toBe(true);
  });

  it("file nguồn rỗng (0 byte) là lỗi, không tải lên", async () => {
    const tables: World["tables"] = { materials: [], logos: [logo("l1")], images: [], zaloMessages: [], zaloAssets: [] };
    const w = createWorld(tables, { "logos/l1/original.jpg": Buffer.alloc(0), "logos/l1/normalized.png": PNG });
    const results = await migrate(w.plan().ops, w.deps, RUN);
    expect(statusOf(results, "l1", "originalPath")).toBe("failed");
    expect(statusOf(results, "l1", "normalizedPath")).toBe("migrated");
    expect(tables.logos[0].originalPath).toBe("logos/l1/original.jpg");
    expect(w.calls.put).toHaveLength(1);
  });

  it("nén WebP hỏng (file không phải ảnh) là lỗi của file đó, các file khác vẫn chạy", async () => {
    const tables: World["tables"] = { materials: [mat("m1", { layer2Path: null, referencePath: null }), mat("m2", { layer2Path: null, referencePath: null })], logos: [], images: [], zaloMessages: [], zaloAssets: [] };
    const w = createWorld(tables, { "materials/m1/layer1-1794808813682.jpg": Buffer.from("không phải ảnh"), "materials/m2/layer1-1794808813682.jpg": JPG });
    const results = await migrate(w.plan().ops, w.deps, RUN);
    expect(statusOf(results, "m1", "layer1Path")).toBe("failed");
    expect(statusOf(results, "m2", "layer1Path")).toBe("migrated");
    expect(tables.materials[0].layer1Path).toBe("materials/m1/layer1-1794808813682.jpg");
    expect(w.calls.put).toHaveLength(1);
  });

  it("lỗi ghi CSDL: file đã tải lên được báo là mồ côi, key cũ còn nguyên", async () => {
    const w = fullWorld();
    w.failDb.add("l1");
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, RUN);
    const logoResults = results.filter((r) => r.op.table === "logos");
    expect(logoResults.every((r) => r.status === "failed" && r.orphan === true)).toBe(true);
    expect(logoResults[0].error).toContain("mất kết nối CSDL");
    expect(w.tables.logos[0].originalPath).toBe("logos/l1/original.jpg");
    expect(results.filter((r) => r.op.table === "materials").every((r) => r.status === "migrated")).toBe(true);
    // không tự xóa file đã tải lên (không chắc CSDL chưa nhận)
    expect(w.calls.delete).toHaveLength(0);
  });

  it("dòng đã bị đổi trong lúc chạy thì không ghi đè (stale)", async () => {
    const w = fullWorld();
    const plan = w.plan();
    w.tables.logos[0].originalPath = "logos/l1/original-moi.png"; // web vừa đổi logo
    const results = await migrate(plan.ops.filter((o) => o.kind === "logos"), w.deps, RUN);
    expect(results.every((r) => r.status === "stale" && r.orphan)).toBe(true);
    expect(w.tables.logos[0].originalPath).toBe("logos/l1/original-moi.png");
    expect(w.tables.logos[0].kieUrl).not.toBeNull();
  });

  it("chạy lại lần hai không làm gì thêm (không tải lên lần hai)", async () => {
    const w = fullWorld();
    await migrate(w.plan().ops, w.deps, RUN);
    const putsAfterFirst = w.calls.put.length;
    const r2KeysAfterFirst = [...w.r2.keys()].sort();

    const plan2 = w.plan();
    // chỉ còn nhóm zalo (key giữ nguyên) trong kế hoạch; materials/logos/images đã ở key mới
    expect(new Set(plan2.ops.map((o) => o.kind))).toEqual(new Set(["zalo"]));
    const results2 = await migrate(plan2.ops, w.deps, RUN);
    expect(results2.every((r) => r.status === "present")).toBe(true);
    expect(w.calls.put).toHaveLength(putsAfterFirst);
    expect([...w.r2.keys()].sort()).toEqual(r2KeysAfterFirst);
    expect(w.calls.update).toHaveLength(3); // vẫn chỉ ba lần ghi CSDL của lần đầu
  });

  it("chạy lại sau lỗi chỉ làm phần chưa xong", async () => {
    const w = fullWorld();
    const plan = w.plan();
    const bad = opOf(plan.ops, "m1", "referencePath");
    w.failPut.add(bad.newKey);
    const first = await migrate(plan.ops, w.deps, RUN);
    expect(statusOf(first, "m1", "referencePath")).toBe("failed");

    w.failPut.clear();
    const putsBefore = w.calls.put.length;
    const plan2 = w.plan();
    expect(plan2.ops.filter((o) => o.kind !== "zalo").map((o) => `${o.rowId}.${o.column}`)).toEqual(["m1.referencePath"]);
    const second = await migrate(plan2.ops, w.deps, RUN);
    expect(statusOf(second, "m1", "referencePath")).toBe("migrated");
    expect(isNewStyleKey("materials", w.tables.materials[0].referencePath!)).toBe(true);
    // lần hai chỉ tải 1 file (cột đã lỗi); zalo có sẵn nên không tải lại
    expect(w.calls.put.length - putsBefore).toBe(1);
  });

  it("giới hạn song song theo --concurrency", async () => {
    const mats = Array.from({ length: 12 }, (_, n) => mat(`m${n}`, { layer2Path: null, referencePath: null }));
    const sources = Object.fromEntries(mats.map((m) => [m.layer1Path!, JPG]));
    const w = createWorld({ materials: mats, logos: [], images: [], zaloMessages: [], zaloAssets: [] }, sources);
    let active = 0;
    let peak = 0;
    const slowDest: StorageDriver = {
      ...w.deps.dest,
      async put(key, data, opts) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        await w.deps.dest.put(key, data, opts);
        active--;
      },
    };
    const results = await migrate(w.plan().ops, { ...w.deps, dest: slowDest }, { dryRun: false, concurrency: 3 });
    expect(results.every((r) => r.status === "migrated")).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("báo tiến độ định kỳ và khi xong", async () => {
    const mats = Array.from({ length: 5 }, (_, n) => mat(`m${n}`, { layer2Path: null, referencePath: null }));
    const w = createWorld({ materials: mats, logos: [], images: [], zaloMessages: [], zaloAssets: [] }, Object.fromEntries(mats.map((m) => [m.layer1Path!, JPG])));
    const seen: [number, number][] = [];
    await migrate(w.plan().ops, w.deps, { dryRun: false, concurrency: 1, progressEvery: 2, onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
  });
});

// ---------- dry-run ----------
describe("migrate (dry-run)", () => {
  it("không gọi đích ghi, không đọc nội dung file, không cập nhật CSDL; chỉ stat nguồn", async () => {
    const w = fullWorld();
    w.src.delete("materials/m1/layer2-1794808813682.jpg"); // một file nguồn thiếu
    const snapshot = JSON.stringify(w.tables);
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, { dryRun: true, concurrency: 4 });

    expect(w.calls.put).toHaveLength(0);
    expect(w.calls.exists).toHaveLength(0);
    expect(w.calls.get).toHaveLength(0);
    expect(w.calls.delete).toHaveLength(0);
    expect(w.calls.update).toHaveLength(0);
    expect(w.calls.read).toHaveLength(0);
    expect(w.calls.stat).toHaveLength(plan.ops.length);
    expect(w.r2.size).toBe(0);
    expect(JSON.stringify(w.tables)).toBe(snapshot);

    expect(statusOf(results, "m1", "layer2Path")).toBe("missing");
    expect(results.filter((r) => r.status === "planned")).toHaveLength(plan.ops.length - 1);
  });

  it("báo cáo: bảng theo nhóm, ví dụ key cũ -> key mới, cảnh báo thiếu nguồn và productPhotoPath, file phái sinh", async () => {
    const tables: World["tables"] = {
      materials: [mat("m1"), mat("m2", { layer1Path: materialKey("m2", "layer1"), layer2Path: null, referencePath: null, productPhotoPath: "materials/m2/photo.jpg" })],
      logos: [logo("l1")],
      images: [img("i1")],
      zaloMessages: [zmsg("zm1", "zalo/c1/111.jpg")],
      zaloAssets: [],
    };
    const w = createWorld(tables, {
      "materials/m1/layer1-1794808813682.jpg": Buffer.alloc(2048),
      "materials/m1/reference-1794808813682.jpg": Buffer.alloc(1024),
      "logos/l1/original.jpg": Buffer.alloc(100),
      "logos/l1/normalized.png": Buffer.alloc(100),
      "images/s1/i1-original.png": Buffer.alloc(500),
      "images/s1/i1-final.jpg": Buffer.alloc(500),
      "zalo/c1/111.jpg": Buffer.alloc(300),
    }); // thiếu layer2 của m1
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, { dryRun: true, concurrency: 2 });
    const sum = summarize(plan, results);
    expect(sum.materials).toMatchObject({ rows: 2, planned: 2, missing: 1, alreadyNew: 1, bytesIn: 3072 });
    expect(sum.logos).toMatchObject({ rows: 1, planned: 2, bytesIn: 200 });
    expect(sum.images).toMatchObject({ rows: 1, planned: 2, bytesIn: 1000 });
    expect(sum.zalo).toMatchObject({ rows: 1, planned: 1, bytesIn: 300 });

    const text = formatDryRunReport(plan, results, { source: "C:\\anh-cu", derived: { thumbs: 7, aiLogos: 2 } }).join("\n");
    expect(text).toContain("DRY-RUN");
    expect(text).toContain("C:\\anh-cu");
    for (const k of ["materials", "logos", "images", "zalo"]) expect(text).toContain(k);
    expect(text).toContain("materials/m1/layer1-1794808813682.jpg  ->  materials/go-oc-cho-m1/layer1-");
    expect(text).toContain("zalo/c1/111.jpg  (giữ nguyên key)");
    expect(text).toContain("ví dụ ngẫu nhiên");
    expect(text).toContain("THIẾU");
    expect(text).toContain("materials/m1/layer2-1794808813682.jpg");
    expect(text).toContain("productPhotoPath");
    expect(text).toContain("7 ảnh thu nhỏ cũ");
    expect(text).toContain(".secret-key");
    expect(text).toContain("KHÔNG xóa");
  });

  it("báo cáo chỉ liệt kê tối đa ~10 ví dụ mỗi nhóm", async () => {
    const mats = Array.from({ length: 8 }, (_, n) => mat(`m${n}`));
    const sources = Object.fromEntries(mats.flatMap((m) => [m.layer1Path!, m.layer2Path!, m.referencePath!]).map((k) => [k, JPG]));
    const w = createWorld({ materials: mats, logos: [], images: [], zaloMessages: [], zaloAssets: [] }, sources);
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, { dryRun: true, concurrency: 2 });
    const text = formatDryRunReport(plan, results, { source: "x" }).join("\n");
    expect(text.split("\n").filter((l) => l.includes("  ->  materials/"))).toHaveLength(10);
  });
});

describe("báo cáo chạy thật", () => {
  it("tóm tắt lỗi, file thiếu, file mồ côi và nhắc giữ .secret-key", async () => {
    const w = fullWorld();
    w.src.delete("logos/l1/normalized.png");
    const plan = w.plan();
    w.failDb.add("m1");
    const results = await migrate(plan.ops, w.deps, RUN);
    const text = formatRunReport(plan, results, { source: "S" }).join("\n");
    expect(text).toContain("KẾT QUẢ");
    expect(text).toContain("1 file nguồn THIẾU");
    expect(text).toContain("LỖI: 3 file");
    expect(text).toContain("CSDL không trỏ tới");
    expect(text).toContain(".secret-key");
    expect(text).not.toContain("Bước tiếp theo"); // còn lỗi thì chưa gợi ý chuyển sang R2
  });

  it("không còn lỗi thì gợi ý bước tiếp theo", async () => {
    const w = fullWorld();
    const plan = w.plan();
    const results = await migrate(plan.ops, w.deps, RUN);
    const text = formatRunReport(plan, results, { source: "S" }).join("\n");
    expect(text).toContain("STORAGE_DRIVER=r2");
  });
});

describe("tiện ích báo cáo", () => {
  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("formatTable căn cột", () => {
    const t = formatTable(["Nhóm", "Dòng"], [["materials", "12"], ["zalo", "3"]]);
    expect(t).toHaveLength(4);
    expect(new Set(t.map((l) => l.length)).size).toBe(1);
  });

  it("makeRedactor che bí mật, bỏ qua chuỗi quá ngắn", () => {
    const redact = makeRedactor(["mysql://root:matkhau-dai-123@127.0.0.1:3306/db", "matkhau-dai-123", "ab", undefined]);
    expect(redact("lỗi kết nối mysql://root:matkhau-dai-123@127.0.0.1:3306/db và matkhau-dai-123 ab")).toBe("lỗi kết nối *** và *** ab");
  });
});

// ---------- tham số dòng lệnh ----------
describe("parseCliArgs", () => {
  it("mặc định là chạy thật, song song 4, mọi nhóm", () => {
    const r = parseCliArgs([]);
    expect(r).toMatchObject({ ok: true, help: false, args: { dryRun: false, source: undefined, concurrency: DEFAULT_CONCURRENCY, limit: undefined, only: ["materials", "logos", "images", "zalo"] } });
  });

  it("đọc đủ các cờ", () => {
    const r = parseCliArgs(["--dry-run", "--source", "./cu", "--concurrency", "8", "--limit", "5", "--only", "images,logos"]);
    expect(r).toMatchObject({ ok: true, args: { dryRun: true, source: "./cu", concurrency: 8, limit: 5, only: ["logos", "images"] } });
    expect(parseCliArgs(["--source=./cu", "--limit=3"])).toMatchObject({ ok: true, args: { source: "./cu", limit: 3 } });
  });

  it("--concurrency quá lớn bị hạ về 16 kèm ghi chú", () => {
    const r = parseCliArgs(["--concurrency", "99"]);
    expect(r).toMatchObject({ ok: true, args: { concurrency: 16 } });
    expect(r.ok && r.notes[0]).toContain("16");
  });

  it("--help", () => {
    expect(parseCliArgs(["--help"])).toMatchObject({ ok: true, help: true });
    expect(parseCliArgs(["-h"])).toMatchObject({ ok: true, help: true });
  });

  it("từ chối tham số sai bằng thông báo tiếng Việt", () => {
    for (const argv of [["--concurrency", "0"], ["--concurrency", "abc"], ["--limit", "-1"], ["--only", "anh"], ["--only", ""], ["--khong-co"], ["thua"], ["--source", " "]]) {
      const r = parseCliArgs(argv);
      expect(r.ok, argv.join(" ")).toBe(false);
    }
    const bad = parseCliArgs(["--only", "logos,xyz"]);
    expect(!bad.ok && bad.error).toContain("xyz");
  });
});

describe("missingR2Vars", () => {
  const full = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b", R2_PUBLIC_URL: "https://pub.example" };
  it("đủ thì không thiếu gì; nhận R2_BUCKET_PUBLIC (tên cũ) khi không có R2_BUCKET", () => {
    expect(missingR2Vars(full)).toEqual([]);
    expect(missingR2Vars({ ...full, R2_BUCKET: undefined, R2_BUCKET_PUBLIC: "b" })).toEqual([]);
  });
  it("liệt kê đúng biến thiếu hoặc để trống", () => {
    expect(missingR2Vars({})).toEqual(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]);
    expect(missingR2Vars({ ...full, R2_SECRET_ACCESS_KEY: "", R2_PUBLIC_URL: undefined })).toEqual(["R2_SECRET_ACCESS_KEY", "R2_PUBLIC_URL"]);
  });
});

// ---------- đọc file nguồn thật (thư mục tạm) ----------
describe("createFsSource / countDerivedFiles", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-r2-test-"));
    const put = async (key: string, data: string) => {
      const full = path.join(dir, ...key.split("/"));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data);
    };
    await put("logos/l1/original.png", "abc");
    await put("logos/l1/normalized.png", "abcd");
    await put("logos/l1/normalized-ai-v2.png", "x");
    await put("images/s1/i1-final.jpg", "1");
    await put("images/s1/i1-final-thumb.jpg", "1");
    await put("images/s1/i2-final-mwj05hog-thumb.jpg", "1");
    await put("images/s1/i2-final-mwj05hog.jpg", "1");
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("đọc và stat file có, trả null khi thiếu hoặc là thư mục", async () => {
    const s = createFsSource(dir);
    expect((await s.readSource("logos/l1/original.png"))!.toString()).toBe("abc");
    expect(await s.statSource("logos/l1/normalized.png")).toEqual({ size: 4 });
    expect(await s.readSource("logos/l1/khong-co.png")).toBeNull();
    expect(await s.statSource("khong/co/thu-muc/x.png")).toBeNull();
    expect(await s.statSource("logos/l1")).toBeNull();
    expect(await s.readSource("logos/l1")).toBeNull();
  });

  it("từ chối key thoát ra ngoài thư mục nguồn", async () => {
    const s = createFsSource(dir);
    await expect(s.readSource("../ngoai.txt")).rejects.toThrow();
    await expect(s.statSource("logos/../../x")).rejects.toThrow();
  });

  it("đếm ảnh thu nhỏ cũ và bản logo gửi AI", async () => {
    expect(await countDerivedFiles(dir)).toEqual({ thumbs: 2, aiLogos: 1 });
    expect(await countDerivedFiles(path.join(dir, "khong-co"))).toEqual({ thumbs: 0, aiLogos: 0 });
  });
});
