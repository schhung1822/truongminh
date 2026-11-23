# Thiết kế module Lead Facebook (webapp Trường Minh + Chrome extension)

Phiên bản: 1.1, cập nhật ngày 23/11/2026
Người yêu cầu: Ngô Hồng Sơn
Mục đích tài liệu: đưa cho Claude Code trong VS Code để dựng cả phần webapp lẫn extension trong cùng một dự án.

---

## 1. Mục tiêu

Phòng MKT đăng bài lên các nhóm Facebook và trang cá nhân để tìm khách hoặc tìm bên sản xuất. Module này làm 3 việc:

1. Thu thập comment trên **các bài người dùng chủ động thêm vào danh sách theo dõi**, kể cả bài do người khác đăng, tách số điện thoại và thông tin liên hệ, đưa vào danh sách lead trong webapp.
2. Với comment dạng "ib", "quan tâm", "cần tư vấn": soạn sẵn câu trả lời dẫn khách về inbox fanpage, nhân sự duyệt và bấm gửi.
3. Hỗ trợ đăng bài lên nhiều nhóm: điền sẵn nội dung, nhân sự bấm đăng, link bài tự ghi về webapp.

## 2. Phạm vi

### Trong phạm vi

- Đọc comment trên bài có trong danh sách `fb_posts` của webapp, trong phạm vi nick Facebook đã kết nối nhìn thấy.
- Tách số điện thoại, Zalo, email từ nội dung comment.
- Phân loại comment và soạn câu trả lời gợi ý.
- Điền sẵn câu trả lời hoặc nội dung bài đăng vào Facebook, **người bấm nút gửi cuối cùng**.
- Thống kê lead theo nhóm, theo bài, theo nhân sự.

### Ngoài phạm vi (không dựng, kể cả khi được yêu cầu thêm sau)

- Tự động đăng bài hoặc gửi comment mà không có người bấm nút cuối.
- Tự tìm kiếm, tự phát hiện hoặc quét hàng loạt bài chưa được người dùng chủ động thêm vào danh sách theo dõi.
- Tự comment vào bài của người khác.
- Dùng tài khoản mua lại (via), proxy, giả lập vân tay trình duyệt, hoặc bất kỳ kỹ thuật nào nhằm che giấu việc tự động hoá.
- Quét danh sách thành viên nhóm, đổi UID ra số điện thoại.

Lý do: các việc này vi phạm chính sách spam của Meta và có rủi ro với Luật Bảo vệ dữ liệu cá nhân (hiệu lực 1/1/2026).

## 3. Kiến trúc tổng quan

```
[Chrome của nhân sự]                         [Webapp Trường Minh]
 Extension (Manifest V3)   <--- HTTPS --->    Next.js API /api/ext/*
  - đọc comment trên Facebook                  - lưu comment, tách số
  - điền sẵn câu trả lời / bài đăng            - phân loại, soạn trả lời
  - không tự xử lý dữ liệu                     - chia lead, thống kê
                                               MySQL
```

Nguyên tắc: **extension càng đơn giản càng tốt**. Extension chỉ đọc trang và điền ô nhập. Mọi logic (tách số, phân loại, chống trùng, soạn câu) nằm ở webapp. Khi Facebook đổi giao diện, chỉ phải sửa một file selector trong extension.

Giao tiếp: extension hỏi webapp định kỳ (polling), không cần realtime.

## 4. Giả định cần anh Sơn xác nhận

| # | Giả định | Nếu sai thì ảnh hưởng |
|---|---|---|
| G1 | Webapp đã hoặc sẽ có tên miền HTTPS truy cập được từ máy nhân sự | Extension không kết nối được nếu webapp chỉ chạy local |
| G2 | Mỗi nhân sự có tài khoản riêng trên webapp | Nếu dùng chung, phải dựng thêm bảng người dùng trước |
| G3 | Dự án dùng Next.js App Router, MySQL | Claude Code tự kiểm tra codebase và chỉnh theo cấu trúc thực tế (ORM, thư mục) |
| G4 | Webapp đã có bảng khách hàng | Lead sẽ liên kết sang bảng này qua số điện thoại |
| G5 | Số lượng: vài chục bài đang theo dõi, 6-8 nhân sự | Nếu lên vài trăm bài, cần tính lại chu kỳ quét |

