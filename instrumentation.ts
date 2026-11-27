/**
 * Chạy một lần khi máy chủ Next khởi động: tự kết nối lại các tài khoản Zalo cá nhân đã đăng nhập (bằng cookie đã lưu),
 * để tin khách nhắn vào các số đó được nhận ngay cả khi chưa ai mở trang web. Cũng bật các việc chạy nền khác của tiến trình.
 * Không chờ kết nối xong (register phải trả về nhanh thì máy chủ mới nhận yêu cầu).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAllPersonalAccounts } = await import("@/lib/zalo/personal/manager");
  void startAllPersonalAccounts();
  // nhặt lại các việc nhân viên đã giao cho bot trong nhóm Zalo mà máy chủ chưa kịp gửi kết quả
  const { resumeBotTasks } = await import("@/lib/zalo/agent/tasks");
  void resumeBotTasks();
  // vòng theo dõi pin mới trên Pinterest để bot gửi vào nhóm Zalo (chỉ gọi Pinterest khi có board đang được theo dõi)
  const { startPinFeedWatcher } = await import("@/lib/pinterest/zalo-feed");
  startPinFeedWatcher();
}
