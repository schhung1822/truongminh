# BRIEF DỰ ÁN: Web app tạo ảnh mẫu in logo theo chất liệu

Bạn là kỹ sư chính của dự án này. Tôi là chủ dự án, KHÔNG biết lập trình. Hãy giao tiếp với tôi bằng tiếng Việt, giải thích ngắn gọn, và mỗi khi cần tôi kiểm tra thì chỉ rõ từng bước bấm vào đâu.

## 1. Bối cảnh

Khách hàng của tôi là một xưởng in logo lên nhiều chất liệu (vải, nhựa...), có khoảng 80 chất liệu, công nghệ in UV và in khắc. Khi tư vấn, sale cần gửi cho khách các ảnh mô phỏng logo của khách trên từng chất liệu để khách chọn.

Hiện chỉ có chủ xưởng làm được việc này bằng ChatGPT cá nhân. Đội sale 6 đến 8 người không làm ra kết quả đồng nhất. Web app này đóng gói quy trình đó: sale chỉ upload logo và bấm nút, toàn bộ ảnh mẫu chất liệu, prompt và bố cục được khóa trong hệ thống. Sale KHÔNG viết prompt, KHÔNG có ô chat.

## 2. Công nghệ

- Codebase Next.js đã có sẵn, đã cài shadcn/ui. Hãy đọc codebase trước, dùng lại đúng các component shadcn có sẵn, không cài thêm bộ UI khác.
- CSDL: MySQL. Dùng Prisma làm ORM (nếu codebase đã có ORM khác thì dùng cái đang có).
- Xử lý ảnh phía server: thư viện `sharp`.
- Tạo ảnh AI: API của kie.ai, model GPT Image (chi tiết ở mục 7).
- Toàn bộ giao diện bằng tiếng Việt, dùng tốt trên cả máy tính và điện thoại.

## 3. Vai trò người dùng

- **ADMIN** (chủ xưởng): quản lý chất liệu, trang mẫu, prompt, người dùng, cấu hình. Xem được mọi dữ liệu.
- **SALE**: tạo khách hàng, thương hiệu, logo, chạy tạo ảnh, xem lịch sử.

Đăng nhập bằng email và mật khẩu. Tài khoản admin đầu tiên tạo từ biến môi trường khi seed. Không có trang tự đăng ký, admin tạo tài khoản cho sale.

## 4. Quy trình nghiệp vụ

### Bước 1: Catalog chất liệu

1. Sale chọn hoặc tạo Khách hàng, rồi Thương hiệu, rồi upload Logo (hoặc chọn logo đã có).
2. Sale chọn các "trang mẫu" muốn tạo (mặc định chọn tất cả, có thể lọc theo nhóm chất liệu).
3. Hệ thống tạo MỖI TRANG MẪU LÀ MỘT ẢNH, trong ảnh có 8 đến 10 chất liệu xếp dạng lưới, mỗi ô là logo của khách thể hiện trên một chất liệu. 80 chất liệu sẽ ra khoảng 8 đến 10 ảnh.
4. Sale xem kết quả, bấm "Tạo lại trang này" nếu trang nào lỗi, rồi tải ảnh gửi khách.

### Bước 2: Thiết kế theo chất liệu khách chọn

1. Từ phiên bước 1, sale tick các chất liệu khách ưng (thường 1 đến 5 cái).
2. Sale chọn loại sản phẩm áp dụng (ô nhập tự do, có gợi ý sẵn), số phương án mỗi chất liệu (mặc định 2, tối đa 4) và ghi chú thêm nếu có.
3. Hệ thống tạo các ảnh thiết kế khác nhau cho từng chất liệu đã chọn. Mỗi ảnh là một lượt gọi AI với một "kiểu thiết kế" lấy từ danh sách preset do admin quản lý.

## 5. Chức năng chi tiết

### 5.1 Thư viện chất liệu (ADMIN)

Mỗi chất liệu có: mã (duy nhất), tên gọi, nhóm (vải, nhựa...), công nghệ in, mô tả cho người đọc, mô tả cho AI (đặc điểm bề mặt, màu, độ bóng, cách logo hiện lên), ảnh lớp 1, ảnh lớp 2, ảnh sản phẩm thật (không bắt buộc), trạng thái bật/tắt, thứ tự.

