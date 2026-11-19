# BÁO CÁO HIỆN TRẠNG: CHẤT LIỆU VÀ TẠO MOCKUP

Khảo sát ngày 19/11/2026, chỉ đọc (không sửa code, không sửa CSDL ngoài việc đọc). Quy ước: "KHÔNG TÌM THẤY" = đã tìm trong mã nguồn và CSDL mà không có; "KHÔNG CHẮC" = chưa kiểm chứng được.
Không in khóa bí mật: mọi biến môi trường chỉ liệt kê tên, giá trị là `***`.

---

## 1. Tổng quan dự án

### 1.1 Công nghệ
| Mục | Hiện có |
|---|---|
| Framework | Next.js **16.4.6** (App Router, Turbopack), React 19.3.0, TypeScript |
| ORM / CSDL | **Prisma 7.10.1** + `@prisma/adapter-mariadb`, CSDL **MySQL** (Docker khi dev). Client sinh ra ở `generated/prisma` |
| UI | Tailwind, shadcn + `@base-ui/react`, lucide-react, sonner, motion |
| Xử lý ảnh | `sharp` (chuẩn hóa logo/ảnh chất liệu, ghép ảnh tham chiếu, vẽ khung/nhãn lên ảnh kết quả) |
| Kiểm tra dữ liệu | zod 4 |
| Xuất file | `fflate` (ZIP), `pdf-lib` (PDF) |
| Nhà cung cấp AI ảnh | **kie.ai** (class `KieProvider`) hoặc **mock** (ảnh giả), chọn bằng biến `IMAGE_PROVIDER` |
| Lưu file | Ổ đĩa cục bộ (`STORAGE_DRIVER=local`, thư mục `STORAGE_DIR`), chưa có S3 |
| Triển khai | Dockerfile + docker-compose (web, MySQL, Caddy HTTPS), thư mục `deploy/` |
| Test | vitest (file `*.test.ts` cạnh mã). **Không chạy được trên máy này** ngay cả ở bản sạch (đã ghi trong README) |

Biến môi trường (chỉ tên): `DATABASE_URL, APP_URL, APP_TIMEZONE, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, STORAGE_DRIVER, STORAGE_DIR, IMAGE_PROVIDER, KIE_API_KEY, KIE_API_BASE, KIE_UPLOAD_BASE, KIE_CALLBACK_ENABLED, KIE_CALLBACK_SECRET, ZALO_BOT_TOKEN, ZALO_API_BASE, ZALO_WEBHOOK_SECRET, ZALO_CARE_CRON_SECRET` (tất cả `***`).

### 1.2 Cấu trúc thư mục (2-3 cấp)
```
truongminh/
├─ app/
│  ├─ (app)/            giao diện sau đăng nhập
│  │  ├─ page.tsx       Trang chính = trình tạo phiên (wizard)
│  │  ├─ customers/     khách hàng, thương hiệu, logo
│  │  ├─ history/       lịch sử phiên
│  │  ├─ sessions/      new/ (wizard), [id]/ (kết quả), [id]/design/ (bước 2)
│  │  ├─ zalo/          care/ (kịch bản chăm sóc), guide/ (hướng dẫn)
│  │  └─ admin/         materials, sheets, design-styles, prompts, settings, usage, users, zalo
│  ├─ (auth)/login
│  └─ api/              admin/materials, uploads/logo, files, images, sessions, webhooks/{kie,zalo}, jobs/zalo-care, healthz...
├─ components/          ui/ (shadcn), shell/, materials/, sheets/, customers/, stats/
├─ lib/
│  ├─ jobs/             tạo phiên, gửi/hỏi kết quả AI, giữ nhịp, hoàn thiện ảnh
│  ├─ providers/        kie.ts, mock.ts (giao diện chung ImageProvider)
│  ├─ prompts/          defaults.ts (prompt mặc định), render.ts (ghép prompt)
│  ├─ materials/        save.ts, delete.ts, usage.ts, thickness.ts
│  ├─ imaging/          material-images.ts, normalize-logo.ts, logo-for-ai.ts, finish-image.ts
│  ├─ design/, grid/, sheets/, csv/, export/, storage/, stats/, auth/, ai/ (chat), zalo/
├─ prisma/              schema.prisma, migrations/ (8 bản), seed*.ts
├─ docs/                PLAN.md (thiết kế), DECISIONS.md (quyết định kỹ thuật D1..D72)
├─ storage/             ảnh thật (images, logos, materials, zalo-assets), ~158 MB
└─ deploy/, assets/fonts, public/
```

### 1.3 Các trang / route
| Route | Chức năng |
|---|---|
| `/login` | Đăng nhập |
| `/` (Trang chính) | Trình tạo phiên: chọn khách, thương hiệu, logo → chọn trang mẫu → xác nhận → tạo ảnh. Có nút "Tạo nhanh" |
| `/customers` | Duyệt khách hàng > thương hiệu > logo; thêm, đổi tên, xóa |
| `/history` | Lịch sử phiên, lọc theo từ khóa, sale, khoảng ngày (tối đa 200 phiên) |
| `/sessions/[id]` | Kết quả một phiên: tiến độ, ảnh, tải ZIP/PDF, tạo lại ảnh lỗi, gửi nhóm Zalo |
| `/sessions/[id]/design` | Bước 2 (thiết kế sản phẩm) từ chất liệu khách chọn |
| `/zalo/care`, `/zalo/guide` | Kịch bản chăm sóc nhóm Zalo; hướng dẫn Zalo (`/zalo` chuyển hướng sang care) |
| `/admin/materials` (+ `/new`, `/[id]`, `/import`) | Quản trị chất liệu (xem mục 6) |
| `/admin/sheets` (+ `/new`, `/[id]`) | Trang mẫu: gom tối đa 10 chất liệu vào một ảnh; đặt mặc định |
| `/admin/design-styles` | Kiểu thiết kế (cho bước 2) |
| `/admin/prompts` | Prompt catalog / thiết kế, nhiều phiên bản |
| `/admin/settings` | Cấu hình: model, độ phân giải, hạn mức/ngày, tên xưởng, kiểu nhãn... |
| `/admin/usage` | Thống kê (có xuất CSV: `/api/admin/usage/export`) |
| `/admin/users` | Người dùng (ADMIN / SALE) |
| `/admin/zalo` (+ `/bot`, `/care`, `/groups`, `/staff`) | Cài đặt Zalo |

