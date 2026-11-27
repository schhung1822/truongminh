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

# 4. Tạo thư mục lưu ảnh và cấp quyền cho user trong container (uid 1000), nếu không web không ghi được ảnh
mkdir -p data/storage && chown -R 1000:1000 data/storage

# 5. Build và chạy (lần đầu mất vài phút). Cấu trúc CSDL tự tạo khi web khởi động.
docker compose up -d --build

# 6. Tạo tài khoản admin và dữ liệu mặc định (chạy một lần, chạy lại cũng an toàn)
docker compose exec app npm run db:seed
docker compose exec app npm run db:seed-styles
```

Mở `https://tên-miền-của-bạn`, đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`, **đổi mật khẩu ngay** ở trang Tài khoản của tôi (bấm vào tên mình ở góc phải > Tài khoản và mật khẩu), rồi vào **Hệ thống > Người dùng** tạo thêm một quản trị viên thứ hai để dự phòng. Lần đầu Caddy cần vài chục giây để xin chứng chỉ HTTPS; nếu trình duyệt báo lỗi thì chờ một phút rồi tải lại.

Sau đó: vào **Quản trị > Chất liệu** nhập chất liệu thật, **Trang mẫu** xếp chất liệu vào trang (số cột x hàng là bố cục một ảnh; trang có nhiều chất liệu hơn số ô sẽ tự chia thành nhiều ảnh, ví dụ 80 chất liệu với 8 ô mỗi ảnh ra 10 ảnh), **Cấu hình** kiểm tra model và số dư kie.ai.

### Triển khai bằng PM2 (AlmaLinux 9, không dùng Docker)
Dành cho VPS đã chạy PM2. Web chạy bằng PM2 (đúng **một** tiến trình), MySQL cài thẳng trên máy, nginx đứng trước lo HTTPS. Đã kiểm thử với MySQL 8.0 (bản có sẵn trong kho AlmaLinux 9) và 8.4; **chưa kiểm thử với MariaDB**, nên nếu máy đang chạy MariaDB cho ứng dụng khác thì đừng dùng chung, hãy hỏi lại người làm dự án.

**Cần chuẩn bị:** Node **22.12 trở lên (khuyến nghị 24)**, RAM từ 2 GB (build cần nhiều RAM; thiếu thì tạo thêm swap), tên miền đã trỏ bản ghi A về IP VPS, cổng 80 và 443 mở.

```bash
# 1. Kiểm tra Node (cũ hơn 22.12 thì cài Node 24)
node -v
# curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash - && sudo dnf install -y nodejs

# 2. Cài MySQL 8.0 từ kho AlmaLinux, tạo CSDL và tài khoản riêng (đặt mật khẩu chỉ gồm chữ và số)
sudo dnf install -y mysql-server
sudo systemctl enable --now mysqld
sudo mysql -e "CREATE DATABASE truongminh CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'truongminh'@'localhost' IDENTIFIED BY 'DAT_MAT_KHAU_O_DAY';
GRANT ALL PRIVILEGES ON truongminh.* TO 'truongminh'@'localhost';"

# 3. Lấy mã nguồn (đặt ở thư mục bạn muốn, dưới user chạy PM2)
git clone https://github.com/schhung1822/truongminh.git
cd truongminh
cp .env.example .env
nano .env
```
Trong `.env` điền: `DATABASE_URL="mysql://truongminh:MAT_KHAU@127.0.0.1:3306/truongminh"`, `APP_URL` (địa chỉ https của web), `APP_TIMEZONE`, `IMAGE_PROVIDER="kie"` và `KIE_API_KEY`, `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET`; `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` nếu chạy tạo admin mới. Ảnh lưu ở thư mục `storage/` ngay trong thư mục dự án (giữ nguyên `STORAGE_DIR`).

**Cài mới, bắt đầu trống:**
```bash
npm ci --include=dev
npx prisma migrate deploy
npm run build
npm run db:seed && npm run db:seed-styles     # tạo admin và dữ liệu mặc định (chạy lại cũng an toàn)
pm2 start deploy/ecosystem.config.cjs
pm2 save
```
**Hoặc mang dữ liệu từ máy khác sang** (CSDL + ảnh, thay cho lệnh `db:seed`): chép hai file lên VPS rồi
```bash
mysql -u truongminh -p truongminh < ~/ten-file-csdl.sql
tar -xzf ~/ten-file-anh.tar.gz -C .            # tạo thư mục storage/ trong thư mục dự án (có cả khóa .secret-key)
npm ci --include=dev && npx prisma migrate deploy && npm run build
pm2 start deploy/ecosystem.config.cjs && pm2 save
```
Kiểm tra: `pm2 status` (online), `curl -s http://127.0.0.1:3000/api/healthz`, `pm2 logs truongminh`. Cổng 3000 đã có ứng dụng khác dùng thì đặt `APP_PORT=3100` khi `pm2 start` và sửa cổng trong nginx.