Claude Code: trước khi code, hãy đọc codebase hiện tại và báo lại những giả định nào không khớp.

## 5. Cấu trúc dữ liệu (MySQL)

Tên bảng có tiền tố `fb_` để tách khỏi phần hiện có. Tất cả bảng có `id` (khoá chính), `created_at`, `updated_at`.

### 5.1 `fb_accounts`: nick Facebook dùng để đăng bài

| Cột | Kiểu | Ghi chú |
|---|---|---|
| user_id | FK người dùng webapp | Nhân sự sở hữu nick |
| display_name | varchar | Tên hiển thị trên Facebook |
| profile_url | varchar | |
| status | enum: active, paused, restricted | `restricted` khi extension phát hiện checkpoint hoặc bị hạn chế |

### 5.2 `fb_groups`: nhóm Facebook

| Cột | Kiểu | Ghi chú |
|---|---|---|
| name | varchar | |
| url | varchar, unique | |
| topic | varchar | Ngành hoặc chủ đề nhóm |
| purpose | enum: find_customer, find_supplier, both | |
| notes | text | Quy định của nhóm, lưu ý admin |
| status | enum: active, paused, banned | |

### 5.3 `fb_posts`: bài đã đăng cần theo dõi

| Cột | Kiểu | Ghi chú |
|---|---|---|
| account_id | FK fb_accounts | Nick dùng để mở và quét bài |
| group_id | FK fb_groups, nullable | Null nếu đăng trang cá nhân |
| url | varchar, unique | Link bài (permalink) |
| content_snapshot | text | Nội dung bài lúc đăng |
| purpose | enum: find_customer, find_supplier | |
| posted_at | datetime | |
| tracking_status | enum: tracking, paused, done | `done` sau N ngày không có comment mới |
| last_scanned_at | datetime | |
| comment_count | int | |
| lead_count | int | |

### 5.4 `fb_comments`: comment thu thập được

| Cột | Kiểu | Ghi chú |
|---|---|---|
| post_id | FK fb_posts | |
| fb_comment_id | varchar | ID comment của Facebook, dùng chống trùng |
| parent_fb_comment_id | varchar, nullable | Nếu là trả lời của comment khác |
| author_name | varchar | |
| author_profile_url | varchar | |
| is_own | boolean | True nếu do nick của mình viết |
| text | text | Nguyên văn |
| commented_at | datetime, nullable | Thời gian tương đối quy đổi, có thể không chính xác |
| category | enum: has_contact, interest, question, other, spam | Xem mục 6.2 |
| extracted_phone | varchar, nullable | Đã chuẩn hoá |
| extracted_other | json, nullable | Zalo, email |
| handled | boolean | Đã có trả lời từ nick của mình chưa |

Unique: (`post_id`, `fb_comment_id`).

### 5.5 `fb_leads`: lead

| Cột | Kiểu | Ghi chú |
|---|---|---|
| comment_id | FK fb_comments | Nguồn |
| post_id, group_id | FK | Để thống kê nhanh |
| name | varchar | |
| phone | varchar, nullable, index | Chuẩn hoá về dạng 0xxxxxxxxx |
| profile_url | varchar | |
| lead_type | enum: customer, supplier | Theo `purpose` của bài |
| status | enum: new, contacted, qualified, won, lost, invalid | |
| assigned_to | FK người dùng, nullable | Sale phụ trách |
| customer_id | FK bảng khách hàng hiện có, nullable | Gắn khi trùng số điện thoại |
| note | text | |

Chống trùng: cùng `phone` thì không tạo lead mới, chỉ ghi thêm nguồn vào `note` hoặc bảng phụ.

### 5.6 `fb_reply_queue`: hàng chờ trả lời

