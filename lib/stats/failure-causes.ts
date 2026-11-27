/**
 * Phân loại ảnh tạo lỗi theo NGUYÊN NHÂN để trang Thống kê gom đếm (docs/DECISIONS.md D130). Phép tính thuần.
 *
 * Câu lỗi gốc (generated_images.errorMessage) do hệ thống tự viết ở lib/providers/kie.ts, lib/jobs/process.ts và
 * lib/jobs/references.ts, riêng phần trong ngoặc là nguyên văn kie.ai trả về. Thêm một kiểu câu lỗi mới ở các file đó thì
 * thêm một dòng vào CAUSES bên dưới, nếu không nó rơi vào "Lỗi khác".
 */

export type FailureCauseKey =
  | "credits"
  | "api_key"
  | "missing_file"
  | "too_many_refs"
  | "no_reference"
  | "pinterest"
  | "prompt_too_long"
  | "resolution"
  | "content"
  | "queue"
  | "timeout"
  | "result"
  | "network"
  | "rejected"
  | "provider"
  | "other";

/** Ai gỡ được lỗi: quản trị viên phải sửa cấu hình/dữ liệu, sale chỉ cần bấm Tạo lại, hoặc cần mở phiên ra xem. */
export type FailureFix = "admin" | "retry" | "review";

export type FailureCause = {
  key: FailureCauseKey;
  label: string;
  fix: FailureFix;
  /** nên làm gì để lỗi này không lặp lại */
  advice: string;
};

export const FIX_LABEL: Record<FailureFix, string> = {
  admin: "Cần quản trị viên",
  retry: "Bấm Tạo lại là được",
  review: "Cần xem lại phiên",
};