Vai trò: `ADMIN`, `SALE`. Ai cũng xem được dữ liệu của người khác; SALE chỉ sửa/thêm dữ liệu mình tạo hoặc phụ trách (`lib/permissions.ts`).

---

## 2. Database (Prisma schema, MySQL)

Ghi chú kiểu: `String` trong Prisma = `VARCHAR(191)` trên MySQL trừ khi có `@db.*`; `Json` = JSON; `DateTime` = DATETIME(3). PK là `id String @default(cuid())`.
**Không có bảng riêng cho "nhóm/loại chất liệu", "màu", "tag" hay "ngành hàng"**: nhóm là chuỗi `groupName` nằm ngay trong từng dòng.

### 2.1 Chất liệu và trang mẫu
**`materials`** (model `Material`)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | String PK | |
| code | String **unique** | mã chất liệu |
| name | String | |
| groupName | String | nhóm (chuỗi tự do) |
| printTech | String | công nghệ in (chuỗi tự do) |
| descHuman | Text | mô tả cho người đọc |
| descAi | Text? | **không còn dùng** (đã bỏ khỏi form, prompt) |
| thicknessMm | Float? | độ dày thật (mm), thêm 19/11 |
| layer1Path | VarChar(500)? | ảnh mặt trước |
| layer2Path | VarChar(500)? | ảnh mặt sau |
| productPhotoPath | VarChar(500)? | **không còn dùng** (form đã bỏ; 0 dòng có giá trị) |
| referencePath | VarChar(500)? | ảnh ghép lớp 1 + lớp 2, **đây là ảnh gửi cho AI** |
| referenceUpdatedAt | DateTime? | |
| kieRefUrl, kieRefExpiresAt | VarChar(1000)?, DateTime? | bộ nhớ đệm URL đã upload lên kie.ai (hết hạn sau ~24 giờ) |
| isActive | Boolean default true | |
| sortOrder | Int default 0 | |
| createdAt, updatedAt | DateTime | |
Quan hệ: 1-n `SheetMaterial`, `SessionSelectedMaterial`, `GeneratedImage`. Index `(groupName, isActive)`.

**`sheets`** (`Sheet`): id, name, groupName (default ""), cols (2), rows (5), aspectRatio ("2:3"), resolution ("2K"), isActive, isDefault (nút Tạo nhanh), sortOrder, createdAt/updatedAt. Quan hệ: 1-n `SheetMaterial`, `GeneratedImage`.

**`sheet_materials`** (`SheetMaterial`): id, sheetId → `Sheet` (onDelete **Cascade**), materialId → `Material`, position Int. Unique `(sheetId, position)` và `(sheetId, materialId)`.

### 2.2 Prompt và kiểu thiết kế
**`prompt_templates`**: id, kind (`CATALOG`|`DESIGN`), version Int, body Text, isActive Boolean (default false), note?, createdById? → `User`, createdAt. Unique `(kind, version)`. Quan hệ 1-n `GeneratedImage`.
**`design_styles`**: id, name, description Text, isActive, sortOrder, createdAt, updatedAt. Quan hệ 1-n `GeneratedImage`.
**`settings`**: key String PK, value Json, updatedAt (cấu hình hệ thống và Zalo dạng khóa-giá trị).

### 2.3 Khách hàng, thương hiệu, logo
**`customers`**: id, name, phone?, note Text?, ownerId → User (sale phụ trách), createdById → User, createdAt/updatedAt. Index name, phone, ownerId. Quan hệ 1-n `Brand`.
**`brands`**: id, customerId → Customer, name, createdById → User, createdAt/updatedAt. 1-n `Logo`.
**`logos`**: id, brandId → Brand, originalPath VarChar(500), normalizedPath VarChar(500), width Int, height Int, note Text?, kieUrl VarChar(1000)?, kieExpiresAt?, createdById → User, createdAt/updatedAt. 1-n `ConsultSession`.

