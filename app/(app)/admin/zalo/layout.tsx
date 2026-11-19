import { ZaloTabs } from "./zalo-tabs";

export default function ZaloAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt Zalo</h1>
        <p className="text-muted-foreground">
          Bật/tắt và cấu hình từng chức năng của bot Zalo: gửi ảnh mẫu vào nhóm, bot AI trả lời khách, nhân viên ghép nối và lệnh gõ nhanh, kịch bản chăm sóc nhóm.
        </p>
      </div>
      <ZaloTabs />
      {children}
    </div>
  );
}
