import { describe, expect, it } from "vitest";
import { acquireScanLeases, releaseScanLease, type LeaseStore } from "./lease";

const posts = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("acquireScanLeases", () => {
  it("máy đầu tiên lấy được hết và giữ chỗ", () => {
    const store: LeaseStore = new Map();
    expect(acquireScanLeases(posts, "may1", 1000, store, 60_000).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(store.size).toBe(3);
  });

  it("máy thứ hai cùng nick hỏi ngay sau đó thì không được bài nào đang bị giữ", () => {
    const store: LeaseStore = new Map();
    acquireScanLeases(posts, "may1", 1000, store, 60_000);
    expect(acquireScanLeases(posts, "may2", 2000, store, 60_000)).toEqual([]);
  });

  it("chính máy đó hỏi lại (ví dụ bấm Quét ngay) thì vẫn được, chỗ được gia hạn", () => {
    const store: LeaseStore = new Map();
    acquireScanLeases(posts, "may1", 1000, store, 60_000);
    expect(acquireScanLeases(posts, "may1", 30_000, store, 60_000)).toHaveLength(3);
    expect(store.get("a")?.until).toBe(90_000);
  });

  it("hết hạn thì máy khác lấy được", () => {
    const store: LeaseStore = new Map();
    acquireScanLeases(posts, "may1", 1000, store, 60_000);
    expect(acquireScanLeases(posts, "may2", 61_001, store, 60_000)).toHaveLength(3);
    expect(store.get("a")?.tokenId).toBe("may2");
  });

  it("trả chỗ sớm thì máy khác lấy được ngay; máy không giữ thì không trả được chỗ của người khác", () => {
    const store: LeaseStore = new Map();
    acquireScanLeases(posts, "may1", 1000, store, 60_000);
    releaseScanLease("a", "may2", store); // không phải của may2
    expect(acquireScanLeases([{ id: "a" }], "may2", 2000, store, 60_000)).toEqual([]);
    releaseScanLease("a", "may1", store);
    expect(acquireScanLeases([{ id: "a" }], "may2", 2000, store, 60_000)).toEqual([{ id: "a" }]);
  });

  it("một phần bị giữ thì chỉ trả phần còn lại, đúng thứ tự", () => {
    const store: LeaseStore = new Map();
    acquireScanLeases([{ id: "b" }], "may1", 1000, store, 60_000);
    expect(acquireScanLeases(posts, "may2", 2000, store, 60_000).map((p) => p.id)).toEqual(["a", "c"]);
  });
});
