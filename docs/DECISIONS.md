# Các quyết định kỹ thuật

Ghi lại những điểm kỹ thuật nhỏ đã tự quyết (không ảnh hưởng nghiệp vụ). Điểm nào ảnh hưởng nghiệp vụ thì đã hỏi chủ dự án, xem `docs/PLAN.md`.

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Phiên đăng nhập lưu trong CSDL (`auth_sessions`), cookie chứa token ngẫu nhiên, DB chỉ lưu bản băm. Không dùng JWT/cookie không trạng thái | Admin khóa tài khoản sale thì mất quyền ngay; đơn giản, không cần thư viện phiên |
| D2 | Băm mật khẩu bằng `bcryptjs` | Thuần JavaScript, không cần biên dịch, chạy ổn trên Windows và hosting |
| D3 | Đổi tên để tránh nhầm: phiên đăng nhập = `auth_sessions`, phiên tạo ảnh = `consult_sessions` (hiển thị "Phiên tư vấn") | Brief dùng chữ "session" cho cả hai |
| D4 | Phiên bước 2 là một `consult_sessions` loại `DESIGN` trỏ `parentId` về phiên `CATALOG` | Một phiên catalog có thể chạy bước 2 nhiều lần (loại sản phẩm khác nhau), lịch sử vẫn gom thành một phiên tư vấn |
| D5 | Mỗi ảnh lưu `layoutSnapshot` (cột, hàng, danh sách chất liệu lúc tạo) | Sau này admin sửa trang mẫu hay đổi tên chất liệu thì ảnh cũ và nhãn của nó không bị sai |
| D6 | Upload ảnh đi qua Route Handler, không qua Server Action | Server Action giới hạn thân request 1MB mặc định, logo cho phép đến 10MB |
| D7 | Việc gửi tác vụ sang kie.ai chạy sau khi trả response (`after()`), có cơ chế gửi bù khi polling | Không giữ request mở chờ upload/gọi API |
| D8 | Sắp xếp chất liệu trong trang mẫu bằng nút lên/xuống, không thêm thư viện kéo thả | Brief cho phép "kéo thả hoặc nút lên/xuống"; ít phụ thuộc, dùng tốt trên điện thoại |
| D9 | Tự thử lại khi lỗi **không** tính vào hạn mức ngày của sale; mỗi lần sale bấm tạo hoặc "Tạo lại" thì tính 1 lượt cho mỗi ảnh | Lỗi do nhà cung cấp không nên làm sale hết lượt |
| D10 | "Ngày" của hạn mức tính theo múi giờ `Asia/Ho_Chi_Minh` (cấu hình bằng `APP_TIMEZONE`) | Sale ở Việt Nam, reset đúng nửa đêm địa phương |
| D11 | Ảnh hoàn thiện xuất JPEG chất lượng cao (để gửi qua Zalo nhẹ); ảnh gốc từ AI giữ nguyên định dạng nhận được | Ảnh 2K dạng PNG rất nặng; vẫn giữ bản gốc đúng yêu cầu |
| D12 | Chế độ nhãn mặc định là `overlay`; admin đổi được sang `legend` | Brief yêu cầu hỗ trợ cả hai, chọn một mặc định |
| D13 | Môi trường dev chạy MySQL bằng Docker (`docker-compose.dev.yml`) | Máy chưa cài MySQL, Docker đã có; giúp người không rành lập trình khởi động bằng một lệnh |
| D14 | Thêm `!.env.example` vào `.gitignore` | `.gitignore` hiện chặn mọi `.env*`, nên `.env.example` sẽ không được commit nếu không mở lại |
| D15 | Commit trên nhánh `master` đang dùng | Repo hiện chỉ có nhánh `master`; nhánh `main` chưa tồn tại |
| D16 | Triển khai VPS bằng Docker Compose (app + MySQL + Caddy), một bản `app` duy nhất | Giống hệt môi trường test, `sharp` cần font hệ thống nên đóng gói sẵn trong image; Caddy tự lo HTTPS |
| D17 | Chưa dùng S3/R2 ở bản đầu, ảnh lưu thư mục trên VPS (mount ra ngoài container) và sao lưu hằng đêm | Brief mặc định lưu trên server; lớp `storage` vẫn tách riêng để đổi sau |
| D18 | Vitest dùng bản 4.x (bản 5.1 lỗi ngay cả với test đơn giản trên máy này); chạy test trong PowerShell | Git Bash trên Windows làm Vitest nạp thư viện hai lần (lệch chữ hoa/thường ổ đĩa) nên báo lỗi |
| D19 | Chặn dò mật khẩu: 5 lần sai trong 15 phút thì khóa theo email, lưu trong bộ nhớ | Chạy một bản app duy nhất nên không cần kho dùng chung. Hạn chế: kẻ xấu biết email có thể làm người đó bị khóa đăng nhập tạm 15 phút (chấp nhận được với web nội bộ) |
| D20 | `getSessionUser` gọi `connection()` trước khi đọc cookie; khu vực `(app)` đặt `instant = false` | `cacheComponents` cần báo rõ "đọc lúc có request"; khu vực sau đăng nhập toàn nội dung riêng của từng người nên không cần điều hướng tức thì |
| D21 | Admin chỉ tạo được tài khoản SALE trong giao diện (admin thứ hai chưa có chức năng) | Brief chỉ nói "admin tạo tài khoản cho sale"; thêm vai trò khi chủ dự án cần |
| D22 | Bản khởi đầu prompt "thiết kế" do kỹ sư soạn (brief chỉ cung cấp prompt catalog) | Cần có sẵn để chạy GĐ6; admin sửa được trong trang Prompt |
| D23 | Mục nav chưa làm hiện mờ "Sắp có", bật dần theo giai đoạn | Tránh bấm vào trang chưa tồn tại |
| D24 | Nhập CSV chất liệu: mã đã có thì BỎ QUA (không ghi đè), mã mới tạo với mô tả AI để trống | Tránh vô tình ghi đè chỉnh sửa của admin; mô tả AI bổ sung sau |
| D25 | Trang mẫu: tối đa 5 cột, 10 hàng; số chất liệu ≤ số ô; có thể chưa đầy ô | Trang cuối của một nhóm thường không đủ 10 chất liệu |
| D26 | Có lệnh `npm run db:seed-demo` tạo 12 chất liệu giả + 2 trang mẫu để thử | Chủ dự án thử được toàn luồng mà chưa cần nhập 80 chất liệu thật. Chỉ dùng khi dev |
| D27 | Ảnh trong kho dùng thẻ img thường, không dùng next/image | Ảnh nằm sau đăng nhập, bộ tối ưu ảnh của Next không gửi cookie |
