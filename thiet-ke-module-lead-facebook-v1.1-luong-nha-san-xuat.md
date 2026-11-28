# Bổ sung v1.1: Luồng tìm nhà sản xuất và mời dùng vật liệu

Ngày: 28/11/2026. Người yêu cầu: Ngô Hồng Sơn.
Tài liệu này bổ sung cho `thiet-ke-module-lead-facebook.md` (v1.0), không thay thế. Mục 2 "Ngoài phạm vi" của v1.0 giữ nguyên: người bấm nút gửi cuối cùng, không dùng via, proxy hay kỹ thuật che giấu tự động hoá.

---

## 1. Bài toán

1. Nhân sự đăng bài "tìm nhà sản xuất cho mẫu áo / sản phẩm X" vào nhóm (`purpose = find_supplier`).
2. Xưởng sản xuất vào comment, thường để lại số điện thoại.
3. Hệ thống tạo lead loại nhà sản xuất, phân loại xưởng thật hay môi giới.
4. **Fanpage** của xưởng vào trả lời comment đó, mời dùng vật liệu phù hợp với sản phẩm của bài.
5. Sale gọi hoặc nhắn Zalo theo số điện thoại. Comment chỉ là bước làm nóng, kênh chốt là gọi/Zalo.

## 2. Thay đổi so với v1.0

| Chỗ | v1.0 | v1.1 |
|---|---|---|
| Comment `has_contact` | Tạo lead, không cần trả lời | Với bài `find_supplier`: tạo lead **và** tạo dòng trả lời loại `supplier_offer` |
| Danh tính trả lời | Luôn là nick đã đăng bài | Chọn được: nick đăng bài hoặc fanpage |
| Phân loại nhà sản xuất | Không có | Thêm `supplier_type`: xưởng trực tiếp, môi giới, chưa rõ |
| Nội dung trả lời | Mẫu chung dẫn về inbox | Gợi ý vật liệu lấy từ thư viện vật liệu sẵn có của webapp, theo sản phẩm của bài |
| Chống chào lặp | Không có | Một số điện thoại đã được chào thì không chào lại trong N ngày |

## 3. Dữ liệu

### 3.1 Bảng mới `fb_pages`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| name | varchar | Tên fanpage, dùng để tìm đúng page khi chuyển danh tính |
| url | varchar | |
| is_default | boolean | Page mặc định cho luồng `supplier_offer` |
| status | enum: active, paused | |

### 3.2 Cột thêm vào bảng cũ

| Bảng | Cột thêm | Ghi chú |
|---|---|---|
| `fb_groups` | `page_allowed` boolean, `page_joined` boolean | Nhóm có cho page tham gia không, page đã vào chưa |
| `fb_post_drafts`, `fb_posts` | `product_ref` varchar | Mã mẫu áo / sản phẩm đang tìm nhà sản xuất |
| `fb_post_drafts`, `fb_posts` | `suggested_material_ids` json | Danh sách mã vật liệu trong thư viện vật liệu, phù hợp sản phẩm này |
| `fb_reply_queue` | `reply_as` enum: account, page | |
| `fb_reply_queue` | `page_id` FK fb_pages, nullable | |
| `fb_reply_queue` | `intent` enum: answer_interest, supplier_offer | |
| `fb_reply_templates` | `category` thêm giá trị `supplier_offer` | Biến mới: `{san_pham}`, `{vat_lieu_goi_y}` |
| `fb_leads` | `supplier_type` enum: manufacturer, broker, unknown | |
| `fb_leads` | `capability` text | Tóm tắt từ comment: làm mặt hàng gì, quy mô nếu có nói |
| `fb_leads` | `last_offered_at` datetime, nullable | Dùng cho chống chào lặp |

## 4. Xử lý phía webapp

### 4.1 Quy tắc kích hoạt

Khi comment mới thuộc bài `purpose = find_supplier`, không phải `is_own`, và (tách được số điện thoại **hoặc** AI xếp là `manufacturer`):

1. Tạo hoặc cập nhật lead `lead_type = supplier`.
2. Nếu lead chưa được chào trong `offer_cooldown_days` ngày (mặc định 30): tạo dòng `fb_reply_queue` với `intent = supplier_offer`, `reply_as = page`, `page_id` = page mặc định.
3. Nếu nhóm có `page_joined = false`: tạo với `reply_as = account` hoặc bỏ qua, theo cấu hình `fallback_when_page_unavailable`.

### 4.2 AI phân loại và soạn câu (bật mặc định cho luồng này)