**HTTPS bằng nginx** (đã có nginx thì chỉ thêm khối `server` mẫu):
```bash
sudo dnf install -y epel-release && sudo dnf install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/truongminh.conf    # sửa tên miền trong file này
sudo setsebool -P httpd_can_network_connect 1                         # SELinux cho phép nginx gọi web ở 127.0.0.1
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
sudo systemctl enable --now nginx
sudo certbot --nginx -d tên-miền-của-bạn
```
**Cập nhật bản mới:** `bash deploy/update-pm2.sh` (sao lưu, lấy mã, build, nạp lại PM2). **Sao lưu:** `bash deploy/backup-pm2.sh` (cần lệnh `mysqldump`, có sẵn trong gói `mysql`), đặt lịch như mục "Sao lưu" bên dưới nhưng dùng `backup-pm2.sh`. Phần "Thử bot Zalo trên VPS" bên dưới dùng được y như vậy.
**Lưu ý:** không chạy PM2 ở chế độ cluster hay nhiều bản (`instances` phải là 1), vì tiến trình giữ kết nối Zalo và theo dõi việc bot đang làm.

### Lưu ảnh trên Cloudflare R2
Ảnh (chất liệu, logo, ảnh đã tạo) có thể lưu trên **Cloudflare R2** thay vì thư mục trên máy chủ: không đầy ổ đĩa, không phải sao lưu thư mục ảnh, ảnh tải nhanh qua mạng của Cloudflare và kie.ai đọc ảnh thẳng từ địa chỉ công khai (không phải upload sang kho của kie.ai nữa). Chọn bằng `STORAGE_DRIVER="r2"` trong `.env`; để `"local"` thì mọi thứ chạy như cũ.

**Tạo bucket (một lần, trên Cloudflare):** R2 > Create bucket (một bucket duy nhất) > Settings > bật **Public access** (địa chỉ `https://pub-xxxx.r2.dev`, hoặc gắn tên miền riêng ở *Custom Domains*). R2 > **Manage API tokens** > tạo token quyền *Object Read & Write* cho đúng bucket đó. Điền vào `.env`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (mẫu trong `.env.example`). Đổi sang tên miền riêng sau này chỉ cần sửa `R2_PUBLIC_URL` rồi build/khởi động lại, không sửa code.

**Cách đặt tên file (key) trên bucket:** `materials/{mã chất liệu}/{lớp 1, lớp 2, ảnh ghép}-{ngẫu nhiên}.webp`, `mockups/{brandId}/{yyyy-mm}/{ngẫu nhiên}.webp`, `logos/{customerId}/{ngẫu nhiên}.{đuôi}`. Tên file là chuỗi ngẫu nhiên, không có tên khách hay tên thương hiệu. CSDL chỉ lưu key; địa chỉ đầy đủ được ghép lúc hiển thị. Ảnh chất liệu và ảnh tạo ra được nén WebP (chất lượng 82); logo gốc giữ nguyên định dạng và chất lượng. Ảnh khách gửi qua Zalo và tư liệu video vẫn nằm trên bucket nhưng **không** đưa địa chỉ công khai ra trình duyệt, chỉ phục vụ qua trang web sau khi đăng nhập.

**Chuyển ảnh đã có sang R2** (làm một lần, trên máy đang giữ ảnh cũ và CSDL tương ứng):
```bash
node --env-file=.env --import tsx scripts/migrate-to-r2.ts --dry-run   # chỉ in kế hoạch, không đụng gì
node --env-file=.env --import tsx scripts/migrate-to-r2.ts             # chạy thật; chạy lại được, chỉ làm phần chưa xong
```
Sau đó đặt `STORAGE_DRIVER="r2"` và khởi động lại. Script **không xóa** thư mục ảnh cũ: cứ giữ làm bản sao lưu cho tới khi kiểm tra kỹ. Giữ lại file `storage/.secret-key` (khóa mã hóa tài khoản Zalo cá nhân), thư mục `STORAGE_DIR` vẫn cần cho file này. Kiểm tra ảnh còn thiếu: `node --env-file=.env --import tsx deploy/check-storage.ts`.

