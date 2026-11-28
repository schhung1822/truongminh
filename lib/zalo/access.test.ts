import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOT_ACCESS_DESC, BOT_ACCESS_LABELS, BOT_ACCESS_LEVELS, canUseBot, CREATE_TOOLS, isBotAccess, toolAllowed } from "./access";
import { usageLevel, ZALO_BASIC_LIMITS } from "./limits";

/** Tên mọi lệnh của trợ lý, đọc thẳng từ mã nguồn (tools.ts chỉ chạy trên máy chủ nên không nhập vào test được). */
function toolNames(): string[] {
  const src = readFileSync(new URL("./agent/tools.ts", import.meta.url), "utf8");
  const list = /const TOOLS: ToolDef<any>\[\] = \[([^\]]+)\]/.exec(src);
  expect(list, "không tìm thấy danh sách TOOLS trong tools.ts").not.toBeNull();
  const names = [...src.matchAll(/^const \w+: ToolDef<[^=]*= \{\s*name: "([a-z_]+)"/gm)].map((m) => m[1]);
  expect(names.length).toBe(list![1].split(",").length);
  return names;
}

describe("quyền dùng bot", () => {
  it("mỗi mức có nhãn và mô tả", () => {
    for (const a of BOT_ACCESS_LEVELS) {
      expect(BOT_ACCESS_LABELS[a]).toBeTruthy();
      expect(BOT_ACCESS_DESC[a]).toBeTruthy();
      expect(isBotAccess(a)).toBe(true);
    }
    expect(isBotAccess("ADMIN")).toBe(false);
    expect(isBotAccess(undefined)).toBe(false);
  });

  it("chỉ tài khoản còn hoạt động và không ở mức Không dùng bot mới ra lệnh được", () => {
    expect(canUseBot({ isActive: true, zaloBotAccess: "FULL" })).toBe(true);
    expect(canUseBot({ isActive: true, zaloBotAccess: "LOOKUP" })).toBe(true);
    expect(canUseBot({ isActive: true, zaloBotAccess: "NONE" })).toBe(false);
    expect(canUseBot({ isActive: false, zaloBotAccess: "FULL" })).toBe(false);
    expect(canUseBot(null)).toBe(false);
  });
});

describe("toolAllowed", () => {
  const names = toolNames();

  it("mọi lệnh tạo ảnh trong danh sách chặn đều là lệnh có thật của trợ lý", () => {
    for (const t of CREATE_TOOLS) expect(names, t).toContain(t);
  });

  it("mọi lệnh tên tao_... của trợ lý đều nằm trong danh sách chặn (thêm lệnh tạo ảnh mới thì phải thêm vào CREATE_TOOLS)", () => {
    for (const t of names.filter((n) => n.startsWith("tao_"))) expect(CREATE_TOOLS.has(t), t).toBe(true);
  });

  it("Đầy đủ chạy được mọi lệnh", () => {
    for (const t of names) expect(toolAllowed("FULL", t), t).toBe(true);
  });

  it("Chỉ tra cứu: tra khách, lịch sử, kỹ thuật, gửi lại ảnh thì được; tạo ảnh và xác nhận tạo ảnh thì không", () => {
    for (const t of ["tim_khach", "xem_lich_su", "gui_lai_anh", "gui_mau_pinterest", "tien_do", "han_muc", "hoi_kien_thuc", "huy"]) {
      expect(names, t).toContain(t);
      expect(toolAllowed("LOOKUP", t), t).toBe(true);
    }
    for (const t of ["tao_catalog", "tao_thiet_ke", "tao_thiet_ke_tu_catalog", "tao_theo_lich_su", "xac_nhan"]) expect(toolAllowed("LOOKUP", t), t).toBe(false);
  });

  it("Không dùng bot thì không chạy lệnh nào", () => {
    for (const t of names) expect(toolAllowed("NONE", t), t).toBe(false);
  });
});

describe("usageLevel", () => {
  it("dưới 80% là bình thường, từ 80% là sắp đầy, chạm giới hạn là đầy", () => {
    const limit = ZALO_BASIC_LIMITS.messagesPerMonth;
    expect(usageLevel(0, limit)).toBe("ok");
    expect(usageLevel(limit * 0.8 - 1, limit)).toBe("ok");
    expect(usageLevel(limit * 0.8, limit)).toBe("warn");
    expect(usageLevel(limit - 1, limit)).toBe("warn");
    expect(usageLevel(limit, limit)).toBe("full");
    expect(usageLevel(limit + 50, limit)).toBe("full");
  });

  it("3 nhóm: 2 nhóm chưa cảnh báo, 3 nhóm là đầy", () => {
    expect(usageLevel(2, ZALO_BASIC_LIMITS.groupsPerBot)).toBe("ok");
    expect(usageLevel(3, ZALO_BASIC_LIMITS.groupsPerBot)).toBe("full");
  });
});
