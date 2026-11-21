/**
 * Lập kế hoạch chuyển ảnh từ thư mục local sang Cloudflare R2 (hàm THUẦN: không đọc file, không gọi CSDL, không gọi R2).
 * Nhận danh sách dòng CSDL, trả về danh sách thao tác {kind, table, rowId, column, oldKey, newKey, transform}.
 * Key mới luôn tạo bằng các hàm trong lib/storage/keys.ts để khớp đúng cách đặt tên của code mới.
 */
import { logoKey, materialKey, mockupKey, type MaterialImageRole } from "../lib/storage/keys";

export const KINDS = ["materials", "logos", "images", "zalo"] as const;
export type Kind = (typeof KINDS)[number];

export type TableName = "materials" | "logos" | "generated_images" | "zalo_messages" | "zalo_assets";

/** webp = nén sang WebP; copy = sao chép nguyên văn từng byte. */
export type Transform = "webp" | "copy";

export type MigrationOp = {
  kind: Kind;
  table: TableName;
  rowId: string;
  /** tên cột trong Prisma (layer1Path, originalPath, ...) */
  column: string;
  oldKey: string;
  /** bằng oldKey khi chỉ sao chép lên R2 mà giữ nguyên key (nhóm zalo): lúc đó CSDL không đổi */
  newKey: string;
  transform: Transform;
};

export type PlanNote = { kind: Kind; table: TableName; rowId: string; column: string; key: string; message?: string };

export type Plan = {
  ops: MigrationOp[];
  /** file đã ở key dạng mới: bỏ qua */
  alreadyNew: PlanNote[];
  /** file bị bỏ qua kèm lý do (ví dụ productPhotoPath): không đoán, không đụng tới */
  warnings: PlanNote[];
  /** số dòng CSDL có ít nhất một đường dẫn ảnh (trước khi áp --limit) */
  rows: Record<Kind, number>;
  /** true = --limit đã cắt bớt, còn dòng chưa đưa vào kế hoạch */
  limited: boolean;
};

export type MaterialRow = {
  id: string;
  code: string;
  layer1Path: string | null;
  layer2Path: string | null;
  referencePath: string | null;
  productPhotoPath: string | null;
};
export type LogoRow = { id: string; customerId: string; originalPath: string; normalizedPath: string };
export type ImageRow = { id: string; brandId: string; createdAt: Date; originalPath: string | null; finalPath: string | null };
export type ZaloMessageRow = { id: string; mediaPath: string | null };
export type ZaloAssetRow = { id: string; path: string };

export type PlanInput = {
  materials?: MaterialRow[];
  logos?: LogoRow[];
  images?: ImageRow[];
  zaloMessages?: ZaloMessageRow[];
  zaloAssets?: ZaloAssetRow[];
};

export type PlanOptions = {
  /** chỉ lập kế hoạch cho các nhóm này (mặc định: tất cả) */
  only?: readonly Kind[];
  /** tối đa N dòng CẦN LÀM MỚI mỗi nhóm (dòng đã xong không tính vào N, nên chạy lại với --limit vẫn tiến lên) */
  limit?: number;
};

/**
 * Cột ghi thêm vào dòng CSDL khi có ít nhất một cột ảnh của dòng đó được chuyển:
 * URL đã upload lên kho tạm của kie.ai không còn đúng/không dùng nữa nên xóa.
 */
export const ROW_RESETS: Record<TableName, Record<string, null>> = {
  materials: { kieRefUrl: null, kieRefExpiresAt: null },
  logos: { kieUrl: null, kieExpiresAt: null },
  generated_images: {},
  zalo_messages: {},
  zalo_assets: {},
};

// Mẫu key MỚI, đúng như lib/storage/keys.ts (materialKey, mockupKey, logoKey).
const NEW_STYLE: Record<Exclude<Kind, "zalo">, RegExp> = {
  materials: /^materials\/[a-z0-9-]+\/(?:layer1|layer2|reference)-[a-z0-9]{10}\.webp$/,
  images: /^mockups\/[A-Za-z0-9_-]+\/\d{4}-(?:0[1-9]|1[0-2])\/[a-z0-9]{16}\.webp$/,
  logos: /^logos\/[A-Za-z0-9_-]+\/[a-z0-9]{16}\.(?:png|jpg|webp|gif|svg|bin)$/,
};

/**
 * Key đã ở dạng mới chưa? Nhóm "zalo" luôn trả false: key zalo giữ nguyên cách đặt tên cũ,
 * việc nhận biết "đã chuyển" của nhóm này dựa vào việc file đã có trên R2 (xem migrate-exec.ts).
 */
export function isNewStyleKey(kind: Kind, key: string): boolean {
  if (kind === "zalo") return false;
  return NEW_STYLE[kind].test(key);
}

/** Đuôi file của key (không có dấu chấm); rỗng nếu không có. */
export function extOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot > key.lastIndexOf("/") ? key.slice(dot + 1) : "";
}

const isAnyNewStyleKey = (key: string) => isNewStyleKey("materials", key) || isNewStyleKey("images", key) || isNewStyleKey("logos", key);

