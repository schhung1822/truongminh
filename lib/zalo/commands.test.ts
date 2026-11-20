import { describe, expect, it } from "vitest";
import { helpText, parseCommand, PUBLIC_COMMANDS, TOGGLEABLE_COMMANDS } from "./commands";

describe("parseCommand", () => {
  it("nhận lệnh có dấu, không dấu, có @tên bot và tham số", () => {
    expect(parseCommand("/ghépnối")).toEqual({ name: "pair", args: "" });
    expect(parseCommand("/status@MyBot abc")).toEqual({ name: "status", args: "abc" });
    expect(parseCommand("/MOI")).toEqual({ name: "reset", args: "" });
  });

  it("chữ thường hoặc lệnh lạ thì không phải lệnh", () => {
    expect(parseCommand("xin chào")).toBeNull();
    expect(parseCommand("/khongco")).toBeNull();
  });

  it("các lệnh khách từng dùng (/nhanvien, /cho, /xong) không còn", () => {
    expect(parseCommand("/nhanvien")).toBeNull();
    expect(parseCommand("/cho")).toBeNull();
    expect(parseCommand("/xong")).toBeNull();
  });
});

describe("quyền dùng lệnh", () => {
  it("người chưa ghép nối chỉ được xin ghép nối", () => {
    expect([...PUBLIC_COMMANDS]).toEqual(["pair"]);
  });
});

describe("helpText", () => {
  it("chỉ liệt kê các lệnh đang bật, không có /help", () => {
    const t = helpText(["status", "reset"]);
    expect(t).toContain("/status");
    expect(t).toContain("/reset");
    expect(t).not.toContain("/today");
    expect(t).not.toContain("/help");
  });

  it("bật hết thì có đủ lệnh", () => {
    const t = helpText([...TOGGLEABLE_COMMANDS]);
    for (const c of ["/status", "/today", "/reset"]) expect(t).toContain(c);
  });
});
