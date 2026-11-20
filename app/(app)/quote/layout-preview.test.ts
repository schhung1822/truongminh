import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/nesting";
import { LayoutPreview, MAX_IMAGE_PLACEMENTS } from "./layout-preview";

const stock = { widthMm: 600, heightMm: 400, edgeMarginMm: 10, gapMm: 3 };
const mk = (n: number, rotated = 0): Placement[] =>
  Array.from({ length: n }, (_, i) => ({ x: 10 + (i % 10) * 30, y: 10 + Math.floor(i / 10) * 30, width: 28, height: 28, rotation: i < rotated ? 90 : 0 }));

const html = (props: Parameters<typeof LayoutPreview>[0]) => renderToStaticMarkup(createElement(LayoutPreview, props));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("LayoutPreview", () => {
  it("vẽ viền tấm, vùng lề nét đứt và đủ ô logo; ghi kích thước tấm (cm) và số logo", () => {
    const out = html({ stock, placements: mk(12, 3) });
    // 1 viền tấm + 1 lề + 12 logo
    expect(count(out, /<rect /g)).toBe(14);
    expect(out).toContain("stroke-dasharray");
    expect(out).toContain("Tấm 60 x 40 cm · 12 logo");
    expect(out).toContain("Xoay 90° (3)");
    expect(out).toContain("Xếp thẳng (9)");
    expect(count(out, /fill-orange-100/g)).toBe(3);
  });

  it("chỉ vẽ ảnh logo khi được bật và có URL, xoay 90 độ quanh tâm ô", () => {
    const off = html({ stock, placements: mk(2, 1), logoUrl: "/api/files/logo.png", showImages: false });
    expect(off).not.toContain("<image");
    const on = html({ stock, placements: mk(2, 1), logoUrl: "/api/files/logo.png", showImages: true });
    expect(count(on, /<image /g)).toBe(2);
    expect(on).toContain("rotate(90 ");
    const noUrl = html({ stock, placements: mk(2), showImages: true });
    expect(noUrl).not.toContain("<image");
  });

  it("quá nhiều logo thì chỉ vẽ khung chữ nhật, không vẽ ảnh", () => {
    const out = html({ stock, placements: mk(MAX_IMAGE_PLACEMENTS + 1), logoUrl: "/x.png", showImages: true });
    expect(out).not.toContain("<image");
  });

  it("không có kích thước tấm thì báo thay vì vẽ", () => {
    expect(html({ stock: null, placements: mk(3) })).toContain("không lưu kích thước tấm");
  });
});
