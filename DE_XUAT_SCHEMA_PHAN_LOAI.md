# GIAI ĐOẠN A, BƯỚC 1: ĐỀ XUẤT SCHEMA PHÂN LOẠI CHẤT LIỆU

Trạng thái: **chỉ là đề xuất, chưa sửa code, chưa đụng CSDL.** Chờ bạn duyệt rồi mới sang Bước 2.
Cơ sở: BAO_CAO_HIEN_TRANG.md và việc xem lại cả 119 ảnh tham chiếu (mặt trước | mặt sau).

---

## 0. Điểm cần bạn quyết (đọc phần này trước)

| # | Câu hỏi | Tôi đề xuất |
|---|---|---|
| Q1 | `surfaceEffect` là **một** danh sách, hay tách thành hai trục "độ bóng/chất bề mặt" và "vân/hoa văn"? | **Một danh sách** (đúng ý bạn), chọn "đặc điểm nổi bật nhất". Nhược điểm: mẫu vừa nhũ vừa vân carbon chỉ chọn được một; chi tiết còn lại nằm trong `aiVisualNote`. Nếu muốn lọc chính xác hơn thì tách hai trục, nhưng thêm một cột và nhiều việc nhập hơn |
| Q2 | Các mẫu tên "Nhung", "Phồng", "Xù" (khoảng 25 mẫu) | Xem mục 2.3. Ảnh cho thấy **Nhung và Phồng nhìn gần như phẳng, mờ** (khác "Xù" nhìn rõ lông). Tên là phân loại của nhà cung cấp, không phải thứ nhìn thấy. Tôi đề xuất vẫn giữ giá trị "Nhung", "Phồng" trong `surfaceEffect` (để sale lọc theo cách gọi quen thuộc) nhưng **`aiVisualNote` chỉ tả cái nhìn thấy**, và để độ tin cậy TRUNG_BINH |
| Q3 | Thêm loại danh mục thứ 6 là `SERIES` (mã dòng nhà cung cấp: ZY, HT, H, YYB, YPS...) để `seriesCode` cũng là dropdown, lọc được | **Có**, vì bạn muốn mọi trường phân loại là dropdown |
| Q4 | Chính tả nhãn "Giả gương" (bạn viết thường) khác giá trị hiện có "Giả Gương" (4 mẫu) | Dùng "Giả gương". Khi lưu, cột cũ `groupName` của 4 mẫu này đổi chữ hoa. Ảnh đã tạo không đổi (có bản chụp). Nếu muốn giữ nguyên "Giả Gương" thì báo tôi |
| Q5 | Khi nhập CSV ở chế độ cập nhật: ô để trống nghĩa là "giữ nguyên" hay "xóa trắng"? | **Giữ nguyên**; muốn xóa thì ghi `[xoa]`. Tránh mất dữ liệu vì lỡ để trống |

---

## 1. Thiết kế dữ liệu

### 1.1 Bảng danh mục `material_options` (admin quản lý, không hard-code giá trị)
```prisma
enum MaterialOptionType {
  BASE_MATERIAL   // Nhựa, Vải, Giả gương
  TECHNIQUE       // Khắc laser, Cắt laser, In UV
  SURFACE_EFFECT
  COLOR_FAMILY
  STYLE_TAG
  SERIES          // mã dòng nhà cung cấp (đề xuất thêm, câu Q3)
}

model MaterialOption {
  id        String             @id @default(cuid())
  type      MaterialOptionType
  value     String             @db.VarChar(60)   // mã không dấu, ví dụ "khac-laser". KHÔNG đổi sau khi tạo
  label     String             @db.VarChar(100)  // tiếng Việt hiển thị, đổi được
  sortOrder Int                @default(0)
  isActive  Boolean            @default(true)
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  @@unique([type, value])
  @@unique([type, label])
  @@index([type, isActive, sortOrder])
  @@map("material_options")
}
```
Quy tắc: không xóa giá trị đang được dùng (chỉ tắt `isActive`); giá trị bị tắt vẫn hiện đúng trên chất liệu cũ nhưng không chọn được cho chất liệu mới. `type` là enum cứng vì mỗi type là một "trục phân loại" gắn với cột trong code; giá trị bên trong thì do admin thêm tự do.

