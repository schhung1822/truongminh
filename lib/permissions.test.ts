import { describe, expect, it } from "vitest";
import { canEditCustomer, canEditOwned } from "./permissions";

const sale = { id: "s1", role: "SALE" as const };
const other = { id: "s2", role: "SALE" as const };
const admin = { id: "a1", role: "ADMIN" as const };

describe("quyền sửa", () => {
  it("sale sửa được khách mình phụ trách hoặc mình tạo", () => {
    expect(canEditCustomer(sale, { ownerId: "s1", createdById: "s2" })).toBe(true);
    expect(canEditCustomer(sale, { ownerId: "s2", createdById: "s1" })).toBe(true);
  });

  it("sale không sửa được khách của người khác", () => {
    expect(canEditCustomer(other, { ownerId: "s1", createdById: "s1" })).toBe(false);
  });

  it("admin sửa được tất cả", () => {
    expect(canEditCustomer(admin, { ownerId: "s1", createdById: "s1" })).toBe(true);
    expect(canEditOwned(admin, "s1")).toBe(true);
  });

  it("chỉ người tạo sửa được dữ liệu của mình", () => {
    expect(canEditOwned(sale, "s1")).toBe(true);
    expect(canEditOwned(other, "s1")).toBe(false);
  });
});
