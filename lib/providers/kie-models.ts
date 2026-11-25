import type { Resolution } from "@/lib/image-options";

/**
 * Danh mục model tạo ảnh của kie.ai mà hệ thống cho chọn (Quản trị > Cấu hình). Tra cứu kie.ai ngày 2026-11-25
 * (trang kie.ai/pricing + trang riêng từng model; docs.kie.ai đọc được OpenAPI đầy đủ cho GPT Image và Nano Banana 2,
 * các model còn lại chỉ có thông tin từ trang giới thiệu sản phẩm — xem cờ `verified`). Giá có thể đổi theo kie.ai.
 *
 * QUAN TRỌNG: mỗi dòng model của kie.ai dùng TÊN TRƯỜNG khác nhau cho mảng ảnh tham chiếu (`refField`) và cho độ
 * phân giải (`sizeField`) khi gọi POST /api/v1/jobs/createTask — không phải lúc nào cũng là `input_urls`/`resolution`
 * như GPT Image. Gửi sai tên trường thì kie.ai bỏ qua ảnh tham chiếu (ảnh logo/chất liệu), hỏng đúng mục đích chính
 * của hệ thống. Việc map tên trường + giá trị độ phân giải thật của từng model nằm ở lib/providers/kie.ts.
 *
 * Độ phân giải vẫn dùng chung vocabulary "1K"|"2K"|"4K" của hệ thống (lib/image-options.ts) cho mọi model, dù kie.ai
 * gọi tên khác nhau (ví dụ Seedream 5 Pro gọi là "basic"/"high") — mỗi model chỉ liệt kê đúng những mức nó hỗ trợ.
 */

export type RefField = "input_urls" | "image_urls" | "image_input";
export type SizeField = "resolution" | "quality" | "size";

export type KieModelSize = {
  resolution: Resolution;
  /** giá trị thật gửi cho kie.ai trong trường sizeField, ví dụ "2K" hoặc "high" */
  value: string;
  /** credit tiêu tốn cho một ảnh ở độ phân giải này; null = tính theo token, chưa có mức quy đổi cố định theo ảnh */
  credits: number | null;
};

export type KieModel = {
  /** giá trị gửi cho kie.ai trong trường "model" của createTask */
  id: string;
  label: string;
  refField: RefField;
  sizeField: SizeField;
  sizes: KieModelSize[];
  /** độ dài prompt tối đa (ký tự) model nhận; vượt thì kie.ai trả 422 "The text length cannot exceed the maximum limit" */
  maxPromptChars: number;
  /** true = tạm ẩn khỏi ô chọn model ở Quản trị > Cấu hình (vẫn giữ thông số để bật lại sau: xóa dòng `hidden`) */
  hidden?: boolean;
  /** true = đã đọc được tài liệu API chính thức (docs.kie.ai) hoặc đang chạy thật; false = chỉ có trang giới thiệu */
  verified: boolean;
  note?: string;
};

const UNVERIFIED_NOTE = "Chưa đọc được tài liệu API chính thức của kie.ai cho model này (chỉ có trang giới thiệu sản phẩm) — nên tạo thử vài ảnh trước khi dùng nhiều, để chắc ảnh logo/chất liệu tham chiếu được model nhận đúng.";

