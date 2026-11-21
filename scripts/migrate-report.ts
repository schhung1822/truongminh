/** Dựng báo cáo (dry-run và chạy thật) thành các dòng chữ tiếng Việt. Thuần, có test. */
import type { OpResult } from "./migrate-exec";
import { KINDS, type Kind, type MigrationOp, type Plan } from "./migrate-plan";

export type KindSummary = {
  /** số dòng CSDL có đường dẫn ảnh */
  rows: number;
  /** số file đã ở key dạng mới (bỏ qua) */
  alreadyNew: number;
  planned: number;
  migrated: number;
  present: number;
  missing: number;
  failed: number;
  stale: number;
  /** tổng dung lượng file nguồn (dry-run: file sẽ chuyển; chạy thật: file đã chuyển) */
  bytesIn: number;
  /** tổng dung lượng đã ghi lên R2 */
  bytesOut: number;
};

export function summarize(plan: Plan, results: OpResult[]): Record<Kind, KindSummary> {
  const empty = (): KindSummary => ({ rows: 0, alreadyNew: 0, planned: 0, migrated: 0, present: 0, missing: 0, failed: 0, stale: 0, bytesIn: 0, bytesOut: 0 });
  const out = { materials: empty(), logos: empty(), images: empty(), zalo: empty() } as Record<Kind, KindSummary>;
  for (const k of KINDS) out[k].rows = plan.rows[k];
  for (const n of plan.alreadyNew) out[n.kind].alreadyNew++;
  for (const r of results) {
    const s = out[r.op.kind];
    s[r.status]++;
    if (r.status === "planned" || r.status === "migrated") {
      s.bytesIn += r.bytesIn;
      s.bytesOut += r.bytesOut;
    }
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/** Bảng chữ: cột đầu căn trái, các cột còn lại căn phải. */
export function formatTable(header: string[], rows: string[][]): string[] {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => [...r[c]].length)));
  const line = (r: string[]) => r.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join("  ");
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)];
}

/** Thay mọi bí mật (mật khẩu CSDL, khóa R2...) bằng *** trong chữ sắp in ra. Bỏ qua chuỗi quá ngắn để không che nhầm chữ thường gặp. */
export function makeRedactor(secrets: (string | undefined)[], minLength = 6): (text: string) => string {
  const list = [...new Set(secrets.filter((s): s is string => !!s && s.length >= minLength))].sort((a, b) => b.length - a.length);
  return (text) => list.reduce((t, s) => t.split(s).join("***"), text);
}

const SEPARATOR_NOTE = (op: MigrationOp) => (op.oldKey === op.newKey ? `${op.oldKey}  (giữ nguyên key)` : `${op.oldKey}  ->  ${op.newKey}`);

const FOOTER = [
  "Script KHÔNG xóa file nào ở thư mục cũ. Nên giữ thư mục đó làm bản sao lưu, chỉ xóa sau khi đã kiểm tra kỹ ảnh trên R2 và web chạy đúng.",
  "Lưu ý: file .secret-key trong thư mục STORAGE_DIR (khóa mã hóa tài khoản Zalo cá nhân) vẫn phải giữ lại, KHÔNG xóa.",
];

type Derived = { thumbs: number; aiLogos: number };

function derivedLines(derived?: Derived): string[] {
  if (!derived) return [];
  return [
    `File phái sinh KHÔNG chuyển (hệ thống tự tạo lại khi cần): ${derived.thumbs} ảnh thu nhỏ cũ (*-thumb.jpg), ${derived.aiLogos} bản logo gửi AI.`,
  ];
}

const CAP = 200;
const capped = (items: string[]): string[] => (items.length > CAP ? [...items.slice(0, CAP), `  ... và ${items.length - CAP} dòng nữa`] : items);

export type ReportContext = { source: string; derived?: Derived; examplesPerKind?: number };

