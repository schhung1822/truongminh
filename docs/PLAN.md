# KẾ HOẠCH: Web app tạo ảnh mẫu in logo theo chất liệu

> Trạng thái: **ĐÃ DUYỆT**. Đã xong GĐ1 đến GĐ5 (GĐ5 đã nối kie.ai, chờ chủ dự án chạy thử mẫu 8 chất liệu thật). Tiếp theo: GĐ6.
> Nguồn yêu cầu: `prompt-claude-code-logo-mockup.md`.

---

## 0. Những điều đã chốt, và việc còn cần bạn

**Đã chốt (theo thông tin bạn cung cấp):**

1. **Nơi chạy thật: VPS của bạn.** Đúng với giả định của brief (ảnh lưu ra thư mục trên server), nên **không cần S3/R2 ở bản đầu**. Lớp `storage` vẫn viết tách riêng để sau này đổi được. Cách triển khai cụ thể xem mục 9.
2. **Đã có tài khoản kie.ai.** GĐ1 đến GĐ4 chạy bằng `MockProvider` nên chưa cần khóa. Đến GĐ5 tôi sẽ nhờ bạn tạo `KIE_API_KEY` và nạp một ít tiền thử (xem "Việc cần bạn làm" bên dưới).
3. **Chuyện OneDrive: bỏ.** Bản kế hoạch trước ghi nhầm. Dự án nằm ở `C:\code\truongminh`, không nằm trong OneDrive.

**Việc cần bạn trả lời, KHÔNG chặn việc code (chỉ cần trước GĐ8, lúc triển khai):**

- VPS dùng hệ điều hành gì (Ubuntu hay Debian, bản mấy), RAM bao nhiêu, ổ đĩa còn trống bao nhiêu?
- Bạn đã có tên miền trỏ về VPS chưa? (Cần cho HTTPS và cho callback của kie.ai. Không có thì vẫn chạy được bằng polling.)
- Trên VPS đã cài Docker chưa, và có đang chạy web khác (Nginx/Caddy...) chiếm cổng 80/443 không?

**Việc cần bạn làm trước GĐ5 (tôi sẽ nhắc lại lúc đó):** đăng nhập kie.ai, tạo API key, nạp tiền thử. Khóa này **chỉ dán vào file `.env` trên máy và trên VPS**, không gửi vào chat và không đưa lên GitHub.

Các điểm kỹ thuật nhỏ khác tôi đã tự quyết và ghi ở `docs/DECISIONS.md`.

---

## 1. Hiện trạng codebase (đã có sẵn)

| Hạng mục | Hiện có |
|---|---|
| Framework | Next.js **16.4.6**, React 19.3, TypeScript strict, App Router, alias `@/*` |
| Cấu hình Next | `cacheComponents: true`, `partialPrefetching: true`, Tailwind qua `@tailwindcss/turbopack` |
| Giao diện | Tailwind 4.3.3, shadcn kiểu **base-nova** (dựa trên `@base-ui/react`, không phải Radix), icon `lucide-react`, `motion`, `tw-animate-css` |
| Component shadcn đã có | accordion, badge, button, card, carousel, checkbox, dialog, input, navigation-menu, select, separator, sheet, skeleton, slider, tabs |
| Helper | `cn` lấy từ gói npm `cn` (qua `lib/utils.ts`), không phải `clsx + tailwind-merge` |
| Trang | Chỉ còn trang mẫu mặc định của Create Next App (`app/page.tsx`, `layout.tsx` đang `lang="en"`, font Geist subset `latin`) |
| Git | 1 commit "Initial commit", nhánh `master`. Đang có thay đổi chưa commit: cài shadcn (`components.json`, `components/`, `lib/utils.ts`, `app/globals.css`, `package.json`) và các file tài liệu (`docs/`, brief). Tôi sẽ gom vào commit đầu của GĐ1 |
| Môi trường máy dev | Node 24, npm 11, Docker 29 có sẵn, **MySQL chưa cài** (dev sẽ chạy MySQL bằng Docker) |

**Chưa có:** ORM, đăng nhập, phân quyền, lớp lưu trữ, xử lý ảnh, test, `.env.example`, README thật. `sharp` và `zod` hiện chỉ nằm trong `node_modules` như phụ thuộc gián tiếp, không có trong `package.json` nên phải thêm chính thức.

### Điểm cần lưu ý vì Next.js 16 khác bản cũ (đã đọc `node_modules/next/dist/docs`)