| Cột | Kiểu | Ghi chú |
|---|---|---|
| comment_id | FK fb_comments | |
| account_id | FK fb_accounts | Nick dự kiến trả lời; chưa dùng ở giai đoạn thu thập |
| draft_text | text | Câu soạn sẵn |
| final_text | text, nullable | Sau khi nhân sự sửa |
| status | enum: draft, approved, filled, sent, skipped, failed | |
| approved_by | FK người dùng | |
| sent_at | datetime, nullable | |
| fail_reason | varchar, nullable | |

### 5.7 `fb_reply_templates`: mẫu câu trả lời

| Cột | Kiểu | Ghi chú |
|---|---|---|
| purpose | enum: find_customer, find_supplier | |
| category | enum: interest, question | |
| text | text | Có biến `{ten}`, `{ten_page}`, `{link_page}` |
| active | boolean | |

### 5.8 `fb_post_drafts`: bài chuẩn bị đăng (giai đoạn 3)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| title | varchar | Tên nội bộ |
| base_content | text | Nội dung gốc |
| media | json | Đường dẫn ảnh |
| purpose | enum | |

### 5.9 `fb_post_tasks`: việc đăng theo từng nhóm (giai đoạn 3)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| draft_id | FK fb_post_drafts | |
| group_id | FK fb_groups | |
| account_id | FK fb_accounts | |
| variant_content | text | Biến thể nội dung riêng cho nhóm này |
| status | enum: pending, filled, posted, skipped, failed | |
| post_id | FK fb_posts, nullable | Gắn sau khi đăng xong |

### 5.10 `ext_tokens`: mã kết nối extension

| Cột | Kiểu | Ghi chú |
|---|---|---|
| user_id | FK người dùng | |
| account_id | FK fb_accounts | Nick gắn với extension này |
| token_hash | varchar | Chỉ lưu hash, không lưu mã gốc |
| label | varchar | Ví dụ "Máy Lan, Chrome chính" |
| last_seen_at | datetime | |
| revoked_at | datetime, nullable | |

### 5.11 `ext_logs`: nhật ký extension

| Cột | Kiểu | Ghi chú |
|---|---|---|
| token_id | FK ext_tokens | |
| type | enum: scan_ok, scan_fail, selector_broken, checkpoint, reply_sent, post_done | |
| detail | json | |

## 6. Xử lý phía webapp

### 6.1 Tách số điện thoại

Thực hiện theo thứ tự:

1. Chuẩn hoá chuỗi: bỏ dấu chấm, dấu cách, dấu gạch giữa các chữ số; đổi `+84` và `84` đầu số thành `0`.
2. Thay ký tự giả số: `o`, `O` thành `0`; `l`, `I` thành `1` **chỉ khi** nằm trong cụm có ít nhất 7 chữ số.
3. Nhận dạng số di động Việt Nam: 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09.
4. Số viết bằng chữ ("không chín một hai...") không xử lý bằng quy tắc. Đánh dấu comment là `question` và để bước AI (nếu bật) hoặc nhân sự xử lý.
5. Tách thêm: email (regex chuẩn), cụm "zalo" kèm số.

Viết thành một hàm thuần có unit test với ít nhất 20 ca mẫu.

### 6.2 Phân loại comment

| Loại | Điều kiện | Hành động |
|---|---|---|
| has_contact | Tách được số, Zalo hoặc email | Tạo lead, không cần trả lời (hoặc trả lời cảm ơn, tuỳ cấu hình) |
| interest | Khớp từ khoá: ib, inbox, quan tâm, cần tư vấn, báo giá, xin giá, check ib, chấm, "." | Tạo dòng trong `fb_reply_queue` |
| question | Có dấu hỏi hoặc từ khoá hỏi: bao nhiêu, ở đâu, có ... không | Tạo dòng trong `fb_reply_queue`, đánh dấu cần người đọc kỹ |
| spam | Có link ngoài, hoặc nội dung quảng cáo của bên khác | Bỏ qua |
| other | Còn lại | Bỏ qua, vẫn lưu |

Danh sách từ khoá lưu trong cấu hình (bảng hoặc file), sửa được từ màn hình quản trị.

