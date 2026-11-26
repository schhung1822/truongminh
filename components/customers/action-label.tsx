import { cn } from "@/lib/utils";

/** Lớp CSS cho các nút tạo ảnh ở khung logo: nút hai dòng (tên việc + một dòng nói rõ nút làm gì). */
export const ACTION_BUTTON_CLASS = "h-auto min-h-14 gap-2.5 px-4 py-2 text-left";

/** Chữ hai dòng trong nút tạo ảnh: `title` là tên việc, `hint` nói ngắn gọn nút sẽ tạo gì (số chất liệu, số ảnh). */
export function ActionLabel({ title, hint, warn }: { title: string; hint?: string; /** dòng phụ là lời cảnh báo (không đủ lượt) */ warn?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="text-base font-medium">{title}</span>
      {hint && <span className={cn("text-xs font-normal", warn ? "text-red-600" : "opacity-70")}>{hint}</span>}
    </span>
  );
}
