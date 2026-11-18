/** Một ô CSV: bọc dấu nháy kép khi có dấu phẩy, nháy kép hoặc xuống dòng; chặn công thức Excel (=, +, -, @ ở đầu ô chữ). */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}