- `middleware.ts` đã đổi tên thành **`proxy.ts`**. Chỉ dùng cho kiểm tra "có cookie đăng nhập chưa", không truy vấn CSDL trong đó.
- Vì bật `cacheComponents`, mọi chỗ đọc `cookies()` (đọc phiên đăng nhập) **phải nằm trong `<Suspense>`**, nếu không build lỗi. Tôi sẽ đặt phần đọc phiên đăng nhập vào một component con trong layout, không `await` ở tầng ngoài cùng của layout.
- Route Handler `GET` chạy lúc có request, không bị cache sẵn. Phù hợp cho route phục vụ ảnh.
- Server Action mặc định giới hạn thân request 1MB. **Upload ảnh (logo, ảnh chất liệu) sẽ đi qua Route Handler** (`/api/uploads/...`), không đi qua Server Action.
- Font: Geist đang dùng subset `latin`, chưa chắc có đủ dấu tiếng Việt. Sẽ kiểm tra khi làm GĐ1; nếu thiếu sẽ đổi sang font có subset `vietnamese` (ví dụ Be Vietnam Pro) cho cả giao diện.

---

## 2. Kiến trúc tổng quan

```
Trình duyệt (sale/admin)
   │  Server Actions (thao tác dữ liệu) + Route Handlers (upload, tải file, polling)
   ▼
Next.js server ── lib/auth (phiên DB, DAL) ── lib/db (Prisma, MySQL)
   │
   ├─ lib/storage   (StorageDriver: local → sau này S3/R2)
   ├─ lib/providers (ImageProvider: MockProvider | KieProvider)
   ├─ lib/jobs      (gửi tác vụ, hỏi trạng thái, tự thử lại 1 lần, hạn mức/ngày)
   ├─ lib/prompts   (render prompt + sinh {{materials_list}})
   ├─ lib/grid      (tính vị trí ô lưới)
   └─ lib/imaging   (sharp: chuẩn hóa logo, ghép ảnh chất liệu, hoàn thiện ảnh)
```

### Luồng tạo ảnh (không giữ request mở)

1. Sale bấm "Tạo": Server Action kiểm tra hạn mức ngày, ghi `consult_sessions` + các `generated_images` trạng thái `PENDING` (kèm bản chụp prompt, bố cục), rồi trả về ngay.
2. Việc gửi tác vụ sang kie.ai (upload ảnh tham chiếu + `createTask`) chạy **sau khi đã trả response** (dùng `after()` của Next). Nếu tiến trình chết giữa chừng, bước 3 sẽ tự gửi bù.
3. Màn hình kết quả gọi `POST /api/sessions/[id]/sync` mỗi 3 đến 5 giây. Server: gửi bù ảnh `PENDING` quá lâu, hỏi kie.ai các ảnh `PROCESSING` (không hỏi lại cùng 1 tác vụ quá 1 lần mỗi vài giây dù có nhiều người cùng xem), khi `SUCCESS` thì tải ảnh về kho, chạy `sharp` hoàn thiện, cập nhật CSDL.
4. Mỗi ảnh được "chiếm" bằng cập nhật có điều kiện trong CSDL (`WHERE status = ...`) để hai request cùng lúc không xử lý trùng một ảnh.
5. Lỗi: tự thử lại tối đa 1 lần (tạo task mới, không tính vào hạn mức), vẫn lỗi thì `FAILED` và hiện nút "Tạo lại".
6. Callback của kie.ai (`POST /api/webhooks/kie`) chỉ là đường tăng tốc tùy chọn, có xác thực chữ ký, bật bằng biến môi trường. Hệ thống phải chạy đúng chỉ với polling.

---

## 3. Schema CSDL (Prisma, MySQL)

Quy ước: khóa chính `String @id @default(cuid())`; `createdAt/updatedAt` ở mọi bảng; tên bảng `snake_case` qua `@@map`. Không xóa cứng dữ liệu nghiệp vụ (chỉ tắt/ẩn).