Tuỳ chọn AI: với comment loại `question` và `other`, gọi một model ngôn ngữ để phân loại lại và soạn câu trả lời. Làm thành công tắc bật tắt, mặc định tắt ở giai đoạn 1.

### 6.3 Soạn câu trả lời

- Chọn ngẫu nhiên một mẫu đang `active` đúng `purpose` và `category`, thay biến.
- Không dùng lại cùng một mẫu cho 2 comment liền nhau trong cùng bài.
- Nếu bật AI: sinh câu theo nội dung comment, giới hạn 1-2 câu, luôn có tên fanpage.
- Câu trả lời không chứa số điện thoại của khách.

### 6.4 Chia lead

Giai đoạn 1: lead mới ở trạng thái `new`, chưa gán. Trưởng nhóm gán tay. Chia tự động vòng tròn để sau.

## 7. API cho extension

Tất cả nằm dưới `/api/ext/`. Xác thực bằng header `Authorization: Bearer <token>`. Server so hash, kiểm tra `revoked_at`, cập nhật `last_seen_at`. Trả lỗi 401 nếu token sai hoặc đã thu hồi.

Bật CORS cho origin `chrome-extension://<id>`. Áp giới hạn tần suất theo token.

### 7.1 `GET /api/ext/me`

Kiểm tra kết nối. Trả về tên nhân sự, nick gắn với token, cấu hình chạy.

```json
{
  "user": "Lan",
  "account": { "id": 3, "display_name": "Lan Trường Minh" },
  "config": { "poll_minutes": 10, "max_posts_per_cycle": 8, "delay_seconds_between_posts": 45 }
}
```

### 7.2 `GET /api/ext/jobs`

Trả về việc cần làm cho nick này, theo thứ tự ưu tiên.

```json
{
  "scan": [
    { "post_id": 41, "url": "https://www.facebook.com/groups/.../posts/...", "known_comment_ids": ["123", "456"] }
  ],
  "replies": [
    { "reply_id": 77, "post_url": "...", "fb_comment_id": "123", "text": "Dạ em chào anh ..." }
  ],
  "post_tasks": []
}
```

Quy tắc chọn bài cần quét: `tracking_status = tracking`, thuộc nick này, `last_scanned_at` cũ hơn chu kỳ. Bài mới đăng trong 48 giờ quét dày hơn bài cũ. Giới hạn số bài mỗi lần theo `max_posts_per_cycle`.

`replies` chỉ gồm dòng `status = approved`.

### 7.3 `POST /api/ext/posts/{post_id}/comments`

Extension gửi toàn bộ comment đọc được trong một lần quét.

```json
{
  "scanned_at": "2026-11-20T09:00:00Z",
  "complete": true,
  "comments": [
    {
      "fb_comment_id": "123",
      "parent_fb_comment_id": null,
      "author_name": "Nguyễn Văn A",
      "author_profile_url": "https://www.facebook.com/...",
      "is_own": false,
      "text": "ib giá em nhé",
      "time_text": "2 giờ"
    }
  ]
}
```

Server: upsert theo (`post_id`, `fb_comment_id`), chạy mục 6.1 đến 6.3 cho comment mới, cập nhật `last_scanned_at` và bộ đếm. Trả về số comment mới, số lead mới.

`complete: false` nghĩa là extension dừng giữa chừng (quá dài, lỗi). Server vẫn lưu phần đã có.

### 7.4 `POST /api/ext/replies/{reply_id}/result`

```json
{ "status": "sent", "detail": null }
```

Giá trị `status`: `filled` (đã điền, chờ người bấm), `sent` (đã thấy comment xuất hiện), `skipped` (người dùng bỏ qua), `failed` (kèm lý do).

### 7.5 `POST /api/ext/posts`

Đăng ký bài mới để theo dõi. Dùng khi nhân sự vừa đăng xong, hoặc bấm nút "Theo dõi bài này" trên popup extension.

```json
{ "url": "...", "group_url": "...", "content_snapshot": "...", "post_task_id": null }
```

