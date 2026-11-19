# BÁO CÁO BƯỚC 2: ĐỀ XUẤT PHÂN LOẠI 119 CHẤT LIỆU (CHƯA GHI CSDL)

File dữ liệu: **phan_loai_de_xuat.csv** (UTF-8 có BOM, 119 dòng, 27 cột). CSDL, code, prompt chưa bị thay đổi.
Cách làm: mở ảnh tham chiếu (mặt trước | mặt sau) của từng mẫu, kết hợp tên và mã. Mọi giá trị đều chỉ tả **cái nhìn thấy trong ảnh**; chỗ không chắc đã hạ độ tin cậy và đánh `needsReview`.

## 1. Đọc file CSV thế nào
- Cột mới theo hai trục đã duyệt: `surfaceFinish` (chất bề mặt) và `surfacePattern` (họa tiết).
- Độ tin cậy: `confidence` (tổng thể), `frontColorConfidence` và `backColorConfidence` (riêng từng mặt màu; **THAP** = màu chưa chắc do ánh sáng/nền ảnh, tôi không đoán thêm).
- `photoIssue`: các vấn đề ảnh, nối bằng `|`: CO_THUOC, CO_TAY, NEN_LAN, MAU_LECH, MO, KHONG_THAY_CHAT_LIEU. Gần như mọi ảnh đều có thước (CO_THUOC) nên **không** làm đánh dấu needsReview. Chỉ các lỗi nặng (CO_TAY, MAU_LECH, MO, KHONG_THAY_CHAT_LIEU) tự động đặt needsReview = TRUE.
- Mẫu Nhung/Phồng nhìn phẳng: `needsReview = TRUE`, `photoIssue` có KHONG_THAY_CHAT_LIEU, `reviewNote` bắt đầu bằng đúng câu "Cần chụp lại ảnh cận, nghiêng sáng để thấy chất liệu".
- `groupName`, `printTech` là giá trị hiện có (dùng để đối chiếu); `baseMaterial`, `technique` suy ra 1-1 từ hai cột đó (khi ghi sẽ ghi song song ngược lại: groupName = nhãn của baseMaterial, printTech = nhãn của technique).
- `de_xuat_code_moi`, `de_xuat_ten_moi`: chỉ có ở những mẫu tôi đề xuất đổi (xem mục 4). Mã nhà cung cấp (ZY-, HT-, H...) **không** đề xuất đổi.
- `seriesCode` rút theo quy tắc ở đề xuất Bước 1; `styleTags` là ý kiến chủ quan, bạn là người chốt.

## 2. Giá trị danh mục sau khi chia hai trục
### 2.1 SURFACE_FINISH (11 giá trị)
| value | label | số mẫu | mã ví dụ thật |
|---|---|---|---|
| mo | Mờ | 46 | 11078-18, yps3002A, yps3002B-0.5, H0007 |
| bong | Bóng | 7 | 123b, H0006, YYB-048, LUOI-VANG |
| guong | Gương | 4 | 123c, SU-DEN, SU-BAC, TRANG-GUONG-VANG-HT-10472-12 |
| anh-kim-xuoc | Ánh kim / xước | 11 | YYB-047, ZY-YYB041, BAC-HOA-TIET-HT-10981-226, BAC-NHAN-HT-10981-146 |
| nhu-lap-lanh | Nhũ / lấp lánh | 7 | lw102, LAP-LANH-DEN-LW401, KT-BAC-HT-10510-5, HONG-NHU-BAC-HT-F889 |
| anh-cau-vong | Ánh cầu vồng | 4 | 05, CAU-VONG-TO-HT-11031-8, HB001-10, ZY-E001 |
| nhung-long | Nhung / lông | 17 | NHUNG-HONG-HT-10725-37, NHUNG-XANH-LA-HT-10725-8, NHUNG-XL-DAM-HT-10725-43, NHUNG-DO-DO |
| phong-noi | Phồng / nổi | 8 | PHONG-TRANG-HT-10963-3, PHONG-XANH-THAN-HT-10963-10, PHONG-DEN-HT-10963-1, PHONG-DUA-LUOI-HT-11160-7 |
| gia-da | Giả da / hạt nhám | 9 | 11074-1, 11074-14, 11074-19, 11074-25 |
| vai-det | Vải dệt / jeans | 6 | 123, lw103, CARO-XANH-TRANG, 01 |
| khac | Khác | 0 | (chưa có mẫu nào) |

