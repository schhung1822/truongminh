import { BusinessTabs } from "./business-tabs";

export default function BusinessAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Thông tin doanh nghiệp</h1>
        <p className="text-muted-foreground">
          Kho kiến thức cho AI: hồ sơ xưởng, bài kiến thức, thông số tính giá. Bot không tự nói chuyện với khách; mọi AI chỉ làm việc cho nhân viên đã ghép nối và chỉ đọc đúng mức hiển thị bạn đặt.
        </p>
      </div>
      <BusinessTabs />
      {children}
    </div>
  );
}