### 1.2 Cột mới trong `materials`
```prisma
enum ColorCount { ONE TWO }

// thêm vào model Material (tất cả đều nullable để migration không làm vỡ dữ liệu cũ)
baseMaterial      String?    @db.VarChar(60)   // value của BASE_MATERIAL
technique         String?    @db.VarChar(60)   // value của TECHNIQUE
surfaceEffect     String?    @db.VarChar(60)
colorCount        ColorCount?
frontColorName    String?    @db.VarChar(100)  // chữ tự do: "đen ánh cầu vồng", "xanh navy"
frontColorFamily  String?    @db.VarChar(60)   // value của COLOR_FAMILY
backColorName     String?    @db.VarChar(100)
backColorFamily   String?    @db.VarChar(60)
seriesCode        String?    @db.VarChar(60)   // value của SERIES
aiVisualNote      String?    @db.Text          // 1 câu tiếng Anh, chỉ tả cái nhìn thấy
needsReview       Boolean    @default(false)
reviewNote        String?    @db.Text
styleTags         MaterialStyleTag[]

@@index([baseMaterial]) @@index([technique]) @@index([surfaceEffect])
@@index([colorCount])   @@index([needsReview])
```
`descHuman` đã có sẵn (đang trống ở cả 119), sẽ được điền ở Bước 2. `groupName`, `printTech`, `descAi`, `productPhotoPath` giữ nguyên, **không xóa**; `descAi` và `productPhotoPath` chỉ ghi chú "không dùng" trong schema (đã có).

```prisma
model MaterialStyleTag {
  materialId String
  value      String   @db.VarChar(60)   // value của STYLE_TAG
  material   Material @relation(fields: [materialId], references: [id], onDelete: Cascade)
  @@id([materialId, value])
  @@index([value])
  @@map("material_style_tags")
}
```

### 1.3 Điều chỉnh so với hướng bạn nêu (và lý do)
1. **Lưu `value` (chuỗi) chứ không dùng khóa ngoại tới `material_options`.** CSV chỉ cần đọc/ghi `khac-laser`, dễ chỉnh bằng Excel; hai cột cũ cần ghi song song nhãn tiếng Việt (mục 3.2); không cần 5 quan hệ trùng tên trong Prisma. Đổi lại phải kiểm tra tính hợp lệ ở tầng ứng dụng (form chỉ cho chọn từ danh mục, nhập CSV từ chối giá trị lạ) và `value` không được sửa (giao diện khóa ô này). Nếu bạn thích ràng buộc ở tầng CSDL thì đổi sang khóa ngoại được, chi phí thêm khoảng nửa ngày.
2. **`styleTags` dùng bảng nối `material_style_tags`, không dùng Json.** Lọc "có tag X" bằng truy vấn thường, chắc chắn chạy trên MySQL/Prisma; CSV ghi `toi-gian|sang-trong`.
3. **Thêm type `SERIES`** (câu Q3).
4. **`colorCount` mang nghĩa "số lớp màu":** `ONE` = một màu cho cả hai mặt, `TWO` = hai mặt khác màu (khắc lộ màu lớp sau). Lấy từ chữ "1 màu/2 màu" trong tên; **nếu ảnh mâu thuẫn với tên thì không sửa mà đánh `needsReview`** (đã thấy: BAC-HT-10881-25 ghi "1 màu" nhưng mặt trước bạc, mặt sau trắng; BE-HT-10539-42 ghi "2 màu" nhưng hai mặt cùng tông kem).
5. **CSV nhập cập nhật khớp theo `id` nếu có, nếu không thì theo `code`.** Bản xuất sẽ có cột `id`, nhờ đó đổi được mã (cần cho 8 mẫu mã nhập tay) mà không bị tạo bản ghi mới. Mã nhà cung cấp (ZY-, HT-, H...) giữ nguyên theo yêu cầu của bạn.
6. **Độ dày (Mỏng/Cao thành/Dày) tiếp tục tính từ `thicknessMm`**, không thêm cột.

