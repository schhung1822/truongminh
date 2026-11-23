# Extension Chrome: Data Lead Facebook

Extension đọc **comment trên những bài bạn chủ động theo dõi** và gửi về webapp, để webapp tách số điện thoại và đưa vào mục **Lead Facebook**. Bài có thể do bạn hoặc người khác đăng, miễn là nick Facebook đã kết nối xem được bài và comment. Thiết kế đầy đủ: [docs/thiet-ke-module-lead-facebook.md](../docs/thiet-ke-module-lead-facebook.md). Hướng dẫn đọc hiểu toàn hệ thống: [docs/huong-dan-lead-facebook.md](../docs/huong-dan-lead-facebook.md).

## Extension làm gì và KHÔNG làm gì

Làm:
- Cứ mỗi vài phút hỏi webapp "có bài nào cần quét không", mở **từng bài một** trong một cửa sổ Facebook nhỏ riêng (hoặc tab nền, tuỳ thiết lập), cuộn và bấm các nút mở rộng để Facebook hiện đủ bình luận, đọc comment, gửi về, đóng cửa sổ.
- Nút **Theo dõi bài này**: đưa permalink đang mở vào danh sách theo dõi, kể cả bài do người khác đăng.
- Nút **Chẩn đoán trang này**: đọc thử cấu trúc trang Facebook đang mở và tạo báo cáo (số đếm, nhãn nút, mẫu đường link; không có tên hay nội dung comment) để người phát triển chỉnh bộ đọc khi Facebook đổi giao diện.
- Báo trên máy khi có lead mới (tắt được ở Cài đặt).

Không làm, và có test chặn ([src/guard.test.ts](src/guard.test.ts)):
- Không tự đăng bài, không tự comment, không tự bấm gửi, không gõ chữ vào ô nào của Facebook. Chỉ cuộn trang và bấm các nút để **mở rộng nội dung đã có**: "Xem thêm bình luận", "Xem phản hồi", "Xem thêm", menu "Tất cả bình luận".
- Không tự tìm hoặc quét hàng loạt bài: chỉ mở đúng permalink người dùng đã chủ động thêm vào danh sách theo dõi.
- Không đọc cookie hay token đăng nhập Facebook, không đọc tin nhắn, không mở trang nào ngoài danh sách việc.
- Không dùng tài khoản mua lại, proxy, giả lập vân tay trình duyệt, độ trễ ngẫu nhiên hay bất kỳ kỹ thuật nào che giấu việc tự động hoá. Độ trễ giữa các bài là **số cố định** (mặc định 45 giây) chỉ để không tạo tải bất thường lên tài khoản.
- Không lưu comment hay số điện thoại trên máy. Dữ liệu chỉ nằm tạm trong bộ nhớ khi quét rồi gửi đi.

Khi Facebook yêu cầu xác minh nick (checkpoint) hoặc hiện trang đăng nhập, extension **dừng toàn bộ**, báo về webapp, và webapp ngừng giao việc cho nick đó cho tới khi quản trị viên bật lại.

## Quyền extension xin và vì sao
| Quyền | Dùng để |
|---|---|
| `storage` | Lưu mã kết nối, thiết lập, nhật ký ngắn |
| `alarms` | Hẹn giờ quét định kỳ |
| `tabs` | Mở/đóng tab hoặc cửa sổ bài cần quét, đọc địa chỉ tab đang mở |
| `scripting` | Nạp bổ sung **đúng file `content.js` của extension** vào tab Facebook mở trước khi cài extension (test chặn chạy mã khác) |
| `notifications` | Báo "có lead mới" trên máy |
| Host `https://*.facebook.com/*` | Facebook ở Việt Nam hay dùng `web.facebook.com`, không chỉ `www` |
| Host webapp | Gọi `/api/ext/*` |

## Cài đặt

Cần Node.js để build (một lần, quản trị viên làm giúp được):

```bash
npm run ext:build                 # địa chỉ webapp mặc định: https://truongminh.activate.vn
# APP_ORIGIN=http://localhost:3000 npm run ext:build     (bản thử ở máy dev)
```

Kết quả ở thư mục `extension/dist/`. Gửi thư mục này cho nhân sự (nén zip), rồi trên máy nhân sự:

1. Mở `chrome://extensions`, bật **Chế độ nhà phát triển** (góc phải trên).
2. Bấm **Tải tiện ích đã giải nén** và chọn thư mục `dist`. Ghim biểu tượng extension lên thanh công cụ (nút mảnh ghép).
3. Trên webapp: **Lead Facebook > Kết nối extension**: thêm nick Facebook của mình, bấm **Tạo mã kết nối** (mã chỉ hiện một lần, sao chép ngay).
4. Bấm biểu tượng extension > **Cài đặt & hướng dẫn**, dán mã, bấm **Kết nối**. Extension sẽ tự chạy lần quét đầu ngay sau đó.
5. Đăng nhập Facebook trên chính Chrome này bằng nick đã thêm.

Đã cài bản cũ: build lại rồi vào `chrome://extensions` bấm nút tải lại (mũi tên vòng) của extension; mã kết nối và thiết lập giữ nguyên.

## Dùng hằng ngày

1. Mở bài cần theo dõi ở trang riêng của nó (bấm vào thời gian đăng). Bài có thể do bạn hoặc người khác đăng.
2. Bấm biểu tượng extension > **Theo dõi bài này**. Hoặc dán link bài ở webapp: **Lead Facebook > Bài đăng**, rồi chọn nick dùng để quét.
3. Extension tự quét theo chu kỳ. Muốn quét ngay: **Quét ngay** trong popup. Khi quét, một cửa sổ Facebook nhỏ tự mở ở góc màn hình rồi tự đóng; đừng đóng tay.
4. Lead xuất hiện ở **Lead Facebook > Lead**. Popup có mục **Nhật ký gần đây** cho biết từng bài quét được gì.

