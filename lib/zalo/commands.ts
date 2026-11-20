/**
 * Lệnh gõ nhanh qua Zalo. Phần nhận dạng lệnh (thuần, có test); phần thực thi nằm ở bot.ts.
 * Bot không nói chuyện với người chưa ghép nối: chỉ /ghepnoi dùng được khi chưa ghép nối, mọi lệnh khác dành cho nhân viên.
 */
import { fold } from "./text";

export type CommandName = "help" | "status" | "today" | "reset" | "pair";

/** Các lệnh bật/tắt riêng được trong cấu hình (lệnh ghép nối /ghepnoi bật bằng công tắc "Ghép nối nhân viên"). */
export const TOGGLEABLE_COMMANDS = ["help", "status", "today", "reset"] as const;
export type ToggleableCommand = (typeof TOGGLEABLE_COMMANDS)[number];

const ALIASES: Record<string, CommandName> = {
  help: "help",
  start: "help",
  tro_giup: "help",
  trogiup: "help",
  status: "status",
  trang_thai: "status",
  trangthai: "status",
  today: "today",
  homnay: "today",
  hom_nay: "today",
  reset: "reset",
  moi: "reset",
  pair: "pair",
  ghepnoi: "pair",
  ghep_noi: "pair",
};

/** "/status" hoặc "/status@TenBot abc" -> { name: "status", args: "abc" }. Không phải lệnh thì trả null. */
export function parseCommand(text: string): { name: CommandName; args: string } | null {
  const m = /^\/([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const name = ALIASES[fold(m[1])];
  return name ? { name, args: (m[2] ?? "").trim() } : null;
}

/** Lệnh người chưa ghép nối được dùng (chỉ xin ghép nối). */
export const PUBLIC_COMMANDS: ReadonlySet<CommandName> = new Set(["pair"]);

/** Mô tả từng lệnh (cho /help và trang hướng dẫn). */
export const COMMAND_INFO: Record<ToggleableCommand, { usage: string; desc: string }> = {
  help: { usage: "/help", desc: "xem danh sách lệnh" },
  status: { usage: "/status", desc: "tình trạng hệ thống (token kie.ai, ảnh đang tạo)" },
  today: { usage: "/today", desc: "số lượt tạo ảnh hôm nay theo từng người" },
  reset: { usage: "/reset", desc: "xóa ngữ cảnh của cuộc trò chuyện này (AI soạn nháp bắt đầu lại từ đầu)" },
};

/** Nội dung /help cho nhân viên đã ghép nối: các lệnh đang bật. */
export function helpText(enabled: readonly string[]): string {
  const on = TOGGLEABLE_COMMANDS.filter((c) => enabled.includes(c) && c !== "help");
  return ["Lệnh dành cho nhân viên:", ...on.map((c) => `${COMMAND_INFO[c].usage} - ${COMMAND_INFO[c].desc}`)].join("\n");
}
