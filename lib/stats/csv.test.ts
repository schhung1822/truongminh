import { describe, expect, it } from "vitest";
import { csvCell, csvLine } from "./csv";

describe("csv", () => {
  it("ô thường giữ nguyên, số không bị bọc", () => {
    expect(csvCell("Nguyễn Văn A")).toBe("Nguyễn Văn A");
    expect(csvCell(12)).toBe("12");
  });

  it("bọc nháy kép khi có dấu phẩy, nháy hoặc xuống dòng", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('nói "hi"')).toBe('"nói ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("chặn công thức Excel ở đầu ô chữ nhưng không đụng số âm", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(-5)).toBe("-5");
  });

  it("ghép một dòng", () => {
    expect(csvLine(["2026-11-18", "A, B", 3])).toBe('2026-11-18,"A, B",3');
  });
});
