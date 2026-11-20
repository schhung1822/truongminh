import { boundsOf, polygonArea, polygonPerimeter, scalePolygon, simplifyRing, simplifyToBudget, type Point, type Polygon } from "./geometry";
import type { LogoContour } from "./types";

/**
 * Lấy đường viền logo từ ảnh đã giải mã (thuần: nhận mảng điểm ảnh, không phụ thuộc thư viện ảnh).
 *  1. Dựng "mặt nạ" nội dung: dùng kênh trong suốt nếu có; logo nền đặc thì tách nền theo màu viền ảnh;
 *     không tách được thì trả về khung chữ nhật kèm cảnh báo.
 *  2. Dò đường biên đúng từng điểm ảnh, tách mảnh ngoài và lỗ, bỏ đốm nhiễu, đơn giản hóa.
 *  3. Cắt sát khung bao thật và chuẩn hóa về [0,1] để đổi sang mm theo kích thước sale nhập.
 */

export type Mask = { width: number; height: number; /** 1 = nội dung logo */ data: Uint8Array };

export type LogoGeometry = {
  /** rộng / cao của khung bao thật (sau khi cắt sát nội dung) */
  widthHeightRatio: number;
  /** các mảnh ngoài và lỗ, tọa độ chuẩn hóa trong [0,1] theo khung bao */
  outers: Polygon[];
  holes: Polygon[];
  /** diện tích nội dung / diện tích khung bao */
  areaFraction: number;
  /** sai số hình học (so với cạnh dài của khung bao) do lượng tử hóa điểm ảnh và đơn giản hóa */
  toleranceNorm: number;
  hasTransparency: boolean;
  /** nền đặc đã được tách tự động theo màu viền ảnh */
  backgroundRemoved: boolean;
  /** không tách được nền: đang dùng khung chữ nhật */
  fallbackRect: boolean;
  warnings: string[];
};

const SIMPLIFY_PX = 1.5;
const MIN_SPECK_FRACTION = 0.0002; // đốm nhỏ hơn 0,02% diện tích ảnh bị coi là nhiễu
const ALPHA_ON = 128;
const TRANSPARENT_FRACTION = 0.005;
const BG_TOLERANCE = 48;
const BG_BORDER_MATCH = 0.9;

type Loop = { points: Point[]; area: number };

/** Dò mọi đường biên của mặt nạ. Mảnh ngoài có diện tích dương, lỗ có diện tích âm (hệ y hướng xuống). */
export function traceLoops(mask: Mask): Loop[] {
  const { width: w, height: h, data } = mask;
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  const stride = w + 1;

  // mỗi điểm ảnh nội dung sinh một cạnh ở mỗi phía tiếp giáp nền; đi sao cho nội dung nằm bên phải
  const sx: number[] = [];
  const sy: number[] = [];
  const ex: number[] = [];
  const ey: number[] = [];
  const add = (a: number, b: number, c: number, d: number) => {
    sx.push(a);
    sy.push(b);
    ex.push(c);
    ey.push(d);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] !== 1) continue;
      if (!fg(x, y - 1)) add(x, y, x + 1, y);
      if (!fg(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!fg(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!fg(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const out = new Map<number, number[]>();
  for (let i = 0; i < sx.length; i++) {
    const k = sy[i] * stride + sx[i];
    const list = out.get(k);
    if (list) list.push(i);
    else out.set(k, [i]);
  }
  const used = new Uint8Array(sx.length);
  const loops: Loop[] = [];

  for (let first = 0; first < sx.length; first++) {
    if (used[first]) continue;
    const edges: number[] = [];
    let cur = first;
    for (;;) {
      used[cur] = 1;
      edges.push(cur);
      const vx = ex[cur];
      const vy = ey[cur];
      if (vx === sx[first] && vy === sy[first]) break;
      const cands = (out.get(vy * stride + vx) ?? []).filter((e) => !used[e]);
      if (cands.length === 0) break; // không xảy ra với mặt nạ hợp lệ
      if (cands.length === 1) {
        cur = cands[0];
      } else {
        // đỉnh chạm chéo: ưu tiên rẽ phải (ôm sát nội dung), rồi đi thẳng, rồi rẽ trái
        const dx = ex[cur] - sx[cur];
        const dy = ey[cur] - sy[cur];
        const right = [-dy, dx];
        const straight = [dx, dy];
        const pick =
          cands.find((e) => ex[e] - sx[e] === right[0] && ey[e] - sy[e] === right[1]) ??
          cands.find((e) => ex[e] - sx[e] === straight[0] && ey[e] - sy[e] === straight[1]) ??
          cands[0];
        cur = pick;
      }
    }
    // giữ lại các đỉnh nơi hướng đổi
    const pts: Point[] = [];
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const p = edges[(i + edges.length - 1) % edges.length];
      if (ex[e] - sx[e] !== ex[p] - sx[p] || ey[e] - sy[e] !== ey[p] - sy[p]) pts.push({ x: sx[e], y: sy[e] });
    }
    if (pts.length >= 3) loops.push({ points: pts, area: polygonArea(pts) });
  }
  return loops;
}

/** Dựng mặt nạ từ ảnh RGBA. Trả về null nếu không tách được nội dung. */
export function maskFromRgba(rgba: Uint8Array, width: number, height: number): { mask: Mask; hasTransparency: boolean; backgroundRemoved: boolean } | null {
  const total = width * height;
  let transparent = 0;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] < 16) transparent++;

  if (transparent / total >= TRANSPARENT_FRACTION) {
    const data = new Uint8Array(total);
    for (let i = 0; i < total; i++) data[i] = rgba[i * 4 + 3] >= ALPHA_ON ? 1 : 0;
    return { mask: { width, height, data }, hasTransparency: true, backgroundRemoved: false };
  }

  // nền đặc: lấy màu giữa của các điểm ở viền ảnh làm màu nền, rồi loang từ viền vào
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const med = (c: number) => {
    const vals = border.map((i) => rgba[i * 4 + c]).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };
  const ref = [med(0), med(1), med(2)];
  const near = (i: number) => {
    const dr = rgba[i * 4] - ref[0];
    const dg = rgba[i * 4 + 1] - ref[1];
    const db = rgba[i * 4 + 2] - ref[2];
    return dr * dr + dg * dg + db * db <= BG_TOLERANCE * BG_TOLERANCE;
  };
  const matching = border.filter(near).length;
  if (matching / border.length < BG_BORDER_MATCH) return null;

  const isBg = new Uint8Array(total);
  const stack: number[] = [];
  for (const i of border) {
    if (near(i) && !isBg[i]) {
      isBg[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const j of nb) {
      if (j >= 0 && !isBg[j] && near(j)) {
        isBg[j] = 1;
        stack.push(j);
      }
    }
  }
  const data = new Uint8Array(total);
  let fgCount = 0;
  for (let i = 0; i < total; i++) {
    if (!isBg[i]) {
      data[i] = 1;
      fgCount++;
    }
  }
  const frac = fgCount / total;
  if (frac < 0.002 || frac > 0.97) return null;
  return { mask: { width, height, data }, hasTransparency: false, backgroundRemoved: true };
}

function rectGeometry(ratio: number, warnings: string[], hasTransparency: boolean): LogoGeometry {
  return {
    widthHeightRatio: ratio,
    outers: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    ],
    holes: [],
    areaFraction: 1,
    toleranceNorm: 0,
    hasTransparency,
    backgroundRemoved: false,
    fallbackRect: true,
    warnings,
  };
}