Server tự tạo `fb_groups` nếu chưa có nhóm đó.

### 7.6 `POST /api/ext/logs`

Extension báo sự kiện: `selector_broken`, `checkpoint`, `scan_fail`. Khi nhận `checkpoint`, server đổi `fb_accounts.status` thành `restricted` và ngừng giao việc cho nick đó cho tới khi quản trị bật lại.

### 7.7 `POST /api/ext/post-tasks/{id}/result` (giai đoạn 3)

Tương tự 7.4, kèm `post_url` khi đăng thành công.

## 8. Extension

### 8.1 Cấu trúc thư mục

Đặt trong cùng dự án, thư mục `extension/`.

```
extension/
  manifest.json          Manifest V3
  src/
    background.ts        Service worker: hẹn giờ, gọi API, điều phối tab
    content/
      facebook.ts        Content script chạy trên facebook.com
      selectors.ts       TẤT CẢ cách tìm phần tử trên trang nằm ở đây
      extract.ts         Đọc comment từ trang
      fill.ts            Điền ô trả lời, ô đăng bài
    popup/               Giao diện nhỏ: trạng thái, nút quét ngay, nút theo dõi bài này
    options/             Nhập địa chỉ webapp và mã kết nối
    api.ts               Gọi /api/ext/*
  README.md              Hướng dẫn cài cho nhân sự
```

Quyền trong manifest: `storage`, `alarms`, `tabs`, `scripting`; host: `https://www.facebook.com/*` và tên miền webapp. Không xin quyền thừa.

### 8.2 Luồng quét comment

1. `chrome.alarms` kích hoạt theo `poll_minutes`.
2. Gọi `GET /jobs`. Không có việc thì dừng.
3. Với từng bài trong `scan`, xử lý **tuần tự, một tab một lúc**:
   1. Mở link bài trong tab nền.
   2. Chờ trang tải xong. Nếu thấy trang đăng nhập hoặc checkpoint: gửi log `checkpoint`, dừng toàn bộ chu kỳ.
   3. Đổi bộ lọc bình luận sang "Tất cả bình luận".
   4. Bấm "Xem thêm bình luận" và "Xem phản hồi" cho tới khi hết, có giới hạn số lần và thời gian tối đa mỗi bài.
   5. Đọc từng comment: ID (lấy từ tham số `comment_id` trong link thời gian của comment), tên, link profile, nội dung (bấm "Xem thêm" nếu bị cắt), chuỗi thời gian, comment cha.
   6. Gửi `POST /posts/{id}/comments`.
   7. Đóng tab, chờ `delay_seconds_between_posts` rồi sang bài kế.
4. Ghi kết quả chu kỳ vào popup.

Giới hạn tốc độ ở đây nhằm tránh tạo tải bất thường lên tài khoản, không nhằm che giấu việc tự động hoá. Không thêm bất kỳ kỹ thuật giả lập hành vi người dùng nào.

### 8.3 Luồng trả lời bán tự động

1. Popup hiện số câu trả lời đã duyệt đang chờ.
2. Nhân sự bấm "Xử lý trả lời". Extension mở bài, cuộn tới đúng comment theo `fb_comment_id`.
3. Extension bấm "Phản hồi" của comment đó và điền `text` vào ô nhập. Báo `filled`.
4. Extension **dừng lại**, tô sáng ô nhập. Nhân sự đọc, sửa nếu cần, tự bấm Enter để gửi.
5. Extension thấy comment mới xuất hiện thì báo `sent`, chuyển sang câu kế. Có nút "Bỏ qua" để báo `skipped`.

Extension không bao giờ tự bấm gửi.

### 8.4 Luồng hỗ trợ đăng bài (giai đoạn 3)

1. Nhân sự chọn bài nháp trên webapp, chọn danh sách nhóm. Webapp tạo `fb_post_tasks` với biến thể nội dung riêng từng nhóm.
2. Nhân sự bấm "Bắt đầu đăng" trên popup. Extension mở nhóm đầu tiên, mở ô soạn bài, điền `variant_content`.
3. Extension dừng lại. Nhân sự thêm ảnh nếu cần, kiểm tra, tự bấm "Đăng".
4. Extension lấy link bài vừa đăng, gọi `POST /posts`, báo kết quả, chờ nhân sự bấm "Nhóm tiếp theo".