> Lưu ý đặt tên: brief gọi cả "phiên đăng nhập" lẫn "phiên tạo ảnh" là session. Để khỏi nhầm, phiên đăng nhập là `auth_sessions`, phiên tạo ảnh là `consult_sessions` (hiển thị cho sale là "Phiên tư vấn").

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `users` | email (unique), name, passwordHash, role (`ADMIN`/`SALE`), isActive | Admin đầu tiên tạo bằng seed từ env |
| `auth_sessions` | userId, tokenHash (unique), expiresAt | Cookie chứa token ngẫu nhiên, DB chỉ lưu bản băm. Khóa tài khoản là mất phiên ngay |
| `materials` | code (unique), name, groupName, printTech, descHuman, thicknessMm? (mm; nhóm Mỏng/Cao thành/Dày tính từ đây), (descAi và productPhotoPath không còn dùng), layer1Path, layer2Path, referencePath, referenceUpdatedAt, kieRefUrl?, kieRefExpiresAt?, isActive, sortOrder | `referencePath` là ảnh ghép lớp 1 + lớp 2, tạo lại mỗi khi sửa ảnh. `kieRef*` là bộ nhớ đệm URL đã upload lên kie.ai |
| `sheets` | name, groupName, cols, rows, aspectRatio, resolution, isActive, sortOrder | Mặc định 5 x 2, `16:9`, `2K` |
| `sheet_materials` | sheetId, materialId, position | unique (sheetId, position) và (sheetId, materialId). Chặn cứng: tối đa 10 dòng/trang và không vượt cols x rows |
| `prompt_templates` | kind (`CATALOG`/`DESIGN`), version, body, isActive, note, createdById | Mỗi lần lưu là một phiên bản mới, giữ lịch sử, đánh dấu bản đang dùng |
| `design_styles` | name, description, isActive, sortOrder | Kiểu thiết kế cho bước 2 |
| `settings` | key (PK), value (JSON) | `imageModel`, `defaultResolution`, `dailyLimitPerSale` (60), `workshopName`, `footerNote`, `labelMode` (`overlay`/`legend`) |
| `customers` | name, phone, note, ownerId (sale phụ trách), createdById | |
| `brands` | customerId, name, createdById | |
| `logos` | brandId, originalPath, normalizedPath, width, height, note, kieUrl?, kieExpiresAt?, createdById | Chuẩn hóa PNG, cạnh dài tối đa 2048px, cảnh báo nếu < 500px |
| `consult_sessions` | type (`CATALOG`/`DESIGN`), logoId, parentId? (phiên DESIGN trỏ về phiên CATALOG), productType?, variantsPerMaterial?, note?, createdById | Một "phiên tư vấn" = 1 phiên CATALOG và các phiên DESIGN con của nó |
| `session_selected_materials` | sessionId (phiên DESIGN), materialId | Chất liệu khách đã chọn |
| `generated_images` | sessionId, kind (`SHEET`/`DESIGN`), sheetId?, materialId?, designStyleId?, variantIndex, **layoutSnapshot (JSON)**, promptUsed, promptTemplateId, promptVersion, model, resolution, aspectRatio, taskId?, status (`PENDING`/`PROCESSING`/`SUCCESS`/`FAILED`), attempt, lastPolledAt?, originalPath?, finalPath?, errorMessage?, parentImageId?, createdById | `layoutSnapshot` lưu lại cột/hàng và danh sách (vị trí, mã, tên chất liệu) lúc tạo, để sửa trang mẫu sau này không làm sai ảnh cũ. Tạo lại = tạo dòng mới trỏ `parentImageId` |
| `usage_logs` | userId, imageId, kind, day (ngày theo múi giờ Việt Nam), createdAt | Đếm hạn mức theo (userId, day). Thống kê cho admin |

Index chính: `generated_images(status, lastPolledAt)`, `generated_images(sessionId)`, `usage_logs(userId, day)`, `customers(name)`, `customers(phone)`, `materials(groupName, isActive)`.

---

## 4. Danh sách route

### Trang (App Router)

