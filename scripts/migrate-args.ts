/** Đọc tham số dòng lệnh của migrate-to-r2.ts (thuần, có test). */
import { parseArgs } from "node:util";
import { KINDS, type Kind } from "./migrate-plan";

export const MAX_CONCURRENCY = 16;
export const DEFAULT_CONCURRENCY = 4;

export type CliArgs = {
  dryRun: boolean;
  /** undefined = lấy STORAGE_DIR trong .env, mặc định ./storage */
  source: string | undefined;
  concurrency: number;
  limit: number | undefined;
  only: Kind[];
};

export type ParsedArgs = { ok: true; help: boolean; args: CliArgs; notes: string[] } | { ok: false; error: string };

export const HELP = `Chuyển toàn bộ ảnh trong thư mục local lên Cloudflare R2 và đổi key trong CSDL sang cách đặt tên mới.

Cách chạy (trong thư mục dự án, nơi có file .env):
  node --env-file=.env --import tsx scripts/migrate-to-r2.ts [tùy chọn]

Tùy chọn:
  --dry-run            Chỉ xem trước: đọc CSDL và kiểm tra file nguồn, KHÔNG gọi R2, KHÔNG ghi CSDL. Không cần R2_* trong .env.
                       (Không có cờ này là chạy THẬT.)
  --source <thư mục>   Thư mục ảnh cũ. Mặc định: STORAGE_DIR trong .env, nếu không có thì ./storage
  --concurrency <N>    Số file xử lý cùng lúc, 1-${MAX_CONCURRENCY}. Mặc định ${DEFAULT_CONCURRENCY}. (Nén WebP tốn RAM/CPU, đừng đặt quá cao.)
  --limit <N>          Mỗi nhóm chỉ làm tối đa N dòng CSDL còn việc (dòng đã chuyển rồi không tính). Dùng để thử vài dòng trước.
  --only <nhóm,...>    Chỉ làm các nhóm: ${KINDS.join(", ")}. Mặc định: tất cả.
  --help               Hiện hướng dẫn này.

Các nhóm:
  materials   ảnh chất liệu (lớp 1, lớp 2, ảnh ghép): nén WebP, key mới materials/{mã}/{vai trò}-{ngẫu nhiên}.webp
  logos       logo gốc và logo chuẩn hóa: sao chép NGUYÊN VĂN từng byte, key mới logos/{customerId}/{ngẫu nhiên}.{đuôi}
  images      ảnh mockup (ảnh AI gốc và ảnh hoàn thiện): nén WebP, key mới mockups/{brandId}/{yyyy-mm}/{ngẫu nhiên}.webp
  zalo        ảnh khách gửi qua Zalo và tư liệu chăm sóc: sao chép nguyên văn, GIỮ NGUYÊN key, CSDL không đổi

Chạy lại được: dòng đã có key mới thì bỏ qua, chỉ làm phần còn lại. Script không bao giờ xóa file ở thư mục cũ.
Thoát với mã khác 0 nếu có file lỗi.
`;

function parsePositiveInt(name: string, raw: string): number | string {
  if (!/^\d+$/.test(raw) || Number(raw) < 1) return `${name} phải là số nguyên dương (nhận được "${raw}").`;
  return Number(raw);
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        "dry-run": { type: "boolean" },
        source: { type: "string" },
        concurrency: { type: "string" },
        limit: { type: "string" },
        only: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (e) {
    return { ok: false, error: `Tham số không hợp lệ: ${e instanceof Error ? e.message : String(e)}. Xem hướng dẫn: --help` };
  }

  const notes: string[] = [];
  let concurrency = DEFAULT_CONCURRENCY;
  if (values.concurrency !== undefined) {
    const n = parsePositiveInt("--concurrency", values.concurrency);
    if (typeof n === "string") return { ok: false, error: n };
    concurrency = Math.min(n, MAX_CONCURRENCY);
    if (n > MAX_CONCURRENCY) notes.push(`--concurrency ${n} vượt mức tối đa, dùng ${MAX_CONCURRENCY}.`);
  }

  let limit: number | undefined;
  if (values.limit !== undefined) {
    const n = parsePositiveInt("--limit", values.limit);
    if (typeof n === "string") return { ok: false, error: n };
    limit = n;
  }

  let only: Kind[] = [...KINDS];
  if (values.only !== undefined) {
    const names = values.only.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = names.filter((n) => !(KINDS as readonly string[]).includes(n));
    if (names.length === 0 || bad.length > 0) {
      return { ok: false, error: `--only chỉ nhận: ${KINDS.join(", ")} (cách nhau bằng dấu phẩy)${bad.length > 0 ? `; không hiểu: ${bad.join(", ")}` : ""}.` };
    }
    only = KINDS.filter((k) => names.includes(k));
  }

  if (values.source !== undefined && values.source.trim() === "") return { ok: false, error: "--source cần một đường dẫn thư mục." };

  return {
    ok: true,
    help: values.help === true,
    notes,
    args: { dryRun: values["dry-run"] === true, source: values.source, concurrency, limit, only },
  };
}

/**
 * Biến R2 còn thiếu trong .env (theo đúng cách getR2Config trong lib/env.ts quyết định: R2_BUCKET_PUBLIC chỉ được
 * dùng khi R2_BUCKET không có mặt; để R2_BUCKET="" trống thì coi như thiếu bucket).
 */
export function missingR2Vars(env: Record<string, string | undefined>): string[] {
  return (
    [
      ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
      ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
      ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
      ["R2_BUCKET", env.R2_BUCKET ?? env.R2_BUCKET_PUBLIC],
      ["R2_PUBLIC_URL", env.R2_PUBLIC_URL],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
}
