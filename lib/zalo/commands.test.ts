import { describe, expect, it } from "vitest";
import { helpText, parseCommand, TOGGLEABLE_COMMANDS } from "./commands";

describe("parseCommand", () => {
  it("nhận lệnh có dấu, không dấu, có @tên bot và tham số", () => {
    expect(parseCommand("/ghépnối")).toEqual({ name: "pair", args: "" });
    expect(parseCommand("/status@MyBot abc")).toEqual({ name: "status", args: "abc" });
    expect(parseCommand("/NHANVIEN")).toEqual({ name: "human", args: "" });
  });

  it("/cho, /inbox và /hopthu đều là danh sách khách chờ nhân viên", () => {
    expect(parseCommand("/cho")?.name).toBe("waiting");
    expect(parseCommand("/inbox")?.name).toBe("waiting");
    expect(parseCommand("/hopthu")?.name).toBe("waiting");
  });

  it("/xong là xử lý xong", () => {
    expect(parseCommand("/xong")?.name).toBe("done");
    expect(parseCommand("/done")?.name).toBe("done");
  });

  it("chữ thường hoặc lệnh lạ thì không phải lệnh", () => {
    expect(parseCommand("xin chào")).toBeNull();
    expect(parseCommand("/khongco")).toBeNull();
  });
});

describe("helpText", () => {
  it("nhân viên thấy các lệnh nhân viên đang bật, không thấy lệnh đã tắt", () => {
    const t = helpText(true, ["status", "waiting", "done"]);
    expect(t).toContain("/status");
    expect(t).toContain("/cho");
    expect(t).toContain("/xong");
    expect(t).not.toContain("/today");
  });

  it("khách chỉ thấy lệnh dành cho khách", () => {
    const t = helpText(false, [...TOGGLEABLE_COMMANDS]);
    expect(t).toContain("/nhanvien");
    expect(t).toContain("/reset");
    expect(t).not.toContain("/status");
    expect(t).not.toContain("/xong");
  });
});
