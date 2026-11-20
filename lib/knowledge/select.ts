import { CATEGORY_KEYS, categoryInfo } from "./roles";

/**
 * Chọn bài kiến thức đưa vào prompt trong giới hạn ký tự. Thuần, có test.
 * Cả bài hoặc không: bài nào không vừa thì bỏ hẳn, không cắt dở.
 */

export type Candidate = {
  id: string;
  title: string;
  category: string;
  body: string;
  tags: string[];
  priority: number;
  alwaysInclude: boolean;
  updatedAt: Date;
};

const STOP = new Set(["la", "va", "co", "khong", "cua", "cho", "the", "nao", "gi", "bao", "nhieu", "duoc", "nay", "thi", "de", "mot", "nhung", "voi", "can", "hay", "ma", "o", "em", "anh", "chi"]);

/** Chữ thường, bỏ dấu, tách từ, bỏ từ quá ngắn hoặc quá phổ biến. */
export function tokenize(text: string): string[] {
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
  return plain.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Chữ của một bài khi đưa vào prompt. */
export function articleText(a: Pick<Candidate, "title" | "body">): string {
  return `### ${a.title.trim()}\n${a.body.trim()}`;
}

/** Điểm liên quan giữa câu hỏi và bài: trùng tiêu đề/tag nặng hơn trùng nội dung. */
export function relevance(question: string, a: Candidate): number {
  const q = new Set(tokenize(question));
  if (q.size === 0) return 0;
  const title = new Set(tokenize(a.title));
  const tags = new Set(a.tags.flatMap((t) => tokenize(t)));
  const cat = new Set(tokenize(categoryInfo(a.category).label));
  const body = new Set(tokenize(a.body));
  let score = 0;
  for (const t of q) {
    if (title.has(t)) score += 3;
    if (tags.has(t)) score += 3;
    if (cat.has(t)) score += 2;
    if (body.has(t)) score += 1;
  }
  return score;
}

const order = (a: Candidate) => CATEGORY_KEYS.indexOf(a.category);

export function selectWithinBudget(
  candidates: Candidate[],
  budgetChars: number,
  question = "",
): { chosen: Candidate[]; dropped: Candidate[] } {
  const SEP = 2; // "\n\n" giữa các bài
  const total = candidates.reduce((n, a) => n + articleText(a).length + SEP, 0);
  const display = (list: Candidate[]) => [...list].sort((a, b) => order(a) - order(b) || b.priority - a.priority || a.title.localeCompare(b.title, "vi"));

  if (total <= budgetChars) return { chosen: display(candidates), dropped: [] };

  const scored = candidates.map((a) => ({ a, score: relevance(question, a) }));
  scored.sort(
    (x, y) =>
      Number(y.a.alwaysInclude) - Number(x.a.alwaysInclude) ||
      y.score - x.score ||
      y.a.priority - x.a.priority ||
      y.a.updatedAt.getTime() - x.a.updatedAt.getTime(),
  );

  const chosen: Candidate[] = [];
  const dropped: Candidate[] = [];
  let used = 0;
  for (const { a } of scored) {
    const cost = articleText(a).length + SEP;
    if (used + cost <= budgetChars) {
      chosen.push(a);
      used += cost;
    } else dropped.push(a);
  }
  return { chosen: display(chosen), dropped };
}