| Route | Ai | Việc |
|---|---|---|
| `/login` | Công khai | Đăng nhập |
| `/` | SALE, ADMIN | Nút lớn "Tạo phiên tư vấn mới" + phiên gần đây |
| `/sessions/new` | SALE, ADMIN | Tạo phiên từng bước: Khách hàng, Thương hiệu, Logo, Trang mẫu, Xác nhận. Nhận `?logoId=` để tái sử dụng logo cũ |
| `/sessions/[id]` | SALE, ADMIN | Kết quả phiên: lưới ảnh có trạng thái, phóng to, tạo lại, tải về, tick chất liệu; các lượt thiết kế bên dưới |
| `/sessions/[id]/design` | SALE, ADMIN | Bước 2: loại sản phẩm, số phương án, ghi chú |
| `/history` | SALE, ADMIN | Cây Khách hàng > Thương hiệu > Logo, tìm kiếm và lọc theo sale, ngày |
| `/customers/[id]`, `/brands/[id]`, `/logos/[id]` | SALE, ADMIN | Chi tiết từng cấp; logo có nút "Tạo phiên mới" |
| `/admin/materials`, `/admin/materials/new`, `/admin/materials/[id]`, `/admin/materials/import` | ADMIN | Thư viện chất liệu, nhập CSV |
| `/admin/sheets`, `/admin/sheets/new`, `/admin/sheets/[id]` | ADMIN | Trang mẫu, sắp xếp chất liệu |
| `/admin/prompts` | ADMIN | Hai mẫu prompt + lịch sử phiên bản |
| `/admin/design-styles` | ADMIN | Kiểu thiết kế |
| `/admin/users` | ADMIN | Tạo/khóa tài khoản sale, đặt lại mật khẩu |
| `/admin/settings` | ADMIN | Model, độ phân giải, hạn mức, tên xưởng, chú thích, chế độ nhãn |
| `/admin/usage` | ADMIN | Thống kê lượt tạo theo người và theo ngày |

### Route Handler (API)

| Route | Việc |
|---|---|
| `GET /api/files/[...key]` | Phục vụ ảnh từ kho, **bắt buộc đã đăng nhập** |
| `POST /api/uploads/logo` | Upload logo (PNG/JPG/WEBP/SVG, ≤ 10MB), chuẩn hóa bằng sharp |
| `POST /api/uploads/material-image` | Upload ảnh lớp 1 (mặt trước), lớp 2 (mặt sau) của chất liệu (ADMIN) |
| `POST /api/sessions/[id]/sync` | Polling: tiến các ảnh chưa xong và trả trạng thái |
| `GET /api/images/[id]/download` | Tải từng ảnh |
| `GET /api/sessions/[id]/download?format=zip\|pdf` | Tải cả phiên dạng ZIP hoặc PDF (mỗi trang một ảnh) |
| `POST /api/webhooks/kie` | Callback tùy chọn, xác thực chữ ký |

### Server Actions (nhóm theo file)

`auth` (đăng nhập, đăng xuất), `customers/brands`, `sessions` (tạo phiên catalog, tạo phiên thiết kế, tạo lại ảnh), `admin/materials` (lưu, bật/tắt, nhập CSV), `admin/sheets`, `admin/prompts`, `admin/design-styles`, `admin/users`, `admin/settings`. Mọi action **tự kiểm tra lại phiên đăng nhập và vai trò** ở server, không tin giao diện.

### Phân quyền

- `proxy.ts`: chỉ kiểm tra có cookie hay không, chưa có thì chuyển về `/login` (kiểm tra "lạc quan").
- Kiểm tra thật nằm ở lớp truy cập dữ liệu (DAL) `requireUser()` / `requireAdmin()` gọi trong mọi trang, action, route handler.
- SALE: xem được dữ liệu người khác, chỉ sửa/tạo lại được dữ liệu `createdById` là mình. ADMIN toàn quyền.

---

## 5. Cấu trúc thư mục

```
app/
  (auth)/login/
  (app)/                     # khung giao diện sale + admin, đọc phiên trong <Suspense>
    page.tsx
    sessions/ new/ [id]/ [id]/design/
    history/  customers/[id]  brands/[id]  logos/[id]
    admin/ materials/ sheets/ prompts/ design-styles/ users/ settings/ usage/
  api/ files/ uploads/ sessions/[id]/sync  images/[id]/download  webhooks/kie
proxy.ts
lib/
  db.ts  env.ts              # env.ts kiểm tra biến môi trường bằng zod, lỗi rõ ràng bằng tiếng Việt
  auth/ session.ts password.ts dal.ts
  storage/ types.ts local.ts index.ts        # sau này thêm s3.ts
  providers/ types.ts mock.ts kie.ts index.ts # ImageProvider
  prompts/ render.ts materials-list.ts
  grid/ layout.ts                              # tính ô lưới (overlay + legend)
  imaging/ normalize-logo.ts compose-reference.ts finish-image.ts fonts.ts
  jobs/ submit.ts sync.ts limits.ts
  csv/ materials.ts
  export/ zip.ts pdf.ts
components/
  ui/            # shadcn đã có + bổ sung thêm cùng hệ shadcn
  ...            # component riêng của từng màn hình
prisma/ schema.prisma  seed.ts
assets/fonts/     # font có tiếng Việt, giấy phép mở (OFL)
docs/ PLAN.md  DECISIONS.md
.env.example  README.md
```

