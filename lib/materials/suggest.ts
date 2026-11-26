/**
 * AI chọn chất liệu hợp với một logo (docs/DECISIONS.md D115). File này chỉ có phép tính thuần (dựng câu hỏi, đọc câu trả
 * lời), không gọi mạng, không đụng CSDL, để kiểm thử được. Phần gọi AI và tạo phiên nằm ở lib/jobs/auto.ts.
 *
 * AI nhận ảnh logo + danh mục chất liệu đang bật dưới dạng chữ (mỗi chất liệu một dòng, lấy từ các nhãn admin đã gắn: nhóm,
 * công nghệ, bề mặt, họa tiết, màu, độ dày, phong cách, mô tả). Không gửi ảnh chất liệu: 60-80 ảnh mỗi lượt thì đắt và chậm.
 * Chất liệu được đánh số thứ tự 1..n trong câu hỏi và AI trả về số đó, không trả mã: mã của xưởng có cái rất ngắn ("5", "7",
 * "123b") nên dễ bị AI chép sai hoặc nhầm với số khác.
 */

/** Dấu hiệu trong câu system để bản chat giả (MockChat) nhận ra đây là lượt chọn chất liệu. */
export const MATERIAL_PICK_MARKER = "[[CHON_CHAT_LIEU]]";

export type CatalogMaterial = {
  id: string;
  code: string;
  name: string;
  group: string;
  technique: string;
  finish: string;
  pattern: string;
  frontColor: string;
  backColor: string;
  thickness: string;
  styles: string[];
  desc: string;
};

