import { shapesTooClose, translatePolygon, rotatePolygon90 } from "./geometry";
import { hybridGrid, straightGrid, usableArea } from "./grid";
import { staggerGrid } from "./stagger";
import type { NestingCandidate, NestingInput, NestingResult, NestingStrategy, Placement } from "./types";

/** Các phương án mặc định (cấp 1 và cấp 2). Cấp 3 (nesting theo đường viền thật) sau này chỉ cần thêm một NestingStrategy vào đây. */
export const DEFAULT_STRATEGIES: NestingStrategy[] = [straightGrid(0), straightGrid(90), hybridGrid, staggerGrid(0), staggerGrid(90)];

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function validate(input: NestingInput): string | null {
  const nums: [string, number][] = [
    ["chiều rộng tấm", input.stockWidthMm],
    ["chiều cao tấm", input.stockHeightMm],
    ["chiều rộng logo", input.logoWidthMm],
    ["chiều cao logo", input.logoHeightMm],
  ];
  for (const [name, v] of nums) if (!Number.isFinite(v) || v <= 0) return `Thiếu hoặc sai ${name} (phải là số lớn hơn 0).`;
  if (!Number.isFinite(input.edgeMarginMm) || input.edgeMarginMm < 0) return "Lề tấm phải là số không âm.";
  if (!Number.isFinite(input.gapMm) || input.gapMm < 0) return "Khoảng cách giữa các logo phải là số không âm.";
  return null;
}

function empty(error: string, warnings: string[] = []): NestingResult {
  return { strategy: "", label: "", count: 0, placements: [], efficiencyPct: 0, candidates: [], warnings, error };
}

/**
 * Kiểm tra bố cục: mọi logo nằm trong vùng dùng được và không logo nào chồng hoặc quá gần logo khác.
 * Có đường viền thì kiểm tra theo đường viền thật, không thì theo khung chữ nhật. Trả về lời mô tả lỗi đầu tiên, hoặc null nếu hợp lệ.
 * (Độ phức tạp O(n^2): chỉ dùng cho kiểm tra và với số logo vừa phải.)
 */
export function verifyPlacements(input: NestingInput, placements: Placement[]): string | null {
  const u = usableArea(input);
  const m = input.edgeMarginMm;
  const e = 1e-6;
  for (const p of placements) {
    if (p.x < m - e || p.y < m - e || p.x + p.width > m + u.width + e || p.y + p.height > m + u.height + e) return "Có logo vượt ra ngoài vùng dùng được của tấm.";
  }
  const shapeOf = (p: Placement) => {
    if (!input.contour) return null;
    const base = p.rotation === 0 ? input.contour.outers : input.contour.outers.map((q) => rotatePolygon90(q, input.logoHeightMm));
    return base.map((q) => translatePolygon(q, p.x, p.y));
  };
  const minDist = input.gapMm + (input.contour?.toleranceMm ?? 0);
  const shapes = input.contour ? placements.map(shapeOf) : null;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
      const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
      if (Math.max(dx, dy) >= input.gapMm - e) continue; // khung bao (chính xác) đã cách nhau đủ gap
      if (!shapes) return "Có hai logo chồng nhau hoặc gần nhau hơn khoảng cách tối thiểu.";
      if (shapesTooClose(shapes[i]!, shapes[j]!, minDist)) return "Có hai logo chồng nhau hoặc gần nhau hơn khoảng cách tối thiểu.";
    }
  }
  return null;
}

const VERIFY_LIMIT = 500;

/**
 * Chạy mọi phương án hợp lệ và chọn phương án xếp được nhiều logo nhất; bằng nhau thì chọn phương án đơn giản hơn
 * (lưới thẳng trước, rồi xếp lai, rồi so le). Phương án so le được kiểm tra lại va chạm trước khi nhận.
 */
export function nest(input: NestingInput, strategies: NestingStrategy[] = DEFAULT_STRATEGIES): NestingResult {
  const bad = validate(input);
  if (bad) return empty(bad);

  const u = usableArea(input);
  if (u.width <= 0 || u.height <= 0) {
    return empty(`Lề tấm quá lớn: vùng dùng được còn ${fmt(Math.max(0, u.width))} x ${fmt(Math.max(0, u.height))} mm.`);
  }
  const fits0 = input.logoWidthMm <= u.width + 1e-9 && input.logoHeightMm <= u.height + 1e-9;
  const fits90 = input.allowRotate && input.logoHeightMm <= u.width + 1e-9 && input.logoWidthMm <= u.height + 1e-9;
  if (!fits0 && !fits90) {
    return empty(
      `Logo (${fmt(input.logoWidthMm)} x ${fmt(input.logoHeightMm)} mm) lớn hơn vùng dùng được của tấm (${fmt(u.width)} x ${fmt(u.height)} mm sau khi trừ lề)${input.allowRotate ? ", kể cả khi xoay" : ""}. Hãy giảm kích thước logo hoặc chọn tấm lớn hơn.`,
    );
  }

  const logoArea = input.logoAreaMm2 && input.logoAreaMm2 > 0 ? input.logoAreaMm2 : input.logoWidthMm * input.logoHeightMm;
  const stockArea = input.stockWidthMm * input.stockHeightMm;
  const eff = (count: number) => (count * logoArea * 100) / stockArea;

  type Run = { id: string; complexity: number; order: number; label: string; placements: Placement[] };
  const runs: Run[] = [];
  strategies.forEach((s, order) => {
    const r = s.run(input);
    if (r && r.placements.length > 0) runs.push({ id: s.id, complexity: s.complexity, order, label: r.label, placements: r.placements });
  });

  runs.sort((a, b) => b.placements.length - a.placements.length || a.complexity - b.complexity || a.order - b.order);
  const warnings: string[] = [];
  let chosen: Run | undefined;
  for (const r of runs) {
    if (input.contour && r.id.startsWith("stagger") && r.placements.length <= VERIFY_LIMIT) {
      const problem = verifyPlacements(input, r.placements);
      if (problem) {
        warnings.push(`Đã bỏ phương án "${r.label}": ${problem}`);
        continue;
      }
    }
    chosen = r;
    break;
  }

  const candidates: NestingCandidate[] = runs.map((r) => ({ strategy: r.id, label: r.label, count: r.placements.length, efficiencyPct: eff(r.placements.length) }));
  if (!chosen) return { ...empty("Không xếp được logo nào lên tấm.", warnings), candidates };
  return {
    strategy: chosen.id,
    label: chosen.label,
    count: chosen.placements.length,
    placements: chosen.placements,
    efficiencyPct: eff(chosen.placements.length),
    candidates,
    warnings,
  };
}
