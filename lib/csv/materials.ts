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

export type MaterialCsvRow = {
  line: number; // số dòng trong file (dòng tiêu đề là 1)
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  descHuman: string;
};

export type MaterialCsvParse = {
  rows: MaterialCsvRow[];
  errors: { line: number; message: string }[];
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<keyof Omit<MaterialCsvRow, "line">, string[]> = {
  code: ["ma", "mavatlieu", "machatlieu", "code", "sku"],
  name: ["ten", "tengoi", "tenchatlieu", "name"],
  groupName: ["nhom", "nhomchatlieu", "group", "groupname"],
  printTech: ["congnghein", "congnghe", "kythuatin", "printtech", "tech", "technology"],
  descHuman: ["mota", "motachonguoidoc", "description", "desc"],
};

/** Đọc file CSV chất liệu: cột mã, tên, nhóm, công nghệ in, mô tả (tên cột tiếng Việt hoặc tiếng Anh). */
export function parseMaterialsCsv(text: string): MaterialCsvParse {
  const table = parseCsv(text);
  const errors: MaterialCsvParse["errors"] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "File rỗng." }] };

  const header = table[0].map(normalizeHeader);
  const index: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof typeof HEADER_ALIASES, string[]][]) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) index[field] = i;
  }
  if (index.code === undefined || index.name === undefined) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Dòng đầu tiên phải có tiêu đề cột, ít nhất gồm "mã" và "tên".' }],
    };
  }

  const rows: MaterialCsvRow[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (f: keyof typeof HEADER_ALIASES) => (index[f] === undefined ? "" : (cells[index[f]!] ?? "").trim());
    const row = {
      line,
      code: get("code"),
      name: get("name"),
      groupName: get("groupName"),
      printTech: get("printTech"),
      descHuman: get("descHuman"),
    };
    if (!row.code) return errors.push({ line, message: "Thiếu mã chất liệu." });
    if (!row.name) return errors.push({ line, message: `Chất liệu ${row.code}: thiếu tên.` });
    if (row.code.length > 50) return errors.push({ line, message: `Mã quá dài (tối đa 50 ký tự): ${row.code}` });
    const key = row.code.toLowerCase();
    if (seen.has(key)) return errors.push({ line, message: `Mã ${row.code} bị lặp trong file.` });
    seen.add(key);
    rows.push(row);
  });
  return { rows, errors };
}