Quy ước phân biệt hai trục: **kết cấu hạt/vân ở bề mặt (hạt da, hạt nhám)** thuộc finish `gia-da`; **họa tiết hình/vẽ trên bề mặt** thuộc pattern. Vì vậy 11074-xx (da hạt) là finish Giả da, pattern Trơn. Tôi thêm 2 giá trị finish so với ví dụ của bạn: **Ánh cầu vồng** (đổi màu theo góc nhìn) và **Vải dệt / jeans** (bề mặt dệt thật), vì có 4 và 6 mẫu không xếp được vào giá trị nào khác.

### 2.2 SURFACE_PATTERN (9 giá trị)
| value | label | số mẫu | mã ví dụ thật |
|---|---|---|---|
| tron | Trơn | 78 | 11078-18, 123c, 11074-1, 11074-14 |
| caro | Caro / ô vuông | 7 | 123, lw103, 123b, LUOI-VANG |
| ke-soc | Kẻ sọc | 0 | (chưa có mẫu nào) |
| hinh-hoc | Hoa văn hình học (carbon, tổ ong, đan chéo) | 7 | YYB-048, YYB-046, YYB-047, ZY-15 |
| song-xoay-ran-ri | Hoa văn lượn (sóng, xoáy, rằn ri) | 7 | ZY-YYB016, ZY-YYB031, ZY-YYB080, PHONG-DX-HT-P002 |
| nut-ran | Nứt / rạn | 4 | BAC-HOA-TIET-HT-10981-226, BAC-NUT-HT-10981-154, PHONG-DUA-LUOI-HT-11160-7, NHUNG-XD-NUT-HT-F247 |
| van-nhien | Vân tự nhiên (đá, mây, loang) | 6 | yps3002A, yps3002B-0.5, VAN-DA-XAM-11074, HONG-NHU-BAC-HT-F889 |
| chuyen-mau | Chuyển màu | 8 | lw102, 05, CAU-VONG-TO-HT-11031-8, HB001-10 |
| khac | Khác | 2 | BAC-NHAN-HT-10981-146, BAC-TO-HT-11031-1 |

- **Kẻ sọc: chưa có mẫu nào** trong 119 mẫu (02, 03 là sọc loang chuyển màu nên xếp vào Chuyển màu). Tôi vẫn giữ giá trị vì bạn đã nêu; bỏ cũng được.
- Tôi chia "Hoa văn" của bạn thành 2 giá trị (hình học và lượn/rằn ri) và thêm "Nứt / rạn" vì mỗi loại có nhiều mẫu thật và khác nhau rõ.

### 2.3 COLOR_FAMILY, STYLE_TAG, SERIES (số mẫu, đếm theo mặt trước + mặt sau)
| họ màu | mặt trước | mặt sau |
|---|---|---|
| trang (Trắng) | 12 | 19 |
| kem-be (Kem / be) | 4 | 4 |
| den (Đen) | 34 | 48 |
| xam (Xám) | 13 | 14 |
| bac (Bạc) | 10 | 2 |
| vang-kim (Vàng kim) | 3 | 0 |
| vang (Vàng) | 4 | 5 |
| cam (Cam) | 2 | 1 |
| do (Đỏ) | 8 | 5 |
| hong (Hồng) | 5 | 4 |
| tim (Tím) | 1 | 2 |
| xanh-duong (Xanh dương) | 11 | 12 |
| xanh-ngoc (Xanh ngọc) | 2 | 2 |
| xanh-la (Xanh lá) | 4 | 0 |
| nau (Nâu) | 0 | 1 |
| nhieu-mau (Nhiều màu) | 6 | 0 |

Style tag: Tối giản 37, Sang trọng 57, Trẻ trung 35, Thể thao 35, Streetwear 32, Mộc mạc 9, Đồng phục công ty 11. Series: 11074 7, (để trống) 15, LW 3, SU 3, YPS 2, H 2, YYB 3, HT 56, ZY 27, HB 1.