**Máy dev và máy chủ dùng chung một bucket (CSDL riêng):** tránh nếu được, vì thay hoặc xóa ảnh ở máy này sẽ xóa file mà CSDL máy kia còn trỏ tới, và máy kia tạo ảnh báo lỗi "Ảnh của chất liệu ... không còn trong kho ảnh". Nếu vẫn dùng chung:
1. Ở máy dev đặt `STORAGE_NEVER_DELETE="true"` trong `.env`: máy đó không bao giờ xóa file khỏi kho nữa (file thừa nằm lại, tốn dung lượng không đáng kể).
2. Mỗi lần sửa chất liệu ở máy dev xong, chép dữ liệu chất liệu sang máy chủ (file ảnh đã nằm sẵn trong kho chung, chỉ cần chép các dòng CSDL):
```bash
npm run materials:export                    # ở máy dev: ghi backups/chat-lieu.json
scp backups/chat-lieu.json user@máy-chủ:/đường/dẫn/dự-án/backups/
npm run materials:import                    # ở máy chủ: chỉ IN kế hoạch, chưa ghi gì
npm run materials:import -- --apply --disable-broken   # ghi vào CSDL
```
Chất liệu khớp theo mã: mã đã có thì cập nhật (giữ nguyên id nên trang mẫu, ảnh đã tạo, báo giá không ảnh hưởng), mã mới thì tạo. Không xóa chất liệu hay file nào. Thông số tấm và giá của chất liệu đã có được giữ theo máy chủ, thêm `--with-stock` nếu muốn lấy theo file. `--disable-broken` tắt các chất liệu đang bật mà ảnh không có trong kho (ví dụ chất liệu đã xóa ở máy dev). Trang mẫu không được đồng bộ. File có giá tấm, đừng gửi cho người ngoài.

### Thử bot Zalo trên VPS
Bot Zalo chính thức cần một địa chỉ https công khai để Zalo đẩy tin về, nên VPS có tên miền là chỗ thử bot đúng nhất. Làm sau khi web đã chạy và đăng nhập được:
1. Vào **Hệ thống > Kết nối > Zalo**, bấm **Thêm bot**, dán token của bot (lấy ở mini app Zalo Bot Creator). Thêm được nhiều bot; token lưu mã hóa trong CSDL. (Cách cũ vẫn dùng được: điền `ZALO_BOT_TOKEN` và `ZALO_WEBHOOK_SECRET` trong `.env` rồi `docker compose up -d`; bot đó hiện chung trong danh sách.) `APP_URL` phải là địa chỉ https của web.
2. Ở bot vừa thêm bấm **Kiểm tra token**, rồi **Đăng ký webhook**. Sau đó vào **Quản trị > Cài đặt Zalo > Tổng quan** gạt **Bật Zalo**.
3. Nhân viên mở chat với bot trên Zalo, gõ `/ghepnoi`; admin vào **Nhân viên và lệnh**, nhập mã 4 số, chọn tài khoản web cho nhân viên đó rồi bấm **Cho phép**.
4. Vào **Trợ lý AI**, bật **Trợ lý nhận lệnh**, điền tên bot (đúng tên hiển thị trên Zalo) rồi lưu. Cần `IMAGE_PROVIDER="kie"` và khóa kie.ai vì trợ lý dùng model chat của kie.ai.
5. Mời bot vào nhóm khách (link bot ở Zalo Bot Creator), tag bot trong nhóm để ra lệnh. Xem mục "Tag bot ra lệnh trong nhóm" ở **Zalo > Hướng dẫn Zalo**.
Bot không tự nói chuyện với khách: chỉ nhân viên đã ghép nối gọi được. Mỗi lệnh tốn một ít token kie.ai.

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

Khôi phục (khi chuyển VPS hoặc hỏng dữ liệu): cài lại như "Cài lần đầu" đến bước 3, rồi:
```bash
gunzip -c backups/<bản>/db.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" truongminh'
tar -xzf backups/<bản>/storage.tar.gz -C data
chown -R 1000:1000 data/storage   # cấp quyền ghi cho user trong container
```

