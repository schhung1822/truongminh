# Ảnh mẫu in logo

Web app giúp đội sale của xưởng in tạo ảnh mô phỏng logo của khách trên nhiều chất liệu: sale chỉ upload logo và bấm nút, toàn bộ ảnh mẫu chất liệu, prompt và bố cục do admin cài sẵn.

Tài liệu thiết kế: [docs/PLAN.md](docs/PLAN.md). Các quyết định kỹ thuật: [docs/DECISIONS.md](docs/DECISIONS.md).

> Trạng thái: đang làm theo từng giai đoạn. Đã xong **GĐ1 đến GĐ4** (luồng bước 1 chạy được với ảnh giả). Tiếp theo: GĐ5 nối kie.ai thật.

## Chạy trên máy cá nhân (Windows)

Cần cài sẵn: **Node.js 24** và **Docker Desktop** (mở Docker Desktop lên trước khi làm các bước dưới).

Mở terminal trong thư mục dự án rồi chạy lần lượt:

```powershell
# 1. Cài thư viện (chỉ lần đầu)
npm install

# 2. Tạo file cấu hình (chỉ lần đầu). Mở file .env vừa tạo và đổi ADMIN_EMAIL, ADMIN_PASSWORD
copy .env.example .env

# 3. Bật cơ sở dữ liệu MySQL bằng Docker
npm run db:up

# 4. Tạo các bảng trong CSDL (chỉ lần đầu và mỗi khi có cập nhật)
npm run db:migrate

# 5. Tạo tài khoản admin đầu tiên + dữ liệu mặc định (chỉ lần đầu, chạy lại cũng an toàn)
npm run db:seed

# 5b. (Không bắt buộc) Tạo 12 chất liệu giả + 2 trang mẫu để thử ngay, chưa cần nhập chất liệu thật
npm run db:seed-demo

# 6. Chạy web
npm run dev
```

Mở trình duyệt vào <http://localhost:3000>, đăng nhập bằng `ADMIN_EMAIL` và `ADMIN_PASSWORD` đã điền trong `.env`.

Lần sau chỉ cần: mở Docker Desktop, rồi `npm run db:up` và `npm run dev`.

Mặc định `IMAGE_PROVIDER="mock"`: ảnh AI là ảnh giả, **không tốn tiền**. Chỉ đổi sang `kie` khi đã có khóa kie.ai (giai đoạn 5).

## Các lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy web để dùng/thử |
| `npm run lint` | Kiểm tra lỗi mã |
| `npm test` | Chạy test tự động |
| `npm run build` | Build bản chạy thật |
| `npm run db:up` | Bật MySQL (Docker) |
| `npm run db:migrate` | Cập nhật cấu trúc CSDL |
| `npm run db:seed` | Tạo admin và dữ liệu mặc định |
| `npm run db:seed-demo` | Tạo chất liệu và trang mẫu giả để thử (chỉ dùng khi dev) |
| `npm run db:studio` | Xem dữ liệu trong CSDL bằng giao diện web |

> Nếu `npm test` báo lỗi lạ khi chạy trong Git Bash, hãy chạy trong PowerShell hoặc terminal của VS Code.

## Biến môi trường

Xem chú thích tiếng Việt cho từng biến trong [.env.example](.env.example). **Không bao giờ** đưa file `.env` lên git hoặc gửi cho người khác.

## Triển khai lên VPS

Sẽ được viết đầy đủ ở giai đoạn 8 (Docker Compose, HTTPS, sao lưu). Hướng đi đã chốt nằm ở mục 9 của [docs/PLAN.md](docs/PLAN.md).