export type MaterialPick = { materialId: string; code: string; name: string; reason: string };
export type LogoAnalysis = { summary: string; isBadge: boolean; picks: MaterialPick[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Một dòng mô tả chất liệu cho AI. `n` là số thứ tự (từ 1) AI sẽ dùng để trả lời. */
export function catalogLine(m: CatalogMaterial, n: number): string {
  const colour = m.backColor && m.backColor !== m.frontColor ? `màu ${m.frontColor || "?"}, mặt sau ${m.backColor}` : `màu ${m.frontColor || "?"}`;
  const parts = [
    `${n}. [${m.code}] ${clean(m.name)}`,
    [m.group, m.technique].filter(Boolean).join(", "),
    [m.finish && `bề mặt ${m.finish}`, m.pattern && `họa tiết ${m.pattern}`].filter(Boolean).join(", "),
    colour,
    m.thickness && `dày ${m.thickness}`,
    m.styles.length > 0 && `hợp: ${m.styles.join(", ")}`,
    m.desc && cut(clean(m.desc), 160),
  ];
  return parts.filter(Boolean).join(" | ");
}

/**
 * Ngữ cảnh "thiết kế theo mẫu Pinterest" (D125): khách đã ưng vài ảnh mẫu, AI chọn chất liệu hợp cả logo lẫn các mẫu đó.
 * `images` = số ảnh mẫu nơi gọi đính kèm SAU ảnh logo (0 nếu không gửi được ảnh, khi đó chỉ dùng phần chữ).
 */
export type PickSample = { images: number; productType: string; techniques: string[] };

/** Câu system và câu hỏi (phần chữ) gửi AI; ảnh logo (và ảnh mẫu, nếu có) được nơi gọi đính kèm vào câu hỏi. */
export function buildPickMessages(input: { count: number; materials: CatalogMaterial[]; sample?: PickSample }): { system: string; user: string } {
  const count = Math.min(input.count, input.materials.length);
  const sample = input.sample;
  const techniques = sample?.techniques.map(clean).filter(Boolean) ?? [];
  const system = `${MATERIAL_PICK_MARKER} Bạn là chuyên viên tư vấn của một xưởng làm logo decal bằng khắc laser và cắt laser. Nhiệm vụ: xem ảnh logo của khách rồi chọn những chất liệu của xưởng hợp với logo đó nhất để làm mẫu cho khách xem. Chỉ trả về JSON hợp lệ, không thêm chữ nào khác.`;
  const user = [
    !sample || sample.images === 0
      ? "Ảnh đính kèm là logo của khách."
      : `Ảnh đính kèm ĐẦU TIÊN là logo của khách. ${sample.images === 1 ? "Ảnh thứ hai là MẪU SẢN PHẨM" : `${sample.images} ảnh tiếp theo là các MẪU SẢN PHẨM`} khách thích (ảnh tham khảo, không phải sản phẩm của xưởng).`,
    "",
    "Việc 1. Nhận xét logo: phong cách, tông màu chính, nét mảnh hay đậm, có chữ nhỏ không.",
    "Việc 2. Logo có phải DẠNG HUY HIỆU/BẢNG không: tức là logo có sẵn một mảng nền riêng (chữ nhật, bo góc, tròn, khiên...) kèm đường khung viền bao quanh biểu tượng và chữ. Logo chỉ gồm biểu tượng và chữ đặt trên nền trống thì KHÔNG phải.",
    `Việc 3. Chọn đúng ${count} chất liệu hợp nhất trong danh sách bên dưới, xếp từ hợp nhất xuống. Cách chọn:`,
    "- Ưu tiên chất liệu có phong cách, màu và bề mặt hợp với nhận diện của logo và ngành hàng mà logo gợi ra.",
    "- Logo có nét rất mảnh hoặc chữ rất nhỏ: tránh họa tiết rối (caro, hoa văn, lấp lánh) làm khó đọc, ưu tiên bề mặt trơn và tương phản rõ.",
    "- Danh sách chọn ra phải đa dạng: không chọn toàn một màu hay một nhóm, để khách có nhiều hướng so sánh, nhưng cái nào cũng phải hợp logo.",
    ...(sample
      ? [
          `- Khách muốn làm: ${cut(clean(sample.productType), 120) || "sản phẩm gắn logo"}. Chất liệu phải hợp để làm loại sản phẩm này.`,
          ...(sample.images > 0 ? ["- Ưu tiên chất liệu có màu, bề mặt và cảm giác gần với (các) mẫu sản phẩm khách thích, nhưng vẫn phải hợp logo."] : []),
        ]
      : []),
    techniques.length > 0
      ? `- Mẫu khách thích thuộc nhóm công nghệ: ${techniques.join(", ")}. Ưu tiên chất liệu dùng công nghệ này; chỉ chọn công nghệ khác khi không đủ chất liệu hợp.`
      : "- Giữ cả hai công nghệ nếu đều có chất liệu hợp: khắc laser (hai lớp, hai màu) và cắt laser (một lớp).",
    "- Chỉ chọn trong danh sách, dùng đúng số thứ tự ở đầu dòng, không chọn trùng.",
    "",
    "Chỉ trả về MỘT đối tượng JSON hợp lệ đúng dạng dưới đây: tên khóa đặt trong dấu nháy kép, không bọc trong thẻ, hàm (ví dụ JSON.stringify) hay khối mã, không thêm chữ nào trước và sau.",
    '{"summary":"1-2 câu nhận xét logo bằng tiếng Việt","isBadge":true hoặc false,"picks":[{"id":<số thứ tự>,"reason":"lý do ngắn bằng tiếng Việt, tối đa 15 từ"}]}',
    "",
    `DANH SÁCH CHẤT LIỆU (${input.materials.length} dòng):`,
    ...input.materials.map((m, i) => catalogLine(m, i + 1)),
  ].join("\n");
  return { system, user };
}

/** Lấy khối JSON đầu tiên trong câu trả lời (AI hay bọc trong ```json, <escape>... hoặc thêm chữ trước sau). */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Một chuỗi trong nháy kép hoặc nháy đơn (có thể chứa dấu nháy đã thoát). Hai nhóm bắt: nội dung nháy kép, nội dung nháy đơn. */
const STR = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'`;
const KEY = (name: string) => String.raw`["']?${name}["']?\s*:\s*`;

/** Bỏ dấu thoát của một chuỗi vừa bắt được bằng STR (nháy kép dùng JSON.parse; hỏng thì gỡ tay các dấu thoát thường gặp). */
function unescapeCaptured(double: string | undefined, single: string | undefined): string {
  if (double !== undefined) {
    try {
      return JSON.parse(`"${double}"`) as string;
    } catch {
      /* rơi xuống gỡ tay */
    }
  }
  return (double ?? single ?? "").replace(/\\n/g, " ").replace(/\\(["'\\])/g, "$1");
}

/**
 * Vớt nội dung khi AI trả lời KHÔNG phải JSON chuẩn nhưng vẫn đủ ý. Gặp thật với gpt-5-2 (11/2026): câu trả lời là
 * `<text preserveWhitespace>{JSON.stringify({ summary: "...", isBadge: false, picks: [{id: 4, reason: "..."}, ...] })}`,
 * tức đối tượng kiểu JavaScript (tên khóa không có nháy) bọc trong hàm và thẻ, JSON.parse từ chối toàn bộ. Cũng vớt được
 * câu trả lời bị cắt giữa chừng: lấy các lựa chọn đã viết xong. Chỉ nhận đúng các mẩu có dạng {id: số, reason: "chuỗi"}.
 */
function salvage(text: string): { summary?: string; isBadge?: boolean; picks: { id: number; reason: string }[] } | null {
  const picks: { id: number; reason: string; at: number }[] = [];
  const idFirst = new RegExp(String.raw`\{\s*${KEY("id")}["']?(\d+)["']?\s*(?:,\s*${KEY("reason")}(?:${STR}))?`, "g");
  for (const m of text.matchAll(idFirst)) picks.push({ id: Number(m[1]), reason: unescapeCaptured(m[2], m[3]), at: m.index });
  const reasonFirst = new RegExp(String.raw`\{\s*${KEY("reason")}(?:${STR})\s*,\s*${KEY("id")}["']?(\d+)`, "g");
  for (const m of text.matchAll(reasonFirst)) picks.push({ id: Number(m[3]), reason: unescapeCaptured(m[1], m[2]), at: m.index });
  if (picks.length === 0) return null;
  picks.sort((a, b) => a.at - b.at); // giữ thứ tự AI xếp

  const summary = new RegExp(String.raw`${KEY("summary")}(?:${STR})`).exec(text);
  const badge = new RegExp(String.raw`${KEY("isBadge")}["']?(true|false)`, "i").exec(text);
  return {
    summary: summary ? unescapeCaptured(summary[1], summary[2]) : undefined,
    isBadge: badge ? badge[1].toLowerCase() === "true" : undefined,
    picks: picks.map(({ id, reason }) => ({ id, reason })),
  };
}

/**
 * Đọc câu trả lời của AI. Bỏ số thứ tự lạ hoặc trùng, giữ đúng thứ tự AI xếp, cắt còn `count`. Không có lựa chọn hợp lệ nào
 * thì trả null (nơi gọi báo lỗi, không tự tạo ảnh). Thử JSON chuẩn trước; không được thì vớt theo mẫu (xem salvage).
 */
export function parsePickResponse(text: string, materials: CatalogMaterial[], count: number): LogoAnalysis | null {
  const strict = extractJson(text);
  const data = strict && typeof strict === "object" && Array.isArray((strict as { picks?: unknown }).picks) ? strict : salvage(text);
  if (!data || typeof data !== "object") return null;
  const obj = data as { summary?: unknown; isBadge?: unknown; picks?: unknown };
  if (!Array.isArray(obj.picks)) return null;

  const seen = new Set<number>();
  const picks: MaterialPick[] = [];
  for (const raw of obj.picks) {
    if (picks.length >= count) break;
    if (!raw || typeof raw !== "object") continue;
    const p = raw as { id?: unknown; reason?: unknown };
    const n = typeof p.id === "number" ? p.id : typeof p.id === "string" && /^\d+$/.test(p.id.trim()) ? Number(p.id.trim()) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > materials.length || seen.has(n)) continue;
    seen.add(n);
    const m = materials[n - 1];
    picks.push({ materialId: m.id, code: m.code, name: m.name, reason: typeof p.reason === "string" ? cut(clean(p.reason), 200) : "" });
  }
  if (picks.length === 0) return null;
  return {
    summary: typeof obj.summary === "string" ? cut(clean(obj.summary), 600) : "",
    isBadge: obj.isBadge === true,
    picks,
  };
}
