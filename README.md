# Ảnh mẫu in logo

Web app giúp đội sale của xưởng in tạo ảnh mô phỏng logo của khách trên nhiều chất liệu: sale chỉ upload logo và bấm nút, toàn bộ ảnh mẫu chất liệu, prompt và bố cục do admin cài sẵn.

Tài liệu thiết kế: [docs/PLAN.md](docs/PLAN.md). Các quyết định kỹ thuật: [docs/DECISIONS.md](docs/DECISIONS.md).

> Trạng thái: đã xong các chức năng trong brief (đăng nhập, chất liệu, trang mẫu, khách hàng/logo, bước 1 và bước 2 với kie.ai, lịch sử, ZIP/PDF, thống kê) và có sẵn gói triển khai Docker. Việc còn lại: chạy thử thật trên VPS.

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

| `npm run db:seed-styles` | Thêm 4 kiểu thiết kế khởi đầu nếu chưa có |
| `npm run db:update-prompts` | Tạo phiên bản prompt mới từ mặc định trong mã (không ghi đè bản cũ) |

> Nếu `npm test` báo lỗi lạ khi chạy trong Git Bash, hãy chạy trong PowerShell hoặc terminal của VS Code.

## Chạy thử với kie.ai thật (tốn tiền)

1. Tạo API key ở kie.ai, dán vào `KIE_API_KEY=` trong `.env`. **Không gửi khóa cho ai, không đưa lên git.**
2. Trong `.env` đổi `IMAGE_PROVIDER="mock"` thành `IMAGE_PROVIDER="kie"`, rồi khởi động lại `npm run dev` (web chỉ đọc `.env` lúc khởi động).
3. Vào **Quản trị > Cấu hình**: kiểm tra dòng "Số dư kie.ai" có hiện số, và "Model tạo ảnh" đúng ý (mặc định `gpt-image-2-5-sunburst-image-to-image`).
4. Tạo phiên mới. Bước Xác nhận hiện **chi phí ước tính** (2K = 10 token ≈ 0,05 USD mỗi ảnh). Số token đã dùng và còn lại luôn hiện ở góc phải thanh đầu trang.
5. Muốn quay lại ảnh giả: đổi `IMAGE_PROVIDER="mock"` và khởi động lại.

Giá tham khảo (kie.ai, GPT Image 2.5): 1K = 6, 2K = 10, 4K = 16 token mỗi ảnh; 1 token ≈ 0,005 USD. Giá tính theo ảnh tạo ra, không theo số ảnh tham chiếu.

## Biến môi trường

Xem chú thích tiếng Việt cho từng biến trong [.env.example](.env.example). **Không bao giờ** đưa file `.env` lên git hoặc gửi cho người khác.

## Triển khai lên VPS

Chạy bằng Docker Compose gồm 3 container trên cùng một VPS: `app` (web), `db` (MySQL) và `caddy` (tự xin chứng chỉ HTTPS). Lý do chọn cách này: [docs/PLAN.md](docs/PLAN.md) mục 9.

### Cần chuẩn bị
- Một VPS Linux (khuyến nghị Ubuntu 22.04/24.04, **tối thiểu 2 GB RAM**, ổ đĩa 40 GB trở lên vì ảnh 2K tốn dung lượng).
- Một tên miền (ví dụ `anh-mau.xuongin.com`) đã trỏ bản ghi **A** về địa chỉ IP của VPS.
- Tường lửa VPS chỉ mở cổng **22** (SSH), **80** và **443**. Không mở cổng 3306 (MySQL).

### Cài lần đầu (gõ trên VPS)
```bash
# 1. Cài Docker (chỉ lần đầu)
curl -fsSL https://get.docker.com | sh

# 2. Lấy mã nguồn về (dự án đang để chế độ công khai, nếu để riêng tư thì cần thêm bước đăng nhập git)
git clone https://github.com/schhung1822/truongminh.git
cd truongminh

# 3. Tạo file cấu hình, rồi mở ra điền: tên miền, 2 mật khẩu CSDL, tài khoản admin, khóa kie.ai
cp .env.production.example .env
nano .env          # sửa xong bấm Ctrl+O, Enter, Ctrl+X để lưu

# 4. Build và chạy (lần đầu mất vài phút). Cấu trúc CSDL tự tạo khi web khởi động.
docker compose up -d --build

# 5. Tạo tài khoản admin và dữ liệu mặc định (chạy một lần, chạy lại cũng an toàn)
docker compose exec app npm run db:seed
docker compose exec app npm run db:seed-styles
```

