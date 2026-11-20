import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/nesting";
import { escapeXml, layoutToSvg, SVG_NOTE, type QuoteLayout } from "./layout-svg";

const stock = { widthMm: 600, heightMm: 400, edgeMarginMm: 10, gapMm: 3 };

function grid(cols: number, rows: number, rotatedCount = 0): Placement[] {
  const out: Placement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rotation = out.length < rotatedCount ? 90 : 0;
      out.push({ x: 10 + c * 50, y: 10 + r * 50, width: 47, height: 47, rotation });
    }
  }
  return out;
}

const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

describe("layoutToSvg", () => {
  it("vẽ đủ một phần tử cho mỗi logo, có số thứ tự", () => {
    const layout: QuoteLayout = { stock, placements: grid(5, 4), label: "Lưới thẳng 5 x 4" };
    const svg = layoutToSvg(layout, { title: "Báo giá thử" });
    expect(count(svg, /data-logo="/g)).toBe(20);
    expect(svg).toContain('data-logo="1"');
    expect(svg).toContain('data-logo="20"');
    expect(svg).not.toContain('data-logo="21"');
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("có dòng chú thích bắt buộc, viền tấm và vùng lề", () => {
    const svg = layoutToSvg({ stock, placements: grid(2, 2) }, { title: "x" });
    expect(svg).toContain("Bố cục ước tính để báo giá, không phải file sản xuất");
    expect(SVG_NOTE).toBe("Bố cục ước tính để báo giá, không phải file sản xuất");
    expect(count(svg, /data-role="stock"/g)).toBe(1);
    expect(count(svg, /data-role="margin"/g)).toBe(1);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("Tấm 60 x 40 cm");
  });

  it("không vẽ vùng lề khi lề bằng 0 hoặc lớn hơn tấm", () => {
    expect(count(layoutToSvg({ stock: { ...stock, edgeMarginMm: 0 }, placements: [] }), /data-role="margin"/g)).toBe(0);
    expect(count(layoutToSvg({ stock: { ...stock, edgeMarginMm: 400 }, placements: [] }), /data-role="margin"/g)).toBe(0);
  });

  it("phân biệt logo xoay 90 độ và ghi số lượng trong chú thích", () => {
    const svg = layoutToSvg({ stock, placements: grid(3, 2, 2) });
    expect(count(svg, /data-rotation="90"/g)).toBe(2);
    expect(count(svg, /data-rotation="0"/g)).toBe(4);
    expect(svg).toContain("xếp thẳng (4)");
    expect(svg).toContain("xoay 90° (2)");
  });

  it("thoát ký tự đặc biệt trong tiêu đề và tên phương án", () => {
    const svg = layoutToSvg(
      { stock, placements: grid(1, 1), label: 'Lưới <b> & "x"' },
      { title: `A & B <script>alert("x")</script> 'q'` },
    );
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("A &amp; B &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &apos;q&apos;");
    expect(svg).toContain("Lưới &lt;b&gt; &amp; &quot;x&quot;");
  });

  it("tiêu đề trống thì dùng tiêu đề mặc định; không có logo vẫn ra SVG hợp lệ", () => {
    const svg = layoutToSvg({ stock, placements: [] });
    expect(svg).toContain("Bố cục xếp logo trên tấm");
    expect(count(svg, /data-logo="/g)).toBe(0);
    expect(svg).toContain(SVG_NOTE);
  });

  it("bỏ qua vị trí có số không hợp lệ thay vì sinh NaN", () => {
    const bad: Placement = { x: Number.NaN, y: 0, width: 10, height: 10, rotation: 0 };
    const svg = layoutToSvg({ stock, placements: [...grid(2, 1), bad] });
    expect(count(svg, /data-logo="/g)).toBe(2);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});

describe("escapeXml", () => {
  it("thoát đủ năm ký tự và bỏ ký tự điều khiển", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
    expect(escapeXml("a\u0001b")).toBe("ab");
  });
});
