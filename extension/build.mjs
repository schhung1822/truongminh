// Build extension ra thư mục extension/dist. Chạy:  npm run ext:build
// Địa chỉ webapp cố định lúc build (Manifest V3 phải khai trước quyền truy cập tên miền):
//   APP_ORIGIN=https://truongminh.activate.vn npm run ext:build      (mặc định)
//   APP_ORIGIN=http://localhost:3000 npm run ext:build               (thử ở máy dev)
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
const origin = (process.env.APP_ORIGIN || "https://truongminh.activate.vn").replace(/\/+$/, "");
if (!/^https?:\/\/[^/\s]+$/.test(origin)) throw new Error(`APP_ORIGIN không hợp lệ: ${origin} (ví dụ https://truongminh.activate.vn)`);

const manifestText = (await readFile(resolve(root, "manifest.template.json"), "utf8")).replaceAll("__APP_ORIGIN__", origin);
const manifest = JSON.parse(manifestText);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Mỗi điểm vào gộp thành một file duy nhất (content script của Manifest V3 không nạp được module ES)
await build({
  entryPoints: {
    background: resolve(root, "src/background.ts"),
    content: resolve(root, "src/content/facebook.ts"),
    popup: resolve(root, "src/popup/popup.ts"),
    options: resolve(root, "src/options/options.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: false,
  sourcemap: false,
  logLevel: "info",
  define: { __APP_ORIGIN__: JSON.stringify(origin), __EXT_VERSION__: JSON.stringify(manifest.version) },
});

await writeFile(resolve(dist, "manifest.json"), manifestText);
for (const f of ["popup/popup.html", "popup/popup.css", "options/options.html"]) {
  await cp(resolve(root, "src", f), resolve(dist, f.split("/")[1]));
}
for (const s of [16, 32, 48, 128]) await cp(resolve(root, "src/icons", `icon${s}.png`), resolve(dist, `icon${s}.png`));
console.log(`\nĐã build ${manifest.name} v${manifest.version} vào ${dist}\nĐịa chỉ webapp: ${origin}\nCài: chrome://extensions > bật "Chế độ nhà phát triển" > "Tải tiện ích đã giải nén" > chọn thư mục dist. Đã cài rồi thì bấm nút tải lại của extension.`);