### 2.4 Phiên và ảnh mockup
**`consult_sessions`** (`ConsultSession` = "phiên tạo ảnh"): id, type (`CATALOG`|`DESIGN`), logoId → Logo, parentId? → chính nó (phiên DESIGN trỏ về phiên CATALOG), productType String?, variantsPerMaterial Int?, note Text?, createdById → User, createdAt/updatedAt. 1-n `GeneratedImage`, 1-n `SessionSelectedMaterial`.
**`session_selected_materials`**: id, sessionId → ConsultSession (**Cascade**), materialId → Material. Unique `(sessionId, materialId)`. Chỉ được ghi ở bước 2 (thiết kế) và dùng để biết chất liệu nào "đã từng dùng".
**`generated_images`** (`GeneratedImage`):
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | PK | |
| sessionId | → ConsultSession | |
| kind | `SHEET`\|`DESIGN` | |
| sheetId?, materialId?, designStyleId? | FK | SHEET dùng sheetId; DESIGN dùng materialId + designStyleId |
| variantIndex | Int default 0 | phương án thứ mấy (bước 2) |
| layoutSnapshot | Json | **bản chụp** cột/hàng/tên trang + từng ô (materialId, code, name, groupName, printTech) + số thứ tự ảnh + thông tin thiết kế |
| promptUsed | Text | **prompt đầy đủ đã gửi** |
| promptTemplateId?, promptVersion? | | mẫu prompt nào |
| model, resolution, aspectRatio | String | |
| taskId? | String | mã tác vụ ở kie.ai |
| status | `PENDING`\|`PROCESSING`\|`SUCCESS`\|`FAILED` | |
| attempt | Int default 1 | |
| lastPolledAt? | DateTime | dùng làm khóa/hẹn giờ |
| originalPath?, finalPath? | VarChar(500) | ảnh AI gốc; ảnh hoàn thiện (có khung, nhãn) |
| errorMessage? | Text | |
| costCredits? | Float | credits kie.ai đã trừ |
| parentImageId? | → chính nó | ảnh "Tạo lại" trỏ về ảnh cũ |
| createdById, createdAt, updatedAt | | |
Quan hệ: 1-n `UsageLog`, `ZaloDelivery`, `ZaloPost`, `retries`.
**`usage_logs`**: id, userId → User, imageId? → GeneratedImage, kind, day VarChar(10) ("YYYY-MM-DD" theo `APP_TIMEZONE`), createdAt. Dùng tính hạn mức ngày và thống kê.

### 2.5 Khác
`users` (role ADMIN/SALE), `auth_sessions` (phiên đăng nhập). Zalo: `zalo_groups`, `zalo_deliveries`, `zalo_contacts`, `zalo_messages`, `zalo_assets`, `zalo_posts` (+ các enum trạng thái). Không liên quan trực tiếp tới chất liệu/mockup nên không trình bày chi tiết.

### 2.6 Migration
8 bản trong `prisma/migrations/`: `init`, `add_cost_credits`, `add_sheet_default`, `add_zalo`, `add_zalo_inbox`, `add_zalo_care`, `zalo_bot_paused_at`, `material_thickness` (mới nhất, đã áp dụng vào CSDL dev).

---

## 3. Dữ liệu chất liệu thực tế (CSDL dev, lúc khảo sát)

### 3.1 Số lượng
**Tổng 119 chất liệu, 119 đang bật.**

| Nhóm (`groupName`) | Số lượng |
|---|---|
| Nhựa | 89 |
| Vải | 26 |
| Giả Gương | 4 |

| Công nghệ in (`printTech`) | Số lượng |
|---|---|
| Khắc laser | 102 |
| Cắt laser | 12 |
| In UV | 5 |

| Nhóm độ dày (tính từ `thicknessMm`) | Số lượng |
|---|---|
| Mỏng (< 0.45 mm) | 13 |
| Cao thành (0.45 - 0.95 mm) | 80 |
| Dày (≥ 0.95 mm) | 26 |

Tổ hợp nhóm / công nghệ: Nhựa/Khắc laser 78; Vải/Khắc laser 21; Nhựa/Cắt laser 9; Giả Gương/Khắc laser 3; Vải/In UV 3; Vải/Cắt laser 2; Nhựa/In UV 2; Giả Gương/Cắt laser 1.

**Tất cả giá trị khác nhau ở các cột phân loại:** `groupName` có 3 giá trị (Nhựa, Vải, Giả Gương); `printTech` có 3 giá trị (Khắc laser, Cắt laser, In UV); `isActive` chỉ có `true`. Cột **màu, tag, loại 1 màu/2 màu: KHÔNG TÌM THẤY** (thông tin "1 màu/2 màu" chỉ nằm trong chuỗi `name`, ví dụ "Decal 1 màu ZY 15").

### 3.2 15 bản ghi mẫu
(`descHuman` trống ở tất cả; ảnh nằm trong `materials/<id>/layer1|layer2|reference-<timestamp>.jpg`)
| code | name | groupName | printTech | thicknessMm | sortOrder |
|---|---|---|---|---|---|
| 123 | Caro đen trắng | Vải | In UV | 0.62 | 1 |
| lw102 | Lấp lánh nhiều màu | Vải | In UV | 0.32 | 2 |
| 11078-18 | Decal 2 màu 11078-18 | Nhựa | Khắc laser | 0.61 | 4 |
| 123c | Su vàng | Giả Gương | Khắc laser | 0.79 | 5 |
| yps3002A | yps3002A 2 màu | Nhựa | In UV | 0.82 | 7 |
| H0006 | Decal 1 màu H0006 | Nhựa | Cắt laser | 0.28 | 13 |
| CARO-BE-DO-DEN | Caro be đỏ đen 1 màu | Vải | Cắt laser | 0.38 | 24 |
| CARO-XANH-TRANG | Caro xanh trắng 1 màu | Vải | Khắc laser | 0.62 | 25 |
| CAM-HT-10539-47 | Cam HT 10539-47 1 màu | Nhựa | Khắc laser | 1.13 | 30 |
| ZY-10748-10 | Decal 1 màu ZY 10748-10 | Nhựa | Khắc laser | 0.69 | 43 |
| ZY-15 | Decal 1 màu ZY 15 | Nhựa | Khắc laser | 0.74 | 44 |
| ZY-E003-2 | Decal 1 màu ZY E003 (2) | Nhựa | Khắc laser | 0.76 | 45 |
| ZY-HP002 | Decal 1 màu ZY HP002 | Nhựa | Khắc laser | 0.66 | 46 |
| TRANG-GUONG-VANG-HT-10472-12 | Tráng gương vàng HT 10472-12 2 màu | Giả Gương | Cắt laser | 0.30 | 74 |
| NHUNG-HT-11029-12 | Nhung HT 11029-12 1 màu | Vải | Khắc laser | 1.20 | 108 |

