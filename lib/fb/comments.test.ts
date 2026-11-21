import { describe, expect, it } from "vitest";
import { commentInputSchema, ingestPayloadSchema, prepareComment, type CommentInput } from "./comments";
import { parseRelativeTime } from "./relative-time";

const NOW = new Date("2026-11-21T03:00:00Z");
const ctx = { accountProfileUrl: "https://www.facebook.com/lan.truongminh", now: NOW };
const input = (o: Partial<CommentInput> = {}): CommentInput => commentInputSchema.parse({ fb_comment_id: "123", author_name: "Nguyễn Văn A", text: "", ...o });

describe("prepareComment", () => {
  it("comment có số: HAS_CONTACT, số đã chuẩn hoá", () => {
    const c = prepareComment(input({ text: "ib giá em nhé 0912.345.678" }), ctx);
    expect(c.category).toBe("HAS_CONTACT");
    expect(c.extractedPhone).toBe("0912345678");
    expect(c.extractedOther?.phones).toEqual(["0912345678"]);
    expect(c.isOwn).toBe(false);
  });

  it("comment 'ib' không có số: INTEREST, không có extractedPhone", () => {
    const c = prepareComment(input({ text: "ib giá" }), ctx);
    expect(c.category).toBe("INTEREST");
    expect(c.extractedPhone).toBeNull();
    expect(c.extractedOther).toBeNull();
  });

  it("comment của chính nick (is_own) luôn OTHER và KHÔNG tách số", () => {
    const c = prepareComment(input({ text: "Dạ em đã nhắn, liên hệ 0987654321 nhé", is_own: true }), ctx);
    expect(c.isOwn).toBe(true);
    expect(c.category).toBe("OTHER");
    expect(c.extractedPhone).toBeNull();
    expect(c.extractedOther).toBeNull();
  });

  it("nhận ra comment của mình theo link tác giả dù extension không báo is_own", () => {
    const c = prepareComment(input({ text: "0987654321", author_profile_url: "https://m.facebook.com/Lan.TruongMinh?ref=x" }), ctx);
    expect(c.isOwn).toBe(true);
    expect(c.category).toBe("OTHER");
    expect(c.extractedPhone).toBeNull();
  });

  it("chuẩn hoá link tác giả; link người dùng trong nhóm đổi về profile.php?id; link lạ thì giữ nguyên", () => {
    expect(prepareComment(input({ author_profile_url: "https://m.facebook.com/nguyen.van.a?comment_id=1" }), ctx).authorProfileUrl).toBe("https://www.facebook.com/nguyen.van.a");
    expect(prepareComment(input({ author_profile_url: "https://www.facebook.com/groups/1/user/100012345/" }), ctx).authorProfileUrl).toBe("https://www.facebook.com/profile.php?id=100012345");
    expect(prepareComment(input({ author_profile_url: "https://www.facebook.com/a/b/c/d" }), ctx).authorProfileUrl).toBe("https://www.facebook.com/a/b/c/d");
  });

  it("nick đặt link dạng id số: nhận ra comment của mình dù Facebook cho link trong nhóm", () => {
    const own = { accountProfileUrl: "https://www.facebook.com/profile.php?id=100012345678", now: NOW };
    const c = prepareComment(input({ text: "0912345678", author_profile_url: "https://www.facebook.com/groups/55555/user/100012345678/" }), own);
    expect(c.isOwn).toBe(true);
    expect(c.extractedPhone).toBeNull();
  });

  it("quy đổi thời gian tương đối, giữ chuỗi gốc", () => {
    const c = prepareComment(input({ time_text: "2 giờ" }), ctx);
    expect(c.timeText).toBe("2 giờ");
    expect(c.commentedAt?.toISOString()).toBe("2026-11-21T01:00:00.000Z");
  });

  it("cắt nội dung quá dài, bỏ ký tự NUL, tên trống thì có tên thay thế", () => {
    const c = prepareComment(input({ text: "a\u0000b".repeat(4000), author_name: "   " }), ctx);
    expect(c.text.length).toBe(5000);
    expect(c.text).not.toContain("\u0000");
    expect(c.authorName).toBe("(không rõ tên)");
  });

  it("comment spam có link ngoài", () => {
    expect(prepareComment(input({ text: "xem https://abc.com sdt 0912345678" }), ctx).category).toBe("SPAM");
  });
});