export function buildPlan(input: PlanInput, options: PlanOptions = {}): Plan {
  const only = new Set<Kind>(options.only ?? KINDS);
  const plan: Plan = { ops: [], alreadyNew: [], warnings: [], rows: { materials: 0, logos: 0, images: 0, zalo: 0 }, limited: false };
  const budget: Record<Kind, number> = { materials: Infinity, logos: Infinity, images: Infinity, zalo: Infinity };
  if (options.limit !== undefined) for (const k of KINDS) budget[k] = Math.max(0, Math.floor(options.limit));

  // Mọi key mới đã cấp trong lần lập kế hoạch này: bảo đảm không bao giờ có hai thao tác cùng một key mới.
  const issued = new Set<string>();
  const fresh = (make: () => string): string => {
    let key = make();
    while (issued.has(key)) key = make();
    issued.add(key);
    return key;
  };

  /** Đưa các thao tác của MỘT dòng vào kế hoạch, theo hạn mức --limit của nhóm. */
  const commit = (kind: Kind, rowOps: MigrationOp[]) => {
    if (rowOps.length === 0) return;
    if (budget[kind] <= 0) {
      plan.limited = true;
      return;
    }
    budget[kind]--;
    plan.ops.push(...rowOps);
  };

  const note = (kind: Kind, table: TableName, rowId: string, column: string, key: string, message?: string): PlanNote => ({ kind, table, rowId, column, key, message });

  if (only.has("materials")) {
    for (const m of input.materials ?? []) {
      const cols: [string, string | null, MaterialImageRole][] = [
        ["layer1Path", m.layer1Path, "layer1"],
        ["layer2Path", m.layer2Path, "layer2"],
        ["referencePath", m.referencePath, "reference"],
      ];
      const rowOps: MigrationOp[] = [];
      let hasPath = false;
      for (const [column, key, role] of cols) {
        if (!key) continue;
        hasPath = true;
        if (isNewStyleKey("materials", key)) {
          plan.alreadyNew.push(note("materials", "materials", m.id, column, key));
          continue;
        }
        rowOps.push({
          kind: "materials",
          table: "materials",
          rowId: m.id,
          column,
          oldKey: key,
          newKey: fresh(() => materialKey(m.code, role)),
          transform: "webp",
        });
      }
      // productPhotoPath: cột đã bỏ khỏi giao diện, không có vai trò tương ứng trong materialKey nên không đoán: chỉ cảnh báo.
      if (m.productPhotoPath) {
        hasPath = true;
        plan.warnings.push(
          note("materials", "materials", m.id, "productPhotoPath", m.productPhotoPath, `Chất liệu ${m.code}: productPhotoPath không còn được code nào dùng nên không chuyển; file giữ nguyên ở thư mục cũ.`),
        );
      }
      if (hasPath) plan.rows.materials++;
      commit("materials", rowOps);
    }
  }

  if (only.has("logos")) {
    for (const l of input.logos ?? []) {
      const rowOps: MigrationOp[] = [];
      let hasPath = false;
      const cols: [string, string, () => string][] = [
        ["originalPath", l.originalPath, () => logoKey(l.customerId, extOf(l.originalPath))],
        ["normalizedPath", l.normalizedPath, () => logoKey(l.customerId, "png")],
      ];
      for (const [column, key, make] of cols) {
        if (!key) continue;
        hasPath = true;
        if (isNewStyleKey("logos", key)) {
          plan.alreadyNew.push(note("logos", "logos", l.id, column, key));
          continue;
        }
        // Logo giữ nguyên chất lượng gốc: sao chép từng byte, không nén, không đổi định dạng.
        rowOps.push({ kind: "logos", table: "logos", rowId: l.id, column, oldKey: key, newKey: fresh(make), transform: "copy" });
      }
      if (hasPath) plan.rows.logos++;
      commit("logos", rowOps);
    }
  }

  if (only.has("images")) {
    for (const im of input.images ?? []) {
      const rowOps: MigrationOp[] = [];
      let hasPath = false;
      const cols: [string, string | null][] = [
        ["originalPath", im.originalPath],
        ["finalPath", im.finalPath],
      ];
      for (const [column, key] of cols) {
        if (!key) continue;
        hasPath = true;
        if (isNewStyleKey("images", key)) {
          plan.alreadyNew.push(note("images", "generated_images", im.id, column, key));
          continue;
        }
        // Mỗi key một chuỗi ngẫu nhiên riêng (ảnh gốc và ảnh hoàn thiện khác nhau).
        rowOps.push({
          kind: "images",
          table: "generated_images",
          rowId: im.id,
          column,
          oldKey: key,
          newKey: fresh(() => mockupKey(im.brandId, im.createdAt)),
          transform: "webp",
        });
      }
      if (hasPath) plan.rows.images++;
      commit("images", rowOps);
    }
  }

  if (only.has("zalo")) {
    // Ảnh khách gửi và tư liệu video: giữ nguyên key, chỉ sao chép lên R2 (phục vụ qua /api/files có đăng nhập), CSDL không đổi.
    // Nhiều dòng có thể trỏ cùng một key (tin gửi lại cùng ảnh): mỗi key chỉ sao chép một lần.
    const seen = new Set<string>();
    const addInPlace = (table: "zalo_messages" | "zalo_assets", rowId: string, column: string, key: string | null) => {
      if (!key) return;
      plan.rows.zalo++;
      // mediaPath của tin Zalo có thể trỏ thẳng ảnh mockup/logo/chất liệu (tin bot gửi ảnh thành phẩm): key đó thuộc nhóm khác.
      if (isAnyNewStyleKey(key)) {
        plan.alreadyNew.push(note("zalo", table, rowId, column, key));
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);
      commit("zalo", [{ kind: "zalo", table, rowId, column, oldKey: key, newKey: key, transform: "copy" }]);
    };
    for (const m of input.zaloMessages ?? []) addInPlace("zalo_messages", m.id, "mediaPath", m.mediaPath);
    for (const a of input.zaloAssets ?? []) addInPlace("zalo_assets", a.id, "path", a.path);
  }

  return plan;
}