### 3.3 Thống kê chất lượng dữ liệu
| Chỉ tiêu | Kết quả |
|---|---|
| Thiếu ảnh tham chiếu / mặt trước / mặt sau | 0 / 0 / 0 |
| Thiếu mô tả người đọc (`descHuman` trống) | **119/119** |
| `descAi` trống hoặc null | 111 (8 dòng cũ còn nội dung, không còn dùng) |
| Có `productPhotoPath` | 0 |
| Thiếu độ dày | 0 |
| Mã trùng (không phân biệt hoa thường) | 0 |
| Tên trùng (bỏ dấu, hoa thường) | 0 |
| Tên gần trùng | Có 2 cặp theo mã: `ZY-E003-2` / `ZY-E003`, `ZY-YYB039-2` / `ZY-YYB039` (cùng mã, khác thư mục nguồn, độ dày khác nhau) |
| Chất liệu **không nằm trong trang mẫu nào** | **111/119** (chỉ 8 chất liệu thuộc "Trang mẫu 1") |
| Có `kieRefUrl` đệm | 8 |

Phong cách mã/tên không thống nhất: 8 dòng nhập tay dùng mã `123, 123b, 123c, lw102, lw103, yps3002A...` và công nghệ `In UV`; 111 dòng nhập sau dùng mã IN HOA có gạch nối (ví dụ `ZY-YYB006`).

### 3.4 Nơi lưu ảnh mẫu
- **Ổ đĩa cục bộ** `./storage` (`StorageDriver` = `LocalStorage`). Không có cloud, không dùng URL ngoài.
- CSDL chỉ lưu **khóa tương đối**, ví dụ `materials/cmwiw5ha9001mk46s2cv7krlq/layer1-1794813224485.jpg`, `.../reference-1794813224485.jpg`.
- Trình duyệt xem qua `/api/files/<khóa>` (có kiểm tra đăng nhập), hàm `fileUrl()` trong `lib/storage/index.ts`.
- Khi gửi cho AI, ảnh tham chiếu được **upload lên kie.ai** (`kieai.redpandaai.co/api/file-stream-upload`), lấy `downloadUrl`, đệm trong `Material.kieRefUrl` (hạn ~23 giờ).
- Dung lượng: `storage/` ~158 MB (images 62 MB, materials 87 MB, zalo-assets 9 MB, logos 0.6 MB).
- Thư mục `storage/materials` có 216 thư mục con trong khi có 119 chất liệu: **95 thư mục rỗng** (còn lại sau khi xóa chất liệu) và 121 thư mục có file (nhiều hơn 119 là 2: KHÔNG CHẮC nguyên nhân).

---

## 4. Luồng tạo mockup (quan trọng nhất)

### 4.1 Sale thao tác gì (trang chính `/`, `sessions/new/wizard.tsx`)
1. **Bước 1, chọn khách:** chọn hoặc tạo khách hàng → thương hiệu → logo (upload PNG/JPG/WEBP/SVG ≤ 10 MB). Logo được `normalizeLogo` đổi thành PNG, cạnh dài ≤ 2048 px (SVG vẽ 300 dpi), lưu `logos/<id>/original.*` và `normalized.png`; cảnh báo nếu cạnh dài < 500 px.
2. **Bước "Trang mẫu":** sale **chọn TRANG MẪU** (không chọn từng chất liệu). Mặc định chọn tất cả, lọc được theo `Sheet.groupName`. Mỗi trang mẫu → **một ảnh**. Tối đa 20 trang mẫu mỗi phiên.
3. **Bước "Xác nhận":** hiện số lượt cần dùng so với hạn mức còn lại và chi phí ước tính (khi dùng kie).
4. Bấm "Bắt đầu tạo ảnh" → sang `/sessions/[id]` xem tiến độ. Có nút **"Tạo nhanh"**: tạo cho mọi trang mẫu đang đánh dấu mặc định.
5. **Bước 2 (thiết kế)** từ `/sessions/[id]/design`: chọn chất liệu **trong số chất liệu có mặt ở các ảnh catalog đã xong** (tối đa 10), gõ loại sản phẩm (ô tự do, có gợi ý: Móc khóa, Thẻ tên, Huy hiệu, Nhãn gắn quần áo, Patch, Ví da, Túi vải, Bảng hiệu, Ốp lưng, Sổ tay), số phương án mỗi chất liệu (1-4), ghi chú. Tối đa 24 ảnh mỗi lần.

### 4.2 Chọn chất liệu thế nào, mỗi ảnh chứa bao nhiêu
- **Do admin gom sẵn** vào `Sheet` ở Quản trị > Trang mẫu: tối đa **10 chất liệu/trang**, không vượt số ô (cột × hàng, cột 1-5, hàng 1-10), vì API nhận tối đa 16 ảnh tham chiếu (1 logo + chất liệu).
- Hệ thống **không tự chọn/chia nhóm chất liệu**. Khi tạo ảnh chỉ lấy chất liệu **đang bật và đã có `referencePath`**, đánh số ô lại liên tục.
- Hiện chỉ có **1 trang mẫu**: "Trang mẫu 1 (8 chất liệu)", nhóm "Demo", lưới 2×4, tỉ lệ **16:9**, **2K**, đang là mặc định. Các ảnh bước 2 dùng 1 chất liệu/ảnh.