- Khi lưu, server tự ghép ảnh lớp 1 và lớp 2 thành MỘT ảnh tham chiếu (đặt cạnh nhau, nền trắng) và lưu lại. Ảnh ghép này mới là ảnh gửi cho AI.
- Có danh sách, tìm kiếm, lọc theo nhóm, thêm, sửa, tắt. Không xóa cứng chất liệu đã từng dùng.
- Có nhập hàng loạt: upload file CSV (mã, tên, nhóm, công nghệ in, mô tả) rồi bổ sung ảnh sau.

### 5.2 Trang mẫu (ADMIN)

Trang mẫu là một nhóm cố định gồm tối đa 10 chất liệu có thứ tự. Mọi khách đều nhận cùng cấu trúc trang để kết quả đồng nhất.

- Mỗi trang có: tên, nhóm, số cột, số hàng, tỉ lệ ảnh, danh sách chất liệu theo vị trí.
- Mặc định: 2 cột x 5 hàng, tỉ lệ 2:3, độ phân giải 2K (ảnh dọc để khách xem trên điện thoại).
- Giao diện sắp xếp chất liệu vào trang bằng kéo thả hoặc nút lên/xuống.
- Chặn cứng: một trang không quá 10 chất liệu (API giới hạn 16 ảnh tham chiếu mỗi lượt, gồm 1 logo cộng mỗi chất liệu 1 ảnh).
- Cảnh báo nếu có chất liệu đang bật mà chưa nằm trong trang nào.

### 5.3 Prompt và cấu hình (ADMIN)

- Hai mẫu prompt chỉnh sửa được: "catalog" và "thiết kế". Hỗ trợ biến như `{{rows}}`, `{{cols}}`, `{{materials_list}}`, `{{product_type}}`, `{{design_style}}`, `{{note}}`. Lưu lịch sử phiên bản prompt.
- Danh sách "kiểu thiết kế" cho bước 2 (tên và đoạn mô tả), admin thêm sửa được.
- Cấu hình: model đang dùng, độ phân giải, giới hạn số lượt tạo mỗi sale mỗi ngày (mặc định 60), tên xưởng và dòng chú thích in dưới ảnh.
- Mỗi ảnh tạo ra phải lưu lại nguyên văn prompt đã dùng và phiên bản prompt.

Prompt catalog mặc định để khởi đầu (tôi sẽ thay bằng prompt của chủ xưởng sau):

```
Create one product-sample sheet as a strict grid of {{cols}} columns and {{rows}} rows, equal cells, thin white gutters, plain white background.
Reference image 1 is the customer's logo. Reproduce it exactly: same shapes, proportions, letters and colors. Do not redraw, restyle or add anything to it.
Reference images 2 onward are material samples from our workshop. Each cell shows the logo produced on one material, photographed straight-on, same scale and lighting in every cell.
Cells, in reading order (left to right, top to bottom):
{{materials_list}}
The material in each cell must match its reference image exactly (texture, color, finish, thickness). Do not mix materials between cells.
Do not write any text, numbers or captions in the image.
```

`{{materials_list}}` được hệ thống sinh ra, mỗi dòng dạng: `Cell 3 = reference image 4: <mô tả cho AI>, technique: <công nghệ in>`.

### 5.4 Khách hàng, thương hiệu, logo

Cấu trúc phân cấp: Khách hàng > Thương hiệu > Logo > Phiên tạo ảnh > Ảnh.

- Khách hàng: tên, số điện thoại hoặc Zalo, ghi chú, sale phụ trách.
- Thương hiệu: tên, thuộc một khách hàng.
- Logo: file gốc, file đã chuẩn hóa, ghi chú. Chấp nhận PNG, JPG, WEBP, SVG, tối đa 10MB. Server chuẩn hóa thành PNG, cạnh dài tối đa 2048px, giữ nền trong suốt nếu có. Cảnh báo nếu logo nhỏ hơn 500px.

### 5.5 Lịch sử và tái sử dụng

