/** Lệnh gõ nhanh qua Zalo. Phần nhận dạng lệnh (thuần, có test); phần thực thi nằm ở bot.ts. */
import { fold } from "./text";

export type CommandName = "help" | "status" | "today" | "waiting" | "done" | "reset" | "pair" | "human";

/** Các lệnh bật/tắt riêng được trong cấu hình (lệnh ghép nối /ghepnoi bật bằng công tắc "Ghép nối nhân viên"). */
export const TOGGLEABLE_COMMANDS = ["help", "status", "today", "waiting", "done", "reset", "human"] as const;
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
  waiting: "waiting",
  cho: "waiting",
  inbox: "waiting",
  hopthu: "waiting",
  hop_thu: "waiting",
  done: "done",
  xong: "done",
  reset: "reset",
  moi: "reset",
  pair: "pair",
  ghepnoi: "pair",
  ghep_noi: "pair",
  nhanvien: "human",
  nhan_vien: "human",
  human: "human",
};

/** "/status" hoặc "/status@TenBot abc" -> { name: "status", args: "abc" }. Không phải lệnh thì trả null. */
export function parseCommand(text: string): { name: CommandName; args: string } | null {
  const m = /^\/([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const name = ALIASES[fold(m[1])];
  return name ? { name, args: (m[2] ?? "").trim() } : null;
}

/** Lệnh nào ai cũng dùng được, lệnh nào chỉ nhân viên đã ghép nối. */
export const PUBLIC_COMMANDS: ReadonlySet<CommandName> = new Set(["help", "reset", "pair", "human"]);

/** Mô tả từng lệnh (cho /help và trang hướng dẫn). */
export const COMMAND_INFO: Record<ToggleableCommand, { usage: string; desc: string; staffOnly: boolean }> = {
  help: { usage: "/help", desc: "xem danh sách lệnh", staffOnly: false },
  status: { usage: "/status", desc: "tình trạng hệ thống (token kie.ai, ảnh đang tạo)", staffOnly: true },
  today: { usage: "/today", desc: "số lượt tạo ảnh hôm nay theo từng người", staffOnly: true },
  waiting: { usage: "/cho", desc: "các khách đang chờ nhân viên trả lời", staffOnly: true },
  done: { usage: "/xong", desc: "đánh dấu đã xử lý xong các khách đang chờ, bot trả lời lại các khách đó", staffOnly: true },
  reset: { usage: "/reset", desc: "xóa ngữ cảnh để bot quên cuộc trò chuyện trước đó và trả lời lại từ đầu", staffOnly: false },
  human: { usage: "/nhanvien", desc: "gọi nhân viên", staffOnly: false },
};

/** Nội dung /help: nhân viên thấy mọi lệnh đang bật, khách chỉ thấy lệnh dành cho khách. */
export function helpText(staff: boolean, enabled: readonly string[]): string {
  const on = TOGGLEABLE_COMMANDS.filter((c) => enabled.includes(c) && c !== "help" && (staff || !COMMAND_INFO[c].staffOnly));
  if (!staff) {
    const lines = ["Em là trợ lý của xưởng. Anh/chị cứ nhắn câu hỏi, em trả lời ngay."];
    if (on.length > 0) lines.push(on.map((c) => `${COMMAND_INFO[c].usage} - ${COMMAND_INFO[c].desc}`).join("\n"));
    return lines.join("\n");
  }
  return ["Lệnh dành cho nhân viên:", ...on.map((c) => `${COMMAND_INFO[c].usage} - ${COMMAND_INFO[c].desc}`)].join("\n");
}