### 4.3 Nơi gọi API tạo ảnh
| Bước | File / hàm |
|---|---|
| Server action tạo phiên | `app/(app)/sessions/actions.ts` → `createCatalogSessionAction`, `createDesignSessionAction`, sau đó `after(() => kickSession(id))` |
| Dựng ảnh PENDING + prompt | `lib/jobs/create.ts` → `createCatalogSession`, `buildSheetImage`; bước 2: `lib/jobs/design.ts` → `createDesignSession`, `buildDesignImage` |
| Gửi sang nhà cung cấp | `lib/jobs/process.ts` → `kickSession` → `syncSession` → `submitImage` |
| Upload ảnh tham chiếu | `lib/jobs/references.ts` → `ensureLogoUrl`, `ensureMaterialUrl` |
| Gọi kie.ai | `lib/providers/kie.ts` → `KieProvider.createTask` (POST `https://api.kie.ai/api/v1/jobs/createTask`), `getTask` (GET `/api/v1/jobs/recordInfo?taskId=`) |

**Model:** `imageModel` trong bảng `settings` = `gpt-image-2-5-sunburst-image-to-image` (mặc định trong `lib/settings.ts` cũng vậy).
**Tham số gửi** (đoạn trong `createTask`):
```ts
body: JSON.stringify({
  model: input.model,
  ...(input.callbackUrl ? { callBackUrl: input.callbackUrl } : {}),
  input: {
    prompt: input.prompt,
    input_urls: input.inputUrls, // tên trường là input_urls, không phải image_urls
    aspect_ratio: input.aspectRatio,
    resolution: input.resolution,
  },
}),
```
- `aspect_ratio`, `resolution`: lấy từ **trang mẫu** (catalog; trang hiện tại 16:9, 2K), hoặc từ cấu hình `designAspectRatio` (1:1) và `designResolution` (2K) cho bước 2. Lựa chọn hợp lệ: tỉ lệ 2:3, 3:2, 1:1, 3:4, 4:3, 9:16, 16:9; độ phân giải 1K/2K/4K.
- **Không có tham số "số ảnh"**: mỗi tác vụ ra đúng 1 ảnh. Giá tham khảo trong README: 1K = 6, 2K = 10, 4K = 16 token/ảnh (ảnh gần nhất có `costCredits = 10`).
- Giới hạn: prompt ≤ 20.000 ký tự, ≤ 16 ảnh tham chiếu.

### 4.4 Gửi những gì lên API
**Text prompt + ảnh**, không chỉ text. `inputUrls = [logoUrl, ...materialUrls]`:
- Ảnh 1 = **logo** (đã qua `prepareLogoForAi`: logo nền trong suốt được đặt lên nền tương phản, trắng cho logo tối, xám đậm `#262626` cho logo sáng, lề 8%).
- Ảnh 2..n = **ảnh tham chiếu của từng chất liệu**, theo đúng thứ tự ô. Mỗi ảnh là một tấm ghép 2 nửa: **nửa TRÁI = mặt trước (layer1), nửa PHẢI = mặt sau (layer2)**, hai ảnh cao 1024 px, cách nhau 16 px, nền trắng (`composeReference`).
- **Tên, mô tả, độ dày của chất liệu KHÔNG được đưa vào prompt.** Chỉ có `printTech` (công nghệ in) đi kèm từng ô, và hình ảnh.

### 4.5 Code ghép prompt (nguyên văn)
`lib/prompts/render.ts`:
```ts
export function renderPrompt(template: string, values: Partial<Record<PromptVariable, string | number>>): string {
  return template.replace(VAR_RE, (_all, name: string) => {
    const v = (values as Record<string, string | number | undefined>)[name];
    if (v === undefined) throw new Error(`Prompt dùng biến {{${name}}} nhưng không có giá trị để thay.`);
    return String(v);
  });
}

export type MaterialForPrompt = { printTech: string };

export function buildMaterialsList(materials: MaterialForPrompt[], grid: { cols: number; rows: number }): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const lines = materials.map(
    (m, i) => `Cell ${i + 1} = reference image ${i + 2}: use the front and back materials shown in the two panels of the reference image, technique: ${clean(m.printTech)}`,
  );
  const total = grid.cols * grid.rows;
  if (materials.length < total) {
    const first = materials.length + 1;
    lines.push(
      first === total
        ? `Cell ${total}: leave completely empty (plain white).`
        : `Cells ${first} to ${total}: leave completely empty (plain white).`,
    );
  }
  return lines.join("\n");
}
```
Lắp ráp ở `lib/jobs/create.ts` (`buildSheetImage`):
```ts
promptUsed = renderPrompt(template.body, {
  cols: sheet.cols,
  rows: sheet.rows,
  materials_list: buildMaterialsList(usable, { cols: sheet.cols, rows: sheet.rows }),
});
```
Bước 2 (`lib/jobs/design.ts`):
```ts
promptUsed = renderPrompt(template.body, {
  product_type: input.productType,
  design_style: `${style.name}: ${style.description}`,
  note: input.note.trim() || "none",
});
```
Mẫu prompt (`template.body`) lấy từ bảng `prompt_templates`, phiên bản `isActive` mới nhất (`lib/jobs/template.ts`). Biến dùng được: catalog `{{cols}} {{rows}} {{materials_list}}`; thiết kế `{{product_type}} {{design_style}} {{note}}`.
Đang dùng: **CATALOG v4** (2151 ký tự) và **DESIGN v3** (1334 ký tự). Mỗi loại có các phiên bản cũ (CATALOG v1-v3, DESIGN v1-v2) lưu lại, không bật.