/** Xét theo thứ tự: kiểu cụ thể đứng trước kiểu chung (ví dụ "quá dài" trước "kie.ai từ chối yêu cầu"). */
const CAUSES: (FailureCause & { test: RegExp })[] = [
  {
    key: "credits",
    label: "Hết token kie.ai",
    fix: "admin",
    advice: "Nạp thêm token cho tài khoản kie.ai. Ảnh lỗi trong lúc hết token phải bấm Tạo lại sau khi nạp.",
    test: /hết credits|\(mã 402\)|insufficient (credit|balance)|not enough credit/i,
  },
  {
    key: "api_key",
    label: "Khóa kie.ai không dùng được",
    fix: "admin",
    advice: "Kiểm tra KIE_API_KEY trong file .env của máy chủ (sai, hết hạn hoặc đã bị thu hồi) rồi nạp lại web.",
    test: /không hợp lệ hoặc đã bị thu hồi|\(mã 401\)/i,
  },
  {
    key: "missing_file",
    label: "Ảnh chất liệu không còn trong kho",
    fix: "admin",
    advice: "Đồng bộ lại dữ liệu chất liệu (npm run materials:import) hoặc vào Quản trị > Chất liệu tải lại ảnh hai lớp của các chất liệu được nêu tên.",
    test: /không còn trong kho ảnh/i,
  },
  {
    key: "too_many_refs",
    label: "Một ảnh có quá nhiều ảnh tham chiếu",
    fix: "admin",
    advice: "Giảm số chất liệu trong một trang mẫu, hoặc giảm số ảnh phong cách đính kèm cho một lượt thiết kế.",
    test: /quá giới hạn \d+ ảnh tham chiếu|tối đa \d+ ảnh tham chiếu/i,
  },
  {
    key: "no_reference",
    label: "Chất liệu chưa có ảnh tham chiếu",
    fix: "admin",
    advice: "Vào Quản trị > Chất liệu tải ảnh cho chất liệu được nêu tên, hoặc tắt chất liệu đó cho tới khi có ảnh.",
    test: /chưa có ảnh tham chiếu/i,
  },
  {
    key: "pinterest",
    label: "Ảnh Pinterest tham khảo không dùng được",
    fix: "review",
    advice: "Tạo lại lượt thiết kế và chọn ảnh phong cách khác. Nếu lặp lại, đồng bộ lại thư viện Pinterest ở Kết nối > Pinterest.",
    test: /ảnh phong cách pinterest|ảnh pinterest/i,
  },
  {
    key: "prompt_too_long",
    label: "Lời dặn gửi AI quá dài so với model",
    fix: "admin",
    advice: "Mỗi model nhận lời dặn dài ngắn khác nhau. Rút gọn prompt ở Quản trị > Prompt và mô tả chất liệu, giảm số chất liệu trong một ảnh, hoặc đổi sang model nhận được lời dặn dài hơn.",
    test: /text length cannot exceed|prompt dài \d+ ký tự|prompt (is )?too long|maximum (prompt )?length/i,
  },
  {
    key: "resolution",
    label: "Model không hỗ trợ độ phân giải đã chọn",
    fix: "admin",
    advice: "Đổi độ phân giải hoặc đổi model ở Quản trị > Cấu hình.",
    test: /không hỗ trợ độ phân giải/i,
  },
  {
    key: "content",
    label: "AI từ chối vì nội dung",
    fix: "review",
    advice: "Mở các phiên này xem logo và lời dặn: thường do logo có hình, chữ nhạy cảm hoặc trùng thương hiệu nổi tiếng. Thử sửa lời dặn hoặc đổi model.",
    test: /content polic|safety|moderat|nsfw|sensitive|violat|flagged|prohibited|inappropriate/i,
  },
  {
    key: "queue",
    label: "Xếp hàng quá lâu (hệ thống đông hoặc kie.ai giới hạn tốc độ)",
    fix: "retry",
    advice: "Bấm Tạo lại lúc vắng hơn. Nếu lặp lại nhiều ngày: tạo ít ảnh hơn mỗi phiên, tránh nhiều người tạo cùng lúc, hoặc nâng hạn mức tài khoản kie.ai.",
    test: /đã chờ quá lâu|giới hạn tốc độ|rate limit|too many requests|\(mã 429\)/i,
  },
  {
    key: "timeout",
    label: "kie.ai tạo quá lâu chưa xong",
    fix: "retry",
    advice: "Bấm Tạo lại. Nếu lỗi dồn vào một khung giờ hoặc một model thì kie.ai đang quá tải ở đó: đổi giờ tạo hoặc đổi model.",
    test: /quá thời gian chờ nhà cung cấp/i,
  },
  {
    key: "result",
    label: "Không tải hoặc xử lý được ảnh kết quả",
    fix: "retry",
    advice: "Bấm Tạo lại. AI đã vẽ xong nhưng bước tải ảnh về hoặc ghép ảnh bị hỏng; nếu lặp lại, kiểm tra kho ảnh và dung lượng máy chủ.",
    test: /ảnh kết quả|kết quả không phải ảnh|không trả về đường dẫn ảnh|không có ảnh kết quả|thiếu ảnh của một mảnh|không có mảnh nào|kích thước mảnh/i,
  },
  {
    key: "network",
    label: "Mất kết nối tới kie.ai",
    fix: "retry",
    advice: "Bấm Tạo lại. Nếu lặp lại, kiểm tra mạng của máy chủ và trạng thái dịch vụ của kie.ai.",
    test: /không kết nối được kie\.ai|dữ liệu không đọc được|fetch failed|econn|etimedout|enotfound|socket hang up|network error|timed? ?out|aborted/i,
  },
  {
    key: "rejected",
    label: "kie.ai từ chối yêu cầu (lý do khác)",
    fix: "review",
    advice: "Đọc câu lỗi gốc trong ngoặc: thường do tham số của model (tỉ lệ khung, độ phân giải, số ảnh tham chiếu). Nếu chỉ một model bị thì đổi model.",
    test: /từ chối yêu cầu \(mã \d+\)/i,
  },
  {
    key: "provider",
    label: "kie.ai báo tạo ảnh thất bại",
    fix: "retry",
    advice: "Bấm Tạo lại. Nếu một model lỗi liên tục thì đổi model ở Quản trị > Cấu hình.",
    test: /kie\.ai báo lỗi|báo tạo ảnh thất bại|nhà cung cấp báo lỗi|thiếu mã tác vụ|không trả về taskid|internal (server )?error|server error|\(mã 5\d\d\)/i,
  },
];

const OTHER: FailureCause = {
  key: "other",
  label: "Lỗi khác",
  fix: "review",
  advice: "Mở phiên để xem lỗi gốc. Nếu cùng một câu lỗi lặp lại nhiều lần, gửi câu đó cho người phát triển.",
};

const BY_KEY = new Map<string, FailureCause>([...CAUSES, OTHER].map((c) => [c.key, { key: c.key, label: c.label, fix: c.fix, advice: c.advice }]));

export function classifyFailure(message: string | null | undefined): FailureCause {
  const text = message ?? "";
  const hit = text ? CAUSES.find((c) => c.test.test(text)) : undefined;
  return BY_KEY.get(hit?.key ?? "other")!;
}

/** Tra nguyên nhân theo khóa (đọc từ tham số ?cause= trên đường dẫn); khóa lạ thì null. */
export function failureCauseByKey(key: string | undefined | null): FailureCause | null {
  return (key && BY_KEY.get(key)) || null;
}

/** Mã các chất liệu được nêu tên trong câu lỗi thiếu ảnh ("Ảnh của chất liệu A, B không còn...", "Chất liệu A chưa có..."). */
export function materialCodesInMessage(message: string | null | undefined): string[] {
  const m = /chất liệu\s+([^().]+?)\s+(?:không còn|chưa có)/i.exec(message ?? "");
  if (!m) return [];
  return [...new Set(m[1].split(",").map((s) => s.trim()).filter((s) => s && s.length <= 40))];
}

