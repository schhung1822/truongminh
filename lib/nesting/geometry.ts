/**
 * Hình học phẳng thuần cho thuật toán xếp hình: đa giác, khoảng cách, giao nhau. Không phụ thuộc thư viện nào.
 * Đơn vị tùy người gọi (module xếp hình dùng mm).
 */

export type Point = { x: number; y: number };
export type Polygon = Point[];

export const EPS = 1e-9;

/** Diện tích có dấu (công thức dây giày). Hệ y hướng xuống: dương = đi theo chiều kim đồng hồ trên màn hình. */
export function polygonArea(p: Polygon): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonPerimeter(p: Polygon): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(polys: Polygon[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const { x, y } of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export const translatePolygon = (p: Polygon, dx: number, dy: number): Polygon => p.map(({ x, y }) => ({ x: x + dx, y: y + dy }));

export const scalePolygon = (p: Polygon, sx: number, sy: number): Polygon => p.map(({ x, y }) => ({ x: x * sx, y: y * sy }));

/**
 * Xoay 90 độ theo chiều kim đồng hồ (hệ y hướng xuống) một hình nằm trong khung rộng w, cao h:
 * khung mới rộng h, cao w và vẫn bắt đầu từ (0,0).
 */
export const rotatePolygon90 = (p: Polygon, h: number): Polygon => p.map(({ x, y }) => ({ x: h - y, y: x }));

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const tt = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + tt * dx), p.y - (a.y + tt * dy));
}

/** Đơn giản hóa đường gấp khúc kín bằng Douglas-Peucker (sai lệch tối đa `eps`). Giữ ít nhất 3 điểm nếu đầu vào có từ 3 điểm. */
export function simplifyRing(ring: Polygon, eps: number): Polygon {
  const n = ring.length;
  if (n <= 3 || eps <= 0) return ring.slice();
  // hai điểm neo: điểm đầu và điểm xa nó nhất
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n], // n biểu thị quay về điểm 0
  ];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    const a = ring[i % n];
    const b = ring[j % n];
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = pointLineDistance(ring[k], a, b);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > eps && idx >= 0) {
      keep[idx % n] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  const out = ring.filter((_, i) => keep[i] === 1);
  return out.length >= 3 ? out : ring.slice(0, 3);
}

/** Đơn giản hóa tăng dần cho tới khi tổng số đỉnh không vượt `maxVertices`. Trả về cả sai lệch lớn nhất đã dùng. */
export function simplifyToBudget(rings: Polygon[], startEps: number, maxVertices: number): { rings: Polygon[]; eps: number } {
  let eps = startEps;
  let out = rings.map((r) => simplifyRing(r, eps));
  let guard = 0;
  while (out.reduce((n, r) => n + r.length, 0) > maxVertices && guard++ < 40) {
    eps *= 1.5;
    out = rings.map((r) => simplifyRing(r, eps));
  }
  return { rings: out, eps };
}

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (Math.abs(d1) < EPS && onSegment(c, d, a)) ||
    (Math.abs(d2) < EPS && onSegment(c, d, b)) ||
    (Math.abs(d3) < EPS && onSegment(a, b, c)) ||
    (Math.abs(d4) < EPS && onSegment(a, b, d))
  );
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointLineDistance(a, c, d), pointLineDistance(b, c, d), pointLineDistance(c, a, b), pointLineDistance(d, a, b));
}

/** Điểm có nằm trong đa giác không (tia ngang). */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Hai đa giác (vùng đặc) có chồng nhau hoặc cách nhau gần hơn `minDist` không.
 * Chạy theo kiểu thoát sớm: gặp một cặp cạnh quá gần là trả về true ngay.
 */
export function polygonsTooClose(A: Polygon, B: Polygon, minDist: number): boolean {
  const na = A.length;
  const nb = B.length;
  if (na < 3 || nb < 3) return false;
  const ba = boundsOf([A])!;
  const bb = boundsOf([B])!;
  if (ba.maxX + minDist <= bb.minX || bb.maxX + minDist <= ba.minX || ba.maxY + minDist <= bb.minY || bb.maxY + minDist <= ba.minY) return false;
  for (let i = 0; i < na; i++) {
    const a1 = A[i];
    const a2 = A[(i + 1) % na];
    const loX = Math.min(a1.x, a2.x) - minDist;
    const hiX = Math.max(a1.x, a2.x) + minDist;
    const loY = Math.min(a1.y, a2.y) - minDist;
    const hiY = Math.max(a1.y, a2.y) + minDist;
    for (let j = 0; j < nb; j++) {
      const b1 = B[j];
      const b2 = B[(j + 1) % nb];
      if (Math.max(b1.x, b2.x) < loX || Math.min(b1.x, b2.x) > hiX || Math.max(b1.y, b2.y) < loY || Math.min(b1.y, b2.y) > hiY) continue;
      if (segmentDistance(a1, a2, b1, b2) < minDist - EPS) return true;
    }
  }
  // không có cặp cạnh nào quá gần: chỉ còn trường hợp một hình nằm gọn trong hình kia
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A);
}

/** Hai hình (mỗi hình gồm nhiều mảnh rời) có chồng nhau hoặc quá gần không. */
export function shapesTooClose(A: Polygon[], B: Polygon[], minDist: number): boolean {
  for (const a of A) for (const b of B) if (polygonsTooClose(a, b, minDist)) return true;
  return false;
}