Đầu vào: nội dung bài (gồm `product_ref`), nội dung comment, danh sách vật liệu gợi ý (tên + mô tả ngắn từ thư viện vật liệu).

Đầu ra JSON:

```json
{
  "supplier_type": "manufacturer",
  "capability": "Xưởng may áo thun, áo polo, nhận đơn từ 200 cái",
  "should_reply": true,
  "draft": "Dạ chào anh, bên em là {ten_page} chuyên vật liệu in logo cho áo, mẫu này anh có thể tham khảo decal PET hoặc in chuyển nhiệt. Anh nhắn page giúp em để em gửi bảng mẫu nhé."
}
```

Quy tắc cho câu trả lời:

- 1-2 câu, có tên fanpage, nói rõ là bên cung cấp vật liệu. Không đóng vai người ngoài hay khách hàng.
- Nhắc đúng 1-2 vật liệu hợp với sản phẩm của bài, không liệt kê dài.
- Không nhắc lại số điện thoại của người comment.
- Không dùng lại nguyên văn câu đã gửi trong cùng bài.

AI tắt hoặc lỗi thì dùng mẫu `supplier_offer` theo mục 6.3 của v1.0, `supplier_type = unknown`.

### 4.3 Việc cho sale

Mỗi lead nhà sản xuất có số điện thoại hiển thị trong trang Lead kèm: sản phẩm nguồn, vật liệu gợi ý, năng lực tóm tắt, nút "Đã gọi", "Đã nhắn Zalo", "Đã gửi mẫu".

## 5. Extension

### 5.1 Trả lời dưới tên fanpage

1. Với dòng `reply_as = page`: sau khi mở bài và tìm đúng comment, tìm nút chuyển danh tính bình luận (giao diện tiếng Việt và tiếng Anh) và chọn fanpage theo `fb_pages.name`.
2. Kiểm tra lại danh tính đang chọn đúng là fanpage rồi mới điền nội dung.
3. Không tìm thấy nút chuyển danh tính hoặc không có fanpage trong danh sách: báo `failed` với `fail_reason = page_not_available`, webapp cập nhật `fb_groups.page_joined = false`.
4. Vẫn dừng lại cho nhân sự đọc và tự bấm gửi, như mục 8.3 của v1.0.

Thêm mục `identity_switcher` vào `selectors.ts`, có 2-3 cách tìm dự phòng.

Claude Code: chưa xác minh giao diện chuyển danh tính trong nhóm ở thời điểm viết tài liệu. Phải kiểm tra trên trang thật trước khi code mục này.

### 5.2 Xử lý theo lô

Các dòng trả lời cùng một bài được gom lại, mở tab một lần, xử lý lần lượt từng comment. Popup tách hai nhóm: "Trả lời bằng nick" và "Trả lời bằng fanpage".

## 6. Màn hình webapp

| Trang | Thay đổi |
|---|---|
| Lead | Thêm tab "Nhà sản xuất": loại, năng lực, sản phẩm nguồn, vật liệu gợi ý, trạng thái chào, lần chào gần nhất |
| Hàng chờ trả lời | Lọc theo `reply_as` và `intent`, duyệt cả lô |
| Nhóm | Thêm cột "Page được vào" và "Page đã vào" |
| Đăng bài | Khi soạn bài `find_supplier`: chọn mẫu sản phẩm và vật liệu gợi ý từ thư viện vật liệu |
| Cấu hình | Fanpage mặc định, bật/tắt AI cho luồng này, `offer_cooldown_days`, `fallback_when_page_unavailable` |
| Thống kê | Phễu cho bài tìm nhà sản xuất: comment, số xưởng thật, đã chào, đã liên hệ được, đã gửi mẫu, có đơn vật liệu |

## 7. Tiêu chí nghiệm thu

- Comment có số điện thoại trên bài `find_supplier` tạo lead `supplier` và một dòng `supplier_offer` trong hàng chờ.
- Câu soạn sẵn nhắc đúng vật liệu gợi ý của bài đó.
- Cùng số điện thoại comment ở bài thứ hai trong vòng 30 ngày: có lead (ghi thêm nguồn) nhưng không có dòng chào mới.
- Extension chọn đúng fanpage trước khi điền; nhóm không cho page thì báo `page_not_available`.
- Phễu thống kê hiển thị đủ các bước.


## 9. Câu hỏi còn mở

1. Tên và link fanpage dùng để trả lời?
2. Vật liệu chào cho nhà sản xuất là loại nào trong thư viện (decal, PET, chuyển nhiệt, UV...)? Có cần thư viện riêng cho luồng này không?
3. Lead nhà sản xuất do sale hiện tại xử lý hay một người riêng?