### 1.4 Lưu thế nào, ảnh hưởng gì, có làm vỡ chức năng hiện tại không
- **Migration chỉ thêm** (1 bảng enum+danh mục, 1 bảng tag, 10 cột nullable). Không đổi hay xóa cột nào, nên mọi truy vấn hiện có chạy y như cũ.
- **Cách giữ chức năng cũ chạy:** giai đoạn này `groupName` và `printTech` **vẫn là nguồn mà toàn bộ code cũ đọc** (30 file: ảnh kết quả vẽ nhãn từ `layoutSnapshot`, prompt `technique: ...`, bot Zalo, trang mẫu, wizard). Khi lưu chất liệu (form hoặc CSV) hệ thống **ghi song song**: `groupName` = nhãn của `baseMaterial`, `printTech` = nhãn của `technique`. Nhờ vậy không file nào ngoài khu vực chất liệu phải sửa.
- **Chỉ các file sau thay đổi ở Bước 3:** `lib/materials/save.ts`, `components/materials/material-form.tsx`, trang và bảng danh sách chất liệu (lọc, nhãn), `lib/csv/materials.ts` + hành động nhập, thêm trang admin danh mục, thêm route xuất CSV.
- **Không đổi trong giai đoạn A:** prompt, trang mẫu, luồng tạo ảnh. `aiVisualNote` và các cột mới **chưa được đưa vào prompt** (để một giai đoạn sau quyết).
- **Rủi ro nhỏ:** (a) 5 mẫu đang có `printTech` là "In UV" do nhập tay, sẽ giữ nguyên giá trị (bạn yêu cầu vậy); (b) khi form chuyển sang dropdown, mẫu cũ chưa có `baseMaterial/technique` thì form hiển thị trống: Bước 3 nạp trước từ giá trị hiện có nên không còn mẫu nào trống.
- **Sao lưu trước migration:** tạo `materials_backup_20261119` (sao nguyên bảng) **và** xuất `mysqldump` ra thư mục `backups/` (Bước 3.1).

---

## 2. Giá trị danh mục đề xuất (dựa trên việc xem ảnh thật)

### 2.1 BASE_MATERIAL và TECHNIQUE (giữ giá trị hiện có)
| value | label | hiện có |
|---|---|---|
| nhua | Nhựa | 89 |
| vai | Vải | 26 |
| gia-guong | Giả gương | 4 |
| khac-laser | Khắc laser | 102 |
| cat-laser | Cắt laser | 12 |
| in-uv | In UV | 5 |

Lưu ý: 12 mẫu "Cắt laser" là do tôi gán theo quy tắc "mỏng < 0.45 mm chỉ cắt được" khi nhập 119 mẫu (không phải dữ liệu nhà cung cấp); 5 mẫu "In UV" là bạn nhập tay. Bước 2 sẽ đánh dấu những mẫu mà technique mâu thuẫn với độ dày để bạn xem.

### 2.2 COLOR_FAMILY (16 giá trị)
Từ danh sách bạn nêu, điều chỉnh theo màu thực tế trong ảnh:
| value | label | ghi chú / ví dụ có thật trong ảnh |
|---|---|---|
| trang | Trắng | H0007, TRANG-HT-10539-7, XU-TRANG |
| kem-be | **Kem / be** | KEM-TRON, 11074-19, BE-HT-10539-42 (tách khỏi "Nâu": kem và nâu khác hẳn) |
| den | Đen | H0006, ZY-HP002, NHUNG-DEN |
| xam | Xám | VAN-DA-XAM-11074, ZY-HE003-06, ZY-YYB039 |
| bac | Bạc | SU-BAC, ZY-12, BAC-XUOC |
| vang-kim | Vàng kim | 123c (Su vàng), TRANG-GUONG-VANG, YYB-047 |
| vang | Vàng | NHUNG-VANG, VANG-CHANH, VANG-DAT |
| cam | Cam | CAM-HT-10539-47, NHUNG-CAM |
| do | Đỏ | 11074-25 (đỏ đô), DO-TUOI, PHONG-DO |
| hong | Hồng | HONG-NHAT, ZY-10748-6 (hồng ánh đồng), NHUNG-HONG |
| tim | Tím | TIM-HT-10539-83 |
| xanh-duong | Xanh dương | 11074-14 (navy), NHUNG-THAN-NHAT, XANH-THAN |
| xanh-ngoc | **Xanh ngọc** | XANH-NGOC-HT-10881-16, PHONG-DUA-LUOI (thêm vì ngọc nằm giữa xanh lá và xanh dương) |
| xanh-la | Xanh lá | PHONG-XANH-LA, NHUNG-XANH-LA |
| nau | Nâu | VAN-DA-XAM-11074 (xám nâu), NHUNG-DO-DO (có thể đỏ đô thay vì nâu) |
| nhieu-mau | Nhiều màu | lw102, yps3002A/B, CARO-BE-DO-DEN |