## 3. Thống kê
- **colorCount:** ONE 67, TWO 52. (114 mẫu lấy từ chữ "1 màu/2 màu" trong tên; 5 mẫu tên không có chữ này lấy từ tên thư mục nguồn: Caro đen trắng 1 màu, Lấp lánh nhiều màu 2 màu, Jeans 2 màu, Lưới bạc 2 màu, Su vàng 2 màu.)
- **needsReview = TRUE: 46/119 dòng** (39%).
  - Tên chất liệu mà ảnh nhìn phẳng (Nhung, Phồng, 1 mẫu Vân đá; có câu chụp lại ảnh cận): 23 dòng.
  - Có tay che (CO_TAY): 6; màu lệch (MAU_LECH): 11; nền lẫn (NEN_LAN): 11; mờ (MO): 0.
  - Tên số, chưa rõ mã/tên thật (01-08): 8 dòng.
  - Ghi 1 màu/2 màu mâu thuẫn ảnh, độ dày vượt khung, mẫu bẩn/hỏng: xem mục 4.
- **confidence tổng thể:** CAO 46, TRUNG_BINH 73, THAP 0. (Không có mẫu nào THAP tổng thể; những chỗ thật sự chưa chắc là **màu**, nằm ở cột confidence màu.)
- **Độ tin cậy màu:** mặt trước CAO 70 / TRUNG_BINH 39 / THAP 10; mặt sau CAO 67 / TRUNG_BINH 40 / THAP 12.
- **photoIssue:** CO_THUOC 119, KHONG_THAY_CHAT_LIEU 23, MAU_LECH 11, CO_TAY 6, NEN_LAN 11; ảnh không có vấn đề nào: 0 (mọi ảnh đều có thước).

## 4. Các danh sách riêng
### 4.1 Cặp nghi trùng
Cả hai cặp **không phải bản trùng**: ảnh cho thấy hai mẫu khác nhau dùng chung tên/mã nhà cung cấp.
| mã A | mã B | mẫu A | mẫu B |
|---|---|---|---|
| ZY-E003 | ZY-E003-2 | 2 màu, xám / đen mờ, 0.76 mm | 1 màu, đen / đen, 0.76 mm |
| ZY-YYB039 | ZY-YYB039-2 | 2 màu, xám nhạt rằn ri / đen mờ, 0.78 mm | 2 màu, xám thiếc (pewter) / đen mờ, 0.74 mm |

Đề xuất chỉ đổi **tên** (không đổi mã, theo yêu cầu của bạn) để phân biệt: ZY-E003 -> "ZY E003 (xám/đen) 2 màu"; ZY-E003-2 -> "ZY E003 (đen) 1 màu"; ZY-YYB039 -> "ZY YYB039 (rằn ri xám) 2 màu"; ZY-YYB039-2 -> "ZY YYB039 (xám thiếc) 2 màu". Cột de_xuat_ten_moi đã điền.
Ngoài ra cần để ý: ZY-15 (1 màu) và ZY-17 (2 màu) có họa tiết tổ ong gần như giống nhau, và các số mã nhà cung cấp bị dùng chung cho các màu khác nhau (có thể do mã nguồn trùng thật hoặc ghi nhầm):
- Số mã **10881-2**: TRANG-HT-10881-2 (trắng); DEN-HT-10881-2 (đen)
- Số mã **10510-5**: KT-BAC-HT-10510-5 (bạc kim tuyến); KT-DEN-HT-10510-5 (đen kim tuyến)
- Số mã **10748-2**: BAC-XUOC-HT-10748-2 (bạc xước); ZY-10748-2 (bạc xước)

