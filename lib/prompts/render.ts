import { faceClause, type FaceInfo } from "./face-words";
import { FINISH_LABEL, finishKindOf, finishRule, type FinishKind } from "./finish";

/** Sinh prompt từ mẫu có biến {{ten_bien}}. Phép tính thuần, không phụ thuộc CSDL. */

export const PROMPT_VARIABLES = [
  "rows",
  "cols",
  "materials_list",
  "product_type",
  "design_style",
  "note",
  "material_finish",
] as const;
export type PromptVariable = (typeof PROMPT_VARIABLES)[number];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Liệt kê tên biến xuất hiện trong mẫu (không trùng). */
export function extractVariables(template: string): string[] {
  return [...new Set([...template.matchAll(VAR_RE)].map((m) => m[1]))];
}

/**
 * Kiểm tra mẫu prompt trước khi lưu. Trả về lỗi tiếng Việt hoặc null.
 * - không được có biến lạ (gõ sai tên)
 * - mẫu catalog phải có {{materials_list}}
 */
export function validateTemplate(kind: "CATALOG" | "DESIGN", body: string): string | null {
  if (!body.trim()) return "Nội dung prompt không được để trống.";
  const unknown = extractVariables(body).filter((v) => !(PROMPT_VARIABLES as readonly string[]).includes(v));
  if (unknown.length > 0) {
    return `Prompt có biến không hợp lệ: ${unknown.map((v) => `{{${v}}}`).join(", ")}. Biến hợp lệ: ${PROMPT_VARIABLES.map((v) => `{{${v}}}`).join(", ")}.`;
  }
  if (kind === "CATALOG" && !extractVariables(body).includes("materials_list")) {
    return "Prompt catalog phải có biến {{materials_list}} để AI biết từng ô là chất liệu nào.";
  }
  return null;
}

/** Thay biến bằng giá trị. Biến trong mẫu mà không có giá trị truyền vào thì báo lỗi rõ ràng. */
export function renderPrompt(template: string, values: Partial<Record<PromptVariable, string | number>>): string {
  return template.replace(VAR_RE, (_all, name: string) => {
    const v = (values as Record<string, string | number | undefined>)[name];
    if (v === undefined) throw new Error(`Prompt dùng biến {{${name}}} nhưng không có giá trị để thay.`);
    return String(v);
  });
}

/**
 * Câu dặn AI khi lượt thiết kế có thêm (một hoặc nhiều, tối đa MAX_STYLE_REF_PINS) ảnh phong cách tham khảo
 * (sale chọn từ Pinterest). `startIndex` là số thứ tự ảnh tham chiếu đầu tiên trong số đó (ảnh thiết kế luôn có
 * ảnh 1 = logo, ảnh 2 = chất liệu, nên ảnh phong cách luôn bắt đầu từ ảnh 3); `count` là số ảnh phong cách đó.
 */
export function styleReferenceNote(startIndex: number, count = 1): string {
  if (count <= 1) {
    return `Reference image ${startIndex} is a style/mood reference photo chosen by the sales team: use ONLY its overall visual style (colour palette, mood, lighting, composition, background setting) as inspiration. Do NOT copy its logo, text, specific object shape or any other content from it — the product and logo already described above always take priority over reference image ${startIndex}.`;
  }
  const range = `${startIndex}-${startIndex + count - 1}`;
  return `Reference images ${range} are style/mood reference photos chosen by the sales team: use ONLY their overall visual style (colour palette, mood, lighting, composition, background setting) as inspiration, blending cues from all of them. Do NOT copy their logo, text, specific object shape or any other content — the product and logo already described above always take priority over reference images ${range}.`;
}

/** Màu hai mặt (FaceInfo) không bắt buộc: có thì được ghi vào dòng của ô để AI đối chiếu, xem lib/prompts/face-words.ts. */
export type MaterialForPrompt = { printTech: string; technique?: string | null } & FaceInfo;

/**
 * Prompt thiết kế: thay biến, và dặn kiểu hoàn thiện (khắc / cắt) của chất liệu.
 * Mẫu có {{material_finish}} thì câu dặn nằm đúng chỗ đó. Mẫu cũ chưa có biến này thì câu dặn được nối vào cuối,
 * để quy tắc phân biệt hàng cắt luôn có hiệu lực kể cả khi chưa cập nhật prompt.
 */
export function renderDesignPrompt(
  template: string,
  values: { product_type: string; design_style: string; note: string },
  finishRule: string,
): string {
  const out = renderPrompt(template, { ...values, material_finish: finishRule });
  if (extractVariables(template).includes("material_finish")) return out;
  return `${out}\n\nFinish of the logo piece (follow it exactly; it overrides any conflicting detail above): ${finishRule}`;
}

