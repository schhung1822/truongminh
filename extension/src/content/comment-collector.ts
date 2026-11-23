import type { ReadComment } from "./extract";

/**
 * Giữ comment đã thấy trong suốt một lần quét. Facebook có thể gỡ comment cũ khỏi DOM khi cuộn (virtualization),
 * nên không thể chỉ đọc DOM một lần ở cuối.
 */
export class CommentCollector {
  private readonly byId = new Map<string, ReadComment>();

  get size(): number {
    return this.byId.size;
  }

  addAll(comments: ReadComment[], opts: { mergeExpandedFallbacks?: boolean } = {}): number {
    const before = this.byId.size;
    for (const next of comments) this.add(next, opts.mergeExpandedFallbacks === true);
    return this.byId.size - before;
  }

  values(): ReadComment[] {
    return [...this.byId.values()];
  }

  private add(next: ReadComment, mergeExpandedFallbacks: boolean): void {
    const sameId = this.byId.get(next.fb_comment_id);
    if (sameId) {
      this.byId.set(next.fb_comment_id, richer(sameId, next));
      return;
    }

    // Với mã tạm, nội dung bị cắt và nội dung sau khi bấm "Xem thêm" tạo hai hash khác nhau. Nếu các thông tin còn lại
    // giống nhau và một nội dung là tiền tố của nội dung kia, thay bản ngắn bằng bản đầy đủ thay vì tạo comment trùng.
    if (next.fallbackId && mergeExpandedFallbacks) {
      for (const [id, previous] of this.byId) {
        if (!previous.fallbackId || !sameFallbackAuthor(previous, next) || !isExpandedVersion(previous.text, next.text)) continue;
        this.byId.delete(id);
        const best = richer(previous, next);
        this.byId.set(best.fb_comment_id, best);
        return;
      }
    }

    this.byId.set(next.fb_comment_id, next);
  }
}

function sameFallbackAuthor(a: ReadComment, b: ReadComment): boolean {
  const authorA = a.author_profile_url?.toLowerCase() || a.author_name.trim().toLowerCase();
  const authorB = b.author_profile_url?.toLowerCase() || b.author_name.trim().toLowerCase();
  return authorA !== "" && authorA === authorB && a.time_text === b.time_text && a.parent_fb_comment_id === b.parent_fb_comment_id;
}

function isExpandedVersion(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return left !== right && (left.startsWith(right) || right.startsWith(left));
}

function richer(previous: ReadComment, next: ReadComment): ReadComment {
  const longer = next.text.length >= previous.text.length ? next : previous;
  return {
    ...longer,
    parent_fb_comment_id: next.parent_fb_comment_id ?? previous.parent_fb_comment_id,
    author_name: next.author_name || previous.author_name,
    author_profile_url: next.author_profile_url ?? previous.author_profile_url,
    time_text: next.time_text ?? previous.time_text,
    is_own: next.is_own || previous.is_own,
  };
}
