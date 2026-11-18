import { describe, expect, it } from "vitest";
import { detectMedia, mb } from "./media";

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe("detectMedia", () => {
  it("nhận JPEG, PNG, WEBP theo nội dung", () => {
    expect(detectMedia(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ kind: "IMAGE", ext: "jpg", mime: "image/jpeg" });
    expect(detectMedia(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))?.ext).toBe("png");
    expect(detectMedia(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]))?.ext).toBe("webp");
  });

  it("nhận video MP4 và MOV theo 'ftyp' ở byte 4", () => {
    expect(detectMedia(Uint8Array.from([0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("isom")]))).toEqual({ kind: "VIDEO", ext: "mp4", mime: "video/mp4" });
    expect(detectMedia(Uint8Array.from([0, 0, 0, 0x14, ...ascii("ftyp"), ...ascii("qt  ")]))).toEqual({ kind: "VIDEO", ext: "mov", mime: "video/quicktime" });
  });

  it("file khác (exe, zip, rỗng) thì null", () => {
    expect(detectMedia(Uint8Array.from(ascii("MZ......")))).toBeNull();
    expect(detectMedia(Uint8Array.from(ascii("PK\u0003\u0004....")))).toBeNull();
    expect(detectMedia(new Uint8Array())).toBeNull();
  });
});

describe("mb", () => {
  it("đổi byte sang MB kiểu Việt Nam", () => {
    expect(mb(52 * 1024 * 1024)).toBe("52,0MB");
  });
});
