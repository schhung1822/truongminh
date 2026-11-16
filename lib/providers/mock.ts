import { aspectSize, type Resolution } from "@/lib/image-options";
import { generateMockImage } from "./mock-image";
import type { CreateTaskInput, ImageProvider, TaskInfo } from "./types";

/**
 * Nhà cung cấp ảnh GIẢ để phát triển và thử giao diện mà không tốn tiền.
 * Không giữ trạng thái trong bộ nhớ: mọi thông tin của tác vụ được mã hóa trong taskId,
 * nên khởi động lại máy chủ giữa chừng cũng không mất tác vụ.
 *
 * Điều khiển bằng biến môi trường (không bắt buộc):
 * - MOCK_DELAY_MS: thời gian "tạo ảnh" (mặc định 4000)
 * - MOCK_FAIL_RATE: tỉ lệ lỗi giả lập từ 0 đến 1 (mặc định 0)
 * Hoặc chèn chuỗi [[mock-fail]] vào prompt để tác vụ đó luôn lỗi.
 */

type TaskPayload = {
  t: number; // thời điểm tạo
  d: number; // độ trễ ms
  ar: string;
  res: string;
  c: number; // số cột
  r: number; // số hàng
  n: number; // số chất liệu
  s: number; // seed
  f: 0 | 1; // 1 = sẽ lỗi
};

export function encodeTask(p: TaskPayload): string {
  return "mock_" + Buffer.from(JSON.stringify(p)).toString("base64url");
}

export function decodeTask(taskId: string): TaskPayload {
  if (!taskId.startsWith("mock_")) throw new Error("taskId không phải của MockProvider");
  return JSON.parse(Buffer.from(taskId.slice(5), "base64url").toString("utf8")) as TaskPayload;
}

/** Lấy số cột/hàng và số ô có chất liệu từ prompt catalog (chỉ để vẽ ảnh giả cho giống). */
export function parseGridFromPrompt(prompt: string): { cols: number; rows: number; count: number } {
  const g = prompt.match(/grid of (\d+) columns and (\d+) rows/i);
  const count = (prompt.match(/^Cell \d+ = reference image/gim) ?? []).length;
  if (!g) return { cols: 1, rows: 1, count: 1 }; // ảnh thiết kế: một ảnh duy nhất
  return { cols: Number(g[1]), rows: Number(g[2]), count: count || Number(g[1]) * Number(g[2]) };
}

export class MockProvider implements ImageProvider {
  readonly name = "mock" as const;
  readonly cacheReferences = false;

  async uploadReference(input: { buffer: Buffer; fileName: string }) {
    return { url: `mock://reference/${encodeURIComponent(input.fileName)}`, expiresAt: null };
  }

  async createTask(input: CreateTaskInput): Promise<{ taskId: string }> {
    const delay = Number(process.env.MOCK_DELAY_MS ?? 4000);
    const failRate = Number(process.env.MOCK_FAIL_RATE ?? 0);
    const grid = parseGridFromPrompt(input.prompt);
    const seed = Math.floor(Math.random() * 1000);
    const fail = input.prompt.includes("[[mock-fail]]") || Math.random() < failRate ? 1 : 0;
    return {
      taskId: encodeTask({
        t: Date.now(),
        d: Math.round(delay * (0.7 + Math.random() * 0.6)),
        ar: input.aspectRatio,
        res: input.resolution,
        c: grid.cols,
        r: grid.rows,
        n: grid.count,
        s: seed,
        f: fail,
      }),
    };
  }

  async getTask(taskId: string): Promise<TaskInfo> {
    const p = decodeTask(taskId);
    if (Date.now() - p.t < p.d) return { status: "PROCESSING" };
    if (p.f) return { status: "FAILED", error: "Mock: lỗi giả lập" };
    return { status: "SUCCESS", resultUrl: `mock-result://${taskId}` };
  }

  async downloadResult(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const p = decodeTask(url.replace("mock-result://", ""));
    const { width, height } = aspectSize(p.ar, p.res as Resolution);
    const buffer = await generateMockImage({ width, height, cols: p.c, rows: p.r, count: p.n, seed: p.s });
    return { buffer, contentType: "image/png" };
  }
}