### 4.6 Ví dụ prompt hoàn chỉnh (trang mẫu mặc định, 8 chất liệu: 123, lw102, lw103, 11078-18, 123b, 123c, yps3002A, yps3002B-0.5; 3141 ký tự)
```
Create one product-sample sheet as a strict grid of 2 columns and 4 rows, equal cells, thin white gutters, plain white background.

What each cell shows: ONE finished logo piece, photographed straight-on. The piece is a die-cut copy of the customer's logo: its outer outline IS the silhouette of the logo (symbol and letters kept exactly as in the logo, with the same spacing). It is NOT a logo printed or engraved on a rectangular tag, plate, card or keychain. Do not add any backing shape, hole, ring or frame.

Reference image 1 is the customer's logo, shown on a plain flat background (white or dark). The background is NOT part of the logo: ignore it and use only the logo's shapes, symbol and letters. Reproduce its shapes, proportions and letterforms exactly. Do not redraw, restyle, add or remove anything, and do not invent or replace any letters.

Reference images 2 onward are material samples from our workshop. Each one is a two-panel photo:
- LEFT panel = FRONT material. The front (top) face of the logo piece is made of this material.
- RIGHT panel = BACK material. The border and the edge of the logo piece are made of this material: a clearly visible rim, roughly 2-3% of the overall logo width, running all around the outline of every part of the logo, which also forms the visible thickness at the edges.
Take only texture, colour, pattern, gloss and thickness from the panels. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photos.

Cells, in reading order (left to right, top to bottom):
Cell 1 = reference image 2: use the front and back materials shown in the two panels of the reference image, technique: In UV
Cell 2 = reference image 3: use the front and back materials shown in the two panels of the reference image, technique: In UV
Cell 3 = reference image 4: use the front and back materials shown in the two panels of the reference image, technique: In UV
Cell 4 = reference image 5: use the front and back materials shown in the two panels of the reference image, technique: Khắc laser
Cell 5 = reference image 6: use the front and back materials shown in the two panels of the reference image, technique: Khắc laser
Cell 6 = reference image 7: use the front and back materials shown in the two panels of the reference image, technique: Khắc laser
Cell 7 = reference image 8: use the front and back materials shown in the two panels of the reference image, technique: In UV
Cell 8 = reference image 9: use the front and back materials shown in the two panels of the reference image, technique: In UV

Rules:
- Same logo, same size, same straight-on camera and the same soft studio lighting in every cell. The logo piece is centred with a generous margin on a clean light-grey cell background, with a soft contact shadow.
- The front face and the border must be visibly different materials, exactly like the left and right panels of that cell's reference image.
- Keep the pattern scale realistic and consistent with the sample.
- Do not mix materials between cells.
- Do not write any text, numbers or captions in the image. The logo's own letters are the only text.
```
(Kèm theo 9 ảnh: logo + 8 ảnh tham chiếu chất liệu, `aspect_ratio` 16:9, `resolution` 2K.)
Prompt bước 2 (DESIGN v3): "Create one realistic product photo of: {{product_type}}. The customer's logo appears on it as a die-cut logo piece ...", kèm `Design style: Tối giản hiện đại: Minimalist modern product photo: clean white-to-light-grey studio background, ...` và `Extra notes from the sales team: ...`; gửi 2 ảnh (logo + 1 chất liệu).

### 4.7 Ảnh kết quả lưu ở đâu, kèm thông tin gì
1. Hỏi kết quả mỗi ~5 giây (`pollImage`, từ màn hình kết quả, hoặc từ callback tùy chọn `/api/webhooks/kie`).
2. Xong → `finalizeImage`: tải về, lưu **ảnh gốc** `images/<sessionId>/<imageId>-original.<ext>`, rồi `renderFinal` (sharp) vẽ **đầu trang** (tên thương hiệu + "Ảnh N"), **nhãn từng ô** (mã, tên, nhóm, công nghệ in; kiểu `overlay` hoặc `legend` theo cấu hình), **chân trang** (tên xưởng, ghi chú) và lưu `images/<sessionId>/<imageId>-final.jpg`.
3. Dòng `generated_images` lưu: phiên (→ logo → thương hiệu → khách), loại, trang mẫu hoặc chất liệu + kiểu thiết kế, `layoutSnapshot` (bố cục và danh sách chất liệu **tại thời điểm tạo**), `promptUsed` nguyên văn, phiên bản prompt, model, độ phân giải, tỉ lệ, `taskId`, trạng thái, số lần thử, đường dẫn ảnh gốc/hoàn thiện, `errorMessage`, `costCredits`, người tạo, thời gian. Mỗi ảnh có 1 dòng `usage_logs`.
4. Tải về: ZIP / PDF cả phiên (`/api/sessions/[id]/download`), từng ảnh (`/api/images/[id]/download`). Tự gửi vào nhóm Zalo đang bật "tự động gửi" (`autoSendImage`, chạy nền).

### 4.8 Lỗi, thử lại, hàng đợi
Không dùng hàng đợi ngoài (Redis/BullMQ). **Hàng đợi = chính cột `status`/`lastPolledAt` trong MySQL**, được đẩy bởi `kickSession` (`after()` sau khi tạo phiên, lặp tới 12 phút nếu còn ảnh chờ) và `/api/sessions/[id]/sync` (màn hình kết quả gọi định kỳ).
- **Tự thử lại:** `MAX_ATTEMPTS = 2` (lần đầu + 1 lần). Lỗi có thể thử lại → ảnh về `PENDING`, tạo tác vụ mới, **không tính hạn mức**. Lỗi không thể khắc phục (`ProviderFatalError`, `NoReferenceError`) → `FAILED` ngay.
- **Tạo lại thủ công:** nút "Tạo lại" ở ảnh lỗi/xong → ảnh mới trỏ `parentImageId`, **tính 1 lượt** hạn mức.
- **Giữ nhịp (throttle, `lib/jobs/throttle.ts`, trong bộ nhớ):** tối đa 15 lần gửi/10 giây, tối đa 80 tác vụ đang chạy; bị kie.ai báo 429 thì cả hệ thống nghỉ ≤ 15 giây, ảnh hoãn lâu dần, hoãn tổng quá 10 phút thì báo lỗi. Upload ảnh tham chiếu và xử lý ảnh sau cùng đều có bộ giới hạn đồng thời (4 việc cùng lúc cho đồng bộ phiên).
- **Hết thời gian:** ảnh `PROCESSING` quá 15 phút → `FAILED`. Xử lý ảnh kết quả lỗi tối đa 3 lần rồi `FAILED`.
- **Hạn mức ngày:** `dailyLimitPerSale` = **100** (CSDL; mặc định mã là 60), ADMIN không giới hạn (`lib/jobs/limits.ts`).
- Khóa xử lý bằng cập nhật có điều kiện (`updateMany ... WHERE status=...`) nên nhiều nơi gọi cùng lúc không làm trùng. Trạng thái giữ nhịp và đếm lỗi nằm trong bộ nhớ: giả định **chạy một bản app duy nhất**.