Test nằm cạnh code (`*.test.ts`), chạy bằng Vitest.

### Thư viện sẽ thêm (ghi rõ để bạn biết)

| Thư viện | Dùng để |
|---|---|
| `prisma` + `@prisma/client` (+ driver MySQL theo bản hiện hành) | ORM. Chốt phiên bản và cách kết nối khi cài, đọc tài liệu hiện hành, không đoán |
| `sharp` (thêm chính thức vào package.json) | Xử lý ảnh |
| `zod` (thêm chính thức) | Kiểm tra dữ liệu vào, kiểm tra biến môi trường |
| `bcryptjs` | Băm mật khẩu (thuần JS, không lỗi biên dịch trên Windows/hosting) |
| `vitest` | Test |
| `archiver` và `pdf-lib` | Xuất ZIP và PDF (chốt ở GĐ7) |
| Thêm component shadcn: table, textarea, label, dropdown-menu, sonner (thông báo), alert, progress, switch, popover, scroll-area... | Cùng hệ shadcn đang dùng, không thêm bộ UI khác |

Không thêm thư viện kéo thả: sắp xếp chất liệu bằng nút lên/xuống (brief cho phép "kéo thả **hoặc** nút lên/xuống").

---

## 6. Biến môi trường (sẽ có trong `.env.example`, chú thích tiếng Việt)

| Biến | Ý nghĩa | Bắt buộc |
|---|---|---|
| `DATABASE_URL` | Chuỗi kết nối MySQL | Có |
| `APP_URL` | Địa chỉ công khai của web (dùng cho callback, cookie) | Có |
| `APP_TIMEZONE` | Múi giờ tính "ngày" cho hạn mức, mặc định `Asia/Ho_Chi_Minh` | Không |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Tài khoản admin đầu tiên, dùng khi seed | Có (khi seed) |
| `STORAGE_DRIVER` | `local` (mặc định). Sau này `s3` | Không |
| `STORAGE_DIR` | Thư mục lưu ảnh khi `local` (ngoài `public/`), mặc định `./storage` | Không |
| `IMAGE_PROVIDER` | `mock` hoặc `kie` | Có |
| `KIE_API_KEY` | Khóa kie.ai, **chỉ ở server** | Khi `kie` |
| `KIE_API_BASE` | Mặc định `https://api.kie.ai` | Không |
| `KIE_CALLBACK_ENABLED`, `KIE_CALLBACK_SECRET` | Bật callback và khóa xác thực chữ ký (chỉ khi `APP_URL` truy cập được từ internet; trên VPS có tên miền HTTPS thì nên bật) | Không |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Mật khẩu MySQL, dùng cho Docker Compose trên VPS (xem mục 9) | Khi triển khai |
| `DOMAIN` | Tên miền để Caddy tự cấp HTTPS (xem mục 9) | Khi triển khai |

Tên model, độ phân giải, hạn mức, tên xưởng, chế độ nhãn **không** nằm trong env mà nằm ở trang "Cấu hình" của admin (bảng `settings`).

---

## 7. Phần kỹ thuật cần thử nghiệm sớm (rủi ro)

