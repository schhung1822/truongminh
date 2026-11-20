import { formatThickness, THICKNESS_CLASSES, thicknessClass } from "@/lib/materials/thickness";
import { articleText, tokenize, type Candidate } from "./select";
import { PROFILE_FIELDS, isVisibility, ROLE_INFO, visibilitiesFor, type AiRole, type ProfileFieldKey } from "./roles";

/** Hồ sơ doanh nghiệp đã tải từ CSDL (tên xưởng lấy từ settings). */
export type ProfileData = {
  workshopName: string;
  fields: Partial<Record<ProfileFieldKey, string | null>>;
  /** mức hiển thị từng trường (JSON thô từ CSDL); thiếu hoặc sai = INTERNAL */
  visibility: unknown;
};

function fieldVisibility(raw: unknown, key: string) {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined;
  return isVisibility(v) ? v : "INTERNAL";
}

/** Các dòng hồ sơ vai này được đọc. Trường trống hoặc mức không hợp thì bỏ. */
export function profileLines(role: AiRole, p: ProfileData): string[] {
  const allowed = visibilitiesFor(role);
  const lines: string[] = [];
  for (const f of PROFILE_FIELDS) {
    const value = p.fields[f.key]?.toString().trim();
    if (!value) continue;
    if (!allowed.includes(fieldVisibility(p.visibility, f.key))) continue;
    lines.push(`- ${f.label}: ${value.replace(/\n+/g, "; ")}`);
  }
  return lines;
}

/** Khối kiến thức đưa vào prompt: hồ sơ (phần được đọc) rồi các bài đã chọn. Rỗng nếu chưa có gì. */
export function formatKnowledge(role: AiRole, profile: ProfileData, articles: Candidate[]): string {
  const parts: string[] = [];
  const lines = profileLines(role, profile);
  if (lines.length) parts.push(`HỒ SƠ XƯỞNG:\n${lines.join("\n")}`);
  if (articles.length) parts.push(`KIẾN THỨC CỦA XƯỞNG:\n${articles.map(articleText).join("\n\n")}`);
  return parts.join("\n\n");
}

/* ---------- Chất liệu (lấy trực tiếp từ bảng materials, không chép vào kho kiến thức) ---------- */

export type KnowledgeMaterial = {
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  descHuman: string | null;
  thicknessMm?: number | null;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function materialScore(question: string, m: KnowledgeMaterial): number {
  const q = new Set(tokenize(question));
  if (q.size === 0) return 0;
  const hay = new Set(tokenize(`${m.code} ${m.name} ${m.groupName} ${m.printTech}`));
  let s = 0;
  for (const t of q) if (hay.has(t)) s += 2;
  return s;
}

/**
 * Danh sách chất liệu cho một vai AI, tối đa `materialsLimit` loại (chất liệu liên quan câu hỏi được ưu tiên khi phải cắt).
 * Vai trò chuyên chăm sóc nhóm chỉ cần tên; các vai khác có mã, nhóm, công nghệ, độ dày và mô tả ngắn.
 */
export function formatMaterials(role: AiRole, materials: KnowledgeMaterial[], question = ""): string {
  if (materials.length === 0) return "";
  const limit = ROLE_INFO[role].materialsLimit;
  const ranked = materials.map((m, i) => ({ m, i, s: materialScore(question, m) }));
  const shown = materials.length > limit ? [...ranked].sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).sort((a, b) => a.i - b.i) : ranked;

  const head = `CÁC CHẤT LIỆU XƯỞNG ĐANG CÓ (${shown.length}${materials.length > shown.length ? ` trên ${materials.length}` : ""} loại):`;
  if (role === "CARE_PLANNER") return `${head}\n${shown.map((x) => x.m.name).join(", ")}`;

  const withDesc = shown.length <= 40;
  const lines = shown.map(({ m, s }) => {
    const cls = thicknessClass(m.thicknessMm);
    const thick = cls ? ` | dày ${formatThickness(m.thicknessMm)} (${cls.label.toLowerCase()})` : "";
    const desc = m.descHuman && (withDesc || s > 0) ? ` | ${clip(m.descHuman.replace(/\s+/g, " "), 120)}` : "";
    return `- ${m.code} | ${m.name} | nhóm ${m.groupName} | ${m.printTech}${thick}${desc}`;
  });
  const out = [`${head}\n${lines.join("\n")}`];
  if (shown.some((x) => thicknessClass(x.m.thicknessMm))) {
    out.push(`QUY ƯỚC ĐỘ DÀY (nói đúng theo đây khi hỏi cắt hay khắc được không):\n${THICKNESS_CLASSES.map((c) => `- ${c.label} (${c.range}): ${c.rule}`).join("\n")}`);
  }
  return out.join("\n\n");
}
