// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { actAndWaitForDom } from "./dom-wait";

describe("actAndWaitForDom", () => {
  it("chờ mutation bất đồng bộ rồi mới trả kết quả", async () => {
    document.body.innerHTML = "<div id=host></div>";
    const changed = await actAndWaitForDom(
      () => setTimeout(() => document.querySelector("#host")?.append(document.createElement("span")), 5),
      { timeoutMs: 100, quietMs: 5 },
    );
    expect(changed).toBe(true);
    expect(document.querySelectorAll("#host span")).toHaveLength(1);
  });

  it("trả false khi thao tác không làm DOM thay đổi", async () => {
    expect(await actAndWaitForDom(() => undefined, { timeoutMs: 10, quietMs: 2 })).toBe(false);
  });
});