### 4.2 8 chất liệu mã nhập tay và đề xuất mã/tên sạch
| mã hiện tại | tên hiện tại | mã đề xuất | tên đề xuất | lý do |
|---|---|---|---|---|
| 123 | Caro đen trắng | CARO-DEN-TRANG | Caro đen trắng 1 màu | Mã 123 do nhập tay, nguồn không có mã. |
| 123b | Lưới bạc | LUOI-BAC | Lưới bạc 2 màu | Mã 123b do nhập tay, nguồn không có mã. |
| 123c | Su vàng | SU-VANG | Su vàng 2 màu | Mã 123c do nhập tay, cùng dòng SU với SU-DEN, SU-BAC. |
| lw102 | Lấp lánh nhiều màu | LW102 | Lấp lánh nhiều màu LW102 2 màu | Mã LW102 có thật trong tên thư mục nguồn, chỉ chuẩn hóa viết hoa. |
| lw103 | Jeans OBV đen | JEANS-OV-DEN | Jeans ÔV đen 2 màu | Mã lw103 không có trong nguồn (thư mục nguồn chỉ ghi 'Jeans ÔV đen'); tên hiện ghi sai 'OBV'. |
| yps3002A | yps3002A 2 màu | YPS3002A | YPS3002A 2 màu | Chuẩn hóa viết hoa theo mã nguồn YPS3002A. |
| yps3002B-0.5 | yps3002B-0.5 2 màu | YPS3002B-0.5 | YPS3002B 2 màu | Chuẩn hóa viết hoa; '-0.5' có thể là độ dày danh nghĩa, giữ lại theo tên nguồn. |
| 11078-18 | Decal 2 màu 11078-18 | 11078-18 | Decal 2 màu 11078-18 | Đã sạch, không đổi. |

Lưu ý: đổi mã 123, 123b, 123c, lw102, lw103, yps3002A, yps3002B-0.5 chỉ ảnh hưởng nhãn hiển thị; ảnh đã tạo giữ nguyên mã cũ nhờ bản chụp (`layoutSnapshot`), liên kết trang mẫu dùng id, không dùng mã. CSV nhập (khớp theo `id`) sẽ đổi được mã.

### 4.3 Tên bị cụt hoặc viết tắt chưa rõ
- **PHONG-DEN-TRANG-HT-P00**: tên thư mục nguồn bị cụt ("P00"), có thể là P001. Đề xuất tên "Phồng đen trắng HT P001 2 màu", **cần bạn xác nhận**. Mã nguồn giữ nguyên.
- Ký hiệu **ĐX** (PHONG-DX-HT-P002) và **XĐ** (NHUNG-XD-NUT-HT-F247) chưa rõ nghĩa. **XL** (Nhung XL đậm) đoán là "xanh lá" (ảnh khớp: xanh lá rất đậm).
- Tên số 01 đến 08 (không có mã/tên thật), KEM-TRON ("chưa rõ mã" theo thư mục nguồn), NHUNG-DO-DO (không có mã nhà cung cấp).

### 4.4 technique mâu thuẫn độ dày / quy ước
- Mẫu mỏng (< 0.45 mm) mà technique không phải "Cắt laser": lw102 (in-uv, 0.32 mm).
- Mẫu ≥ 0.45 mm mà technique là "Cắt laser": không có.
- 5 mẫu technique "In UV" (nhập tay, giữ nguyên theo yêu cầu): 123 (0.62 mm), lw102 (0.32 mm), lw103 (0.71 mm), yps3002A (0.82 mm), yps3002B-0.5 (0.82 mm). Riêng lw102 (0.32 mm) là tấm mỏng; In UV là in chứ không khắc nên không vi phạm quy ước "mỏng chỉ cắt", nhưng bạn nên xác nhận công nghệ này.
- **Độ dày vượt khung quy ước (Dày 1.0 - 1.3 mm):** XU-DEN-HT-11029-1 (1.44 mm), NHUNG-XD-NUT-HT-F247 (1.49 mm). Đã đánh needsReview.
- 12 mẫu "Cắt laser" là do tôi gán khi nhập (theo quy tắc mỏng < 0.45 mm), không phải dữ liệu nhà cung cấp.

