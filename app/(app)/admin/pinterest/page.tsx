import { redirect } from "next/navigation";

/** Trang cũ: phần kết nối Pinterest đã chuyển về Hệ thống > Kết nối. */
export default function AdminPinterestRedirect() {
  redirect("/admin/connections/pinterest");
}