Nếu nhóm bật duyệt bài, link bài chưa có ngay: ghi trạng thái `posted` không kèm link, nhân sự bổ sung sau bằng nút "Theo dõi bài này".

### 8.5 Chiến lược đọc trang Facebook

Tên class của Facebook bị xáo trộn và đổi liên tục, không được dùng làm selector.

- Ưu tiên: thuộc tính `role` (`article`, `textbox`, `button`), `aria-label`, cấu trúc link (`/groups/.../posts/...`, tham số `comment_id`).
- Hỗ trợ giao diện tiếng Việt và tiếng Anh cho mọi nhãn văn bản ("Tất cả bình luận" / "All comments", "Xem thêm bình luận" / "View more comments", "Phản hồi" / "Reply").
- Mọi selector và nhãn nằm trong `selectors.ts`, mỗi mục có 2-3 cách tìm dự phòng.
- Khi không tìm thấy phần tử bắt buộc: gửi log `selector_broken` kèm tên mục bị hỏng, không đoán mò.

Claude Code: selector trong tài liệu này chỉ là định hướng. Phải kiểm tra trên trang Facebook thật khi code, vì cấu trúc trang có thể đã khác.

### 8.6 Cài đặt

Giai đoạn đầu cài thủ công: build ra thư mục `dist/`, nhân sự vào `chrome://extensions`, bật chế độ nhà phát triển, chọn "Load unpacked". Viết hướng dẫn có ảnh trong `README.md`.

## 9. Màn hình webapp

Thêm một mục menu "Lead Facebook" với các trang con. Dùng component shadcn sẵn có.

| Trang | Nội dung chính |
|---|---|
| Lead | Bảng lead: tên, số, loại, nguồn (nhóm, bài), trạng thái, sale phụ trách. Lọc theo trạng thái, nhóm, ngày. Bấm vào xem comment gốc và link bài. Nút gán sale, đổi trạng thái, gắn vào khách hàng có sẵn. |
| Hàng chờ trả lời | Danh sách comment cần trả lời kèm câu soạn sẵn. Sửa câu, duyệt từng dòng hoặc duyệt cả lô, bỏ qua. |
| Bài đăng | Danh sách bài đang theo dõi: nhóm, nick, ngày đăng, số comment, số lead, lần quét cuối. Thêm bài bằng cách dán link. Tạm dừng, kết thúc theo dõi. |
| Nhóm | Danh sách nhóm, ghi chú quy định, số bài đã đăng, số lead thu được, tỉ lệ lead trên bài. |
| Mẫu câu | Quản lý mẫu trả lời và danh sách từ khoá phân loại. |
| Kết nối extension | Tạo mã kết nối (hiện mã một lần duy nhất), danh sách thiết bị, lần hoạt động cuối, nút thu hồi. Hiện cảnh báo `selector_broken` và `checkpoint`. |
| Thống kê | Lead theo ngày, theo nhóm, theo nhân sự. Tỉ lệ comment thành lead. Nhóm nào hiệu quả nhất. |
| Đăng bài (giai đoạn 3) | Soạn bài nháp, chọn nhóm, sinh biến thể, theo dõi tiến độ đăng. |

## 10. Phân quyền

| Vai trò | Quyền |
|---|---|
| Quản trị | Toàn bộ, gồm thu hồi mã kết nối, sửa cấu hình, bật lại nick bị `restricted` |
| MKT | Quản lý bài đăng, nhóm, mẫu câu, duyệt trả lời, tạo mã kết nối cho mình |
| Sale | Xem và cập nhật lead được gán cho mình |

## 11. Bảo mật và dữ liệu cá nhân