export function formatDryRunReport(plan: Plan, results: OpResult[], ctx: ReportContext): string[] {
  const sum = summarize(plan, results);
  const lines: string[] = [];
  lines.push("=== DRY-RUN: chỉ đọc CSDL và kiểm tra file nguồn. Không gọi R2, không ghi CSDL, không tạo file. ===");
  lines.push(`Thư mục nguồn: ${ctx.source}`);
  lines.push("");
  lines.push(
    ...formatTable(
      ["Nhóm", "Dòng", "Sẽ chuyển", "Đã ở dạng mới", "Thiếu nguồn", "Lỗi", "Dung lượng nguồn"],
      KINDS.map((k) => [k, String(sum[k].rows), String(sum[k].planned), String(sum[k].alreadyNew), String(sum[k].missing), String(sum[k].failed), formatBytes(sum[k].bytesIn)]),
    ),
  );
  if (plan.limited) lines.push("(Đã giới hạn bằng --limit: còn dòng chưa đưa vào kế hoạch.)");
  lines.push("Nhóm zalo: giữ nguyên key; dry-run không hỏi R2 nên chưa biết file nào đã có sẵn trên R2 (lần chạy thật sẽ bỏ qua những file đó).");

  const per = ctx.examplesPerKind ?? 10;
  for (const k of KINDS) {
    const examples = results.filter((r) => r.op.kind === k && r.status === "planned").slice(0, per);
    if (examples.length === 0) continue;
    lines.push("");
    lines.push(`Ví dụ nhóm ${k} (key cũ -> key mới; key mới ở dry-run chỉ là ví dụ ngẫu nhiên, lần chạy thật sẽ sinh chuỗi khác):`);
    for (const r of examples) lines.push(`  ${SEPARATOR_NOTE(r.op)}`);
  }

  const missing = results.filter((r) => r.status === "missing").map((r) => `  - ${r.op.table}.${r.op.column} (dòng ${r.op.rowId}): ${r.op.oldKey}`);
  const failed = results.filter((r) => r.status === "failed").map((r) => `  - ${r.op.table}.${r.op.column} (dòng ${r.op.rowId}): ${r.op.oldKey}: ${r.error}`);
  const warnings = plan.warnings.map((w) => `  - ${w.message ?? `${w.table}.${w.column} (dòng ${w.rowId}): ${w.key}`}`);
  if (missing.length + failed.length + warnings.length > 0) {
    lines.push("");
    lines.push("CẢNH BÁO:");
    if (missing.length > 0) {
      lines.push(`File nguồn THIẾU (${missing.length}); các cột này sẽ bị bỏ qua, CSDL giữ nguyên:`);
      lines.push(...capped(missing));
    }
    if (failed.length > 0) {
      lines.push(`Không kiểm tra được file nguồn (${failed.length}):`);
      lines.push(...capped(failed));
    }
    if (warnings.length > 0) {
      lines.push(`Bỏ qua có chủ đích (${warnings.length}):`);
      lines.push(...capped(warnings));
    }
  }

  lines.push("");
  lines.push(...derivedLines(ctx.derived));
  lines.push(...FOOTER);
  lines.push("Chạy thật: bỏ cờ --dry-run (cần đủ R2_* trong .env).");
  return lines;
}

export function formatRunReport(plan: Plan, results: OpResult[], ctx: ReportContext): string[] {
  const sum = summarize(plan, results);
  const lines: string[] = [];
  lines.push("=== KẾT QUẢ CHUYỂN ẢNH SANG R2 ===");
  lines.push(`Thư mục nguồn: ${ctx.source}`);
  lines.push("");
  lines.push(
    ...formatTable(
      ["Nhóm", "Dòng", "Đã chuyển", "Có sẵn trên R2", "Đã ở dạng mới", "Thiếu nguồn", "Lỗi", "Dung lượng gốc -> R2"],
      KINDS.map((k) => [
        k,
        String(sum[k].rows),
        String(sum[k].migrated),
        String(sum[k].present),
        String(sum[k].alreadyNew),
        String(sum[k].missing),
        String(sum[k].failed + sum[k].stale),
        `${formatBytes(sum[k].bytesIn)} -> ${formatBytes(sum[k].bytesOut)}`,
      ]),
    ),
  );
  if (plan.limited) lines.push("(Đã giới hạn bằng --limit: còn dòng chưa làm. Chạy lại để làm tiếp.)");

  const missing = results.filter((r) => r.status === "missing").map((r) => `  - ${r.op.table}.${r.op.column} (dòng ${r.op.rowId}): ${r.op.oldKey}`);
  const errors = results.filter((r) => r.status === "failed" || r.status === "stale").map((r) => `  - ${r.op.table}.${r.op.column} (dòng ${r.op.rowId}): ${r.op.oldKey}: ${r.error}`);
  const warnings = plan.warnings.map((w) => `  - ${w.message ?? `${w.table}.${w.column} (dòng ${w.rowId}): ${w.key}`}`);
  const orphans = results.filter((r) => r.orphan).map((r) => `  - ${r.op.newKey}`);

  if (missing.length > 0) {
    lines.push("");
    lines.push(`CẢNH BÁO: ${missing.length} file nguồn THIẾU, đã bỏ qua (dòng đó giữ key cũ):`);
    lines.push(...capped(missing));
  }
  if (warnings.length > 0) {
    lines.push("");
    lines.push(`Bỏ qua có chủ đích (${warnings.length}):`);
    lines.push(...capped(warnings));
  }
  if (errors.length > 0) {
    lines.push("");
    lines.push(`LỖI: ${errors.length} file chưa chuyển được (dòng đó giữ key cũ). Sửa nguyên nhân rồi chạy lại script, chỉ phần lỗi được làm lại:`);
    lines.push(...capped(errors));
  }
  if (orphans.length > 0) {
    lines.push("");
    lines.push(`File đã nằm trên R2 nhưng CSDL không trỏ tới (${orphans.length}); xóa tay trên R2 nếu muốn dọn:`);
    lines.push(...capped(orphans));
  }

  const total = results.length;
  const migrated = results.filter((r) => r.status === "migrated" || r.status === "present").length;
  lines.push("");
  lines.push(`Tổng: ${migrated}/${total} file đã nằm trên R2 sau lần chạy này, ${errors.length} lỗi, ${missing.length} thiếu nguồn.`);
  lines.push(...derivedLines(ctx.derived));
  lines.push(...FOOTER);
  if (errors.length === 0 && !plan.limited) lines.push("Bước tiếp theo: đặt STORAGE_DRIVER=r2 trong .env của web, build lại và khởi động lại.");
  return lines;
}