- Trang lịch sử duyệt theo cây Khách hàng > Thương hiệu > Logo, có tìm kiếm theo tên khách, thương hiệu, số điện thoại, và lọc theo sale, ngày.
- Mở lại một phiên cũ thấy đủ: logo, các ảnh catalog, chất liệu đã chọn, các ảnh thiết kế.
- Từ một logo cũ có nút "Tạo phiên mới" để tái sử dụng mà không cần upload lại.
- Tải về: từng ảnh, hoặc tất cả ảnh của phiên dạng ZIP, hoặc một file PDF mỗi trang một ảnh.
- SALE chỉ sửa được dữ liệu mình tạo, nhưng xem được dữ liệu của người khác. ADMIN toàn quyền.

## 6. Xử lý ảnh kết quả

Sau khi AI trả ảnh, server phải:

1. Tải ảnh về kho lưu trữ của mình ngay (link của nhà cung cấp sẽ hết hạn). Giữ ảnh gốc.
2. Tạo ảnh hoàn thiện bằng `sharp`: thêm phần đầu trang (tên thương hiệu của khách, tên trang mẫu), nhãn chất liệu, và chân trang (tên xưởng, dòng "Ảnh mô phỏng, màu sắc thực tế có thể chênh lệch").
3. Nhãn chất liệu có 2 chế độ, admin chọn trong cấu hình:
   - `overlay`: code tính vị trí từng ô theo số cột, số hàng và in "mã - tên" lên dải dưới của mỗi ô.
   - `legend`: code in số thứ tự nhỏ ở góc mỗi ô và một bảng chú giải bên dưới ảnh (số thứ tự, mã, tên).
4. Chữ tiếng Việt có dấu phải hiển thị đúng. Hãy nhúng font hỗ trợ tiếng Việt vào dự án.

Kho lưu trữ: viết một lớp `storage` riêng. Mặc định lưu ra thư mục trên server, nằm ngoài thư mục public, và phục vụ ảnh qua một route có kiểm tra đăng nhập. Thiết kế để sau này đổi sang S3 hoặc R2 mà không sửa code nghiệp vụ.

## 7. Tích hợp kie.ai

QUAN TRỌNG: trước khi code phần này, hãy đọc tài liệu hiện hành tại docs.kie.ai (trang GPT Image 2.5 image-to-image, Get Task Details, File Upload API, Webhook Verification). Không đoán endpoint. Những gì tôi đã biết:

- Tạo tác vụ: `POST https://api.kie.ai/api/v1/jobs/createTask`, header `Authorization: Bearer <KIE_API_KEY>`.
- API bất đồng bộ: trả về `taskId`, lấy kết quả bằng cách hỏi lại (Get Task Details) hoặc nhận callback qua `callBackUrl`.
- Model: `gpt-image-2-5-flare-image-to-image` và `gpt-image-2-5-sunburst-image-to-image`. Tên model phải là cấu hình, không viết cứng.
- Tham số trong `input`: `prompt`, `input_urls` (lưu ý tên trường là `input_urls`, không phải `image_urls`), `aspect_ratio` (có 2:3, 3:2, 1:1, 16:9, 9:16...), `resolution` (1K, 2K, 4K).
- Tối đa 16 ảnh tham chiếu mỗi lượt. Ảnh tham chiếu phải là URL, nên cần upload ảnh qua File Upload API của kie.ai trước để lấy URL.
- Thứ tự `input_urls`: ảnh 1 là logo, các ảnh sau là ảnh ghép của từng chất liệu theo đúng thứ tự vị trí trong trang.

Yêu cầu kiến trúc:

- Viết interface `ImageProvider` (createTask, getTask, uploadReference). Có 2 bản cài đặt: `KieProvider` và `MockProvider`. `MockProvider` trả về ảnh giả sau vài giây, dùng để phát triển và test giao diện mà không tốn tiền. Chọn provider qua biến môi trường `IMAGE_PROVIDER`.
- KHÔNG giữ một request HTTP mở trong lúc chờ ảnh. Luồng chuẩn: route tạo phiên ghi các bản ghi ảnh ở trạng thái `PENDING` và gọi createTask ngay; màn hình kết quả hỏi lại server mỗi vài giây; server hỏi kie.ai trạng thái các tác vụ chưa xong rồi cập nhật CSDL. Callback là tùy chọn bổ sung, có xác thực chữ ký.
- Trạng thái ảnh: PENDING, PROCESSING, SUCCESS, FAILED. Lỗi thì tự thử lại tối đa 1 lần, sau đó hiện nút "Tạo lại" cho sale.
- `KIE_API_KEY` chỉ nằm ở server, không bao giờ lộ ra trình duyệt.
- Kiểm tra giới hạn lượt tạo mỗi ngày của sale trước khi gọi API. Ghi lại số lượt đã dùng theo người và theo ngày, có trang thống kê đơn giản cho admin.

