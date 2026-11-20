# Mẫu thông tin doanh nghiệp (xưởng điền)

Tài liệu này để xưởng điền thông tin cho AI của hệ thống dùng. Chỗ nào chưa có hoặc chưa chắc thì **để nguyên "Chưa có dữ liệu"**, đừng đoán. AI sẽ không nói những gì chưa được điền, và sẽ báo nhân viên khi khách hỏi.

## Cách đọc ba mức hiển thị

Với mỗi mục, xưởng chọn một mức:

| Mức | Nghĩa | Ai và AI nào thấy |
|---|---|---|
| **CÔNG KHAI** | Được nói thẳng với khách | Bot trả lời khách, kịch bản chăm sóc nhóm, sale, admin |
| **NỘI BỘ** | Chỉ cho sale và AI hỗ trợ sale | Sale (tag bot hỏi kỹ thuật), admin. Khách không bao giờ thấy |
| **CHỈ ADMIN** | Chỉ quản trị viên | Chỉ admin. Không AI nào trò chuyện được dùng |

Nếu phân vân giữa hai mức, **chọn mức kín hơn**. Sửa lại sau rất dễ.

## Cột "Dùng cho AI nào" (gợi ý)

- **A** = Bot trả lời khách (kể cả AI soạn nháp)
- **B** = Bot hỗ trợ sale (sale tag bot hỏi kỹ thuật)
- **C** = Kịch bản chăm sóc nhóm (bài đăng vào nhóm khách)

Mỗi AI chỉ nhận phần liên quan đến nó, để câu trả lời gọn và đúng. Bài nào dùng chung thì ghi nhiều chữ cái. Admin đổi được sau trên giao diện.

---

## 0. Hồ sơ doanh nghiệp

Mỗi dòng ghi thêm mức hiển thị (CÔNG KHAI / NỘI BỘ / CHỈ ADMIN). Mặc định gợi ý là CÔNG KHAI cho mọi dòng trừ khi xưởng nói khác.

| Mục | Nội dung | Mức |
|---|---|---|
| Tên xưởng (hiện ở chân ảnh) | Chưa có dữ liệu | |
| Tên giao dịch | Chưa có dữ liệu | |
| Giới thiệu ngắn (2 đến 3 câu) | Chưa có dữ liệu | |
| Địa chỉ xưởng / nơi nhận hàng | Chưa có dữ liệu | |
| Giờ làm việc (ngày nào, từ giờ nào đến giờ nào) | Chưa có dữ liệu | |
| Hotline | Chưa có dữ liệu | |
| Zalo liên hệ | Chưa có dữ liệu | |
| Fanpage | Chưa có dữ liệu | |
| Website | Chưa có dữ liệu | |
| Khu vực giao hàng | Chưa có dữ liệu | |
| Phương thức thanh toán | Chưa có dữ liệu | |

---

## 1. Dịch vụ và sản phẩm làm được (gợi ý: CÔNG KHAI, dùng cho A B C)

Câu hỏi gợi ý:
- Xưởng làm những loại sản phẩm nào? (móc khóa, nhãn mác, patch, huy hiệu, ... liệt kê đúng những gì xưởng làm)
- Sản phẩm nào xưởng **không** làm? (để AI từ chối đúng)
- Mỗi loại sản phẩm: dùng vào việc gì, hợp với ngành nào?

Chưa có dữ liệu

---

## 2. Công nghệ sản xuất (gợi ý: CÔNG KHAI phần giới thiệu, NỘI BỘ phần chi tiết; dùng cho A B)

Với **từng** công nghệ (khắc laser, cắt laser, in UV, ... đúng như xưởng đang có):
- Làm được gì?
- **Không** làm được gì?
- Hợp với chất liệu nào, không hợp chất liệu nào?
- Lưu ý khi khách gửi logo (ví dụ nét quá mảnh, chi tiết quá nhỏ)

Chưa có dữ liệu

---

## 3. Thông số kỹ thuật (gợi ý: NỘI BỘ; dùng cho B, phần nào khách cần biết thì CÔNG KHAI cho A)

Câu hỏi gợi ý (ghi số cụ thể và đơn vị):
- Kích thước nhỏ nhất / lớn nhất làm được
- Nét mảnh nhất / chữ nhỏ nhất đọc được
- Số màu tối đa với từng công nghệ
- Dung sai kích thước
- Độ dày chất liệu nào cắt được, khắc được (nếu đã có quy ước riêng thì chỉ ghi chỗ chưa có trong hệ thống)

> Thông tin từng chất liệu (tên, độ dày, công nghệ phù hợp) **đã nằm trong danh sách chất liệu** của hệ thống. Không cần chép lại ở đây.

Chưa có dữ liệu

---

## 4. Đơn hàng (gợi ý: CÔNG KHAI phần khách cần biết; dùng cho A B)

Câu hỏi gợi ý:
- Số lượng tối thiểu mỗi đơn? (có khác theo sản phẩm không)
- Thời gian sản xuất theo số lượng (ví dụ dưới bao nhiêu cái mất bao nhiêu ngày)
- Có làm mẫu thử không? Phí mẫu bao nhiêu? Mẫu có được trừ vào đơn không?
- Khi nào khách được duyệt mẫu trước khi sản xuất hàng loạt?