export type FailureInput = {
  at: Date;
  kind: "SHEET" | "DESIGN";
  message: string | null;
  /** mã chất liệu của ảnh thiết kế (ảnh catalog có nhiều chất liệu nên để trống) */
  materialCode?: string | null;
  /** ảnh này đã được bấm Tạo lại chưa, và lần tạo lại có ra ảnh không */
  retry: "none" | "ok" | "failed" | "running";
};

export type CauseSummary = FailureCause & {
  count: number;
  /** phần trăm trên tổng số ảnh lỗi (một chữ số thập phân) */
  share: number;
  sheet: number;
  design: number;
  /** số ảnh đã có kết quả tạo lại, và trong đó bao nhiêu ảnh ra được */
  retried: number;
  retryOk: number;
  lastAt: Date;
  /** chất liệu gặp nhiều nhất trong nhóm này (tối đa 4) */
  materials: { code: string; count: number }[];
  /** câu lỗi gốc gặp nhiều nhất trong nhóm, và nhóm có bao nhiêu câu khác nhau */
  sample: string | null;
  variants: number;
};

/** Bỏ các con số riêng của từng lần (số ký tự, mã tác vụ...) để hai câu lỗi cùng kiểu được tính là một. */
function messageShape(message: string): string {
  return message.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/** Gom ảnh lỗi theo nguyên nhân, nhóm nhiều ảnh nhất đứng trước. */
export function summarizeFailures(rows: FailureInput[]): CauseSummary[] {
  type Acc = CauseSummary & { mats: Map<string, number>; shapes: Map<string, { n: number; text: string }> };
  const groups = new Map<FailureCauseKey, Acc>();
  for (const r of rows) {
    const cause = classifyFailure(r.message);
    let g = groups.get(cause.key);
    if (!g) {
      g = { ...cause, count: 0, share: 0, sheet: 0, design: 0, retried: 0, retryOk: 0, lastAt: r.at, materials: [], sample: null, variants: 0, mats: new Map(), shapes: new Map() };
      groups.set(cause.key, g);
    }
    g.count++;
    if (r.kind === "SHEET") g.sheet++;
    else g.design++;
    if (r.retry === "ok" || r.retry === "failed") g.retried++;
    if (r.retry === "ok") g.retryOk++;
    if (r.at > g.lastAt) g.lastAt = r.at;
    for (const code of new Set([...(r.materialCode ? [r.materialCode] : []), ...materialCodesInMessage(r.message)])) g.mats.set(code, (g.mats.get(code) ?? 0) + 1);
    if (r.message) {
      const shape = messageShape(r.message);
      const s = g.shapes.get(shape);
      if (s) s.n++;
      else g.shapes.set(shape, { n: 1, text: r.message });
    }
  }
  const total = rows.length;
  return [...groups.values()]
    .map(({ mats, shapes, ...g }) => ({
      ...g,
      share: total === 0 ? 0 : Math.round((g.count / total) * 1000) / 10,
      materials: [...mats.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
        .slice(0, 4),
      sample: [...shapes.values()].sort((a, b) => b.n - a.n)[0]?.text ?? null,
      variants: shapes.size,
    }))
    .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime());
}

export type ModelFailure = { model: string; total: number; failed: number; rate: number | null };

/**
 * Tỉ lệ lỗi theo model AI trong số ảnh đã có kết quả (xong hoặc lỗi; ảnh đang tạo không tính). Model có lỗi và tỉ lệ cao
 * đứng trước; model chưa có ảnh nào ra kết quả thì bỏ.
 */
export function modelFailureRates(groups: { model: string; status: string; count: number }[]): ModelFailure[] {
  const by = new Map<string, { ok: number; failed: number }>();
  for (const g of groups) {
    if (g.status !== "SUCCESS" && g.status !== "FAILED") continue;
    const m = by.get(g.model) ?? { ok: 0, failed: 0 };
    if (g.status === "FAILED") m.failed += g.count;
    else m.ok += g.count;
    by.set(g.model, m);
  }
  return [...by.entries()]
    .map(([model, v]) => ({ model, total: v.ok + v.failed, failed: v.failed, rate: v.ok + v.failed === 0 ? null : Math.round((v.failed / (v.ok + v.failed)) * 1000) / 10 }))
    .filter((m) => m.total > 0)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.failed - a.failed || b.total - a.total || a.model.localeCompare(b.model));
}

/** Số ảnh lỗi mỗi ngày trong khoảng; `dayOf` đổi mốc thời gian thành "YYYY-MM-DD" theo múi giờ cấu hình. */
export function failuresByDay(rows: { at: Date }[], days: string[], dayOf: (d: Date) => string): { day: string; failed: number }[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const r of rows) {
    const day = dayOf(r.at);
    if (map.has(day)) map.set(day, map.get(day)! + 1);
  }
  return days.map((day) => ({ day, failed: map.get(day)! }));
}

/** Cắt một trang của danh sách; số trang ngoài khoảng thì đưa về trang gần nhất. */
export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(pages, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pages, from: slice.length ? start + 1 : 0, to: start + slice.length };
}
