import { describe, expect, it } from "vitest";
import { buildChatMessages, buildSystemPrompt, extractHandoff, HANDOFF_MARKER } from "./bot-prompt";
import { parseCommand } from "./commands";

describe("buildSystemPrompt", () => {
  const base = {
    botPrompt: "Bạn là trợ lý.",
    botKnowledge: "Giờ làm việc 8h-17h.",
    includeMaterials: true,
    materials: [{ code: "M1", name: "Mica trong", groupName: "Nhựa", printTech: "In UV", descHuman: "Trong suốt, bóng" }],
    workshopName: "Xưởng Trường Minh",
    contactName: "Lan",
    isGroup: false,
  };

  it("có đủ prompt, thông tin xưởng, chất liệu và quy tắc", () => {
    const s = buildSystemPrompt(base);
    expect(s).toContain("Bạn là trợ lý.");
    expect(s).toContain("Giờ làm việc 8h-17h.");
    expect(s).toContain("M1 | Mica trong | nhóm Nhựa | In UV");
    expect(s).toContain(HANDOFF_MARKER);
    expect(s).toContain("Lan");
  });

  it("có giờ làm việc thì báo cho AI đang trong hay ngoài giờ; không có thì bỏ mục", () => {
    const hours = { description: "Thứ hai, từ 08:00 đến 17:30" };
    expect(buildSystemPrompt({ ...base, hours: { ...hours, open: false } })).toContain("NGOÀI giờ làm việc");
    expect(buildSystemPrompt({ ...base, hours: { ...hours, open: true } })).toContain("TRONG giờ làm việc");
    expect(buildSystemPrompt(base)).not.toContain("Giờ làm việc của xưởng");
  });

  it("có độ dày thì ghi vào dòng chất liệu kèm quy ước cắt/khắc; không ai có độ dày thì bỏ quy ước", () => {
    const withThickness = buildSystemPrompt({ ...base, materials: [{ ...base.materials[0], thicknessMm: 0.76 }] });
    expect(withThickness).toContain("M1 | Mica trong | nhóm Nhựa | In UV | dày 0.76 mm (cao thành) | Trong suốt, bóng");
    expect(withThickness).toContain("QUY ƯỚC ĐỘ DÀY");
    expect(withThickness).toContain("Mỏng (0.2 - 0.4 mm): Chỉ cắt được, không khắc được.");
    expect(buildSystemPrompt(base)).not.toContain("QUY ƯỚC ĐỘ DÀY");
  });

  it("tắt includeMaterials thì không liệt kê chất liệu; thông tin trống thì bỏ mục", () => {
    const s = buildSystemPrompt({ ...base, includeMaterials: false, botKnowledge: "" });
    expect(s).not.toContain("Mica trong");
    expect(s).not.toContain("THÔNG TIN CỦA XƯỞNG");
  });

  it("giới hạn số chất liệu đưa cho AI", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ code: `C${i}`, name: "x", groupName: "g", printTech: "t", descHuman: null }));
    const s = buildSystemPrompt({ ...base, materials: many });
    expect(s).toContain("80 trên 120");
    expect(s).not.toContain("C100 |");
  });
});

describe("extractHandoff", () => {
  it("bỏ dấu và báo cần chuyển người", () => {
    expect(extractHandoff(`Em chuyển nhân viên nhé. ${HANDOFF_MARKER}`)).toEqual({ text: "Em chuyển nhân viên nhé.", handoff: true });
    expect(extractHandoff("Dạ vâng")).toEqual({ text: "Dạ vâng", handoff: false });
  });
});

describe("buildChatMessages", () => {
  it("khách là user, bot và nhân viên là assistant, gộp tin liên tiếp cùng vai, bỏ tin hệ thống", () => {
    const m = buildChatMessages("SYS", [
      { author: "CONTACT", text: "Chào" },
      { author: "CONTACT", text: "Cho hỏi giá" },
      { author: "SYSTEM", text: "ghép nối" },
      { author: "BOT", text: "Dạ" },
      { author: "HUMAN", text: "Để mình báo" },
      { author: "CONTACT", text: "ok" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(m[1].content).toHaveLength(2);
    expect(m[2].content).toHaveLength(2);
  });

  it("tin trợ lý đứng đầu (chưa có tin khách) bị bỏ; ảnh của khách đi kèm dạng image_url", () => {
    const m = buildChatMessages("SYS", [
      { author: "BOT", text: "Xin chào" },
      { author: "CONTACT", text: "", imageUrl: "https://x/y.jpg" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["system", "user"]);
    expect(m[1].content[0]).toEqual({ type: "image_url", image_url: { url: "https://x/y.jpg" } });
  });
});

describe("parseCommand", () => {
  it("nhận lệnh, bỏ @tên bot và lấy phần tham số", () => {
    expect(parseCommand("/status")).toEqual({ name: "status", args: "" });
    expect(parseCommand("/status@BotXuong  abc")).toEqual({ name: "status", args: "abc" });
  });

  it("gõ có dấu hay không dấu đều được", () => {
    expect(parseCommand("/ghépnối")).toEqual({ name: "pair", args: "" });
    expect(parseCommand("/nhânviên")).toEqual({ name: "human", args: "" });
    expect(parseCommand("/Hôm_nay")).toEqual({ name: "today", args: "" });
  });

  it("không phải lệnh hoặc lệnh lạ thì null", () => {
    expect(parseCommand("xin chào")).toBeNull();
    expect(parseCommand("/abc")).toBeNull();
    expect(parseCommand("  /help ")).toEqual({ name: "help", args: "" });
  });
});