### 4.5 Ghi 1 màu / 2 màu mâu thuẫn với ảnh (không tự sửa, chỉ đánh needsReview hoặc ghi chú)
- KEM-TRON (ghi 1 màu): Tên thư mục nguồn ghi 'chưa rõ mã'. Mặt sau trông sáng hơn mặt trước dù ghi 1 màu.
- SU-DEN (ghi 1 màu): Chưa rõ là gương đen thật hay chỉ bóng cao; ảnh chỉ thấy vệt phản chiếu nhẹ. Ghi 1 màu nhưng mặt sau xám hơn mặt trước.
- ZY-17 (ghi 2 màu): Ghi 2 màu nhưng nhìn cả hai mặt đều đen; giống ZY-15 (1 màu) về họa tiết.
- BAC-HT-10881-25 (ghi 1 màu): Ghi 1 màu nhưng mặt trước bạc, mặt sau trắng (khác màu rõ): có thể là 2 màu. Cần đối chiếu mẫu thật.
- HB001-10 (ghi 1 màu): Ánh cầu vồng đổi theo góc nhìn. Ghi 1 màu nhưng mặt sau khác sắc mặt trước.
- HONG-HT-10539-103 (ghi 1 màu): Mặt trước hồng đậm hơn mặt sau (hồng nhạt) dù ghi 1 màu, có thể do ánh sáng; ảnh mặt sau có tay cầm, nền thảm. Nên chụp lại.
- NHUNG-HONG-HT-10725-37 (ghi 1 màu): Cần chụp lại ảnh cận, nghiêng sáng để thấy chất liệu. Hai mặt khác sắc dù ghi 1 màu, có thể do ánh sáng.
- NHUNG-XANH-LA-HT-10725-8 (ghi 1 màu): Cần chụp lại ảnh cận, nghiêng sáng để thấy chất liệu. Hai mặt khác sắc dù ghi 1 màu, có thể do ánh sáng.
- NHUNG-DO-DO (ghi 1 màu): Cần chụp lại ảnh cận, nghiêng sáng để thấy chất liệu. Tên không có mã nhà cung cấp. Hai mặt khác sắc dù ghi 1 màu.
- ZY-E001 (ghi 2 màu): Ghi 2 màu nhưng nhìn cả hai mặt đều đen. Ánh cầu vồng đổi theo góc nhìn.
- NHUNG-XANH-LA-HT-10725-9 (ghi 1 màu): Cần chụp lại ảnh cận, nghiêng sáng để thấy chất liệu. Hai mặt khác sắc dù ghi 1 màu, có thể do ánh sáng.

### 4.6 Mẫu có tên chất liệu mà ảnh không thể hiện (Nhung, Phồng, Vân đá; theo Q2)
VAN-DA-TRANG-11074, PHONG-TRANG-HT-10963-3, PHONG-XANH-THAN-HT-10963-10, PHONG-DEN-HT-10963-1, PHONG-DUA-LUOI-HT-11160-7, PHONG-XANH-LA-HT-10963-32, PHONG-DEN-TRANG-HT-P00, PHONG-DX-HT-P002, NHUNG-HONG-HT-10725-37, NHUNG-XANH-LA-HT-10725-8, NHUNG-XL-DAM-HT-10725-43, NHUNG-DO-DO, PHONG-DO-HT-10963-37, NHUNG-CAM-HT-10725-35, NHUNG-HT-11029-12, NHUNG-THAN-NHAT-HT-10725-15, NHUNG-THAN-DAM-HT-10725-14, NHUNG-TRANG-HT-10725-2, NHUNG-VANG-HT-10725-4, NHUNG-XANH-LA-HT-10725-9, NHUNG-XD-NUT-HT-F247, NHUNG-DEN-HT-11025-1, NHUNG-DO-HT-11029-19
(Chỉ 3 mẫu "Xù" XU-TRANG, XU-DEN, XU-DO-DO nhìn rõ lông nên không đánh dấu.)

## 5. Ảnh cần chụp lại, theo mức ưu tiên
Cách chấm điểm: Không thấy chất liệu 3, có tay 3, màu lệch 3, mờ 2, nền lẫn 1, màu chưa chắc 1, mẫu bẩn/hỏng 1. Mức 1 = từ 6 điểm, mức 2 = 3-5 điểm, mức 3 = 1-2 điểm. Ảnh nào cũng có thước (không tính).
Hướng chung khi chụp lại: nền trắng hoặc xám phẳng, ánh sáng trắng đều, **không để tay/thảm trong khung**, thước đặt cách xa mẫu, thêm **một ảnh cận cảnh nghiêng sáng** cho mẫu nhung, phồng, nhũ, vân.

