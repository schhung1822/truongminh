/**
 * Thực thi kế hoạch chuyển ảnh sang R2. Mọi thứ bên ngoài đều được truyền vào (nguồn đọc, đích ghi, bộ cập nhật CSDL)
 * nên test được bằng đối tượng giả trong bộ nhớ. File chính migrate-to-r2.ts chỉ nối với fs, R2 và CSDL thật.
 */
import { contentTypeOf } from "../lib/storage/keys";
import type { StorageDriver } from "../lib/storage/types";
import { mapLimit } from "../lib/jobs/async";
import { ROW_RESETS, type MigrationOp, type TableName } from "./migrate-plan";

export interface DbUpdater {
  /**
   * Ghi các cột mới của một dòng, CHỈ KHI các cột trong `expected` vẫn còn đúng giá trị cũ
   * (phòng khi web đang chạy và người dùng vừa đổi ảnh đúng dòng đó). Trả về false nếu dòng đã đổi hoặc không còn.
   */
  updateRow(table: TableName, rowId: string, expected: Record<string, string>, data: Record<string, string | null>): Promise<boolean>;
}

export type OpStatus =
  /** dry-run: sẽ chuyển (nguồn có tồn tại) */
  | "planned"
  /** đã tải lên R2, kiểm tra thấy file, và (nếu cần) đã cập nhật CSDL */
  | "migrated"
  /** (nhóm zalo) file đã có sẵn trên R2: không tải lại */
  | "present"
  /** file nguồn không có trong thư mục nguồn: bỏ qua, không đụng CSDL cột đó */
  | "missing"
  | "failed"
  /** đã tải lên nhưng dòng CSDL đã đổi trong lúc chạy nên không cập nhật (file trên R2 thành file mồ côi) */
  | "stale";

export type OpResult = {
  op: MigrationOp;
  status: OpStatus;
  bytesIn: number;
  bytesOut: number;
  error?: string;
  /** đã có file mới trên R2 nhưng CSDL không trỏ tới nó */
  orphan?: boolean;
};

export type MigrateDeps = {
  /** null = không có file nguồn */
  readSource(key: string): Promise<Buffer | null>;
  statSource(key: string): Promise<{ size: number } | null>;
  dest: StorageDriver;
  db: DbUpdater;
  /** mặc định: toWebp trong lib/imaging/webp.ts (nạp lúc cần để dry-run không phải nạp sharp) */
  toWebp?: (input: Buffer) => Promise<Buffer>;
  log?: (line: string) => void;
};