/**
 * Sinh {{materials_list}} (D113). Gồm hai phần:
 * 1. Định nghĩa các KIỂU HÀNG có mặt trong ảnh (ENGRAVED / CUT-ONLY), mỗi kiểu đúng MỘT lần. Trước đây câu dặn kiểu
 *    hàng bị chép lại cho từng ô nên prompt dài tới 15.000-23.000 ký tự: AI dễ bỏ qua chỉ dẫn, vượt giới hạn 20.000 ký
 *    tự của GPT Image khi có 9-10 ô khắc, và bị Seedream / MiniMax / Qwen (giới hạn 5.000 ký tự) từ chối.
 * 2. Mỗi ô một dòng ngắn: "Cell 3 (row 2, column 1) = reference image 4, type ENGRAVED (technique: Khắc laser)".
 *    Kiểu của ô lấy từ công nghệ của chính chất liệu đó (lib/prompts/finish.ts), không theo vị trí. Nêu cả hàng/cột để
 *    AI có điểm neo không gian, bớt tráo nhầm nội dung giữa các ô (D105).
 * `badge` = logo dạng huy hiệu/bảng do người dùng đánh dấu trên logo: quyết định hình dạng tấm khắc.
 * Ảnh tham chiếu số 1 là logo nên ô thứ k (tính từ 1) ứng với ảnh tham chiếu số k + 1.
 * Nếu trang chưa đầy ô thì thêm dòng dặn AI để trống các ô còn lại.
 *
 * D123, chống tráo chất liệu giữa các ô và khắc nhầm mặt:
 * 3. Dòng của ô ghi thêm màu mặt trước / mặt sau bằng chữ (khi chất liệu có dữ liệu), để AI có điểm đối chiếu ngoài thứ tự ảnh.
 * 4. Hai đoạn dặn ở cuối: cách đọc dải nhãn "CELL n / FRONT / BACK" gắn trên từng ảnh tham chiếu (lib/imaging/reference-tag.ts),
 *    và quy tắc không tráo hai mặt. Không bắt đầu dòng nào bằng "- " hay "Cell " để không lẫn với hai phần trên.
 */
/** Cách dùng dải nhãn gắn trên từng ảnh tham chiếu chất liệu (lib/imaging/reference-tag.ts). */
export const REFERENCE_STRIP_NOTE =
  "Reference strips: every material reference image carries a white header strip above its two panels. `CELL n` on the strip is the number of the cell that material belongs to, and LEFT = FRONT / RIGHT = BACK name its two panels. Use the strip only to match each image to its cell and to tell the two faces apart. Never draw the strip, its number or its words.";

/** Không tráo hai mặt, và dùng màu ghi trên dòng của ô để tự kiểm tra đã lấy đúng ảnh tham chiếu. */
export const FACES_NOTE =
  "Faces: where a cell's line names colours, they are a cross-check (the quoted Vietnamese names are our workshop's own labels). On an ENGRAVED piece the large untouched face is ALWAYS the FRONT panel's material and only the engraved marks show the BACK panel's material: never swap the two faces. If a reference image does not match the colours on its cell's line, it is the wrong reference image for that cell.";

export function buildMaterialsList(materials: MaterialForPrompt[], grid: { cols: number; rows: number }, opts: { badge?: boolean } = {}): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const kinds = materials.map((m) => finishKindOf(m));
  const types = (["ENGRAVE", "CUT"] as FinishKind[])
    .filter((k) => kinds.includes(k))
    .map((k) => `- ${FINISH_LABEL[k]} = ${finishRule(k, opts.badge)}`);

  const cells = materials.map((m, i) => {
    const row = Math.floor(i / grid.cols) + 1;
    const col = (i % grid.cols) + 1;
    const faces = faceClause(kinds[i], m);
    return `Cell ${i + 1} (row ${row}, column ${col}) = reference image ${i + 2}, type ${FINISH_LABEL[kinds[i]]} (technique: ${clean(m.printTech)})${faces ? `; ${faces}` : ""}`;
  });

  const total = grid.cols * grid.rows;
  if (materials.length < total) {
    const first = materials.length + 1;
    cells.push(
      first === total
        ? `Cell ${total}: leave completely empty (plain white).`
        : `Cells ${first} to ${total}: leave completely empty (plain white).`,
    );
  }
  return [
    "Product types. Each cell's type is fixed by our workshop from its material's production technique: follow the type written on the cell's line, never choose it from how the material looks or from the cell's position.",
    ...types,
    "",
    "Cells, in reading order (left to right, top to bottom):",
    ...cells,
    "",
    REFERENCE_STRIP_NOTE,
    FACES_NOTE,
  ].join("\n");
}