Chrome phải đang mở (có thể thu nhỏ) và máy không ngủ thì mới quét được.

## Nhiều nhân sự, nhiều máy
- Mỗi máy một mã kết nối, mỗi mã gắn một nick. Mỗi máy đăng nhập Facebook bằng đúng nick của mã.
- Webapp giao việc theo nick; hai máy cùng một nick (hiếm) không được giao cùng một bài trong lúc máy kia đang quét (giữ chỗ 12 phút).
- Dữ liệu của extension nằm riêng theo hồ sơ Chrome; không có gì dùng chung giữa các máy ngoài webapp.

## Khi có sự cố

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| Popup báo "Chưa kết nối" | Chưa nhập mã, hoặc mã đã bị thu hồi. Tạo mã mới trên webapp và nhập lại ở Cài đặt. |
| Báo "Facebook đang hiện trang đăng nhập" | Hết phiên Facebook trên Chrome này. Đăng nhập lại rồi bấm Quét ngay. |
| Báo "Facebook đang yêu cầu xác minh nick" | Vào Facebook xử lý xác minh bằng tay. Nick bị tạm ngừng giao việc; nhờ quản trị viên bật lại ở webapp sau khi nick ổn. |
| Quét xong 0 comment dù bài có comment, hoặc "Không đọc được trang Facebook" | Facebook có thể đã đổi giao diện. Mở bài đó, bấm **Chẩn đoán trang này**, rồi **Sao chép báo cáo** và gửi cho người phát triển. Báo cáo cũng được gửi về webapp (trang Kết nối extension, mục Cảnh báo). |
| "Theo dõi bài này" báo không phải trang bài đăng | Đang ở trang chủ/trang cá nhân/nhóm. Bấm vào thời gian đăng của bài để mở trang riêng rồi bấm lại. |
| Bài của người khác quét được 0 comment | Kiểm tra nick đã kết nối có quyền xem bài/comment; mở bài và dùng **Thử đọc sâu** hoặc **Chẩn đoán trang này**. |
| Bấm nút mà không thấy gì | `chrome://extensions` > tải lại extension, F5 trang Facebook, thử lại. |

## Chưa kiểm chứng (đọc trước khi dùng thật)

- **Đã kiểm:** logic tách số, phân loại, API và lưu dữ liệu ở webapp (test và chạy thử đầu cuối); logic đọc comment, đọc tác giả, tìm nút, nhận biết trang đăng nhập/xác minh trên **hai trang HTML mô phỏng** (có link thời gian kèm `comment_id`, và trường hợp xấu không có link: khi đó dùng `aria-label` và mã tạm), xem [src/content/extract.test.ts](src/content/extract.test.ts); bản build tạo ra đúng.
- **Chưa kiểm:** cấu trúc và nhãn của trang Facebook thật. Các selector trong [src/content/selectors.ts](src/content/selectors.ts) là **định hướng**. Lần thử thật đầu tiên: dùng một bài ít comment mà nick đã kết nối xem được, bấm **Quét ngay**; nếu thiếu, bấm **Chẩn đoán trang này** trên bài đó và gửi báo cáo.
- **Chưa kiểm:** chạy thật trong Chrome (service worker, cửa sổ quét, hẹn giờ, thông báo).

## Cho người phát triển

```
extension/
  manifest.template.json   Manifest V3; quyền: storage, alarms, tabs, scripting, notifications; host: *.facebook.com + webapp
  build.mjs                Gộp bằng esbuild vào dist/ (APP_ORIGIN cố định lúc build; phiên bản lấy từ manifest)
  src/background.ts        Service worker: hẹn giờ, hỏi việc, mở cửa sổ/tab quét, nạp bổ sung content.js, gửi kết quả, nhật ký, thông báo
  src/api.ts               Gọi /api/ext/* (xác thực bằng mã kết nối, không dùng cookie)
  src/storage.ts           Mã, thiết lập, nhật ký ngắn, báo cáo chẩn đoán gần nhất
  src/content/selectors.ts TẤT CẢ cách tìm phần tử/nhãn trên trang Facebook (sửa ở đây khi Facebook đổi)
  src/content/extract.ts   Đọc comment, tác giả bài, cuộn trang, chẩn đoán
  src/content/facebook.ts  Luồng quét một bài; trả lời PING / SCAN / GET_POST_INFO / DIAGNOSE
  src/popup, src/options   Popup và trang Cài đặt & hướng dẫn
  src/icons                Biểu tượng (sinh bằng sharp, không dùng hình/màu thương hiệu Facebook)
```

- `npm run ext:check`: kiểm tra kiểu. `npx vitest run extension`: chạy test (gồm hàng rào chống tự động gửi / che giấu).
- Đổi selector: chỉ sửa `selectors.ts` (nhãn nút, cách tìm phần tử), thêm ca vào `selectors.test.ts` / `extract.test.ts`, build lại.
- Đọc báo cáo chẩn đoán: `counts.articlesWithCommentLink` = 0 mà `articlesWithCommentLabel` > 0 nghĩa là Facebook không còn để `comment_id` trong link thời gian (extension đang dùng mã tạm); `linkPatterns` và `sampleCommentStructure` cho biết nên bắt theo mẫu nào; `visibility` = "hidden" nghĩa là trang bị ẩn nên Facebook có thể không vẽ hết (đổi thiết lập sang cửa sổ riêng).
- Mọi logic nặng (tách số, phân loại, chống trùng) nằm ở webapp, không nằm ở extension.