### 2.3 SURFACE_EFFECT (16 giá trị, xây từ các nhóm nhìn thấy trong ảnh)
Danh sách mẫu của bạn (Trơn mờ, Bóng, Nhũ/lấp lánh, Gương/kim loại, Nhung, Caro/hoa văn, Phồng/nổi, Giả da, Khác) **không khớp** hoàn toàn: "Caro/hoa văn" quá rộng (gồm caro, carbon, sóng, xoáy, rằn ri, nứt, loang) và "Gương/kim loại" gộp hai thứ rất khác nhau (gương phản chiếu và kim loại xước mờ). Đề xuất:
| value | label | ví dụ có thật trong ảnh |
|---|---|---|
| tron-mo | Trơn mờ | H0007, ZY-HP002, ZY-YYB036, ZY-YYB039, nhiều màu HT |
| bong | Bóng | H0006, SU-DEN, 11078-18 (xanh navy), ZY-E003 (xám) |
| guong | Gương | 123c (Su vàng), SU-BAC, TRANG-GUONG-VANG-HT-10472-12 |
| kim-loai-xuoc | Kim loại xước / ánh kim | ZY-10748-2 (bạc xước), ZY-10748-6 (hồng ánh kim), ZY-12, BAC-NHAN, BAC-HT-10881-25 |
| nhu-lap-lanh | Nhũ / lấp lánh | LAP-LANH-DEN-LW401, KT-BAC, KT-DEN, KT-MIX, HONG-NHU-BAC-HT-F889, NHU-VANG-DEN-HT-F258 |
| anh-cau-vong | Ánh cầu vồng | lw102, ZY-E001, `05`, HB001-10, CAU-VONG-TO-HT-11031-8 |
| van-da-hat | Vân da / hạt nhám | 11074-1, 11074-14, 11074-19, 11074-25, VAN-DA-TRANG, ZY-YYB056, ZY-YYB006 |
| van-dap | Vân dập (carbon, lưới, sóng, xoáy, rằn ri) | YYB-046/047/048, ZY-17, ZY-15, ZY-YYB080/090 (sóng), ZY-YYB016/018 (xoáy), ZY-YYB030/031 (rằn ri), ZY-YYB041/043 (chéo) |
| nut-ran | Nứt / rạn | BAC-NUT, BAC-HOA-TIET, NHUNG-XD-NUT-HT-F247, PHONG-DUA-LUOI |
| loang | Loang / vân mây | yps3002A, yps3002B, PHONG-DEN-TRANG-HT-P00, PHONG-DX-HT-P002 |
| caro-ke | Caro / kẻ ô | 123, 123b, LUOI-VANG, CARO-BE-DO-DEN, CARO-XANH-TRANG |
| vai-det | Vải dệt / jeans | lw103 (jeans đen), `01` (jeans xanh), `02`, `03` (dệt chuyển màu) |
| nhung | Nhung | NHUNG-* (khoảng 14 mẫu), theo tên nhà cung cấp (xem Q2) |
| phong | Phồng / nổi | PHONG-* (khoảng 8 mẫu), theo tên nhà cung cấp (xem Q2) |
| xu-long | Xù / lông | XU-TRANG, XU-DEN, XU-DO-DO (nhìn rõ lông) |
| khac | Khác | những mẫu không xếp được vào trên (kèm `needsReview`) |

Phát hiện quan trọng khi xem ảnh: **các mẫu tên "Nhung" và "Phồng" nhìn gần như một mặt màu phẳng, mờ** (ví dụ NHUNG-XANH-LA, NHUNG-VANG, PHONG-TRANG, PHONG-XANH-THAN), ở độ phân giải ảnh hiện có không thấy hạt nhung hay độ phồng. Chỉ nhóm "Xù" nhìn rõ chất liệu. Nghĩa là tên nhà cung cấp mô tả loại hàng chứ không chắc mô tả bề mặt nhìn thấy; vì thế (Q2) giữ giá trị theo tên, nhưng `aiVisualNote` tả đúng cái thấy và độ tin cậy ghi TRUNG_BINH.
**Giới hạn của một danh sách duy nhất:** nhiều mẫu mang hai đặc điểm (ví dụ ZY-YYB090 bạc, vân sóng, mờ; BAC-NUT bạc, nứt, ánh kim). Chỉ chọn được một giá trị chính; phần còn lại nằm ở `aiVisualNote` (Q1).

### 2.4 STYLE_TAG (giữ 7 giá trị bạn nêu)
toi-gian = Tối giản, sang-trong = Sang trọng, tre-trung = Trẻ trung, the-thao = Thể thao, streetwear = Streetwear, moc-mac = Mộc mạc, dong-phuc = Đồng phục công ty. Gán 1-3 tag/mẫu là **ý kiến chủ quan**, nên ở Bước 2 mọi tag đều để độ tin cậy tối đa TRUNG_BINH và bạn là người chốt.