export type MigrateOptions = {
  dryRun: boolean;
  concurrency: number;
  /** in tiến độ sau mỗi N thao tác (mặc định 20) và khi xong */
  progressEvery?: number;
  onProgress?: (done: number, total: number) => void;
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function defaultToWebp(input: Buffer): Promise<Buffer> {
  const { toWebp } = await import("../lib/imaging/webp");
  return toWebp(input);
}

/** Một file: đọc nguồn, (nén), tải lên, kiểm tra tồn tại. Chưa đụng CSDL. */
async function transferOne(op: MigrationOp, deps: MigrateDeps): Promise<OpResult> {
  const inPlace = op.oldKey === op.newKey;
  // Giữ nguyên key (nhóm zalo): file đã có trên R2 thì thôi, để chạy lại không tải lên lần hai.
  if (inPlace && (await deps.dest.exists(op.newKey))) return { op, status: "present", bytesIn: 0, bytesOut: 0 };

  const src = await deps.readSource(op.oldKey);
  if (!src) return { op, status: "missing", bytesIn: 0, bytesOut: 0 };
  if (src.length === 0) throw new Error("File nguồn rỗng (0 byte).");

  let body = src;
  let contentType: string;
  if (op.transform === "webp") {
    body = await (deps.toWebp ?? defaultToWebp)(src);
    contentType = "image/webp";
  } else {
    contentType = contentTypeOf(op.newKey);
  }

  await deps.dest.put(op.newKey, body, { contentType });
  if (!(await deps.dest.exists(op.newKey))) throw new Error("Đã tải lên nhưng kiểm tra lại không thấy file trên R2.");
  return { op, status: "migrated", bytesIn: src.length, bytesOut: body.length };
}

/**
 * Chạy kế hoạch.
 * - dryRun: chỉ stat file nguồn (deps.statSource). KHÔNG đụng dest, KHÔNG đụng db.
 * - chạy thật: theo từng dòng CSDL: tải các cột lên R2, và chỉ cột nào tải xong + kiểm tra thấy mới được ghi vào CSDL
 *   (một lần cho cả dòng). Cột lỗi/thiếu nguồn giữ nguyên key cũ. Lỗi một file không dừng các file khác.
 * Kết quả trả về theo đúng thứ tự `ops`.
 */
export async function migrate(ops: MigrationOp[], deps: MigrateDeps, options: MigrateOptions): Promise<OpResult[]> {
  const results = new Array<OpResult>(ops.length);
  const every = options.progressEvery ?? 20;
  let done = 0;
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      done++;
      if (options.onProgress && (done % every === 0 || done === ops.length)) options.onProgress(done, ops.length);
    }
  };

  if (options.dryRun) {
    await mapLimit(ops.map((op, i) => ({ op, i })), options.concurrency, async ({ op, i }) => {
      try {
        const st = await deps.statSource(op.oldKey);
        results[i] = st ? { op, status: "planned", bytesIn: st.size, bytesOut: 0 } : { op, status: "missing", bytesIn: 0, bytesOut: 0 };
      } catch (e) {
        results[i] = { op, status: "failed", bytesIn: 0, bytesOut: 0, error: errMsg(e) };
      }
      tick(1);
    });
    return results;
  }

  // Gom thao tác theo dòng CSDL (giữ thứ tự xuất hiện).
  const groups = new Map<string, { op: MigrationOp; i: number }[]>();
  ops.forEach((op, i) => {
    const g = groups.get(`${op.table}:${op.rowId}`);
    if (g) g.push({ op, i });
    else groups.set(`${op.table}:${op.rowId}`, [{ op, i }]);
  });

  await mapLimit([...groups.values()], options.concurrency, async (group) => {
    for (const { op, i } of group) {
      try {
        results[i] = await transferOne(op, deps);
      } catch (e) {
        results[i] = { op, status: "failed", bytesIn: 0, bytesOut: 0, error: errMsg(e) };
        deps.log?.(`LỖI ${op.table}.${op.column} (dòng ${op.rowId}): ${op.oldKey}: ${errMsg(e)}`);
      }
      if (results[i].status === "missing") deps.log?.(`THIẾU file nguồn ${op.table}.${op.column} (dòng ${op.rowId}): ${op.oldKey}`);
    }

    // Ghi CSDL gộp một lần cho dòng: chỉ các cột đã tải lên và kiểm tra thành công, và chỉ khi key đổi.
    const ready = group.filter(({ op, i }) => results[i].status === "migrated" && op.oldKey !== op.newKey);
    if (ready.length > 0) {
      const { table, rowId } = ready[0].op;
      const expected: Record<string, string> = {};
      const data: Record<string, string | null> = { ...ROW_RESETS[table] };
      for (const { op } of ready) {
        expected[op.column] = op.oldKey;
        data[op.column] = op.newKey;
      }
      let failure: { status: "stale" | "failed"; message: string } | null = null;
      try {
        const ok = await deps.db.updateRow(table, rowId, expected, data);
        if (!ok) failure = { status: "stale", message: "Dòng CSDL đã thay đổi hoặc không còn trong lúc chạy nên không cập nhật (giữ key cũ)." };
      } catch (e) {
        failure = { status: "failed", message: `Không ghi được CSDL: ${errMsg(e)}` };
      }
      if (failure) {
        for (const { op, i } of ready) {
          results[i] = { ...results[i], status: failure.status, orphan: true, error: `${failure.message} File đã tải lên R2 nhưng CSDL không trỏ tới: ${op.newKey}` };
          deps.log?.(`LỖI ${op.table}.${op.column} (dòng ${op.rowId}): ${results[i].error}`);
        }
      }
    }
    tick(group.length);
  });

  return results;
}
