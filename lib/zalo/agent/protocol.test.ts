import { describe, expect, it } from "vitest";
import { buildSystemPrompt, claimsNoAccess, commandJson, confirmIntent, isStalling, parseAction, skipsTools, refFor, refLegend, resolveRef, toolResultMessage, trimThread, ASSISTANT_MARKER, TOOL_RESULT_PREFIX, type RefTable, type ThreadMsg, type ToolSpec } from "./protocol";

const TOOLS = new Set(["tim_khach", "tao_catalog", "xac_nhan"]);

describe("parseAction", () => {
  it("đọc lời gọi công cụ, kể cả khi bọc trong khối mã hoặc có chữ thừa", () => {
    expect(parseAction('{"tool":"tim_khach","args":{"ten":"Lascote"}}', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Lascote" } });
    expect(parseAction('Em tra nhé:\n```json\n{"tool": "tim_khach", "args": {"ten": "Anh Minh"}}\n```', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Anh Minh" } });
  });

  it('nhận khóa "lenh" (quy ước hiện tại) lẫn "tool" (tên cũ)', () => {
    expect(parseAction('{"lenh":"tim_khach","args":{"ten":"Gió"}}', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Gió" } });
    expect(parseAction('{"lenh":"xoa_het","args":{}}', TOOLS)).toBeNull();
    expect(commandJson("tim_khach", { ten: "Gió" })).toBe('{"lenh":"tim_khach","args":{"ten":"Gió"}}');
    expect(parseAction(commandJson("xac_nhan"), TOOLS)).toEqual({ kind: "tool", tool: "xac_nhan", args: {} });
  });

  it("thiếu args hoặc args sai kiểu thì coi là không có tham số", () => {
    expect(parseAction('{"tool":"xac_nhan"}', TOOLS)).toEqual({ kind: "tool", tool: "xac_nhan", args: {} });
    expect(parseAction('{"tool":"xac_nhan","args":"ok"}', TOOLS)).toEqual({ kind: "tool", tool: "xac_nhan", args: {} });
  });

  it("bỏ thẻ bọc mà model của kie.ai tự thêm quanh câu trả lời", () => {
    expect(parseAction('<escape>{"tool":"tim_khach","args":{"ten":"Lascote"}}</escape>', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Lascote" } });
    expect(parseAction("<escape>Dạ em chào anh ạ.</escape>", TOOLS)).toEqual({ kind: "say", text: "Dạ em chào anh ạ." });
  });

  it("đọc được dạng bọc trong JSON.stringify với tên khóa không nháy (model hay viết vậy)", () => {
    expect(parseAction('<text preserveWhitespace>{JSON.stringify({say:"Dạ, anh Minh ạ."})}</text>', TOOLS)).toEqual({ kind: "say", text: "Dạ, anh Minh ạ." });
    expect(parseAction('{JSON.stringify({ tool: "tim_khach", args: { ten: "Gió" } })}', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Gió" } });
  });

  it("đọc lời nói với người ra lệnh", () => {
    expect(parseAction('{"say":"Có 2 khách tên Minh, anh chọn ai ạ?"}', TOOLS)).toEqual({ kind: "say", text: "Có 2 khách tên Minh, anh chọn ai ạ?" });
  });

  it("AI trả lời chữ thường (quên JSON) thì vẫn dùng làm lời nói", () => {
    expect(parseAction("Dạ em chào anh ạ.", TOOLS)).toEqual({ kind: "say", text: "Dạ em chào anh ạ." });
  });

  it("vớt được khối kiểu JavaScript có tên khóa không nháy", () => {
    expect(parseAction('{tool: "tim_khach", args: {ten: "Gió"}}', TOOLS)).toEqual({ kind: "tool", tool: "tim_khach", args: { ten: "Gió" } });
  });

  it("gọi công cụ không có, JSON hỏng, hay khối rỗng thì trả null để hỏi lại AI", () => {
    expect(parseAction('{"tool":"xoa_het_du_lieu","args":{}}', TOOLS)).toBeNull();
    expect(parseAction('{"tool": "tim_khach", "args": {"ten": ', TOOLS)).toBeNull();
    expect(parseAction('{"say":""}', TOOLS)).toBeNull();
    expect(parseAction('{"khac":1}', TOOLS)).toBeNull();
    expect(parseAction("   ", TOOLS)).toBeNull();
  });
});

describe("buildSystemPrompt", () => {
  const facts = { workshopName: "Xưởng A", staffName: "Lan", staffRole: "Sale", groupName: null, hasRecentImage: false, lastCatalogImages: 0, sheetNames: ["Mẫu 80"], pending: null, knownRefs: [], now: "thứ Sáu 27/11/2026 10:00" };
  const tools: ToolSpec[] = [{ name: "tim_khach", usage: "ten*", description: "Tìm khách." }, { name: "xac_nhan", usage: "", description: "Đồng ý." }];

  it("có dấu nhận biết, quy ước JSON, danh sách công cụ kèm tham số và bối cảnh", () => {
    const p = buildSystemPrompt(tools, facts);
    expect(p).toContain(ASSISTANT_MARKER);
    expect(p).toContain('{"lenh": "<tên lệnh>", "args": {...}}');
    expect(p).toContain("mọi lệnh trong mục LỆNH bên dưới luôn dùng được");
    expect(p).toContain("- tim_khach(ten*): Tìm khách.");
    expect(p).toContain("- xac_nhan(): Đồng ý.");
    expect(p).toContain("Người ra lệnh: Lan (Sale)");
    expect(p).toContain("Đang chat riêng với bot");
    expect(p).toContain("KHÔNG có");
    expect(p).toContain('"Mẫu 80"');
    expect(p).toContain("Không có việc nào đang chờ xác nhận");
    expect(p).not.toContain("MÃ ĐÃ BIẾT:");
  });

  it("trong nhóm thì dặn không nhắc khách khác; có việc chờ và mã đã biết thì ghi rõ", () => {
    const p = buildSystemPrompt(tools, { ...facts, groupName: "Cà phê Gió", hasRecentImage: true, lastCatalogImages: 3, pending: "Em sẽ tạo 4 ảnh thiết kế móc khóa.", knownRefs: ["K1 = khách Anh Minh", "L1 = logo Lascote"] });
    expect(p).toContain('nhóm Zalo "Cà phê Gió"');
    expect(p).toContain("không nhắc khách khác");
    expect(p).toContain("(dùng làm logo mới được): CÓ.");
    expect(p).toContain("có 3 ảnh");
    expect(p).toContain("ĐANG CHỜ XÁC NHẬN: Em sẽ tạo 4 ảnh thiết kế móc khóa.");
    expect(p).toContain("MÃ ĐÃ BIẾT: K1 = khách Anh Minh; L1 = logo Lascote.");
  });

  it("có ví dụ hai bước dùng chỗ trống chứ không dùng mã thật (để AI không chép nhầm một mã có sẵn)", () => {
    const p = buildSystemPrompt(tools, facts);
    expect(p).toContain('{"lenh":"gui_lai_anh","args":{"phien":"<mã P>"}}');
    expect(p).not.toMatch(/"(logo|phien|khach)":"[KLPM]\d+"/);
  });

  it("lời dặn gọn: phần khung (chưa kể công cụ) dưới 3.000 ký tự", () => {
    expect(buildSystemPrompt([], facts).length).toBeLessThan(3000);
  });
});

describe("toolResultMessage / trimThread", () => {
  it("kết quả công cụ có tiền tố riêng và bị cắt nếu quá dài", () => {
    expect(toolResultMessage("tim_khach", { so_ket_qua: 0 })).toBe(`${TOOL_RESULT_PREFIX} tim_khach] {"so_ket_qua":0}`);
    expect(toolResultMessage("x", { a: "y".repeat(10_000) }).length).toBeLessThan(2600);
  });

  it("giữ phần mới nhất trong ngân sách và luôn bắt đầu ở lời người ra lệnh", () => {
    const m = (r: ThreadMsg["r"], c: string): ThreadMsg => ({ r, c });
    const log = [m("u", "a".repeat(50)), m("a", "b".repeat(50)), m("t", "c".repeat(50)), m("a", "d".repeat(50)), m("u", "e".repeat(50)), m("a", "f".repeat(50))];
    expect(trimThread(log, 1000)).toEqual(log);
    // đủ chỗ cho 4 tin cuối, nhưng tin đầu trong số đó là kết quả công cụ: lùi tới lời người ra lệnh kế tiếp
    expect(trimThread(log, 220).map((x) => x.c[0])).toEqual(["e", "f"]);
    expect(trimThread(log, 10)).toEqual([]);
    expect(trimThread(log, 1000, 2).map((x) => x.c[0])).toEqual(["e", "f"]);
  });
});

describe("isStalling", () => {
  it("nhận ra câu hứa suông ngắn", () => {
    for (const s of ["Dạ, để em kiểm tra hạn mức tạo ảnh hôm nay cho anh/chị ạ.", "Em sẽ tra giúp anh ngay ạ", "Anh đợi em chút nhé", "Chờ em một lát ạ", "Dạ em đang xem lại lịch sử của khách ạ"]) expect(isStalling(s), s).toBe(true);
  });

  it("câu trả lời thật, câu hỏi lại, câu dài thì không phải hứa suông", () => {
    for (const s of ["Hôm nay anh/chị còn 48 lượt ạ.", "Anh/chị muốn em kiểm tra khách nào ạ?", "Dạ em chào anh/chị ạ.", "Em sẽ tạo 3 ảnh thiết kế móc khóa. " + "x".repeat(200)]) expect(isStalling(s), s).toBe(false);
  });
});

describe("claimsNoAccess / skipsTools", () => {
  it("nhận ra câu AI tự bảo không dùng được công cụ hay dữ liệu", () => {
    for (const s of [
      "Em chưa kết nối được công cụ tra cứu khách hàng, anh/chị vui lòng thử lại sau ạ.",
      "Em hiện chưa kết nối được công cụ kiểm tra hạn mức hôm nay, nên chưa xác nhận được số lượt còn lại.",
      "Dạ hiện em chưa truy xuất được lịch sử chi tiết của khách Minh.",
      "Em không có quyền truy cập dữ liệu khách hàng ạ.",
      "Em chưa thể tra cứu khách Lascote vì công cụ dữ liệu của xưởng hiện không khả dụng. Anh/chị vui lòng thử lại sau nhé.",
      "Hiện tại hệ thống không có công cụ tra cứu khách hàng và tạo ảnh của xưởng trong phiên chat này. Anh/chị vui lòng kết nối hệ thống xưởng để em thực hiện yêu cầu nhé.",
    ]) {
      expect(claimsNoAccess(s), s).toBe(true);
      expect(skipsTools(s), s).toBe(true);
    }
  });

  it("lời chào, câu hỏi lại, câu trả lời thường thì không", () => {
    for (const s of ["Dạ em chào anh/chị ạ.", "Anh/chị muốn làm sản phẩm gì ạ?", "Có 2 khách tên Minh, anh/chị chọn ai ạ?", "Mica 3mm khắc laser được ạ."]) expect(skipsTools(s), s).toBe(false);
  });
});

describe("confirmIntent", () => {
  it("nhận các cách đồng ý ngắn", () => {
    for (const t of ["ok", "OK em", "oke nhé", "Ừ", "được", "đồng ý", "làm đi em", "làm luôn", "chốt", "dạ", "vâng ạ", "đúng rồi", "Ok!"]) expect(confirmIntent(t), t).toBe("yes");
  });

  it("nhận các cách từ chối ngắn", () => {
    for (const t of ["thôi", "hủy", "không", "ko", "thôi khỏi em", "đừng", "đừng làm", "bỏ đi"]) expect(confirmIntent(t), t).toBe("no");
  });

  it("tin có thêm ý khác, tin dài, hay viết không dấu gây nhập nhằng thì để AI đọc", () => {
    for (const t of ["ok nhưng đổi sang 2 phương án", "làm móc khóa thôi", "dung", "khách Minh", "", "ok ".repeat(30)]) expect(confirmIntent(t), t).toBeNull();
  });
});

describe("mã tham chiếu", () => {
  const table = (): RefTable => ({ refs: {}, seq: {} });

  it("cấp mã theo loại, dùng lại mã đã cấp cho cùng một đối tượng", () => {
    const t = table();
    expect(refFor(t, "K", "cus1", "Anh Minh")).toBe("K1");
    expect(refFor(t, "L", "logo1", "logo Gió")).toBe("L1");
    expect(refFor(t, "K", "cus2", "Chị Lan")).toBe("K2");
    expect(refFor(t, "K", "cus1", "Anh Minh")).toBe("K1");
  });

  it("đổi mã thành id; mã lạ hoặc sai loại thì báo lỗi để AI sửa", () => {
    const t = table();
    refFor(t, "L", "logo1", "logo Gió");
    expect(resolveRef(t, "L1", "L")).toEqual({ id: "logo1", label: "logo Gió" });
    expect(resolveRef(t, " l1 ", "L")).toEqual({ id: "logo1", label: "logo Gió" });
    expect(resolveRef(t, "L9", "L")).toHaveProperty("error");
    expect(resolveRef(t, "cmwq44y0r000ia0moqk2vw8sv", "L")).toHaveProperty("error"); // AI tự bịa id thật cũng bị từ chối
    expect(resolveRef(t, "L1", "K")).toEqual({ error: "Mã L1 là logo, không phải khách." });
    expect(resolveRef(t, undefined, "L")).toHaveProperty("error");
  });

  it("bảng mã cho lời dặn: mã mới dùng nhất ở cuối, có ghi loại", () => {
    const t = table();
    refFor(t, "K", "cus1", "Anh Minh");
    refFor(t, "L", "logo1", "logo Lascote");
    refFor(t, "M", "pin1", "Tem da nâu");
    refFor(t, "K", "cus1", "Anh Minh"); // dùng lại: về cuối bảng
    expect(refLegend(t)).toEqual(["L1 = logo Lascote", "M1 = mẫu Pinterest Tem da nâu", "K1 = khách Anh Minh"]);
    expect(refLegend(t, 1)).toEqual(["K1 = khách Anh Minh"]);
  });
});
