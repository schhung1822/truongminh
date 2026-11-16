import { redirect } from "next/navigation";

// Tạo phiên mới đã chuyển về Trang chính. Giữ lại liên kết cũ (kể cả ?logoId=) để không hỏng đường dẫn đã lưu.
export default async function NewSessionRedirect({ searchParams }: { searchParams: Promise<{ logoId?: string }> }) {
  const { logoId } = await searchParams;
  redirect(logoId ? `/?logoId=${encodeURIComponent(logoId)}` : "/");
}