### Ưu tiên 1: chụp lại sớm (7 mẫu)
1. **DO-DO-HT-10539-112** (8 điểm): bỏ tay khỏi khung; chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
2. **HONG-HT-10539-103** (8 điểm): bỏ tay khỏi khung; chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
3. **NHUNG-HT-11029-12** (8 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp dưới ánh sáng trắng đều, nền trung tính; chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
4. **NHUNG-DO-HT-11029-19** (7 điểm): bỏ tay khỏi khung; chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp cận cảnh, nghiêng sáng để thấy chất liệu
5. **NHUNG-THAN-NHAT-HT-10725-15** (7 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
6. **NHUNG-XL-DAM-HT-10725-43** (7 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
7. **PHONG-XANH-THAN-HT-10963-10** (7 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc

### Ưu tiên 2 (26 mẫu)
1. **DEN-HT-10539-30** (5 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
2. **VANG-DAT-HT-10539-74** (5 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm; chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
3. **CAM-HT-10539-47** (4 điểm): bỏ tay khỏi khung; chụp trên nền trắng hoặc xám phẳng, không dùng thảm
4. **NHUNG-DO-DO** (4 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
5. **NHUNG-HONG-HT-10725-37** (4 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
6. **NHUNG-XANH-LA-HT-10725-8** (4 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
7. **NHUNG-XANH-LA-HT-10725-9** (4 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu; màu chưa chắc
8. **PHONG-DX-HT-P002** (4 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu; mặt sau có đốm trắng (dính nhãn/keo) (làm sạch hoặc đổi mẫu)
9. **TIM-HT-10539-83** (4 điểm): bỏ tay khỏi khung; chụp trên nền trắng hoặc xám phẳng, không dùng thảm
10. **XAM-CHI-HT-10539-53** (4 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
11. **XANH-THAN-HT-10881-66** (4 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
12. **YYB-046** (4 điểm): chụp dưới ánh sáng trắng đều, nền trung tính; màu chưa chắc
13. **04** (3 điểm): bỏ tay khỏi khung
14. **NHUNG-CAM-HT-10725-35** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
15. **NHUNG-DEN-HT-11025-1** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
16. **NHUNG-THAN-DAM-HT-10725-14** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
17. **NHUNG-TRANG-HT-10725-2** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
18. **NHUNG-VANG-HT-10725-4** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
19. **NHUNG-XD-NUT-HT-F247** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
20. **PHONG-DEN-HT-10963-1** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
21. **PHONG-DEN-TRANG-HT-P00** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
22. **PHONG-DO-HT-10963-37** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
23. **PHONG-DUA-LUOI-HT-11160-7** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
24. **PHONG-TRANG-HT-10963-3** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
25. **PHONG-XANH-LA-HT-10963-32** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu
26. **VAN-DA-TRANG-11074** (3 điểm): chụp cận cảnh, nghiêng sáng để thấy chất liệu

### Ưu tiên 3: nhẹ (7 mẫu)
1. **HONG-NHAT-HT-10539-55** (1 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm
2. **HONG-NHU-BAC-HT-F889** (1 điểm): mẫu có mảng trắng (bong lớp hoặc hỏng) (làm sạch hoặc đổi mẫu)
3. **TRANG-HT-10539-7** (1 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm
4. **VANG-HT-10539-37** (1 điểm): chụp trên nền trắng hoặc xám phẳng, không dùng thảm
5. **ZY-E003** (1 điểm): mẫu có vệt trắng (keo/nhãn dính) nhỏ (làm sạch hoặc đổi mẫu)
6. **ZY-E003-2** (1 điểm): mẫu có vệt trắng (keo/nhãn dính) trên bề mặt (làm sạch hoặc đổi mẫu)
7. **ZY-YYA019** (1 điểm): mặt sau mẫu có vết ố vàng/bẩn (làm sạch hoặc đổi mẫu)

## 6. Giới hạn của lần phân loại này
- Dựa trên **ảnh chụp nhanh có thước, nền khác nhau, ánh sáng không đều**, nên họ màu và độ bóng là ước lượng bằng mắt; chỗ nào không chắc đã ghi vào confidence màu hoặc reviewNote.
- Tên màu (`frontColorName`, `backColorName`) viết theo cái nhìn thấy, **không** lấy theo tên nhà cung cấp (ví dụ mẫu tên "xanh than" nhưng ảnh ra cobalt thì ghi cobalt và hạ độ tin cậy).
- `styleTags` là gợi ý chủ quan (1-3 tag), `aiVisualNote` và `descHuman` do tôi viết từ ảnh; bạn nên đọc lướt cả hai cột.
- Chưa có mẫu nào ở mức confidence tổng thể THAP; số lượng mẫu cần xem nằm ở needsReview (46).
- Bước 3 chỉ bắt đầu sau khi bạn sửa xong CSV và báo tôi.