### 2.5 SERIES (mã dòng nhà cung cấp, rút từ mã/tên)
Quy tắc tách (áp theo thứ tự):
| Quy tắc | seriesCode | số mẫu (ước tính từ mã hiện có) |
|---|---|---|
| mã bắt đầu `ZY-` (kể cả ZY-HT-001) | ZY | ~27 |
| mã chứa `-HT-` hoặc bắt đầu `HT-` | HT | ~56 (HT có thể là "hợp tác", **KHÔNG CHẮC**, chỉ biết từ tên thư mục nguồn) |
| mã dạng `H` + số (H0006, H0007) | H | 2 |
| mã bắt đầu `YYB-` (không có ZY phía trước) | YYB | 3 |
| mã bắt đầu `yps` | YPS | 2 |
| mã `LW...`/`lw...` | LW | 3 |
| mã `11074-...` và `VAN-DA-*-11074` | 11074 | 6 |
| `11078-18` | 11078 | 1 |
| `SU-*`, `123c` (Su vàng) | SU | 3 |
| `HB001-10` | HB | 1 |
| còn lại (`01`-`08`, `123`, `123b`, KEM-TRON, LUOI-VANG, CARO-*, NHUNG-DO-DO) | để trống | ~13 (không đánh needsReview, vì series không bắt buộc) |

---

## 3. Kế hoạch triển khai sau khi bạn duyệt (không làm ở Bước 1)

### 3.1 Bước 2 (xuất `phan_loai_de_xuat.csv`, chưa ghi CSDL)
Cột CSV (UTF-8 có BOM):
`id, code, name, thicknessMm, [giá trị hiện có] groupName, printTech, baseMaterial, technique, surfaceEffect, colorCount, frontColorName, frontColorFamily, backColorName, backColorFamily, seriesCode, styleTags (dạng a|b|c), aiVisualNote, descHuman, confidence (CAO/TRUNG_BINH/THAP), needsReview, reviewNote, de_xuat_code_moi, de_xuat_ten_moi`.
Cách làm: với mỗi mẫu mở ảnh mặt trước và mặt sau (đã xem toàn bộ 119 ảnh để lập danh mục), cộng với tên/mã. Chất lượng ảnh nguồn cần lưu ý: **nhiều ảnh có thước, bàn tay, nền vải/đá, chữ in trên mặt sau**; màu thật có thể lệch vì ánh sáng. Mẫu nào ảnh quá nhỏ/tối/bị che sẽ để `confidence = THAP` và `needsReview = true`.
Những danh sách riêng sẽ có trong báo cáo Bước 2: cặp nghi trùng (ZY-E003 / ZY-E003-2; ZY-YYB039 / ZY-YYB039-2), 8 mẫu mã nhập tay kèm mã/tên sạch đề xuất, tên bị cụt ("Phồng đen trắng HT P00" tên thư mục nguồn bị cắt, có thể là P001), mẫu mà technique mâu thuẫn độ dày, mẫu mà "1 màu/2 màu" mâu thuẫn ảnh; cùng thống kê theo surfaceEffect, colorCount, số dòng needsReview.

### 3.2 Bước 3 (sau khi bạn sửa CSV), đúng thứ tự bạn nêu
1. Sao lưu (bảng `materials_backup_20261119` + `mysqldump`), migration, nạp danh mục (các giá trị trong mục 2).
2. Nhập CSV ở chế độ **cập nhật** (khớp `id` rồi `code`), ghi song song `groupName`/`printTech`.
3. Form chất liệu: dropdown cho baseMaterial, technique, surfaceEffect, colorCount, frontColorFamily, backColorFamily, seriesCode; chọn nhiều cho styleTags. Tên màu (`frontColorName`, `backColorName`) và `aiVisualNote`, `descHuman`, `reviewNote` vẫn là chữ nhập tự do vì là mô tả, không phải phân loại.
4. Trang admin danh mục (thêm/sửa nhãn/tắt từng giá trị theo type; `value` bị khóa).
5. Danh sách chất liệu: bộ lọc baseMaterial, technique, surfaceEffect, colorCount, colorFamily, styleTag, needsReview; nhãn hiển thị.
6. Xuất CSV toàn bộ chất liệu cùng định dạng với nhập.
7. Import CSV hỗ trợ cột mới + chế độ cập nhật (Q5).
8. `npm run build`, kiểm tra không lỗi; báo cáo số bản ghi trước/sau (phải đủ 119).

### 3.3 Việc cố ý **không** làm ở giai đoạn A
Xóa `descAi`/`productPhotoPath`; sửa prompt, trang mẫu hay luồng tạo ảnh; đưa `aiVisualNote` vào prompt; đổi `code` của mã nhà cung cấp.
