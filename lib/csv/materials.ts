/** Đọc CSV (hỗ trợ dấu phẩy hoặc chấm phẩy, ô có dấu ngoặc kép, BOM của Excel). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Ô chứa đúng chữ này nghĩa là "xóa giá trị" (ô trống nghĩa là "giữ nguyên"). */
export const CSV_CLEAR_TOKEN = "[xoa]";

/**
 * Các cột của file CSV chất liệu. Một nơi duy nhất để cả nhập lẫn xuất dùng chung, nên file xuất ra nhập lại được ngay.
 * Tên cột đọc không phân biệt hoa thường, dấu, khoảng trắng (có thêm các tên tiếng Việt cũ).
 */
export const MATERIAL_CSV_COLUMNS = [
  "id", "code", "name", "thicknessMm", "groupName", "printTech", "baseMaterial", "technique", "surfaceFinish", "surfacePattern",
  "colorCount", "frontColorName", "frontColorFamily", "frontColorConfidence", "backColorName", "backColorFamily", "backColorConfidence",
  "seriesCode", "styleTags", "aiVisualNote", "descHuman", "photoIssue", "confidence", "needsReview", "reviewNote", "isActive", "sortOrder",
  // Thông số tấm để báo giá, DÙNG ĐÚNG ĐƠN VỊ LƯU TRỮ (khác form nhập, nơi kích thước tấm tính bằng cm): kích thước, lề, khoảng cách bằng mm; giá bằng đồng.
  "stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "allowRotate",
] as const;
export type MaterialCsvField = (typeof MATERIAL_CSV_COLUMNS)[number];

const HEADER_ALIASES: Record<MaterialCsvField, string[]> = {
  id: ["id"],
  code: ["ma", "mavatlieu", "machatlieu", "code", "sku"],
  name: ["ten", "tengoi", "tenchatlieu", "name"],
  thicknessMm: ["doday", "dodaymm", "thickness", "thicknessmm"],
  groupName: ["nhom", "nhomchatlieu", "group", "groupname"],
  printTech: ["congnghein", "congnghe", "kythuatin", "printtech", "tech", "technology"],
  baseMaterial: ["basematerial", "nhomchatlieuma"],
  technique: ["technique"],
  surfaceFinish: ["surfacefinish", "chatbemat"],
  surfacePattern: ["surfacepattern", "hoatiet"],
  colorCount: ["colorcount", "somau"],
  frontColorName: ["frontcolorname", "tenmaumattruoc"],
  frontColorFamily: ["frontcolorfamily", "homaumattruoc"],
  frontColorConfidence: ["frontcolorconfidence"],
  backColorName: ["backcolorname", "tenmaumatsau"],
  backColorFamily: ["backcolorfamily", "homaumatsau"],
  backColorConfidence: ["backcolorconfidence"],
  seriesCode: ["seriescode", "dongnhacungcap"],
  styleTags: ["styletags", "phongcach"],
  aiVisualNote: ["aivisualnote"],
  descHuman: ["mota", "motachonguoidoc", "description", "desc", "deschuman"],
  photoIssue: ["photoissue", "vandeanh"],
  confidence: ["confidence", "dotincay"],
  needsReview: ["needsreview", "canxemlai"],
  reviewNote: ["reviewnote", "ghichuxemlai"],
  isActive: ["isactive", "dangbat"],
  sortOrder: ["sortorder", "thutu"],
  // tên tiếng Việt cố ý ghi rõ đơn vị (mm, đồng) để không ai nhập nhầm cm vào cột mm
  stockWidthMm: ["stockwidthmm", "rongtammm", "chieurongtammm"],
  stockHeightMm: ["stockheightmm", "caotammm", "chieucaotammm"],
  stockPrice: ["stockprice", "giatam", "giamottam", "giatamdong"],
  edgeMarginMm: ["edgemarginmm", "letammm", "letam"],
  gapMm: ["gapmm", "khoangcach", "khoangcachmm", "khoangcachgiualogomm"],
  allowRotate: ["allowrotate", "chophepxoay"],
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** undefined = giữ nguyên (cột không có hoặc ô trống), null = xóa ("[xoa]"), chuỗi = đặt giá trị. */
export type CsvValue = string | null | undefined;

export type MaterialCsvRow = {
  line: number; // số dòng trong file (dòng tiêu đề là 1)
  values: Partial<Record<MaterialCsvField, CsvValue>>;
};

export type MaterialCsvParse = {
  rows: MaterialCsvRow[];
  errors: { line: number; message: string }[];
  /** các cột đọc được (để báo cho người dùng) */
  columns: MaterialCsvField[];
};

/** Đọc file CSV chất liệu (cả file xuất ra từ hệ thống lẫn file cũ chỉ có mã, tên, nhóm, công nghệ in, mô tả). */
export function parseMaterialsCsv(text: string): MaterialCsvParse {
  const table = parseCsv(text);
  const errors: MaterialCsvParse["errors"] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "File rỗng." }], columns: [] };

  const header = table[0].map(normalizeHeader);
  const index: Partial<Record<MaterialCsvField, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [MaterialCsvField, string[]][]) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) index[field] = i;
  }
  if (index.id === undefined && index.code === undefined) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Dòng đầu tiên phải có tiêu đề cột, ít nhất gồm "mã" (code) hoặc "id".' }],
      columns: [],
    };
  }
  const columns = Object.keys(index) as MaterialCsvField[];

  const rows: MaterialCsvRow[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const values: MaterialCsvRow["values"] = {};
    for (const field of columns) {
      const raw = (cells[index[field]!] ?? "").trim();
      if (raw === "") continue; // trống = giữ nguyên
      values[field] = raw.toLowerCase() === CSV_CLEAR_TOKEN ? null : raw;
    }
    const id = values.id ?? "";
    const code = values.code ?? "";
    if (!id && !code) return errors.push({ line, message: "Thiếu cả id lẫn mã chất liệu." });
    const key = id ? `id:${id}` : `code:${code.toLowerCase()}`;
    if (seen.has(key)) return errors.push({ line, message: `${id ? `id ${id}` : `Mã ${code}`} bị lặp trong file.` });
    seen.add(key);
    rows.push({ line, values });
  });
  return { rows, errors, columns };
}