- Mọi kết nối qua HTTPS.
- Mã kết nối: sinh ngẫu nhiên đủ dài, chỉ lưu hash, hiện cho người dùng một lần, thu hồi được.
- Extension không lưu comment hay số điện thoại lâu dài trên máy nhân sự, chỉ giữ tạm trong bộ nhớ khi quét.
- Extension không đọc cookie, token đăng nhập Facebook, tin nhắn, hay bất kỳ trang nào ngoài bài nằm trong danh sách việc.
- Chỉ thu thập comment trên các permalink người dùng chủ động theo dõi và nick đã kết nối có quyền xem. Mục đích sử dụng: liên hệ tư vấn theo đúng nhu cầu người bình luận đã nêu.
- Có chức năng xoá lead và comment liên quan khi khách yêu cầu.
- Đặt thời hạn lưu: comment loại `other` và `spam` tự xoá sau 90 ngày (con số đề xuất, anh Sơn quyết định).
- Nên hỏi luật sư về nghĩa vụ theo Luật Bảo vệ dữ liệu cá nhân trước khi chạy quy mô lớn.

## 12. Lộ trình

### Giai đoạn 1: Thu thập và lead (làm trước)

Gồm: bảng 5.1 đến 5.5, 5.10, 5.11; API 7.1, 7.2 (phần `scan`), 7.3, 7.5, 7.6; extension mục 8.2 và nút "Theo dõi bài này"; trang Lead, Bài đăng, Nhóm, Kết nối extension.

Tiêu chí nghiệm thu:
- Dán link một bài thật vào webapp, sau một chu kỳ quét thấy đủ comment trong webapp.
- Comment có số điện thoại tạo ra lead, số đã chuẩn hoá đúng.
- Quét lại không tạo dòng trùng.
- Thu hồi mã kết nối thì extension ngừng hoạt động ngay ở lần gọi kế tiếp.
- Hàm tách số qua hết bộ test.

### Giai đoạn 2: Trả lời bán tự động

Gồm: bảng 5.6, 5.7; phần `replies` của API 7.2, API 7.4; extension mục 8.3; trang Hàng chờ trả lời, Mẫu câu.

Tiêu chí: comment "ib" xuất hiện trong hàng chờ với câu soạn sẵn; sau khi duyệt, extension điền đúng vào comment đó và dừng chờ người bấm; trạng thái cập nhật đúng.

### Giai đoạn 3: Hỗ trợ đăng bài

Gồm: bảng 5.8, 5.9; API 7.7; extension mục 8.4; trang Đăng bài, Thống kê.

### Mốc quyết định

Sau giai đoạn 1, chạy thật 1-2 tuần và xem số liệu: mỗi bài ra bao nhiêu comment, bao nhiêu lead có số, nhóm nào hiệu quả. Chỉ làm giai đoạn 2 và 3 nếu số lead đủ đáng.

## 13. Lời nhắc khởi động cho Claude Code

Dán đoạn này vào Claude Code cùng với tài liệu:

> Đọc file `docs/thiet-ke-module-lead-facebook.md`. Trước khi viết code: (1) đọc cấu trúc dự án hiện tại, gồm cách kết nối MySQL, cách xác thực người dùng, cấu trúc thư mục; (2) liệt kê những giả định ở mục 4 không khớp với thực tế; (3) đề xuất kế hoạch thực hiện giai đoạn 1 theo từng bước nhỏ, mỗi bước chạy thử được. Chờ tôi duyệt kế hoạch rồi mới code. Tuân thủ nghiêm mục 2 "Ngoài phạm vi": không thêm tự động gửi, không thêm kỹ thuật che giấu tự động hoá.

## 14. Câu hỏi còn mở

1. Webapp đang chạy ở đâu, đã có HTTPS chưa? (G1)
2. Nhân sự đăng nhập webapp bằng tài khoản riêng hay chung? (G2)
3. Có bao nhiêu nick đăng bài, mỗi ngày khoảng bao nhiêu bài?
4. Tên và link fanpage dùng để dẫn khách về?
5. Lead "tìm bên sản xuất" có cần quy trình riêng (không qua sale) không?
6. Có bật AI cho phân loại và soạn câu ngay từ giai đoạn 2 không, dùng model nào?
