/** Sinh prompt từ mẫu có biến {{ten_bien}}. Phép tính thuần, không phụ thuộc CSDL. */

export const PROMPT_VARIABLES = [
  "rows",
  "cols",
  "materials_list",
  "product_type",
  "design_style",
  "note",
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

export type MaterialForPrompt = { descAi: string; printTech: string };

/**
 * Sinh {{materials_list}}. Mỗi dòng: "Cell 3 = reference image 4: <mô tả cho AI>, technique: <công nghệ in>".
 * Ảnh tham chiếu số 1 là logo nên ô thứ k (tính từ 1) ứng với ảnh tham chiếu số k + 1.
 * Nếu trang chưa đầy ô thì thêm dòng dặn AI để trống các ô còn lại.
 */
export function buildMaterialsList(materials: MaterialForPrompt[], grid: { cols: number; rows: number }): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const lines = materials.map((m, i) => {
    const desc = clean(m.descAi) || "use the front and back materials shown in the two panels of the reference image";
    return `Cell ${i + 1} = reference image ${i + 2}: ${desc}, technique: ${clean(m.printTech)}`;
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
