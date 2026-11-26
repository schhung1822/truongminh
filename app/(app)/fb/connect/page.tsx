import { redirect } from "next/navigation";

/** Trang cũ: phần kết nối extension đã chuyển về Hệ thống > Kết nối. Giữ đường dẫn này vì extension đã cài vẫn mở link cũ. */
export default function FbConnectRedirect() {
  redirect("/admin/connections/extension");
}
