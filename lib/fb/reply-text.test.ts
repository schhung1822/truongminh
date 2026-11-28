import { describe, expect, it } from "vitest";
import { checkAiDraft, DEFAULT_TEMPLATES, isTemplateKind, maskContacts, materialPhrase, mentionsPhone, NO_MATERIAL, pickNextTemplate, renderTemplate, sameWording, sentenceCount, TEMPLATE_KINDS, unknownVars } from "./reply-text";

describe("renderTemplate", () => {
  it("thay đủ các biến", () => {
    expect(
      renderTemplate("Chào {ten}, bên em là {ten_page} ({link_page}). {san_pham} hợp với {vat_lieu_goi_y}.", {
        ten: "Anh Nam",
        ten_page: "Vật Liệu Logo ABC",
        link_page: "https://www.facebook.com/abc",
        san_pham: "Áo polo mẫu P01",
        vat_lieu_goi_y: "Vân xoắn bạc xám hoặc Navy xám than",
      }),
    ).toBe("Chào Anh Nam, bên em là Vật Liệu Logo ABC (https://www.facebook.com/abc). Áo polo mẫu P01 hợp với Vân xoắn bạc xám hoặc Navy xám than.");
  });

  it("biến thiếu giá trị thì bỏ gọn, không lộ ngoặc nhọn hay dấu câu thừa", () => {
    expect(renderTemplate("Dạ chào {ten}, bên em là {ten_page} ({link_page}).", { ten: "", ten_page: "ABC" })).toBe("Dạ chào, bên em là ABC.");
  });

  it("giữ nguyên chữ trong ngoặc nhọn không phải biến của hệ thống", () => {
    expect(renderTemplate("Mã {abc} và {ten}", { ten: "Lan" })).toBe("Mã {abc} và Lan");
    expect(unknownVars("Chào {ten}, {tenpage} và {vat_lieu}")).toEqual(["tenpage", "vat_lieu"]);
    expect(unknownVars("Chào {ten} {ten_page} {link_page} {san_pham} {vat_lieu_goi_y}")).toEqual([]);
  });
});

describe("materialPhrase", () => {
  it("chỉ nhắc 1-2 vật liệu đầu, không liệt kê dài", () => {
    expect(materialPhrase([{ name: "Vân xoắn bạc xám" }])).toBe("Vân xoắn bạc xám");
    expect(materialPhrase([{ name: "A", kind: "Nhựa, Khắc laser" }, { name: "B" }, { name: "C" }])).toBe("A (nhựa, khắc laser) hoặc B");
  });
  it("hai vật liệu cùng loại thì ghi loại một lần", () => {
    expect(materialPhrase([{ name: "A", kind: "Nhựa, Khắc laser" }, { name: "B", kind: "nhựa, khắc laser" }])).toBe("A hoặc B (nhựa, khắc laser)");
    expect(materialPhrase([{ name: "A", kind: "Nhựa" }, { name: "B", kind: "Vải" }])).toBe("A (nhựa) hoặc B (vải)");
  });
  it("bài chưa chọn vật liệu thì dùng cụm chung", () => {
    expect(materialPhrase([])).toBe(NO_MATERIAL);
  });
});

describe("pickNextTemplate", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("xoay vòng: hai comment liền nhau không dùng chung một mẫu", () => {
    expect(pickNextTemplate(list, null)?.id).toBe("a");
    expect(pickNextTemplate(list, "a")?.id).toBe("b");
    expect(pickNextTemplate(list, "c")?.id).toBe("a");
  });
  it("mẫu vừa dùng đã bị xóa thì quay về mẫu đầu; không có mẫu thì null", () => {
    expect(pickNextTemplate(list, "da-xoa")?.id).toBe("a");
    expect(pickNextTemplate([], "a")).toBeNull();
  });
});

describe("mentionsPhone và maskContacts", () => {
  it("nhận ra số của người comment dù viết kiểu nào", () => {
    expect(mentionsPhone("Em gọi anh số 0912.345.678 nhé", ["0912345678"])).toBe(true);
    expect(mentionsPhone("Em gọi anh số +84 912 345 678 nhé", ["0912345678"])).toBe(true);
    expect(mentionsPhone("Hotline bên em 0987654321", ["0912345678"])).toBe(false);
    expect(mentionsPhone("Không có số", [])).toBe(false);
  });
  it("che số điện thoại và email trước khi đưa cho AI, giữ phần còn lại", () => {
    const masked = maskContacts("Xưởng may áo thun, nhận từ 200 cái. LH 0912 345 678 hoặc xuong.a@gmail.com");
    expect(masked).not.toMatch(/0912|345 678|gmail/);
    expect(masked).toContain("Xưởng may áo thun, nhận từ 200 cái");
    expect(masked).toContain("[số điện thoại]");
    expect(masked).toContain("[email]");
  });
  it("không che số không phải số điện thoại (số lượng, giá)", () => {
    expect(maskContacts("nhận đơn từ 200 cái, giá 15.000")).toBe("nhận đơn từ 200 cái, giá 15.000");
  });
});

describe("sentenceCount và sameWording", () => {
  it("đếm câu theo dấu kết câu", () => {
    expect(sentenceCount("Dạ chào anh. Anh nhắn page giúp em nhé.")).toBe(2);
    expect(sentenceCount("Dạ chào anh ạ")).toBe(1);
    expect(sentenceCount("Một. Hai! Ba? Bốn.")).toBe(4);
  });
  it("cùng nguyên văn dù khác hoa thường, dấu câu, khoảng trắng", () => {
    expect(sameWording("Dạ chào anh,  bên em là ABC.", "dạ chào anh bên em là abc")).toBe(true);
    expect(sameWording("Dạ chào anh, bên em là ABC.", "Dạ chào chị, bên em là ABC.")).toBe(false);
  });
});

