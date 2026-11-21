import { z } from "zod";
import { classifyComment, type CommentCategory } from "./classify";
import { parseRelativeTime } from "./relative-time";
import { profileUrlFromAnyLink, sameProfile } from "./urls";

/**
 * Dữ liệu extension gửi lên khi quét một bài (docs/thiet-ke-module-lead-facebook.md mục 7.3) và việc chuẩn bị mỗi comment
 * trước khi lưu. Phần thuần (không CSDL) để kiểm thử.
 */

const MAX_TEXT = 5000;

export const commentInputSchema = z.object({
  fb_comment_id: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_:.=-]+$/, "Mã comment không hợp lệ."),
  parent_fb_comment_id: z.string().trim().max(100).regex(/^[A-Za-z0-9_:.=-]*$/).nullish(),
  author_name: z.string().trim().max(200).default(""),
  author_profile_url: z.string().trim().max(500).nullish(),
  is_own: z.boolean().default(false),
  text: z.string().max(20000).default(""),
  time_text: z.string().trim().max(60).nullish(),
});

export const ingestPayloadSchema = z.object({
  scanned_at: z.string().max(40).optional(),
  /** false = extension dừng giữa chừng (quá dài, lỗi); phần đã đọc vẫn được lưu. */
  complete: z.boolean().default(true),
  comments: z.array(commentInputSchema).max(3000, "Một lần gửi tối đa 3000 comment."),
});

export type CommentInput = z.infer<typeof commentInputSchema>;
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export type PreparedComment = {
  fbCommentId: string;
  parentFbCommentId: string | null;
  authorName: string;
  authorProfileUrl: string | null;
  isOwn: boolean;
  text: string;
  timeText: string | null;
  commentedAt: Date | null;
  category: CommentCategory;
  extractedPhone: string | null;
  extractedOther: { phones: string[]; zalo: string | null; emails: string[]; spelledOut: boolean } | null;
};

/**
 * Chuẩn bị một comment để lưu.
 * - Comment do CHÍNH nick của mình viết (extension báo is_own hoặc link tác giả trùng link nick) luôn là OTHER và KHÔNG tách
 *   số: câu trả lời của nhân sự có thể chứa số của xưởng, không được biến thành lead.
 * - Còn lại: tách số/Zalo/email và phân loại.
 */
export function prepareComment(input: CommentInput, ctx: { accountProfileUrl: string; now: Date }): PreparedComment {
  const text = input.text.replace(/\u0000/g, "").trim().slice(0, MAX_TEXT);
  const rawProfile = input.author_profile_url?.trim() || null;
  const authorProfileUrl = rawProfile ? (profileUrlFromAnyLink(rawProfile) ?? rawProfile.slice(0, 500)) : null;
  const isOwn = input.is_own || sameProfile(authorProfileUrl, ctx.accountProfileUrl);
  const timeText = input.time_text?.trim() || null;

  const base = {
    fbCommentId: input.fb_comment_id,
    parentFbCommentId: input.parent_fb_comment_id?.trim() || null,
    authorName: input.author_name.trim().slice(0, 200) || "(không rõ tên)",
    authorProfileUrl,
    isOwn,
    text,
    timeText,
    commentedAt: parseRelativeTime(timeText, ctx.now),
  };

  if (isOwn) return { ...base, category: "OTHER", extractedPhone: null, extractedOther: null };

  const { category, contacts } = classifyComment(text);
  const hasAny = contacts.phones.length > 0 || contacts.emails.length > 0 || contacts.zalo !== null || contacts.spelledOut;
  return {
    ...base,
    category,
    extractedPhone: contacts.phones[0] ?? null,
    extractedOther: hasAny ? { phones: contacts.phones, zalo: contacts.zalo, emails: contacts.emails, spelledOut: contacts.spelledOut } : null,
  };
}
