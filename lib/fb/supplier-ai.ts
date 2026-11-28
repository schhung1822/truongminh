/**
 * AI phân loại nhà sản xuất và soạn câu mời dùng vật liệu (v1.1 mục 4.2). File này chỉ có phép tính thuần: dựng câu hỏi và đọc
 * câu trả lời. Phần gọi AI và ghi CSDL nằm ở lib/fb/offers.ts.
 *
 * Đầu vào cho AI: nội dung bài (gồm sản phẩm), nội dung comment ĐÃ CHE số điện thoại và email, danh sách vật liệu gợi ý
 * (tên + mô tả ngắn). Không gửi tên hay link trang cá nhân của người comment.
 */

/** Dấu hiệu trong câu system để bản chat giả (MockChat) nhận ra đây là lượt phân loại nhà sản xuất. */
export const SUPPLIER_AI_MARKER = "[[FB_NHA_SAN_XUAT]]";

export type SupplierType = "MANUFACTURER" | "BROKER" | "UNKNOWN";

export type SupplierAiInput = {
  postContent: string;
  productRef: string | null;
  /** Nội dung comment, đã che số điện thoại và email (maskContacts). */
  comment: string;
  /** Tên fanpage sẽ đứng ra trả lời; null khi chưa khai fanpage nào. */
  pageName: string | null;
  materials: { name: string; kind: string; desc: string }[];
  /** Các câu đã soạn / đã gửi trong cùng bài, để AI không lặp nguyên văn. */
  usedDrafts: string[];
};

export type SupplierAiResult = { supplierType: SupplierType; capability: string; shouldReply: boolean; draft: string };

const cut = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export function buildSupplierMessages(input: SupplierAiInput): { system: string; user: string } {
  const page = input.pageName ?? "fanpage của bên cung cấp vật liệu";
  const system = `${SUPPLIER_AI_MARKER} Bạn là trợ lý của một đơn vị cung cấp vật liệu làm logo, nhãn cho xưởng sản xuất. Đơn vị này đăng bài tìm nhà sản xuất trong nhóm Facebook; các xưởng vào comment. Nhiệm vụ: đọc một comment, cho biết người comment là xưởng sản xuất trực tiếp hay môi giới, tóm tắt năng lực họ tự nêu, và soạn câu trả lời mời họ dùng vật liệu phù hợp. Chỉ trả về JSON hợp lệ, không thêm chữ nào khác.`;
  const user = [
    "BÀI ĐĂNG:",
    cut(input.postContent || "(không có nội dung)", 1200),
    `SẢN PHẨM CỦA BÀI: ${input.productRef ? cut(input.productRef, 200) : "(chưa ghi)"}`,
    "",
    "COMMENT CẦN XỬ LÝ (số điện thoại và email đã được che):",
    cut(input.comment || "(trống)", 1500),
    "",
    input.materials.length > 0 ? `VẬT LIỆU GỢI Ý CHO SẢN PHẨM NÀY (${input.materials.length} dòng, chỉ được nhắc vật liệu trong danh sách, dùng ĐÚNG tên):` : "VẬT LIỆU GỢI Ý: (bài chưa chọn vật liệu nào, không nêu tên vật liệu cụ thể)",
    ...input.materials.map((m, i) => `${i + 1}. ${m.name}${m.kind ? ` | ${m.kind}` : ""}${m.desc ? ` | ${cut(m.desc, 160)}` : ""}`),
    "",
    "Việc 1. supplier_type: \"manufacturer\" nếu comment cho thấy họ tự sản xuất (xưởng, nhà máy, nhận may, nhận gia công, có máy, nêu số lượng tối thiểu...); \"broker\" nếu là môi giới, trung gian, nhận tìm xưởng hộ, hoặc chỉ bán lại; \"unknown\" nếu comment không đủ thông tin (chỉ để lại số, \"ib\", chấm...). Không đoán: thiếu căn cứ thì \"unknown\".",
    "Việc 2. capability: một câu ngắn tiếng Việt tóm tắt ĐÚNG những gì comment tự nói về mặt hàng và quy mô. Comment không nói thì để chuỗi rỗng. Không thêm thông tin comment không có.",
    "Việc 3. should_reply: false nếu comment là quảng cáo không liên quan, chửi bới, hoặc của người đi tìm xưởng giống bài đăng; còn lại true.",
    "Việc 4. draft: câu trả lời dưới comment đó, viết bằng tiếng Việt, theo đúng các quy tắc:",
    `- 1 đến 2 câu, giọng lịch sự, tự nhiên. Có tên "${page}" và nói rõ đây là bên cung cấp vật liệu. Không đóng vai người ngoài hay khách hàng.`,
    input.materials.length > 0 ? "- Nhắc đúng 1 hoặc 2 vật liệu trong danh sách trên hợp với sản phẩm của bài, không liệt kê dài." : "- Không bịa tên vật liệu.",
    "- Không nhắc lại số điện thoại, email của người comment. Không chèn đường link.",
    "- Mời họ nhắn fanpage để nhận bảng mẫu. Không hứa giá, không hứa thời gian giao.",
    input.usedDrafts.length > 0 ? `- Không dùng lại nguyên văn các câu đã có trong bài này:\n${input.usedDrafts.slice(0, 8).map((d) => `  · ${cut(d, 220)}`).join("\n")}` : "- Viết theo cách riêng, không rập khuôn.",
    "",
    "Chỉ trả về MỘT đối tượng JSON đúng dạng dưới đây: tên khóa trong nháy kép, không bọc trong thẻ hay khối mã, không thêm chữ nào trước và sau.",
    '{"supplier_type":"manufacturer|broker|unknown","capability":"...","should_reply":true,"draft":"..."}',
  ].join("\n");
  return { system, user };
}

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

const TYPES: Record<string, SupplierType> = { manufacturer: "MANUFACTURER", broker: "BROKER", unknown: "UNKNOWN" };

/** Đọc câu trả lời của AI. Không đúng dạng thì trả null (nơi gọi giữ câu soạn từ mẫu và để loại là "chưa rõ"). */
export function parseSupplierResponse(text: string): SupplierAiResult | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = typeof o.supplier_type === "string" ? TYPES[o.supplier_type.trim().toLowerCase()] : undefined;
  if (!type) return null;
  const capability = typeof o.capability === "string" ? o.capability.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const draft = typeof o.draft === "string" ? o.draft.replace(/\s+/g, " ").trim() : "";
  const shouldReply = typeof o.should_reply === "boolean" ? o.should_reply : true;
  return { supplierType: type, capability, shouldReply, draft };
}
