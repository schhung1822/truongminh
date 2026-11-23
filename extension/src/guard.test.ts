import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hàng rào cho mục 2 "Ngoài phạm vi" của docs/thiet-ke-module-lead-facebook.md: ai đó (hoặc một lần chỉnh sửa vội sau này)
 * lỡ thêm tự động gửi, tự gõ chữ, hay kỹ thuật che giấu tự động hoá vào extension thì test này đỏ.
 */
const SRC = join(__dirname);
const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|html)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const FILES = sourceFiles(SRC).map((p) => ({ path: relative(ROOT, p).replaceAll("\\", "/"), text: readFileSync(p, "utf8") }));
/** Bỏ chú thích để các dòng mô tả "không làm X" không bị tính là có làm X. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function violations(pattern: RegExp, only?: RegExp): string[] {
  return FILES.filter((f) => !only || only.test(f.path)).filter((f) => pattern.test(code(f.text))).map((f) => f.path);
}

describe("extension không tự gửi, không gõ chữ, không che giấu tự động hoá", () => {
  it("có file nguồn để kiểm tra", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it("không giả lập bàn phím, không gõ vào ô nhập, không gửi form", () => {
    expect(violations(/KeyboardEvent|InputEvent|execCommand|insertText|setRangeText|\.submit\s*\(|requestSubmit|dispatchEvent/)).toEqual([]);
  });

  it("content script không ghi vào trang (chỉ đọc, cuộn và bấm nút mở rộng nội dung)", () => {
    expect(violations(/\.(value|innerText|innerHTML|outerHTML|textContent|checked)\s*=[^=]/, /^src\/content\//)).toEqual([]);
    expect(violations(/contenteditable|role=["']textbox["']|<textarea|\.focus\s*\(/i, /^src\/content\//)).toEqual([]);
  });

  it("không dùng số ngẫu nhiên (độ trễ giữa các bước là số cố định, không giả hành vi người)", () => {
    expect(violations(/Math\.random|getRandomValues/)).toEqual([]);
  });

  it("không đụng dấu vân tay trình duyệt, user-agent, proxy, cookie, trình gỡ lỗi", () => {
    expect(violations(/navigator\.(webdriver|userAgent|languages|platform|hardwareConcurrency|plugins)|chrome\.(cookies|debugger|proxy|webRequest|declarativeNetRequest)|document\.cookie|Object\.defineProperty\(\s*navigator/)).toEqual([]);
  });

  it("chrome.scripting chỉ nạp đúng file content.js của extension, không chạy mã tuỳ ý trong trang", () => {
    let uses = 0;
    for (const f of FILES) {
      for (const u of code(f.text).matchAll(/chrome\.scripting\.executeScript\(([\s\S]*?)\)/g)) {
        uses++;
        expect(u[1], f.path).toMatch(/files:\s*\["content\.js"\]/);
        expect(u[1], f.path).not.toMatch(/func:|function|=>/);
      }
    }
    expect(uses).toBeGreaterThan(0);
    expect(violations(/chrome\.scripting\.(insertCSS|registerContentScripts)/)).toEqual([]);
  });

  it("manifest chỉ xin đúng quyền cần thiết", () => {
    const m = JSON.parse(readFileSync(join(ROOT, "manifest.template.json"), "utf8")) as { name: string; permissions: string[]; host_permissions: string[]; content_scripts: { matches: string[] }[] };
    // scripting: chỉ để nạp bổ sung chính content.js vào tab Facebook đã mở sẵn; notifications: báo "có lead mới" trên máy
    expect([...m.permissions].sort()).toEqual(["alarms", "notifications", "scripting", "storage", "tabs"]);
    expect([...m.host_permissions].sort()).toEqual(["__APP_ORIGIN__/*", "https://*.facebook.com/*"]);
    expect(m.content_scripts.flatMap((c) => c.matches)).toEqual(["https://*.facebook.com/*"]);
  });

  it("tên extension là Data Lead Facebook, không kèm tên xưởng", () => {
    const m = JSON.parse(readFileSync(join(ROOT, "manifest.template.json"), "utf8")) as { name: string };
    expect(m.name).toBe("Data Lead Facebook");
    expect(FILES.filter((f) => /Trường Minh|Truong Minh/i.test(f.text)).map((f) => f.path)).toEqual([]);
  });
});