1. **Chữ tiếng Việt có dấu trong `sharp`.** `sharp` vẽ chữ qua Pango/fontconfig; nhúng font bằng `@font-face` trong SVG không chạy ổn. Cách dự kiến: dùng tùy chọn `text.fontfile` của sharp trỏ vào file font trong `assets/fonts/`. **Việc đầu tiên của GĐ4 là chạy thử nghiệm nhỏ trên Windows và đánh giá**; nếu không ổn thì chuyển sang vẽ chữ bằng `@napi-rs/canvas` rồi ghép bằng sharp (sẽ ghi vào DECISIONS).
2. **AI vẽ lưới không chính xác từng điểm ảnh.** Nhãn `overlay` do code đặt theo ô chia đều, nên có thể lệch vài điểm ảnh so với ô AI vẽ. Giảm thiểu: dải nhãn bán trong suốt, đủ cao để che lệch; admin có chế độ `legend` dự phòng. Chất lượng 8 đến 10 chất liệu đúng trong một ảnh phụ thuộc vào model và prompt, **sẽ đánh giá thật ở GĐ5** và có thể phải tinh chỉnh prompt cùng chủ xưởng.
3. **Đặc tả kie.ai chưa kiểm chứng.** (Bạn đã có tài khoản kie.ai nên bước thử thật khả thi.) Các thông tin trong brief là điểm xuất phát. Trước khi viết `KieProvider` (GĐ5) tôi sẽ đọc docs.kie.ai: GPT Image 2.5 image-to-image, Get Task Details, File Upload API, Webhook Verification. Cần xác nhận: tên trường chính xác, cách upload ảnh và **thời hạn của URL upload** (để quyết định bộ nhớ đệm `kieRef*`), giới hạn tốc độ gọi, định dạng ảnh trả về.
4. **Ghép ảnh tham chiếu.** Mỗi chất liệu có ảnh lớp 1 và lớp 2 đặt cạnh nhau, nền trắng. Kích thước 2 lớp có thể khác nhau, sẽ co về cùng chiều cao trước khi ghép.
5. **Chi phí.** Mỗi lần tạo/tạo lại là một lượt tính tiền thật. Hạn mức ngày được kiểm tra **trước** khi gọi API, và `MockProvider` là mặc định ở môi trường dev.

---

## 8. Các giai đoạn

Sau **mỗi** giai đoạn: chạy `npm run lint` và `npm run build`, commit, báo cáo ngắn kèm các bước test bằng tay. Bạn duyệt xong giai đoạn trước tôi mới sang giai đoạn sau nếu bạn muốn (mặc định tôi báo cáo rồi chờ).

| GĐ | Nội dung | Kết quả chạy được |
|---|---|---|
| **1** | Cài Prisma + MySQL (dev bằng Docker), schema, seed admin, đăng nhập/đăng xuất, phân quyền, `proxy.ts`, khung giao diện tiếng Việt (sidebar admin, thanh trên cho điện thoại), `.env.example`, README bản đầu, cấu hình Vitest | Đăng nhập được, sale không vào được `/admin`, admin tạo được tài khoản sale |
| **2** | Lớp `storage`, thư viện chất liệu (CRUD, upload ảnh, ghép ảnh tham chiếu, nhập CSV), trang mẫu (sắp xếp, chặn 10, cảnh báo chất liệu mồ côi) | Admin nhập chất liệu, thấy ảnh ghép, dựng được các trang mẫu |
| **3** | Khách hàng, thương hiệu, logo (upload, chuẩn hóa, cảnh báo < 500px), màn hình tạo phiên đến bước chọn logo | Tạo được cây Khách > Thương hiệu > Logo |
| **4** | `ImageProvider` + `MockProvider`, prompt + `materials_list`, tính ô lưới, luồng bước 1 trọn vẹn (PENDING đến SUCCESS, polling, tạo lại, hạn mức ngày), xử lý ảnh kết quả (đầu trang, nhãn `overlay`/`legend`, chân trang), tải từng ảnh. **Mở đầu bằng thử nghiệm chữ tiếng Việt** | Chạy cả luồng bước 1 với ảnh giả, ảnh hoàn thiện đúng chữ có dấu |
| **5** | `KieProvider` thật (sau khi đọc docs), upload tham chiếu, bộ nhớ đệm URL, callback tùy chọn, thử trên vài trang thật | Tạo được ảnh thật từ kie.ai; cùng quyết định cùng chủ xưởng về prompt |
| **6** | Bước 2: chọn chất liệu, loại sản phẩm, số phương án, kiểu thiết kế, prompt DESIGN | Ra ảnh thiết kế theo chất liệu đã tick |
| **7** | Lịch sử dạng cây + tìm kiếm + lọc, mở lại phiên cũ, "Tạo phiên mới" từ logo cũ, tải ZIP/PDF, thống kê cho admin | Duyệt và tải lại được mọi thứ |
| **8** | Rà lỗi, giao diện điện thoại, thông báo lỗi tiếng Việt, kiểm tra bảo mật (quyền, route ảnh, rò khóa API), **đóng gói triển khai VPS** (Dockerfile, `docker-compose.yml`, cấu hình Caddy, script cập nhật và sao lưu, README hướng dẫn từng bước), hỗ trợ bạn triển khai lần đầu | Bản chạy thật trên VPS qua HTTPS |

### Test tự động (theo yêu cầu mục 11.5)