Mở `https://tên-miền-của-bạn`, đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`, **đổi mật khẩu ngay** ở trang Người dùng. Lần đầu Caddy cần vài chục giây để xin chứng chỉ HTTPS; nếu trình duyệt báo lỗi thì chờ một phút rồi tải lại.

Sau đó: vào **Quản trị > Chất liệu** nhập chất liệu thật, **Trang mẫu** xếp chất liệu vào trang, **Cấu hình** kiểm tra model và số dư kie.ai.

### Kiểm tra web đang chạy
```bash
docker compose ps                 # 3 dòng đều "running", app có chữ "healthy"
docker compose logs -f app        # xem nhật ký web (thoát: Ctrl+C)
```

### Cập nhật bản mới
```bash
cd truongminh
bash deploy/update.sh
```
Script tự sao lưu trước, lấy mã mới (`git pull`), build lại và khởi động lại. Cấu trúc CSDL tự cập nhật khi web khởi động.

### Sao lưu (rất quan trọng)
Có hai thứ không được mất: **CSDL MySQL** và **thư mục ảnh** (`data/storage`). Mất hai thứ này là mất toàn bộ khách hàng, logo, ảnh đã tạo.

```bash
bash deploy/backup.sh             # tạo thư mục backups/<ngày-giờ>/ gồm db.sql.gz và storage.tar.gz (giữ 14 bản gần nhất)
```
Đặt lịch chạy mỗi đêm 2 giờ sáng: gõ `crontab -e`, thêm dòng (sửa đường dẫn cho đúng):
```
0 2 * * * cd /root/truongminh && bash deploy/backup.sh >> backups/backup.log 2>&1
```
**Nhớ tải thư mục `backups/` về máy khác định kỳ** (ví dụ dùng WinSCP/FileZilla hoặc `scp`), đừng chỉ để trên chính VPS.

Khôi phục (khi chuyển VPS hoặc hỏng dữ liệu): cài lại như "Cài lần đầu" đến bước 4, rồi:
```bash
gunzip -c backups/<bản>/db.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" truongminh'
tar -xzf backups/<bản>/storage.tar.gz -C data
```

### Bật callback của kie.ai (không bắt buộc)
Mặc định web tự hỏi kie.ai kết quả mỗi vài giây, đã đủ dùng. Nếu muốn ảnh về nhanh hơn: ở https://kie.ai/settings tạo `webhookHmacKey`, dán vào `KIE_CALLBACK_SECRET`, đổi `KIE_CALLBACK_ENABLED="true"` trong `.env`, rồi `docker compose up -d` để áp dụng.

### Tự động đăng kịch bản chăm sóc Zalo (không bắt buộc)
Trên máy cá nhân bạn bấm đăng bằng tay trong mục **Kịch bản chăm sóc**. Trên VPS có thể cho máy tự lên kịch bản và đăng đúng giờ:
1. Trong `.env` đặt `ZALO_CARE_CRON_SECRET` là một chuỗi dài (16 ký tự trở lên), rồi `docker compose up -d`.
2. Ở **Quản trị > Zalo** bật công tắc "Tự động lên kịch bản và đăng đúng giờ".
3. Gõ `crontab -e` và thêm dòng chạy mỗi 10 phút (thay khóa và tên miền):
```
*/10 * * * * curl -fsS -X POST -H "x-cron-secret: KHÓA_CỦA_BẠN" https://tên-miền/api/jobs/zalo-care >> /root/truongminh/backups/care.log 2>&1
```

### Sự cố thường gặp
| Hiện tượng | Cách xử lý |
|---|---|
| Vào web báo lỗi chứng chỉ / không vào được | Kiểm tra tên miền đã trỏ đúng IP VPS chưa, cổng 80 và 443 đã mở chưa; xem `docker compose logs caddy` |
| Đăng nhập xong bị đưa về trang đăng nhập | `APP_URL` trong `.env` phải đúng `https://tên-miền` (không có dấu `/` ở cuối) |
| Ảnh báo lỗi 402 hoặc "hết token" | Nạp thêm token ở kie.ai (xem số dư ở thanh đầu trang) |
| Sửa `.env` mà web không đổi | Chạy `docker compose up -d` để web đọc lại cấu hình |
| Hết dung lượng ổ đĩa | Kiểm tra `df -h`; xóa bớt thư mục `backups/` cũ, hoặc nâng ổ đĩa VPS |

Sau khi thay đổi lớn, nên tự kiểm tra: đăng nhập admin, tạo một phiên thử với 1 logo, xem ảnh về đủ và tải được ZIP/PDF.