---

## 5. Quản lý khách hàng và lịch sử
| Câu hỏi | Hiện trạng |
|---|---|
| Lưu hồ sơ khách/brand/logo? | **Có.** Khách: tên, SĐT, ghi chú, sale phụ trách. Thương hiệu: tên. Logo: ảnh gốc, ảnh chuẩn hóa, kích thước, ghi chú |
| Quản lý | Thêm khách/thương hiệu/logo; đổi tên và xóa khách, thương hiệu (`customers/actions.ts`). SALE chỉ sửa khách mình tạo/phụ trách |
| Lịch sử mockup theo khách? | **Có.** Phiên → logo → thương hiệu → khách. `/history` lọc theo từ khóa, sale, khoảng ngày; trong wizard xem các phiên cũ của một logo |
| Đánh dấu mockup khách thích/chốt? | **KHÔNG TÌM THẤY** (không có cột, nút, trạng thái) |
| Tag ngành hàng? | **KHÔNG TÌM THẤY** |
| Tag phong cách? | Chỉ có bảng **`design_styles`** (4 kiểu: Tối giản hiện đại, Sang trọng cao cấp, Trẻ trung năng động, Mộc mạc thủ công), do admin quản lý, dùng ở bước 2. Loại sản phẩm lưu dạng chuỗi tự do `ConsultSession.productType` |

Số liệu hiện có: 1 khách, 4 thương hiệu, 4 logo, 7 phiên (6 catalog, 1 thiết kế), 11 ảnh (7 SHEET + 4 DESIGN, **tất cả SUCCESS**), 4 người dùng (1 ADMIN, 3 SALE).

---

