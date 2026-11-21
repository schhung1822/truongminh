import { FINISH_RULES, finishKindOf } from "./finish";

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

export type MaterialForPrompt = { printTech: string; technique?: string | null };

/**
 * Prompt thiết kế: thay biến, và dặn kiểu hoàn thiện (khắc / cắt / in UV) của chất liệu.
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
 * Sinh {{materials_list}}. Mỗi dòng: "Cell 3 = reference image 4: <cách lấy chất liệu>, technique: <công nghệ in>. Finish: <kiểu hoàn thiện>".
 * Chất liệu được mô tả bằng ảnh tham chiếu hai nửa (trái = mặt trước, phải = mặt sau); kiểu hoàn thiện (khắc / cắt / in UV)
 * lấy từ công nghệ của chất liệu, riêng hàng chỉ cắt thì chỉ dùng nửa trái (xem lib/prompts/finish.ts).
 * Ảnh tham chiếu số 1 là logo nên ô thứ k (tính từ 1) ứng với ảnh tham chiếu số k + 1.
 * Nếu trang chưa đầy ô thì thêm dòng dặn AI để trống các ô còn lại.
 */
export function buildMaterialsList(materials: MaterialForPrompt[], grid: { cols: number; rows: number }): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const lines = materials.map((m, i) => {
    const kind = finishKindOf(m);
    const use =
      kind === "CUT"
        ? "use ONLY the front material shown in the LEFT panel of the reference image"
        : "use the front and back materials shown in the two panels of the reference image";
    return `Cell ${i + 1} = reference image ${i + 2}: ${use}, technique: ${clean(m.printTech)}. Finish: ${FINISH_RULES[kind]}`;
  });

  const total = grid.cols * grid.rows;
  if (materials.length < total) {
    const first = materials.length + 1;
    lines.push(
      first === total
        ? `Cell ${total}: leave completely empty (plain white).`
        : `Cells ${first} to ${total}: leave completely empty (plain white).`,
    );
  }
  return lines.join("\n");
}
