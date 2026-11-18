/** Lệnh gõ nhanh qua Zalo. Phần nhận dạng lệnh (thuần, có test); phần thực thi nằm ở inbox.ts. */

export type CommandName = "help" | "status" | "today" | "inbox" | "reset" | "pair" | "human";

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
  inbox: "inbox",
  hopthu: "inbox",
  hop_thu: "inbox",
  reset: "reset",
  moi: "reset",
  pair: "pair",
  ghepnoi: "pair",
  ghep_noi: "pair",
  nhanvien: "human",
  nhan_vien: "human",
  human: "human",
};

/** Bỏ dấu tiếng Việt để người dùng gõ /ghépnối hay /ghepnoi đều được. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** "/status" hoặc "/status@TenBot abc" -> { name: "status", args: "abc" }. Không phải lệnh thì trả null. */
export function parseCommand(text: string): { name: CommandName; args: string } | null {
  const m = /^\/([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const name = ALIASES[fold(m[1])];
  return name ? { name, args: (m[2] ?? "").trim() } : null;
}

/** Lệnh nào ai cũng dùng được, lệnh nào chỉ nhân viên đã ghép nối. */
export const PUBLIC_COMMANDS: ReadonlySet<CommandName> = new Set(["help", "reset", "pair", "human"]);

export const HELP_STAFF = [
  "Lệnh dành cho nhân viên:",
  "/status - tình trạng hệ thống (token kie.ai, ảnh đang tạo)",
  "/today - số lượt tạo ảnh hôm nay",
  "/inbox - hội thoại chưa đọc và đang chờ người",
  "/reset - xóa ngữ cảnh bot ở cuộc chat này",
  "/nhanvien - gọi nhân viên (cho khách)",
].join("\n");

export const HELP_CUSTOMER = [
  "Em là trợ lý của xưởng. Anh/chị cứ nhắn câu hỏi, em trả lời ngay.",
  "Gõ /nhanvien để gặp nhân viên, /reset để em quên cuộc trò chuyện trước đó.",
].join("\n");
