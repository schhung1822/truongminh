// Đọc DATABASE_URL trong .env và in ra MỘT thành phần:  node deploy/db-url.cjs host|port|user|pass|name
// Dùng cho script sao lưu để không phải gõ mật khẩu ra màn hình. Mọi ký tự trong mật khẩu đều được giữ nguyên.
const fs = require("node:fs");
const path = require("node:path");
const line = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error("Thiếu DATABASE_URL trong .env");
  process.exit(1);
}
const u = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, ""));
const parts = { host: u.hostname, port: u.port || "3306", user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password), name: u.pathname.slice(1) };
const key = process.argv[2];
if (!(key in parts)) {
  console.error("Dùng: node deploy/db-url.cjs host|port|user|pass|name");
  process.exit(1);
}
process.stdout.write(parts[key]);
