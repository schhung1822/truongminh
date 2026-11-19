import { redirect } from "next/navigation";

// Hộp thư Zalo đã bỏ. Giữ đường dẫn cũ để ai lưu lối tắt vẫn vào được trang Zalo đang dùng.
export default function ZaloIndexPage() {
  redirect("/zalo/care");
}
