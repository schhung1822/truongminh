import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương chung cho MỌI trang trong khu vực đã đăng nhập (trừ trang đã có loading.tsx riêng, ví dụ /pinterest).
 * Next chỉ coi phần {children} này là "động" (đọc CSDL lúc có request) nên khi chuyển trang, chỉ vùng nội dung này
 * tạm hiện khung xương rồi thay bằng nội dung thật — còn thanh menu/đầu trang (AppShell) không bị vẽ lại, không giật.
 * Đây là lý do chính gây cảm giác khựng khi chuyển trang trước đây: không có loading.tsx thì trình duyệt đứng im,
 * không có phản hồi gì cho tới khi trang mới tải xong hẳn rồi mới hiện ra.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