## 6. Trang quản trị chất liệu (`/admin/materials`)
- **Danh sách:** thẻ hoặc danh sách; tìm theo mã/tên/công nghệ in; lọc theo nhóm (nút) và trạng thái (Tất cả / Đang bật / Đã tắt / Cần bổ sung = thiếu ảnh tham chiếu); phân trang 60/trang; bấm ảnh xem lớn (mô tả, độ dày); nút Bật/Tắt; chọn nhiều để xóa.
- **Xóa:** chất liệu **đã từng dùng** để tạo ảnh (có trong phiên/ảnh) thì **không xóa được**, chỉ tắt; xóa thì xóa luôn file ảnh và gỡ khỏi trang mẫu (`lib/materials/delete.ts`).
- **Form thêm/sửa** (`components/materials/material-form.tsx`, lưu qua `POST /api/admin/materials[/id]` → `lib/materials/save.ts`):
| Trường | Kiểu nhập |
|---|---|
| Mã chất liệu | gõ tự do, bắt buộc, duy nhất, ≤ 50 ký tự, không chứa `/` hoặc `\` |
| Tên gọi | gõ tự do, bắt buộc, ≤ 100 |
| Nhóm | **gõ tự do** có gợi ý (`datalist` các nhóm đang có) |
| Công nghệ in | **gõ tự do** có gợi ý (`datalist` các giá trị đang có) |
| Độ dày (mm) | gõ số (0.5 hoặc 0,5), không bắt buộc, hiện nhóm Mỏng/Cao thành/Dày |
| Mô tả | textarea ≤ 2000 ký tự |
| Ảnh mặt trước, ảnh mặt sau | chọn file PNG/JPG/WEBP; có nút **Đổi chỗ** hai ảnh; thêm mới bắt buộc đủ 2 ảnh (kiểm tra ở trình duyệt; máy chủ **không** bắt buộc) |
| Thứ tự hiển thị | số nguyên |
| Đang bật | hộp kiểm |
→ **Không có dropdown cố định nào**; nhóm và công nghệ in đều là chuỗi tự do.
- **Ảnh:** mỗi ảnh ≤ 15 MB, xoay theo EXIF, cạnh dài ≤ 2048 px, lưu JPG (PNG nếu có nền trong suốt); khi đổi ảnh thì ghép lại ảnh tham chiếu, xóa đệm kie, xóa file cũ.
- **Nhập CSV:** `/admin/materials/import`. Cột: mã, tên (bắt buộc), nhóm, công nghệ in, độ dày, mô tả (tiêu đề tiếng Việt hoặc Anh, dấu `,` hoặc `;`, UTF-8). Mã đã có thì **bỏ qua**, không ghi đè. Nhóm trống → "Chưa phân nhóm", công nghệ trống → "Chưa rõ". Không nhập ảnh qua CSV (thêm ảnh sau ở trang sửa).
- **Xuất file chất liệu (CSV/Excel):** **KHÔNG TÌM THẤY**. Chỉ có xuất CSV thống kê (`/api/admin/usage/export`) và tải ZIP/PDF ảnh của phiên.
- Việc nhập 119 mẫu decal ngày 19/11 được thực hiện bằng script tạm (gọi đúng hàm `saveMaterial`), **script không nằm trong repo**.

---

## 7. Dang dở hoặc bất thường (chỉ liệt kê)
1. **111/119 chất liệu chưa thuộc trang mẫu nào**, nên chưa xuất hiện trong ảnh catalog nào. Hiện chỉ có 1 trang mẫu demo (8 chất liệu).
2. **Độ dày (`thicknessMm`) chưa đi vào prompt AI.** Chỉ được lưu, hiện trong giao diện và đưa vào kiến thức của bot Zalo. Prompt hiện chỉ có ảnh + công nghệ in, không có tên/mô tả/độ dày; prompt có chữ "thickness" nhưng không có số liệu cụ thể.
3. **Cột không còn dùng:** `materials.descAi` (8 dòng cũ vẫn có nội dung), `materials.productPhotoPath` (0 dòng; `delete.ts` vẫn dọn nó).
4. **Prompt trong CSDL lệch prompt mặc định trong mã:** CSDL CATALOG v4 ghi "photographed straight-on"; `lib/prompts/defaults.ts` có khối "top-down / FLAT_LOOK" (mỏng, phẳng). Không rõ phiên bản nào mong muốn: KHÔNG CHẮC.
5. **`docs/PLAN.md`** vẫn ghi route `POST /api/uploads/material-image` (không tồn tại; thực tế là `/api/admin/materials`). Comment trong `lib/image-options.ts`: "Kiểm tra lại với docs.kie.ai ở GĐ5" (còn sót).
6. **`descHuman` trống ở cả 119 chất liệu.** Không có mô tả nào hiển thị cho sale/bot.
7. **Khóa cài đặt Zalo cũ còn trong CSDL:** `zalo.inbox`, `zalo.aiDraft`, `zalo.takeoverOnReply` không còn trong schema cài đặt hiện tại (còn lại sau khi bỏ Hộp thư). KHÔNG CHẮC chúng có bị bỏ qua hoàn toàn khi đọc không.
8. **95 thư mục rỗng** trong `storage/materials` (di tích sau khi xóa chất liệu).
9. **Tên/mã không thống nhất** giữa 8 dòng nhập tay và 111 dòng nhập sau (mục 3.3). Có mẫu tên số (`01`..`08` hiển thị "Decal N màu 04"), và "Phồng đen trắng HT P00" (tên thư mục nguồn bị cụt).
10. **Chưa kiểm thử trình duyệt** cho form chất liệu mới (độ dày, đổi chỗ ảnh); logic máy chủ đã chạy thử, giao diện chưa. Có lỗi hiển thị trên dev server từng gặp do cache Turbopack cũ (đã giải thích cho người dùng, khởi động lại là hết).
11. **Chưa commit:** 64 mục thay đổi/chưa theo dõi trong git (bản viết lại Zalo + thay đổi chất liệu); commit gần nhất `b192e3c`.
12. Throttle và bộ đếm lỗi nằm trong bộ nhớ → chỉ đúng khi chạy **một** bản app.
13. README ghi "Việc còn lại: chạy thử thật trên VPS". Máy dev: vitest không chạy được.
14. Không thấy chú thích `TODO/FIXME` nào trong `app`, `lib`, `components` (chỉ có từ khóa trong một comment về Zalo và `nav-config.ts`).

---

## 8. Tóm tắt 10 dòng
1. Đây là web app nội bộ của xưởng in: sale tải logo của khách lên, hệ thống nhờ AI vẽ ảnh mô phỏng logo cắt rời trên nhiều chất liệu decal.
2. Chất liệu do admin nhập: mã, tên, nhóm, công nghệ in, độ dày, ảnh mặt trước và mặt sau; hiện có 119 chất liệu (Nhựa 89, Vải 26, Giả Gương 4).
3. Hệ thống tự ghép hai ảnh mặt trước/sau thành một ảnh tham chiếu duy nhất cho mỗi chất liệu (trái = mặt trước, phải = mặt sau).
4. Admin gom tối đa 10 chất liệu vào một "trang mẫu"; sale chỉ chọn trang mẫu chứ không chọn từng chất liệu. Mỗi trang mẫu ra một ảnh lưới.
5. Khi tạo, hệ thống gửi cho kie.ai (model gpt-image) một đoạn prompt tiếng Anh cố định cùng ảnh logo và các ảnh tham chiếu; prompt không chứa tên hay mô tả chất liệu, chỉ có hình và công nghệ in.
6. Ảnh về sau 1-3 phút, hệ thống tự thêm đầu trang (tên thương hiệu), nhãn từng ô và chân trang, rồi lưu vào ổ đĩa kèm đầy đủ thông tin (prompt, chất liệu, người tạo, chi phí).
7. Từ ảnh catalog khách chọn chất liệu ưng ý, sale làm bước 2: tạo ảnh sản phẩm thật (móc khóa, ví...) theo các kiểu thiết kế do admin định nghĩa.
8. Có hạn mức lượt tạo mỗi ngày cho sale, tự thử lại khi lỗi, giữ nhịp để không bị kie.ai chặn, tải ZIP/PDF và gửi ảnh thẳng vào nhóm Zalo.
9. Hồ sơ khách (khách > thương hiệu > logo) và lịch sử phiên đều được lưu; chưa có đánh dấu "khách chốt", chưa có tag ngành hàng.
10. Việc nổi bật còn lại: 111 chất liệu mới chưa nằm trong trang mẫu nào, độ dày chưa đưa vào prompt AI, và chưa chạy thử trên VPS thật.