- Sinh prompt: thay biến `{{rows}}`, `{{cols}}`, `{{materials_list}}`, `{{product_type}}`, `{{design_style}}`, `{{note}}`; biến thiếu thì báo lỗi rõ; dòng `Cell N = reference image M: ...` đúng thứ tự và đúng số thứ tự (ảnh 1 là logo nên ô 1 là ảnh 2).
- Tính ô lưới: vị trí/kích thước ô theo cols x rows, gutter, trang chưa đầy, `overlay` và `legend`.
- Giới hạn: trang không quá 10 chất liệu, không vượt cols x rows, tổng ảnh tham chiếu ≤ 16.
- Hạn mức ngày: đếm theo múi giờ Việt Nam, qua nửa đêm thì reset.

---

## 9. Triển khai lên VPS

Hướng làm đề xuất (đã đối chiếu với hướng dẫn self-hosting trong tài liệu Next.js 16 đi kèm dự án). Chi tiết từng bước gõ lệnh sẽ nằm trong `README.md` ở GĐ8, viết cho người không rành kỹ thuật.

**Cách chạy: Docker Compose, 3 container trên cùng một VPS**

| Container | Việc |
|---|---|
| `app` | Next.js chạy bằng `next start` (một bản duy nhất, không chạy nhiều bản) |
| `db` | MySQL, dữ liệu nằm trong một thư mục (volume) trên ổ đĩa VPS |
| `caddy` | Cổng vào: tự xin và gia hạn chứng chỉ HTTPS (Let's Encrypt), chuyển request vào `app`, chặn request quá lớn |

**Vì sao chọn Docker:** bản chạy trên VPS giống hệt bản test, không phải cài tay Node, MySQL, font. Đặc biệt `sharp` vẽ chữ cần thư viện font của hệ điều hành (fontconfig); đóng gói trong image thì không phụ thuộc VPS có cài hay không. Nếu VPS của bạn không dùng được Docker, tôi sẽ đổi sang PM2 + Nginx và hướng dẫn cài font thủ công.

**Dữ liệu cần giữ và sao lưu (quan trọng):**
- Thư mục ảnh (`STORAGE_DIR`, mount ra ngoài container) và dữ liệu MySQL. Mất hai thứ này là mất toàn bộ khách hàng, logo, ảnh đã tạo.
- README sẽ có lệnh sao lưu MySQL + nén thư mục ảnh và hướng dẫn đặt lịch chạy hằng đêm. Khuyến nghị tải bản sao lưu về chỗ khác (không để chung trên VPS).

**Các điểm kỹ thuật riêng cho môi trường VPS (tôi sẽ xử lý, bạn chỉ cần biết):**
- Giới hạn kích thước upload: Caddy cho tối thiểu 12MB để logo 10MB lên được.
- Bộ nhớ `sharp` trên Linux: cấu hình bộ cấp phát bộ nhớ theo khuyến cáo của sharp để RAM không phình khi xử lý nhiều ảnh 2K. Cần biết RAM VPS để chọn mức phù hợp.
- Tắt đệm (buffering) ở lớp proxy để màn hình tải dần hiển thị đúng.
- Tắt máy chủ gọn gàng: `after()` (dùng để gửi tác vụ sang kie.ai) được hỗ trợ đầy đủ khi chạy `next start`; Docker sẽ cấu hình thời gian chờ tắt 30 giây để tác vụ đang gửi không bị cắt.
- Cookie đăng nhập đặt cờ `Secure` khi chạy HTTPS; `APP_URL` phải là địa chỉ `https://...` thật.
- Callback kie.ai: VPS có tên miền HTTPS nên bật được, giúp ảnh về nhanh hơn. Polling vẫn là đường chính, callback chỉ tăng tốc.
- Cập nhật phiên bản mới: `git pull`, build lại image, chạy migration CSDL, khởi động lại. Sẽ có một script duy nhất cho việc này.
- Khóa API và mật khẩu chỉ nằm trong file `.env` trên VPS (không commit lên git).
- Tường lửa VPS: chỉ mở cổng 22 (SSH), 80, 443. Cổng MySQL không mở ra ngoài.

---

## 10. Ngoài phạm vi (giữ đúng brief)

Không làm: tách nền logo tự động, tích hợp Zalo hoặc CRM, báo giá, thanh toán, đa ngôn ngữ, ghép mockup không dùng AI. Chỉ làm đúng những gì có trong brief.