### Bật callback của kie.ai (không bắt buộc)
Mặc định web tự hỏi kie.ai kết quả mỗi vài giây, đã đủ dùng. Nếu muốn ảnh về nhanh hơn: ở https://kie.ai/settings tạo `webhookHmacKey`, dán vào `KIE_CALLBACK_SECRET`, đổi `KIE_CALLBACK_ENABLED="true"` trong `.env`, rồi `docker compose up -d` để áp dụng.

### Phân loại chất liệu và chỉnh hàng loạt bằng Excel
Mỗi chất liệu có nhóm, công nghệ in, chất bề mặt, họa tiết, số màu, họ màu hai mặt, phong cách, độ dày... Mọi trường này **chỉ chọn từ danh mục**; thêm, sửa nhãn, tắt giá trị ở **Quản trị > Chất liệu > Danh mục**. Bộ lọc ở đầu trang Chất liệu lọc theo các trường đó và theo "Cần xem lại".
Chỉnh nhiều chất liệu cùng lúc: bấm **Xuất CSV** (trang Chất liệu), sửa bằng Excel (nếu Excel dồn mọi thứ vào một cột thì mở bằng Data > From Text/CSV, chọn UTF-8 và dấu phẩy), rồi vào **Nhập từ CSV**, chọn chế độ **Cập nhật** và để dấu tích "Chỉ kiểm tra" để xem trước. Ô để trống = giữ nguyên, muốn xóa giá trị thì ghi `[xoa]`. Cột `id` giúp đổi cả mã chất liệu mà không tạo bản mới.
Bản này thêm bảng và cột vào CSDL: trên VPS tự áp dụng khi web khởi động lại, trên máy cá nhân chạy `npm run db:deploy`.

### Cấu hình Zalo và hướng dẫn sử dụng
Bot Zalo **không tự nói chuyện với khách**: nhân viên nói với khách, bot chỉ làm việc khi nhân viên đã ghép nối tag bot (làm ảnh, hỏi kỹ thuật) hoặc bấm "AI soạn" trong Hộp thư. Các chức năng (gửi ảnh vào nhóm, trợ lý nhận lệnh, Hộp thư, ghép nối nhân viên, lệnh, chăm sóc nhóm) bật/tắt và chỉnh ở **Quản trị > Cài đặt Zalo**. Thông tin xưởng cho AI (hồ sơ, bài kiến thức, mức hiển thị Công khai/Nội bộ/Chỉ admin, ngân sách từng AI, trang Thử AI) nằm ở **Quản trị > Thông tin doanh nghiệp**. Hướng dẫn từng bước (kết nối bot, mời bot vào nhóm, tag bot ra lệnh, xử lý sự cố) nằm ngay trong web ở menu **Zalo > Hướng dẫn Zalo**. Bản này thêm bảng và cột vào CSDL: trên VPS tự áp dụng khi web khởi động lại, trên máy cá nhân chạy `npm run db:deploy`.

### Nhiều tài khoản Zalo cá nhân trong một Hộp thư (thử nghiệm)
Ở **Hệ thống > Kết nối > Zalo**, phần Tài khoản Zalo cá nhân, bấm **Thêm tài khoản (quét QR)**, quét bằng Zalo trên điện thoại của số cần thêm; làm lại cho từng số. Tin nhắn của mọi tài khoản (cả bot) gom về **Zalo > Hộp thư Zalo**, có bộ lọc theo tài khoản; trả lời và gửi ảnh mẫu đi qua đúng số của hội thoại. Máy chủ giữ kết nối nghe tin và tự nối lại sau khi khởi động (cookie lưu mã hóa; khóa ở `ZALO_ACCOUNT_KEY` hoặc file `storage/.secret-key`, nên giữ thư mục storage).
Đây là cách **không chính thức** (thư viện `zca-js` mô phỏng Zalo Web), có nguy cơ khóa tài khoản và có thể hỏng khi Zalo đổi giao thức; mỗi tài khoản chỉ có một kết nối nghe tin (mở Zalo Web cùng tài khoản thì kết nối ở đây bị ngắt). Chỉ chạy một bản web duy nhất (không nhân bản container), vì mỗi tài khoản chỉ nghe được ở một nơi.

