import path from "node:path";
import sharp from "sharp";

// Font có đủ dấu tiếng Việt (Be Vietnam Pro, giấy phép OFL) nhúng sẵn trong dự án.
// Dùng tùy chọn fontfile của sharp nên không phụ thuộc font cài trên máy chủ.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const FONTS = {
  regular: { file: "BeVietnamPro-Regular.ttf", family: "Be Vietnam Pro" },
  semibold: { file: "BeVietnamPro-SemiBold.ttf", family: "Be Vietnam Pro SemiBold" },
  bold: { file: "BeVietnamPro-Bold.ttf", family: "Be Vietnam Pro Bold" },
} as const;

export type FontWeight = keyof typeof FONTS;
export type TextImage = { input: Buffer; width: number; height: number };

function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Vẽ một dòng chữ thành ảnh PNG trong suốt. `size` tính bằng px. */
export async function renderText(opts: {
  text: string;
  size: number;
  weight?: FontWeight;
  color?: string;
}): Promise<TextImage> {
  const font = FONTS[opts.weight ?? "regular"];
  const text = opts.text.replace(/\s+/g, " ").trim();
  if (!text) {
    // không có chữ để vẽ: trả về ảnh trong suốt 1x1
    const empty = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    return { input: empty, width: 1, height: 1 };
  }
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${opts.color ?? "#222222"}">${escapeMarkup(text)}</span>`,
      font: `${font.family} ${Math.max(6, Math.round(opts.size))}`,
      fontfile: path.join(FONT_DIR, font.file),
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** Vẽ chữ xuống dòng trong bề rộng `maxWidth`, tối đa `maxLines` dòng (dài hơn thì cắt và thêm "…"). */
export async function renderTextWrap(opts: {
  text: string;
  size: number;
  weight?: FontWeight;
  color?: string;
  maxWidth: number;
  maxLines: number;
}): Promise<TextImage> {
  const font = FONTS[opts.weight ?? "regular"];
  const clean = opts.text.replace(/\s+/g, " ").trim();
  const single = await renderText({ ...opts, text: clean });
  if (single.width <= opts.maxWidth) return single; // vừa một dòng

  const wrapped = async (text: string) => {
    const { data, info } = await sharp({
      text: {
        text: `<span foreground="${opts.color ?? "#222222"}">${escapeMarkup(text)}</span>`,
        font: `${font.family} ${Math.max(6, Math.round(opts.size))}`,
        fontfile: path.join(FONT_DIR, font.file),
        width: Math.round(opts.maxWidth),
        wrap: "word-char",
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { input: data, width: info.width, height: info.height } satisfies TextImage;
  };
  const lineCount = (img: TextImage) => Math.max(1, Math.round(img.height / single.height));

  const full = await wrapped(clean);
  if (lineCount(full) <= opts.maxLines) return full;

  // quá số dòng cho phép: cắt bớt chữ cuối và thêm "…"
  const chars = [...clean];
  let lo = 1;
  let hi = chars.length - 1;
  let best: TextImage | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = await wrapped(chars.slice(0, mid).join("").trimEnd() + "…");
    if (lineCount(candidate) <= opts.maxLines) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best ?? (await renderTextFit({ ...opts, text: clean }));
}

/** Vẽ chữ nhưng cắt bớt và thêm "…" nếu rộng hơn maxWidth. */
export async function renderTextFit(opts: {
  text: string;
  size: number;
  weight?: FontWeight;
  color?: string;
  maxWidth: number;
}): Promise<TextImage> {
  const full = await renderText(opts);
  if (full.width <= opts.maxWidth) return full;

  const chars = [...opts.text.replace(/\s+/g, " ").trim()];
  let lo = 1;
  let hi = chars.length - 1;
  let best: TextImage | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = await renderText({ ...opts, text: chars.slice(0, mid).join("").trimEnd() + "…" });
    if (candidate.width <= opts.maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best ?? (await renderText({ ...opts, text: "…" }));
}