export const KIE_MODELS: KieModel[] = [
  {
    id: "gpt-image-2-5-sunburst-image-to-image",
    label: "GPT Image 2.5 Sunburst",
    maxPromptChars: 20_000,
    refField: "input_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 6 },
      { resolution: "2K", value: "2K", credits: 10 },
      { resolution: "4K", value: "4K", credits: 16 },
    ],
    verified: true,
  },
  {
    id: "gpt-image-2-5-flare-image-to-image",
    label: "GPT Image 2.5 Flare",
    hidden: true,
    maxPromptChars: 20_000,
    refField: "input_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 6 },
      { resolution: "2K", value: "2K", credits: 10 },
      { resolution: "4K", value: "4K", credits: 16 },
    ],
    verified: true,
  },
  {
    id: "gpt-image-2-image-to-image",
    label: "GPT Image 2",
    hidden: true,
    maxPromptChars: 20_000,
    refField: "input_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 6 },
      { resolution: "2K", value: "2K", credits: 10 },
      { resolution: "4K", value: "4K", credits: 16 },
    ],
    verified: true,
  },
  {
    id: "gpt-image-2-6/flare-image-to-image",
    label: "GPT Image 2.6 Flare",
    hidden: true,
    maxPromptChars: 20_000,
    refField: "input_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: null },
      { resolution: "2K", value: "2K", credits: null },
      { resolution: "4K", value: "4K", credits: null },
    ],
    verified: true,
    note: "Tính phí theo token (ảnh ra/ảnh vào/chữ vào riêng), kie.ai không công bố mức quy đổi cố định theo ảnh nên chưa ước tính được credit mỗi ảnh — theo dõi số dư credit thực tế sau khi dùng.",
  },
  {
    id: "nano-banana-2",
    label: "Google Nano Banana 2",
    hidden: true,
    maxPromptChars: 20_000,
    refField: "image_input",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 8 },
      { resolution: "2K", value: "2K", credits: 12 },
      { resolution: "4K", value: "4K", credits: 18 },
    ],
    verified: true,
  },
  {
    id: "nano-banana-2-1",
    label: "Nano Banana 2.1",
    hidden: true,
    maxPromptChars: 20_000,
    refField: "image_input",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 4 },
      { resolution: "2K", value: "2K", credits: 6 },
      { resolution: "4K", value: "4K", credits: 9 },
    ],
    verified: false,
    note: UNVERIFIED_NOTE,
  },
  {
    id: "seedream/5-pro-image-to-image",
    label: "Seedream 5 Pro",
    hidden: true,
    maxPromptChars: 5_000,
    refField: "image_urls",
    sizeField: "quality",
    sizes: [
      { resolution: "1K", value: "basic", credits: 7 },
      { resolution: "2K", value: "high", credits: 14 },
    ],
    verified: false,
    note: UNVERIFIED_NOTE,
  },
  {
    id: "seedream/5-5-image-to-image",
    label: "Seedream 5.5",
    hidden: true,
    maxPromptChars: 5_000,
    refField: "image_urls",
    sizeField: "size",
    sizes: [
      { resolution: "1K", value: "1K", credits: 3.6 },
      { resolution: "2K", value: "2K", credits: 6.3 },
    ],
    verified: false,
    note: UNVERIFIED_NOTE,
  },
  {
    id: "minimax-h3/image-edit",
    label: "MiniMax H3 Image",
    hidden: true,
    maxPromptChars: 5_000,
    refField: "image_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 1.8 },
      { resolution: "2K", value: "2K", credits: 1.8 },
      { resolution: "4K", value: "4K", credits: 5.5 },
    ],
    verified: false,
    note: UNVERIFIED_NOTE,
  },
  {
    id: "qwen2-1/image-to-image",
    label: "Qwen-Image 2.1",
    hidden: true,
    maxPromptChars: 5_000,
    refField: "image_urls",
    sizeField: "resolution",
    sizes: [
      { resolution: "1K", value: "1K", credits: 4 },
      { resolution: "2K", value: "2K", credits: 8 },
    ],
    verified: false,
    note: UNVERIFIED_NOTE,
  },
];

/**
 * Các model đang cho chọn ở Quản trị > Cấu hình. Từ 2026-11-25 chủ dự án tạm ẩn hết, chỉ giữ GPT Image 2.5 Sunburst
 * (model cho ảnh tốt nhất khi thử thực tế); các model ẩn vẫn nằm trong KIE_MODELS để tra giá/tên trường cho ảnh cũ.
 */
export const SELECTABLE_KIE_MODELS: KieModel[] = KIE_MODELS.filter((m) => !m.hidden);

export function kieModel(id: string): KieModel | undefined {
  return KIE_MODELS.find((m) => m.id === id);
}

/** Danh sách độ phân giải (giữ thứ tự 1K/2K/4K) mà một model hỗ trợ; model lạ (không có trong danh mục) coi như hỗ trợ đủ cả ba. */
export function supportedResolutions(modelId: string): Resolution[] {
  const m = kieModel(modelId);
  if (!m) return ["1K", "2K", "4K"];
  return m.sizes.map((s) => s.resolution);
}