Chưa có dữ liệu

---

## 5. Giá và báo giá

Chia làm hai phần, mỗi phần chọn mức riêng.

**5a. Giá niêm yết / cách báo giá cho khách (gợi ý: CÔNG KHAI nếu xưởng cho nói, nếu không thì NỘI BỘ; dùng cho A B)**
- Xưởng có công bố giá cho khách trước khi sale báo không?
- Giá niêm yết (nếu có): theo sản phẩm, theo số lượng
- Cách báo giá: khách cần cung cấp gì (số lượng, kích thước, chất liệu)? Ai báo?
- Đặt cọc: bao nhiêu phần trăm, khi nào, hình thức

Chưa có dữ liệu

**5b. Khung giá đàm phán, mức giảm tối đa sale được cho (gợi ý: NỘI BỘ; dùng cho B)**

Chưa có dữ liệu

---

## 6. Giao hàng, đổi trả, bảo hành, xử lý lỗi (gợi ý: CÔNG KHAI; dùng cho A B)

Câu hỏi gợi ý:
- Giao bằng đơn vị nào, phí giao tính thế nào, bao lâu tới nơi?
- Khi nào được đổi trả? Ai chịu phí?
- Bảo hành bao lâu, bảo hành những gì?
- Hàng lỗi do xưởng / do file khách thì xử lý khác nhau thế nào?
- Quy trình khiếu nại: khách liên hệ ai, xưởng phản hồi trong bao lâu?

Chưa có dữ liệu

---

## 7. File thiết kế (gợi ý: CÔNG KHAI; dùng cho A B)

Câu hỏi gợi ý:
- Khách cần gửi file gì? Định dạng nào nhận (AI, PDF, PNG, ...)? Độ phân giải tối thiểu?
- Xưởng có hỗ trợ vẽ lại logo không? Có tính phí không? Mất bao lâu?
- Logo như thế nào thì khó làm (mờ, nhiều chi tiết nhỏ, ...) và xưởng xử lý ra sao?

Chưa có dữ liệu

---

## 8. Câu hỏi thường gặp (gợi ý: CÔNG KHAI; dùng cho A B, một số bài dùng cho C)

Mỗi câu một dòng, theo mẫu. Thêm dòng khi cần.

| Câu hỏi khách hay hỏi | Câu trả lời mẫu | Mức | AI dùng |
|---|---|---|---|
| Chưa có dữ liệu | Chưa có dữ liệu | | |
| Chưa có dữ liệu | Chưa có dữ liệu | | |
| Chưa có dữ liệu | Chưa có dữ liệu | | |

---

## 9. Kịch bản tư vấn và xử lý từ chối (gợi ý: NỘI BỘ; dùng cho B)

Câu hỏi gợi ý:
- Khi khách chê giá đắt, sale nên nói gì?
- Khi khách so sánh với xưởng khác?
- Khi khách muốn làm gấp hơn thời gian xưởng nhận?
- Khi khách muốn làm số lượng rất ít?
- Những câu sale **không** nên nói với khách?

Chưa có dữ liệu

---

## 10. Bảo quản và cách dùng sản phẩm (gợi ý: CÔNG KHAI; dùng cho A B C)

Câu hỏi gợi ý:
- Mỗi loại sản phẩm / chất liệu bảo quản, vệ sinh thế nào?
- Điều gì làm hỏng sản phẩm (nước, nắng, hóa chất, ...)?
- Lời khuyên khi gắn / may / dán sản phẩm lên đồ

Chưa có dữ liệu

---

## 11. Nội dung dùng cho bài đăng chăm sóc nhóm (gợi ý: CÔNG KHAI; dùng cho C)

Câu hỏi gợi ý:
- Xưởng muốn bài đăng nhấn mạnh điều gì? (chất lượng, tốc độ, mẫu mới, ...)
- Có chương trình khuyến mãi nào được phép nói công khai không? (thời hạn, điều kiện)
- Những chủ đề **không** được nhắc trong bài đăng?
- Giọng điệu mong muốn (thân mật, lịch sự, hài hước vừa phải, ...)

Chưa có dữ liệu

---

## 12. Thông số tính giá (CHỈ ADMIN)

Chỉ để công cụ báo giá sau này dùng. **Không AI trò chuyện nào được xem mục này.** Có thể để trống nếu chưa làm công cụ báo giá.

| Thông số | Giá trị | Đơn vị |
|---|---|---|
| Hệ số máy theo công nghệ (từng công nghệ một dòng) | Chưa có dữ liệu | |
| Đơn giá thời gian máy | Chưa có dữ liệu | |
| Tỉ lệ hao hụt | Chưa có dữ liệu | |
| Giá vốn nguyên liệu (nếu muốn lưu) | Chưa có dữ liệu | |
| Nhà cung cấp, chiết khấu đặc biệt | Chưa có dữ liệu | |