describe("checkAiDraft (quy tắc cho câu AI soạn, v1.1 mục 4.2)", () => {
  const ctx = { pageName: "Vật Liệu Logo ABC", materialNames: ["Vân xoắn bạc xám", "Navy xám than"], commenterPhones: ["0912345678"], usedTexts: [] as string[] };
  const good = "Dạ chào anh, bên em là Vật Liệu Logo ABC chuyên vật liệu làm logo cho áo, mẫu này anh có thể tham khảo Vân xoắn bạc xám. Anh nhắn page giúp em để em gửi bảng mẫu nhé.";

  it("câu đúng quy tắc thì nhận", () => {
    expect(checkAiDraft(good, ctx)).toEqual({ ok: true });
  });
  it("thiếu tên fanpage", () => {
    expect(checkAiDraft(good.replace("Vật Liệu Logo ABC", "một đơn vị"), ctx)).toMatchObject({ ok: false, reason: "thiếu tên fanpage" });
  });
  it("không nhắc vật liệu gợi ý của bài", () => {
    expect(checkAiDraft(good.replace("Vân xoắn bạc xám", "decal PET"), ctx)).toMatchObject({ ok: false, reason: "không nhắc vật liệu gợi ý của bài" });
    // bài chưa chọn vật liệu thì không đòi
    expect(checkAiDraft(good.replace("Vân xoắn bạc xám", "vật liệu phù hợp"), { ...ctx, materialNames: [] })).toEqual({ ok: true });
  });
  it("nhắc lại số điện thoại của người comment", () => {
    expect(checkAiDraft(good + " Em gọi 0912 345 678.", ctx)).toMatchObject({ ok: false });
  });
  it("dài hơn 2 câu (cho phép lời chào tách riêng), quá dài, có link, còn biến", () => {
    expect(checkAiDraft(good + " Câu ba. Câu bốn.", ctx)).toMatchObject({ ok: false, reason: "dài hơn 2 câu" });
    expect(checkAiDraft(good + " " + "x".repeat(450), ctx)).toMatchObject({ ok: false, reason: "quá dài" });
    expect(checkAiDraft(good.replace("nhắn page", "vào https://abc.vn"), ctx)).toMatchObject({ ok: false, reason: "có đường link" });
    expect(checkAiDraft(good.replace("Vật Liệu Logo ABC", "{ten_page}"), ctx)).toMatchObject({ ok: false, reason: "còn biến chưa thay" });
  });
  it("không dùng lại nguyên văn câu đã có trong cùng bài", () => {
    expect(checkAiDraft(good, { ...ctx, usedTexts: [good.toUpperCase()] })).toMatchObject({ ok: false, reason: "trùng nguyên văn câu đã dùng trong bài" });
  });
});

describe("mẫu có sẵn", () => {
  it("mỗi loại câu có ít nhất một mẫu và không có biến lạ", () => {
    for (const k of TEMPLATE_KINDS) expect(DEFAULT_TEMPLATES.some((t) => t.purpose === k.purpose && t.category === k.category), k.label).toBe(true);
    for (const t of DEFAULT_TEMPLATES) {
      expect(unknownVars(t.text), t.text).toEqual([]);
      expect(isTemplateKind(t.purpose, t.category)).toBe(true);
    }
  });
  it("câu mời nhà sản xuất nói rõ là bên cung cấp vật liệu, có tên page và vật liệu gợi ý", () => {
    const offers = DEFAULT_TEMPLATES.filter((t) => t.category === "SUPPLIER_OFFER");
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const t of offers) {
      expect(t.text).toContain("{ten_page}");
      expect(t.text).toContain("{vat_lieu_goi_y}");
      expect(t.text).toMatch(/cung cấp vật liệu/);
    }
  });
  it("mẫu có sẵn dài 1-2 câu sau khi thay biến (v1.1 mục 4.2), kể cả khi bài chưa ghi sản phẩm và chưa chọn vật liệu", () => {
    const full = { ten: "Xưởng May A", ten_page: "Vật Liệu Logo ABC", link_page: "https://www.facebook.com/abc", san_pham: "Áo polo mẫu P01", vat_lieu_goi_y: "Vân xoắn bạc xám hoặc Navy xám than (nhựa, khắc laser)" };
    for (const t of DEFAULT_TEMPLATES) {
      expect(sentenceCount(renderTemplate(t.text, full)), t.text).toBeLessThanOrEqual(2);
      const bare = renderTemplate(t.text, { ten: "", ten_page: "Vật Liệu Logo ABC", san_pham: "mẫu này", vat_lieu_goi_y: NO_MATERIAL });
      expect(sentenceCount(bare), bare).toBeLessThanOrEqual(2);
      expect(bare).not.toMatch(/[{}]|\s[,.;]|,,/);
    }
  });

  it("bài tìm nhà sản xuất không có loại câu nào khác ngoài mời dùng vật liệu", () => {
    expect(isTemplateKind("FIND_SUPPLIER", "INTEREST")).toBe(false);
    expect(isTemplateKind("FIND_CUSTOMER", "SUPPLIER_OFFER")).toBe(false);
  });
});
