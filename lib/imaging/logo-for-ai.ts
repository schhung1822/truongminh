import sharp from "sharp";

/** Nền sáng cho logo tối, nền tối cho logo sáng. */
const LIGHT_BG = "#ffffff";
const DARK_BG = "#262626";
const PADDING_RATIO = 0.08;

/**
 * Chuẩn bị logo để gửi cho AI. Logo thường là PNG nền trong suốt; nhiều bộ xử lý ảnh BỎ kênh trong suốt khi đọc,
 * khi đó logo đen (RGB 0,0,0) thành một khối đen không còn chi tiết và AI tự đoán bậy.
 * Vì vậy đặt logo lên nền phẳng TƯƠNG PHẢN (logo tối -> nền trắng, logo sáng -> nền tối) và chừa lề,
 * để hình dạng logo hiện rõ trong chính các điểm ảnh màu. Ảnh đã đặc (không trong suốt) thì giữ nguyên.
 */
export async function prepareLogoForAi(png: Buffer): Promise<{ buffer: Buffer; background: "none" | "light" | "dark" }> {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return { buffer: png, background: "none" };

  // Đọc ở kích thước nhỏ để tính nhanh: độ sáng trung bình của phần logo (tính theo độ đục) và có trong suốt thật không
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .resize({ width: 256, height: 256, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let weighted = 0;
  let alphaSum = 0;
  let transparent = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 250) transparent++;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    weighted += lum * a;
    alphaSum += a;
  }
  // Gần như không có điểm trong suốt: coi như ảnh đặc, gửi nguyên
  if (transparent / pixels < 0.01) return { buffer: png, background: "none" };

  const meanLum = alphaSum > 0 ? weighted / alphaSum : 255;
  const useLight = meanLum < 140;
  const background = useLight ? LIGHT_BG : DARK_BG;

  const pad = Math.max(8, Math.round(Math.max(meta.width ?? 0, meta.height ?? 0) * PADDING_RATIO));
  const out = await sharp(png)
    .flatten({ background })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background })
    .png()
    .toBuffer();
  return { buffer: out, background: useLight ? "light" : "dark" };
}
