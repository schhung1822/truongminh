/**
 * Lập kế hoạch đồng bộ dữ liệu chất liệu từ máy này sang máy khác (hàm THUẦN: không đọc file, không gọi CSDL, không gọi kho
 * ảnh). Phần nối với thế giới thật ở sync-materials.ts. Xem docs/DECISIONS.md D128.
 *
 * Chất liệu khớp nhau theo MÃ (cột code). Mã đã có ở máy đích thì cập nhật và giữ nguyên id (trang mẫu, ảnh đã tạo, báo giá
 * vẫn trỏ đúng); mã chưa có thì tạo mới; mã chỉ có ở máy đích thì để nguyên và liệt kê ra.
 */

export const EXPORT_VERSION = 1;

/** Các cột được đồng bộ: ảnh, mô tả, phân loại. Thêm cột mới của bảng materials thì thêm vào đây nếu muốn nó đi theo. */
export const DATA_FIELDS = [
  "name",
  "groupName",
  "printTech",
  "descHuman",
  "thicknessMm",
  "layer1Path",
  "layer2Path",
  "referencePath",
  "referenceUpdatedAt",
  "isActive",
  "sortOrder",
  "baseMaterial",
  "technique",
  "surfaceFinish",
  "surfacePattern",
  "colorCount",
  "frontColorName",
  "frontColorFamily",
  "frontColorConfidence",
  "backColorName",
  "backColorFamily",
  "backColorConfidence",
  "seriesCode",
  "aiVisualNote",
  "photoIssue",
  "classifyConfidence",
  "needsReview",
  "reviewNote",
] as const;
export type DataField = (typeof DATA_FIELDS)[number];

/** Các cột ảnh: file của chúng phải có trong kho ảnh của máy đích thì mới được ghi vào CSDL máy đích. */
export const IMAGE_FIELDS = ["layer1Path", "layer2Path", "referencePath"] as const satisfies readonly DataField[];