### Tự động đăng kịch bản chăm sóc Zalo (không bắt buộc)
Trên máy cá nhân bạn bấm đăng bằng tay trong mục **Kịch bản chăm sóc**. Trên VPS có thể cho máy tự lên kịch bản và đăng đúng giờ:
1. Trong `.env` đặt `ZALO_CARE_CRON_SECRET` là một chuỗi dài (16 ký tự trở lên), rồi `docker compose up -d`.
2. Ở **Quản trị > Cài đặt Zalo > Chăm sóc nhóm** bật công tắc "Tự động lên kịch bản và đăng đúng giờ".
3. Gõ `crontab -e` và thêm dòng chạy mỗi 10 phút (thay khóa và tên miền):
```
*/10 * * * * curl -fsS -X POST -H "x-cron-secret: KHÓA_CỦA_BẠN" https://tên-miền/api/jobs/zalo-care >> /root/truongminh/backups/care.log 2>&1
```

### Lead Facebook (thu comment trên bài của mình, tách số điện thoại)
Phòng marketing đăng bài lên nhóm Facebook; extension Chrome **Data Lead Facebook** **chỉ đọc** comment trên các bài do chính nick của mình đăng và gửi về web, web tách số điện thoại và tạo lead. Không tự đăng, không tự comment, không tự bấm gửi. Thiết kế: `docs/thiet-ke-module-lead-facebook.md`; hướng dẫn đọc hiểu: `docs/huong-dan-lead-facebook.md`; quyết định: D91, D92 trong `docs/DECISIONS.md`.
1. Cập nhật mã và CSDL trên VPS: `git pull`, `npx prisma migrate deploy` (thêm vai trò Marketing và các bảng `fb_*`, `ext_*`; **sao lưu CSDL trước**), `npm run build`, nạp lại web.
2. **Quản trị > Người dùng**: tạo tài khoản vai trò **Marketing** cho nhân sự (Sale chỉ thấy lead được gán cho mình).
3. Menu **Lead Facebook**: Marketing thêm nick Facebook và tạo mã kết nối cho từng máy ở **Hệ thống > Kết nối > Extension Facebook**, thêm bài ở **Bài đăng**.
4. Cài extension cho từng nhân sự: xem `extension/README.md` (build bằng `npm run ext:build`, địa chỉ web cố định lúc build bằng `APP_ORIGIN`). Mỗi máy một mã kết nối; nhiều máy chạy song song được, web tự giữ chỗ để hai máy cùng nick không quét trùng một bài.
5. (Không bắt buộc) Dọn comment Khác/Spam quá hạn và nhật ký cũ: đặt `FB_CRON_SECRET` (16 ký tự trở lên) trong `.env` rồi thêm vào `crontab -e` dòng chạy mỗi ngày:
```
30 3 * * * curl -fsS -X POST -H "x-cron-secret: KHÓA_CỦA_BẠN" https://tên-miền/api/jobs/fb-retention >> /root/truongminh/backups/fb-retention.log 2>&1
```
Chưa kiểm chứng trên Facebook thật: xem mục "Chưa kiểm chứng" trong `extension/README.md`. Khi quét không ra comment, nhân sự bấm **Chẩn đoán trang này** trong popup; báo cáo (không chứa dữ liệu cá nhân) hiện ở **Kết nối extension > Cảnh báo** để người phát triển chỉnh bộ đọc.

### Pinterest (thư viện mẫu và ảnh phong cách cho AI)
1. Tạo App tại Pinterest Developers, xin Trial access với các scope đọc: `boards:read`, `pins:read`, `user_accounts:read`; nếu cần board bí mật thì xin thêm `boards:read_secret`, `pins:read_secret` và đặt `PINTEREST_INCLUDE_SECRET_BOARDS="true"`.
2. Đăng ký Redirect URI chính xác là `https://tên-miền/api/pinterest/oauth/callback`.
3. Điền `PINTEREST_CLIENT_ID` và `PINTEREST_CLIENT_SECRET` vào `.env`, chạy migration/build rồi khởi động lại web.
4. Admin vào **Hệ thống > Kết nối > Pinterest**, bấm kết nối và **Đồng bộ ngay**. Nhân viên xem/copy ảnh, gắn tag phong cách và lọc ở **Mẫu Pinterest**; khi tạo thiết kế ở Bước 2 có thể chọn tối đa 3 pin làm ảnh phong cách tham khảo (picker tự gợi ý pin khách đã thích và board đúng công nghệ chất liệu đang chọn).

Token Pinterest chỉ lưu mã hóa trên máy chủ, không đưa vào trình duyệt hoặc Git. Sau mỗi lần thêm/xóa pin trên Pinterest, admin bấm **Đồng bộ ngay** để cập nhật thư viện trong ứng dụng.

