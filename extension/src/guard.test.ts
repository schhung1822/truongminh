import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hàng rào cho mục 2 "Ngoài phạm vi" của docs/thiet-ke-module-lead-facebook.md: ai đó (hoặc một lần chỉnh sửa vội sau này)
 * lỡ thêm tự động gửi, hay kỹ thuật che giấu tự động hoá vào extension thì test này đỏ.
 *
 * Từ bản 0.4.0 (giai đoạn 2 và bổ sung v1.1) extension được ĐIỀN SẴN câu trả lời mà người đã duyệt trên webapp. Phần được nới
 * ra rất hẹp và được ép ngay dưới đây:
 * - Chỉ file content/fill.ts được đặt con trỏ và chèn chữ vào ô trả lời, và chỉ bằng lệnh chèn chữ hoặc sự kiện dán.
 * - Trong luồng trả lời, mọi lần bấm đi qua `safeClick` của fill.ts, hàm này từ chối nút gửi / đăng.
 * - Không ở đâu có giả lập bàn phím (không có phím Enter), không gửi form. Người đọc lại và tự bấm gửi.
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

function violations(pattern: RegExp, only?: RegExp, except?: RegExp): string[] {
  return FILES.filter((f) => (!only || only.test(f.path)) && (!except || !except.test(f.path)))
    .filter((f) => pattern.test(code(f.text)))
    .map((f) => f.path);
}

const FILL = /^src\/content\/fill\.ts$/;
const fileCode = (path: string) => code(FILES.find((f) => f.path === path)?.text ?? "");

describe("extension không tự gửi, không che giấu tự động hoá", () => {
  it("có file nguồn để kiểm tra", () => {
    expect(FILES.length).toBeGreaterThan(5);
    expect(fileCode("src/content/fill.ts")).not.toBe("");
  });

  it("không giả lập bàn phím, không gửi form ở bất kỳ file nào", () => {
    expect(violations(/KeyboardEvent|\.submit\s*\(|requestSubmit|keydown|keyup|keypress|["'`]Enter["'`]/)).toEqual([]);
  });

  it("chỉ fill.ts được chèn chữ vào ô nhập", () => {
    expect(violations(/InputEvent|execCommand|insertText|setRangeText|dispatchEvent|ClipboardEvent|DataTransfer/, undefined, FILL)).toEqual([]);
  });

  it("fill.ts chỉ chèn chữ bằng lệnh chèn chữ hoặc sự kiện dán, xoá chữ bằng lệnh xoá; không phát sự kiện nào khác", () => {
    const fill = fileCode("src/content/fill.ts");
    const commands = [...fill.matchAll(/execCommand\(\s*["']([A-Za-z]+)["']/g)].map((m) => m[1]).sort();
    expect(commands).toEqual(["delete", "insertText"]);
    const dispatched = [...fill.matchAll(/dispatchEvent\(\s*new\s+([A-Za-z]+)\(\s*["']([a-z]+)["']/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(dispatched).toEqual(["ClipboardEvent:paste"]);
    expect((fill.match(/dispatchEvent/g) ?? []).length).toBe(1);
    expect(fill).not.toMatch(/InputEvent|MouseEvent|PointerEvent|new Event\(|\\n|\\r/);
  });

  it("content script không ghi vào trang: không gán value / innerHTML / textContent... ở bất kỳ file content nào", () => {
    expect(violations(/\.(value|innerText|innerHTML|outerHTML|textContent|checked)\s*=[^=]/, /^src\/content\//)).toEqual([]);
  });

  it("chỉ fill.ts biết ô nhập là gì và được đặt con trỏ vào đó", () => {
    expect(violations(/contenteditable|role=["']textbox["']|<textarea|\.focus\s*\(/i, /^src\/content\//, FILL)).toEqual([]);
  });

  it("luồng trả lời: mọi lần bấm đi qua safeClick; safeClick kiểm tra rồi mới bấm", () => {
    const fill = fileCode("src/content/fill.ts");
    // đúng một lời gọi .click() trong fill.ts, đứng ngay sau bước từ chối của safeClick
    expect((fill.match(/\.click\s*\(/g) ?? []).length).toBe(1);
    expect(fill).toMatch(/export function safeClick\([^)]*\): boolean \{\s*if \(clickRefusal\(el, purpose\) !== null\) return false;\s*el\.click\(\);\s*return true;\s*\}/);
    // bước từ chối có xét nhãn nút gửi, nút submit và form soạn thảo
    expect(fill).toMatch(/isSendLabel\(label\)/);
    expect(fill).toMatch(/\[type="submit"\]/);
    expect(fill).toMatch(/closest\("form"\)/);
    // các file còn lại của luồng trả lời không có lời gọi .click() trực tiếp nào
    for (const path of ["src/content/identity.ts", "src/content/reply.ts", "src/content/reply-panel.ts", "src/content/reply-diagnose.ts"]) {
      expect(fileCode(path), path).not.toBe("");
      expect(fileCode(path), path).not.toMatch(/\.click\s*\(/);
    }
  });

  it("các file chỉ đọc trang (quét comment) vẫn chỉ bấm nút mở rộng nội dung: nhãn của chúng không có nút gửi hay trả lời", () => {
    const selectors = FILES.find((f) => f.path === "src/content/selectors.ts")!.text;
    const labels = /export const LABELS = \{([\s\S]*?)\} as const;/.exec(selectors)?.[1] ?? "";
    expect(labels).not.toBe("");
    expect(labels).not.toMatch(/\bgui\b|\bsend\b|\bdang\b|\bpost\b|tra loi|\breply\b(?!\|ies)/);
  });

  it("bảng nhỏ của extension trên trang nằm trong shadow root riêng và không đụng ô nhập", () => {
    const panel = fileCode("src/content/reply-panel.ts");
    expect(panel).toMatch(/attachShadow\(/);
    expect(panel).not.toMatch(/querySelector|execCommand|activeElement/);
  });

  it("webapp không có đường nào để extension báo 'tự gửi': API chỉ nhận kết quả filled / sent / skipped / failed", () => {
    const api = fileCode("src/api.ts");
    expect(api).toMatch(/"filled" \| "sent" \| "skipped" \| "failed"/);
    // extension chỉ gọi các đường dẫn /api/ext/* đã biết
    const paths = [...api.matchAll(/["'`](\/api\/[^"'`$?]*)/g)].map((m) => m[1]).sort();
    expect([...new Set(paths)]).toEqual(["/api/ext/jobs", "/api/ext/logs", "/api/ext/me", "/api/ext/posts", "/api/ext/posts/", "/api/ext/replies/"]);
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

  it("manifest chỉ xin đúng quyền cần thiết (luồng trả lời không cần thêm quyền nào)", () => {
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