/** Thông số tấm và giá (bảng báo giá): chủ xưởng có thể đã nhập riêng ở máy đích, nên mặc định KHÔNG ghi đè. */
export const STOCK_FIELDS = ["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "allowRotate"] as const;
export type StockField = (typeof STOCK_FIELDS)[number];

type Scalar = string | number | boolean | null;
export type MaterialData = Record<DataField, Scalar>;
export type StockData = Record<StockField, Scalar>;

export type ExportedMaterial = { code: string; data: MaterialData; stock: StockData; styleTags: string[] };
export type ExportedOption = { type: string; value: string; label: string; sortOrder: number; isActive: boolean };
export type MaterialsExport = { version: number; exportedAt: string; options: ExportedOption[]; materials: ExportedMaterial[] };

export type CurrentMaterial = ExportedMaterial & { id: string };
export type CurrentOption = ExportedOption & { id: string };

export type MaterialOp =
  | { kind: "create"; code: string; data: MaterialData; stock: StockData; styleTags: string[] }
  | {
      kind: "update";
      id: string;
      code: string;
      /** tên các cột đổi (kể cả "styleTags"), để in báo cáo */
      changed: string[];
      data: Partial<MaterialData>;
      /** có khi chạy với --with-stock và thông số tấm khác nhau */
      stock?: Partial<StockData>;
      styleTags?: string[];
      /** ảnh đổi: xóa địa chỉ đệm đã upload lên nhà cung cấp AI của bản cũ */
      imagesChanged: boolean;
    };

export type OptionOp = { kind: "create"; option: ExportedOption } | { kind: "update"; id: string; option: ExportedOption; changed: string[] };

export type SyncPlan = {
  optionOps: OptionOp[];
  /** nhãn đã được một giá trị khác cùng loại dùng ở máy đích (CSDL bắt nhãn không trùng): bỏ qua, phải sửa tay */
  optionConflicts: { option: ExportedOption; takenBy: string }[];
  materialOps: MaterialOp[];
  unchanged: string[];
  /** chất liệu trong file mà ảnh của nó KHÔNG có trong kho ảnh của máy đích: không đụng tới, để không ghi key chết vào CSDL */
  missingFiles: { code: string; keys: string[] }[];
  /** mã chỉ có ở máy đích */
  onlyHere: string[];
};

/** So hai giá trị cột: số so theo giá trị (0.5 và "0.5" như nhau, cho cột Decimal), còn lại so nguyên văn; trống = null. */
function same(a: Scalar | undefined, b: Scalar | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x === "boolean" || typeof y === "boolean") return false;
  const nx = Number(x);
  const ny = Number(y);
  // chỉ coi là số khi CẢ HAI đều là số hợp lệ (mã như "5" và "05" là chữ ở cột chữ, nhưng không cột chữ nào ở đây lưu số thuần)
  return typeof x !== typeof y && !Number.isNaN(nx) && !Number.isNaN(ny) && nx === ny;
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

export function buildSyncPlan(input: {
  file: MaterialsExport;
  current: CurrentMaterial[];
  currentOptions: CurrentOption[];
  /** các key ảnh có trong file mà kho ảnh của máy đích KHÔNG có */
  missingKeys: ReadonlySet<string>;
  /** true = ghi đè cả thông số tấm và giá của chất liệu đã có */
  withStock: boolean;
}): SyncPlan {
  const plan: SyncPlan = { optionOps: [], optionConflicts: [], materialOps: [], unchanged: [], missingFiles: [], onlyHere: [] };

  // ---- Danh mục phân loại (material_options): khớp theo (loại, giá trị) ----
  const optKey = (o: { type: string; value: string }) => `${o.type}\n${o.value}`;
  const byKey = new Map(input.currentOptions.map((o) => [optKey(o), o]));
  // nhãn đang được giá trị nào giữ, tính cả các thay đổi đã lên kế hoạch ở vòng lặp này
  const labelOwner = new Map(input.currentOptions.map((o) => [`${o.type}\n${o.label}`, o.value]));
  for (const option of input.file.options) {
    const cur = byKey.get(optKey(option));
    const owner = labelOwner.get(`${option.type}\n${option.label}`);
    if (owner !== undefined && owner !== option.value) {
      plan.optionConflicts.push({ option, takenBy: owner });
      continue;
    }
    if (!cur) {
      plan.optionOps.push({ kind: "create", option });
      labelOwner.set(`${option.type}\n${option.label}`, option.value);
      continue;
    }
    const changed = (["label", "sortOrder", "isActive"] as const).filter((f) => cur[f] !== option[f]);
    if (changed.length === 0) continue;
    plan.optionOps.push({ kind: "update", id: cur.id, option, changed });
    if (changed.includes("label")) {
      labelOwner.delete(`${cur.type}\n${cur.label}`);
      labelOwner.set(`${option.type}\n${option.label}`, option.value);
    }
  }

  // ---- Chất liệu: khớp theo mã ----
  const curByCode = new Map(input.current.map((m) => [m.code, m]));
  const inFile = new Set<string>();
  for (const m of input.file.materials) {
    inFile.add(m.code);
    const lost = IMAGE_FIELDS.map((f) => m.data[f]).filter((k): k is string => typeof k === "string" && input.missingKeys.has(k));
    if (lost.length > 0) {
      plan.missingFiles.push({ code: m.code, keys: lost });
      continue;
    }
    const cur = curByCode.get(m.code);
    if (!cur) {
      plan.materialOps.push({ kind: "create", code: m.code, data: m.data, stock: m.stock, styleTags: m.styleTags });
      continue;
    }
    const data: Partial<MaterialData> = {};
    for (const f of DATA_FIELDS) if (!same(cur.data[f], m.data[f])) data[f] = m.data[f] ?? null;
    const changed: string[] = Object.keys(data);
    const op: MaterialOp = { kind: "update", id: cur.id, code: m.code, changed, data, imagesChanged: IMAGE_FIELDS.some((f) => f in data) };
    if (input.withStock) {
      const stock: Partial<StockData> = {};
      for (const f of STOCK_FIELDS) if (!same(cur.stock[f], m.stock[f])) stock[f] = m.stock[f] ?? null;
      if (Object.keys(stock).length > 0) {
        op.stock = stock;
        changed.push(...Object.keys(stock));
      }
    }
    if (!sameTags(cur.styleTags, m.styleTags)) {
      op.styleTags = m.styleTags;
      changed.push("styleTags");
    }
    if (changed.length === 0) plan.unchanged.push(m.code);
    else plan.materialOps.push(op);
  }
  plan.onlyHere = input.current.filter((m) => !inFile.has(m.code)).map((m) => m.code);
  return plan;
}

/** Mọi key ảnh có trong file xuất (để kiểm tra chúng có trong kho ảnh của máy đích không). */
export function imageKeysOf(file: MaterialsExport): string[] {
  const keys = new Set<string>();
  for (const m of file.materials) for (const f of IMAGE_FIELDS) if (typeof m.data[f] === "string" && m.data[f]) keys.add(m.data[f] as string);
  return [...keys];
}

/** Báo cáo kế hoạch bằng chữ (dùng cho cả chạy thử lẫn chạy thật). */
export function formatPlan(plan: SyncPlan, opts: { applied: boolean; withStock: boolean }): string {
  const lines: string[] = [];
  const creates = plan.materialOps.filter((o) => o.kind === "create");
  const updates = plan.materialOps.filter((o) => o.kind === "update");
  const verb = opts.applied ? "Đã" : "Sẽ";
  lines.push(`${verb} tạo mới ${creates.length} chất liệu, cập nhật ${updates.length}; ${plan.unchanged.length} chất liệu đã giống sẵn.`);
  if (creates.length > 0) lines.push(`  Tạo mới: ${creates.map((o) => o.code).join(", ")}`);
  for (const o of updates) {
    if (o.kind !== "update") continue;
    const images = o.imagesChanged ? " [đổi ảnh]" : "";
    lines.push(`  Cập nhật ${o.code}${images}: ${o.changed.join(", ")}`);
  }
  const optCreate = plan.optionOps.filter((o) => o.kind === "create").length;
  const optUpdate = plan.optionOps.length - optCreate;
  if (plan.optionOps.length > 0) lines.push(`${verb} thêm ${optCreate} và sửa ${optUpdate} mục trong danh mục phân loại (nhóm chất liệu, công nghệ, màu, phong cách...).`);
  for (const c of plan.optionConflicts) {
    lines.push(`  CHÚ Ý: không ghi được mục phân loại ${c.option.type} "${c.option.label}" (mã ${c.option.value}) vì ở máy này nhãn đó đang thuộc mã "${c.takenBy}". Sửa tay ở Quản trị > Chất liệu.`);
  }
  if (plan.missingFiles.length > 0) {
    lines.push(`BỎ QUA ${plan.missingFiles.length} chất liệu vì ảnh của chúng KHÔNG có trong kho ảnh của máy này (hai máy không dùng chung kho, hoặc file đã bị xóa):`);
    for (const m of plan.missingFiles) lines.push(`  ${m.code}: ${m.keys.join(" | ")}`);
  }
  if (plan.onlyHere.length > 0) lines.push(`Chỉ có ở máy này, không có trong file (để nguyên): ${plan.onlyHere.join(", ")}`);
  if (!opts.withStock) lines.push("Thông số tấm và giá của chất liệu đã có được GIỮ NGUYÊN theo máy này (thêm --with-stock nếu muốn lấy theo file).");
  return lines.join("\n");
}
