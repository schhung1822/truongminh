import { describe, expect, it } from "vitest";
import { buildArticlesCsv, parseArticlesCsv, rowToArticle, type ExportArticle } from "./articles-csv";
import { parsePricingValue } from "./pricing-value";
import { articleSchema, type ArticleInput, formToInput, normalizeArticle, parseEffectiveFrom, formatEffectiveFrom, splitList } from "./article-schema";

const sample: ExportArticle = {
  id: "abc123",
  title: "Móc khóa, \"đặc biệt\"",
  category: "dich-vu",
  visibility: "PUBLIC",
  status: "ACTIVE",
  roles: ["SALE_ASSISTANT", "DRAFT_REPLY"],
  tags: ["móc khóa", "a|b"],
  priority: 5,
  alwaysInclude: true,
  effectiveFrom: parseEffectiveFrom("2026-12-31"),
  body: "- gạch đầu dòng\nDòng hai, có dấu phẩy",
};

describe("CSV bài kiến thức", () => {
  it("xuất rồi nhập lại giữ nguyên nội dung (kể cả ô bắt đầu bằng dấu gạch)", () => {
    const parsed = parseArticlesCsv(buildArticlesCsv([sample]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    const v = parsed.rows[0].values;
    expect(v.id).toBe("abc123");
    expect(v.title).toBe(sample.title);
    expect(v.body).toBe(sample.body);
    expect(v.roles).toBe("SALE_ASSISTANT|DRAFT_REPLY");
    expect(v.effectiveFrom).toBe("2026-12-31");
  });

  it("báo lỗi khi thiếu cột id và title", () => {
    const parsed = parseArticlesCsv("a,b\n1,2\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0].line).toBe(1);
  });

  it("báo id bị lặp ở đúng dòng nhưng vẫn đọc các dòng khác", () => {
    const parsed = parseArticlesCsv("id,title\nx1,A\nx1,B\nx2,C\n");
    expect(parsed.rows.map((r) => r.line)).toEqual([2, 4]);
    expect(parsed.errors).toEqual([{ line: 3, message: "id x1 bị lặp trong file." }]);
  });

  it("tạo bài mới luôn là NHÁP, mức mặc định NỘI BỘ, kể cả khi file ghi ACTIVE", () => {
    const r = rowToArticle({ title: "Bài mới", category: "Câu hỏi thường gặp", body: "Nội dung", status: "ACTIVE" }, null);
    expect("input" in r && r.input).toMatchObject({ status: "DRAFT", visibility: "INTERNAL", category: "faq", roles: [] });
  });

  it("cập nhật: ô trống giữ nguyên, [xoa] xóa vai và tag", () => {
    const existing = articleSchema.parse({
      title: "Cũ", category: "faq", body: "Thân", visibility: "PUBLIC", roles: ["DRAFT_REPLY"], tags: ["t"],
      status: "ACTIVE", priority: 1, alwaysInclude: false, effectiveFrom: null,
    });
    const keep = rowToArticle({ title: "Mới" }, existing);
    expect("input" in keep && keep.input).toMatchObject({ title: "Mới", roles: ["DRAFT_REPLY"], tags: ["t"], status: "ACTIVE" });
    const clear = rowToArticle({ roles: null, tags: null }, existing);
    expect("input" in clear && clear.input).toMatchObject({ roles: [], tags: [] });
  });

  it("bài ADMIN_ONLY tự bỏ hết vai AI", () => {
    const r = rowToArticle({ title: "Giá vốn", category: "gia", body: "x", visibility: "ADMIN_ONLY", roles: "SALE_ASSISTANT" }, null);
    expect("input" in r && r.input.roles).toEqual([]);
  });

  it("từ chối giá trị sai với thông báo rõ", () => {
    expect(rowToArticle({ title: "A", category: "không có", body: "x" }, null)).toHaveProperty("error");
    expect(rowToArticle({ title: "A", category: "faq", body: "x", roles: "ROBOT" }, null)).toHaveProperty("error");
    expect(rowToArticle({ title: "A", category: "faq", body: "x", priority: "1.5" }, null)).toHaveProperty("error");
    expect(rowToArticle({ category: "faq", body: "x" }, null)).toHaveProperty("error");
  });
});

describe("kiểm tra bài", () => {
  const ok: ArticleInput = { title: "T", category: "faq", body: "B", visibility: "INTERNAL", roles: [], tags: [], status: "DRAFT", priority: 0, alwaysInclude: false, effectiveFrom: null };

  it("giới hạn tiêu đề, nội dung và tag", () => {
    expect(articleSchema.safeParse(ok).success).toBe(true);
    expect(articleSchema.safeParse({ ...ok, title: "x".repeat(201) }).success).toBe(false);
    expect(articleSchema.safeParse({ ...ok, title: "   " }).success).toBe(false);
    expect(articleSchema.safeParse({ ...ok, body: "x".repeat(20_001) }).success).toBe(false);
    expect(articleSchema.safeParse({ ...ok, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(articleSchema.safeParse({ ...ok, tags: ["x".repeat(41)] }).success).toBe(false);
    expect(articleSchema.safeParse({ ...ok, effectiveFrom: "2026-13-45" }).success).toBe(false);
  });

  it("tag nhập cách nhau dấu phẩy, bỏ trùng và ô trống", () => {
    expect(splitList(" a, b ,, A ,c", /,/)).toEqual(["a", "b", "c"]);
    const f = formToInput({ ...ok, tags: "x, y" , roles: ["DRAFT_REPLY", "DRAFT_REPLY"] }) as { tags: string[]; roles: string[] };
    expect(f.tags).toEqual(["x", "y"]);
    expect(f.roles).toEqual(["DRAFT_REPLY"]);
  });

  it("ADMIN_ONLY xóa vai", () => {
    expect(normalizeArticle({ ...ok, visibility: "ADMIN_ONLY", roles: ["SALE_ASSISTANT"] }).roles).toEqual([]);
  });

  it("ngày hiệu lực đi về đúng ngày", () => {
    expect(formatEffectiveFrom(parseEffectiveFrom("2026-01-01"))).toBe("2026-01-01");
  });
});


describe("số trong thông số giá", () => {
  it("nhận số thường, chấp nhận dấu phẩy thập phân, trống = chưa có dữ liệu", () => {
    expect(parsePricingValue("")).toEqual({ value: null });
    expect(parsePricingValue(" 1500 ")).toEqual({ value: "1500" });
    expect(parsePricingValue("0,75")).toEqual({ value: "0.75" });
    expect(parsePricingValue("0.125")).toEqual({ value: "0.125" });
  });
  it("từ chối kiểu 1.500 hoặc 1,500 vì không rõ nghìn hay thập phân, và số âm hoặc chữ", () => {
    expect(parsePricingValue("1.500")).toHaveProperty("error");
    expect(parsePricingValue("1,500,000")).toHaveProperty("error");
    expect(parsePricingValue("-5")).toHaveProperty("error");
    expect(parsePricingValue("abc")).toHaveProperty("error");
  });
});
