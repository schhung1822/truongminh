import { describe, expect, it } from "vitest";
import { ACTIVITY, ACTIVITY_GROUPS, actionsOfGroup, activityInfo, isActivityGroup } from "./activity-types";

describe("activity-types", () => {
  it("mỗi loại việc thuộc đúng một nhóm có thật, và các nhóm phủ hết mọi loại việc", () => {
    const all = ACTIVITY_GROUPS.flatMap((g) => actionsOfGroup(g.id));
    expect(all.sort()).toEqual(Object.keys(ACTIVITY).sort());
  });

  it("mã việc vừa cột action (40 ký tự) trong CSDL", () => {
    for (const code of Object.keys(ACTIVITY)) expect(code.length).toBeLessThanOrEqual(40);
  });

  it("lọc theo nhóm đăng nhập chỉ ra các việc đăng nhập", () => {
    expect(actionsOfGroup("login").sort()).toEqual(["LOGIN", "LOGIN_FAILED", "LOGOUT"]);
  });

  it("mã lạ vẫn hiện được bằng chính mã đó", () => {
    expect(activityInfo("CU_KHONG_CON")).toEqual({ label: "CU_KHONG_CON", tone: "normal" });
    expect(activityInfo("USER_LOCK")).toEqual({ label: "Khóa tài khoản", tone: "warn" });
  });

  it("chỉ nhận tên nhóm hợp lệ", () => {
    expect(isActivityGroup("account")).toBe(true);
    expect(isActivityGroup("khac")).toBe(false);
    expect(isActivityGroup(undefined)).toBe(false);
  });
});
