import { redirect } from "next/navigation";

/** Trang cũ: tài khoản Zalo cá nhân đã chuyển về Hệ thống > Kết nối > Zalo. */
export default function ZaloAccountsRedirect() {
  redirect("/admin/connections/zalo#tai-khoan-ca-nhan");
}