### Tự động đồng bộ Pinterest (không bắt buộc)
Mặc định phải vào **Hệ thống > Kết nối > Pinterest** bấm **Đồng bộ ngay** mỗi khi có ảnh/board mới. Trên VPS có thể cho máy tự đồng bộ định kỳ:
1. Trong `.env` đặt `PINTEREST_SYNC_CRON_SECRET` là một chuỗi dài (16 ký tự trở lên), rồi `docker compose up -d`.
2. Gõ `crontab -e` và thêm dòng chạy mỗi 6 giờ (thay khóa và tên miền):
```
0 */6 * * * curl -fsS -X POST -H "x-cron-secret: KHÓA_CỦA_BẠN" https://tên-miền/api/jobs/pinterest-sync >> /root/truongminh/backups/pinterest-sync.log 2>&1
```

### Pin mới trên Pinterest tự gửi vào nhóm Zalo
Lưu thêm ảnh vào một board được chỉ định là bot Zalo gửi ngay ảnh đó vào các nhóm được đánh dấu. Không cần cron, không cần biến `.env` mới: web tự hỏi Pinterest định kỳ ngay trong tiến trình đang chạy.
1. **Hệ thống > Kết nối > Pinterest**: bật công tắc **Gửi pin mới vào Zalo** ở từng board cần theo dõi. Lúc bật, hệ thống tải các pin đang có của board (không gửi); chỉ pin lưu sau lúc đó mới được gửi.
2. **Cài đặt Zalo > Nhóm và gửi ảnh**: bật cột **Nhận mẫu Pinterest** cho các nhóm nhận. Ở thẻ **Mẫu Pinterest mới vào nhóm** chỉnh chữ đi kèm, số giây giữa hai lần hỏi Pinterest (mặc định 120) và công tắc tạm tắt. Bảng **Mẫu Pinterest gửi vào nhóm** bên dưới cho xem lượt nào đã gửi, lượt nào lỗi và nút gửi lại.
3. Pinterest không có cách báo tức thì khi có pin mới, nên độ trễ gần bằng số giây đã đặt. App Pinterest ở gói Trial chỉ được 1000 lượt gọi API mỗi ngày (mỗi lần hỏi tốn 1 lượt, đồng bộ thư viện cũng tính vào đó): giữ 120 giây trở lên. Khi app được duyệt lên gói Standard thì đặt 30-60 giây được.
4. Tắt công tắc (hoặc tắt Zalo) rồi bật lại là bắt đầu lại từ lúc bật: ảnh lưu trong lúc tắt không được gửi. Máy chủ nghỉ dưới 24 giờ thì gửi bù khi chạy lại, lâu hơn thì bỏ qua.
5. Mỗi ảnh gửi vào mỗi nhóm tính 1 tin trong hạn mức tháng của bot Zalo. Pin video không có ảnh thì bỏ qua.

### Sự cố thường gặp
| Hiện tượng | Cách xử lý |
|---|---|
| Vào web báo lỗi chứng chỉ / không vào được | Kiểm tra tên miền đã trỏ đúng IP VPS chưa, cổng 80 và 443 đã mở chưa; xem `docker compose logs caddy` |
| Đăng nhập xong bị đưa về trang đăng nhập | `APP_URL` trong `.env` phải đúng `https://tên-miền` (không có dấu `/` ở cuối) |
| Ảnh báo lỗi 402 hoặc "hết token" | Nạp thêm token ở kie.ai (xem số dư ở thanh đầu trang) |
| Sửa `.env` mà web không đổi | Chạy `docker compose up -d` để web đọc lại cấu hình |
| Ảnh bị thiếu / không hiện (chất liệu, logo, ảnh đã tạo) | Chạy trong thư mục dự án: `node --env-file=.env --import tsx deploy/check-storage.ts`. Script chỉ đọc, cho biết web đang tìm ảnh ở đâu, ghi được không, và từng nhóm ảnh trong CSDL còn thiếu bao nhiêu file (kèm gợi ý nếu giải nén nhầm chỗ). Cách PM2: thư mục ảnh là `storage/` trong thư mục dự án; cách Docker: `data/storage` và `chown -R 1000:1000 data/storage` |
| Hết dung lượng ổ đĩa | Kiểm tra `df -h`; xóa bớt thư mục `backups/` cũ, hoặc nâng ổ đĩa VPS |

Sau khi thay đổi lớn, nên tự kiểm tra: đăng nhập admin, tạo một phiên thử với 1 logo, xem ảnh về đủ và tải được ZIP/PDF.
