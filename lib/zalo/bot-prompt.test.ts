import { describe, expect, it } from "vitest";
import { buildChatMessages } from "./bot-prompt";

describe("buildChatMessages", () => {
  it("khách là user, bot và nhân viên là assistant, gộp tin liên tiếp cùng vai", () => {
    const m = buildChatMessages("SYS", [
      { author: "CONTACT", text: "a" },
      { author: "CONTACT", text: "b" },
      { author: "BOT", text: "c" },
      { author: "HUMAN", text: "d" },
      { author: "SYSTEM", text: "bỏ" },
      { author: "CONTACT", text: "e" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(m[1].content).toHaveLength(2);
    expect(m[2].content).toHaveLength(2);
  });

  it("bỏ tin assistant đứng đầu khi chưa có tin của khách", () => {
    const m = buildChatMessages("SYS", [
      { author: "BOT", text: "chào" },
      { author: "CONTACT", text: "hi" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["system", "user"]);
  });

  it("chỉ gắn ảnh vào tin của khách", () => {
    const m = buildChatMessages("SYS", [
      { author: "CONTACT", text: "xem", imageUrl: "https://x/y.jpg" },
      { author: "BOT", text: "ok", imageUrl: "https://x/z.jpg" },
    ]);
    expect(m[1].content.some((p) => p.type === "image_url")).toBe(true);
    expect(m[2].content.some((p) => p.type === "image_url")).toBe(false);
  });
});