describe("ingestPayloadSchema", () => {
  it("nhận dữ liệu đúng như ví dụ trong tài liệu (mục 7.3)", () => {
    const p = ingestPayloadSchema.parse({
      scanned_at: "2026-11-20T09:00:00Z",
      complete: true,
      comments: [
        { fb_comment_id: "123", parent_fb_comment_id: null, author_name: "Nguyễn Văn A", author_profile_url: "https://www.facebook.com/x", is_own: false, text: "ib giá em nhé", time_text: "2 giờ" },
      ],
    });
    expect(p.comments).toHaveLength(1);
  });

  it("complete mặc định là true; thiếu comments thì lỗi", () => {
    expect(ingestPayloadSchema.parse({ comments: [] }).complete).toBe(true);
    expect(ingestPayloadSchema.safeParse({}).success).toBe(false);
  });

  it("từ chối mã comment lạ và quá 3000 comment", () => {
    expect(ingestPayloadSchema.safeParse({ comments: [{ fb_comment_id: "a b" }] }).success).toBe(false);
    expect(ingestPayloadSchema.safeParse({ comments: [{ fb_comment_id: "" }] }).success).toBe(false);
    const many = Array.from({ length: 3001 }, (_, i) => ({ fb_comment_id: String(i + 1) }));
    expect(ingestPayloadSchema.safeParse({ comments: many }).success).toBe(false);
  });
});

describe("parseRelativeTime", () => {
  const at = (s: string) => parseRelativeTime(s, NOW)?.toISOString() ?? null;

  it("tiếng Việt", () => {
    expect(at("Vừa xong")).toBe(NOW.toISOString());
    expect(at("5 phút")).toBe("2026-11-21T02:55:00.000Z");
    expect(at("2 giờ")).toBe("2026-11-21T01:00:00.000Z");
    expect(at("3 ngày")).toBe("2026-11-18T03:00:00.000Z");
    expect(at("1 tuần")).toBe("2026-11-14T03:00:00.000Z");
    expect(at("Hôm qua")).toBe("2026-11-20T03:00:00.000Z");
    expect(at("30 giây")).toBe("2026-11-21T02:59:30.000Z");
  });

  it("tiếng Anh và dạng viết tắt", () => {
    expect(at("Just now")).toBe(NOW.toISOString());
    expect(at("5m")).toBe("2026-11-21T02:55:00.000Z");
    expect(at("2h")).toBe("2026-11-21T01:00:00.000Z");
    expect(at("3d")).toBe("2026-11-18T03:00:00.000Z");
    expect(at("2 hours")).toBe("2026-11-21T01:00:00.000Z");
    expect(at("1 week")).toBe("2026-11-14T03:00:00.000Z");
    expect(at("Yesterday")).toBe("2026-11-20T03:00:00.000Z");
  });

  it("không hiểu thì null", () => {
    expect(at("")).toBeNull();
    expect(at("20 tháng 11, 2026 lúc 09:00")).toBeNull();
    expect(at("abc")).toBeNull();
    expect(parseRelativeTime(null, NOW)).toBeNull();
  });
});

describe("parseRelativeTime: dạng có chữ 'trước' / 'ago'", () => {
  it("nhận 'trước' và 'ago', từ chối câu dài", () => {
    expect(parseRelativeTime("2 giờ trước", NOW)?.toISOString()).toBe("2026-11-21T01:00:00.000Z");
    expect(parseRelativeTime("3 days ago", NOW)?.toISOString()).toBe("2026-11-18T03:00:00.000Z");
    expect(parseRelativeTime("đã đăng 2 giờ trước bởi A", NOW)).toBeNull();
  });
});