/** Từ mặt nạ nội dung sang hình học logo (khung bao thật, mảnh ngoài, lỗ, diện tích). */
export function geometryFromMask(mask: Mask, flags: { hasTransparency: boolean; backgroundRemoved: boolean }): LogoGeometry {
  const { width: w, height: h } = mask;
  const minArea = Math.max(4, MIN_SPECK_FRACTION * w * h);
  const loops = traceLoops(mask).filter((l) => Math.abs(l.area) >= minArea);
  const outerLoops = loops.filter((l) => l.area > 0);
  const holeLoops = loops.filter((l) => l.area < 0);
  if (outerLoops.length === 0) return rectGeometry(w / h, ["Không tìm thấy nội dung logo, đang tính theo khung chữ nhật."], flags.hasTransparency);

  const b = boundsOf(outerLoops.map((l) => l.points))!;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  if (!(bw > 0) || !(bh > 0)) return rectGeometry(w / h, ["Không đọc được kích thước logo, đang tính theo khung chữ nhật."], flags.hasTransparency);

  const norm = (pts: Point[]): Polygon => simplifyRing(pts, SIMPLIFY_PX).map(({ x, y }) => ({ x: (x - b.minX) / bw, y: (y - b.minY) / bh }));
  const exact = outerLoops.reduce((s, l) => s + l.area, 0) + holeLoops.reduce((s, l) => s + l.area, 0); // lỗ có diện tích âm
  const warnings: string[] = [];
  if (flags.backgroundRemoved) warnings.push("Logo nền đặc: đã tách nền tự động theo màu viền ảnh, nên kiểm tra lại hình xem trước.");
  return {
    widthHeightRatio: bw / bh,
    outers: outerLoops.map((l) => norm(l.points)),
    holes: holeLoops.map((l) => norm(l.points)),
    areaFraction: Math.min(1, Math.max(0, exact / (bw * bh))),
    toleranceNorm: (SIMPLIFY_PX + 1) / Math.max(bw, bh),
    hasTransparency: flags.hasTransparency,
    backgroundRemoved: flags.backgroundRemoved,
    fallbackRect: false,
    warnings,
  };
}

/** Từ ảnh RGBA (đã thu nhỏ) sang hình học logo; không tách được nền thì dùng khung chữ nhật kèm cảnh báo. */
export function geometryFromRgba(rgba: Uint8Array, width: number, height: number): LogoGeometry {
  const m = maskFromRgba(rgba, width, height);
  if (!m) return rectGeometry(width / height, ["Logo chưa tách nền, đang tính theo khung chữ nhật."], false);
  return geometryFromMask(m.mask, m);
}

/** Chu vi cắt và diện tích khi logo có kích thước thật (mm): chu vi gồm mảnh ngoài và lỗ (laser phải cắt cả hai). */
export function measureGeometry(g: LogoGeometry, widthMm: number, heightMm: number): { perimeterMm: number; areaMm2: number } {
  const rings = [...g.outers, ...g.holes].map((p) => scalePolygon(p, widthMm, heightMm));
  return { perimeterMm: rings.reduce((s, r) => s + polygonPerimeter(r), 0), areaMm2: g.areaFraction * widthMm * heightMm };
}

/**
 * Đường viền dùng cho kiểm tra va chạm khi xếp so le (mm, đã đơn giản hóa tối đa ~96 đỉnh).
 * Trả về undefined nếu không có đường viền thật (khung chữ nhật), khi đó chỉ xếp theo khung bao.
 */
export function contourForNesting(g: LogoGeometry, widthMm: number, heightMm: number): LogoContour | undefined {
  if (g.fallbackRect) return undefined;
  const scaled = g.outers.map((p) => scalePolygon(p, widthMm, heightMm));
  const longest = Math.max(widthMm, heightMm);
  const { rings, eps } = simplifyToBudget(scaled, longest * 0.004, 96);
  return { outers: rings, toleranceMm: eps + g.toleranceNorm * longest };
}