## 8. Dữ liệu (gợi ý, bạn hoàn thiện)

`users`, `materials`, `sheets`, `sheet_materials`, `prompt_templates` (có phiên bản), `design_styles`, `settings`, `customers`, `brands`, `logos`, `sessions` (phiên tạo ảnh, loại CATALOG hoặc DESIGN), `session_selected_materials`, `generated_images` (thuộc phiên, liên kết trang mẫu hoặc chất liệu, prompt đã dùng, model, taskId, trạng thái, file gốc, file hoàn thiện, lỗi, ảnh cha nếu là tạo lại), `usage_logs`.

## 9. Màn hình

1. Đăng nhập.
2. Trang chính của sale: nút lớn "Tạo phiên tư vấn mới" và danh sách phiên gần đây.
3. Tạo phiên (dạng từng bước): Khách hàng > Thương hiệu > Logo > Chọn trang mẫu > Xác nhận.
4. Kết quả phiên: lưới ảnh có trạng thái từng ảnh, xem phóng to, tạo lại, tải về, tick chất liệu để sang bước 2.
5. Bước 2: chọn loại sản phẩm, số phương án, ghi chú, rồi xem kết quả.
6. Lịch sử theo khách hàng, thương hiệu, logo.
7. Khu admin: Chất liệu, Trang mẫu, Prompt, Kiểu thiết kế, Người dùng, Cấu hình, Thống kê sử dụng.

Giao diện gọn, sáng, chữ rõ. Mỗi màn hình sale chỉ có một việc chính. Mọi thao tác chờ đều có trạng thái tải và thông báo lỗi dễ hiểu bằng tiếng Việt.

## 10. Ngoài phạm vi bản đầu

Không làm: tách nền logo tự động, tích hợp Zalo hoặc CRM, báo giá, thanh toán, đa ngôn ngữ, ghép ảnh mockup không dùng AI. Đừng tự thêm tính năng ngoài brief.

## 11. Cách làm việc

1. Đọc toàn bộ codebase hiện có. Tóm tắt cho tôi những gì đã có sẵn.
2. Viết kế hoạch vào `docs/PLAN.md` gồm: schema CSDL, danh sách route, cấu trúc thư mục, danh sách biến môi trường. DỪNG LẠI để tôi duyệt trước khi code.
3. Làm theo các giai đoạn, mỗi giai đoạn phải chạy được:
   - GĐ1: CSDL, đăng nhập, phân quyền, khung giao diện.
   - GĐ2: Thư viện chất liệu và trang mẫu.
   - GĐ3: Khách hàng, thương hiệu, logo.
   - GĐ4: Luồng bước 1 chạy hoàn chỉnh với `MockProvider`, gồm cả xử lý ảnh kết quả.
   - GĐ5: `KieProvider` thật.
   - GĐ6: Bước 2.
   - GĐ7: Lịch sử, tải ZIP và PDF, thống kê.
   - GĐ8: Rà soát lỗi, giao diện điện thoại, hướng dẫn triển khai.
4. Sau mỗi giai đoạn: chạy lint và build, commit, rồi báo cáo ngắn cho tôi kèm các bước test bằng tay.
5. Viết test cho phần sinh prompt và phần tính vị trí ô lưới.
6. Tạo file `.env.example` có chú thích tiếng Việt cho từng biến, và `README.md` hướng dẫn cài đặt, chạy và triển khai.
7. Gặp điểm chưa rõ ảnh hưởng tới nghiệp vụ thì hỏi tôi. Điểm kỹ thuật nhỏ thì tự quyết và ghi vào `docs/DECISIONS.md`.
