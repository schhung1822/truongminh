# Extension Chrome: Trường Minh - Lead Facebook

Extension đọc **comment trên bài do chính nick của bạn đăng** và gửi về webapp Trường Minh, để webapp tách số điện thoại và đưa vào mục **Lead Facebook**. Thiết kế đầy đủ: [docs/thiet-ke-module-lead-facebook.md](../docs/thiet-ke-module-lead-facebook.md).

## Extension làm gì và KHÔNG làm gì

Làm:
- Cứ mỗi vài phút hỏi webapp "có bài nào cần quét không", mở **từng bài một** trong tab nền, đọc comment, gửi về, đóng tab.
- Nút **Theo dõi bài này**: đưa bài đang mở vào danh sách theo dõi (chỉ khi tác giả bài là nick của bạn).

Không làm, và có test chặn ([src/guard.test.ts](src/guard.test.ts)):
- Không tự đăng bài, không tự comment, không tự bấm gửi, không gõ chữ vào ô nào của Facebook. Chỉ bấm các nút để **mở rộng nội dung đã có**: "Xem thêm bình luận", "Xem phản hồi", "Xem thêm", menu "Tất cả bình luận".
- Không đọc bài của người khác: chỉ mở link bài mà webapp giao, và webapp chỉ giao bài của đúng nick gắn với mã kết nối.
- Không đọc cookie hay token đăng nhập Facebook, không đọc tin nhắn, không mở trang nào ngoài danh sách việc.
- Không dùng tài khoản mua lại, proxy, giả lập vân tay trình duyệt, độ trễ ngẫu nhiên hay bất kỳ kỹ thuật nào che giấu việc tự động hoá. Độ trễ giữa các bài là **số cố định** (mặc định 45 giây) chỉ để không tạo tải bất thường lên tài khoản.
- Không lưu comment hay số điện thoại trên máy. Dữ liệu chỉ nằm tạm trong bộ nhớ khi quét rồi gửi đi.

Khi Facebook yêu cầu xác minh nick (checkpoint) hoặc hiện trang đăng nhập, extension **dừng toàn bộ**, báo về webapp, và webapp ngừng giao việc cho nick đó cho tới khi quản trị viên bật lại.

## Cài đặt (nhân sự)

Cần Node.js để build (một lần, quản trị viên làm giúp được):

```bash
npm run ext:build                 # địa chỉ webapp mặc định: https://truongminh.activate.vn
# APP_ORIGIN=http://localhost:3000 npm run ext:build     (bản thử ở máy dev)
```

Kết quả ở thư mục `extension/dist/`. Gửi thư mục này cho nhân sự (nén zip), rồi trên máy nhân sự:

1. Mở `chrome://extensions`, bật **Chế độ nhà phát triển** (góc phải trên).
2. Bấm **Tải tiện ích đã giải nén** và chọn thư mục `dist`.
3. Trên webapp: **Lead Facebook > Kết nối extension**: thêm nick Facebook của mình, bấm **Tạo mã kết nối** (mã chỉ hiện một lần, sao chép ngay).
4. Trong Chrome, bấm biểu tượng extension > **Cài đặt**, dán mã, bấm **Kết nối**.
5. Đăng nhập Facebook trên chính Chrome này bằng nick đã thêm.

## Dùng hằng ngày

1. Đăng bài lên nhóm như bình thường (extension không đăng hộ).
2. Mở bài vừa đăng ở trang riêng của nó (bấm vào thời gian đăng), bấm biểu tượng extension > **Theo dõi bài này**. Hoặc dán link bài ở webapp: **Lead Facebook > Bài đăng**.
3. Extension tự quét theo chu kỳ. Muốn quét ngay: **Quét ngay** trong popup.
4. Lead xuất hiện ở **Lead Facebook > Lead**.

Chrome phải đang mở (có thể thu nhỏ) và máy không ngủ thì mới quét được.

## Khi có sự cố

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| Popup báo "Chưa kết nối" | Chưa nhập mã, hoặc mã đã bị thu hồi. Tạo mã mới trên webapp và nhập lại ở Cài đặt. |
| Báo "Facebook đang hiện trang đăng nhập" | Hết phiên Facebook trên Chrome này. Đăng nhập lại rồi bấm Quét ngay. |
| Báo "Facebook đang yêu cầu xác minh nick" | Vào Facebook xử lý xác minh bằng tay. Nick bị tạm ngừng giao việc; nhờ quản trị viên bật lại ở webapp sau khi nick ổn. |
| Báo "Không đọc được trang Facebook (mục ...)" | Facebook đổi giao diện. Webapp hiện cảnh báo ở **Kết nối extension**. Cần sửa [src/content/selectors.ts](src/content/selectors.ts) và build lại (xem dưới). |
| "Theo dõi bài này" báo không phải bài của nick | Chỉ theo dõi được bài do nick đã kết nối đăng. Kiểm tra đúng nick đang đăng nhập Facebook và đúng nick đã thêm ở webapp. |

## Chưa kiểm chứng (đọc trước khi dùng thật)

Phần này được viết và kiểm thử **không có Facebook thật**:

- **Đã kiểm:** logic tách số, phân loại, API và lưu dữ liệu ở webapp (có test và chạy thử đầu cuối); logic đọc comment, đọc tác giả, tìm nút, nhận biết trang đăng nhập/xác minh, trên một trang HTML mô phỏng ([src/content/extract.test.ts](src/content/extract.test.ts)); bản build tạo ra đúng.
- **Chưa kiểm:** cấu trúc và nhãn của trang Facebook thật. Các selector và nhãn trong [src/content/selectors.ts](src/content/selectors.ts) là **định hướng** theo hiểu biết về giao diện Facebook (role, aria-label, tham số `comment_id` trong link thời gian). Facebook có thể khác, và đổi theo thời gian.
- **Chưa kiểm:** chạy thật trong Chrome (service worker, tab nền, hẹn giờ).

Cách kiểm lần đầu (khuyến nghị): dùng **một bài thật của nick bạn, ít comment**, bấm **Quét ngay** và so với trang Facebook. Nếu thiếu comment hoặc báo `selector_broken`, mở DevTools ở tab Facebook để xem cấu trúc và chỉnh `selectors.ts` / `extract.ts`.

## Cho người phát triển

```
extension/
  manifest.template.json   Manifest V3, quyền tối thiểu: storage, alarms, tabs; host: facebook.com + webapp
  build.mjs                Gộp bằng esbuild vào dist/ (địa chỉ webapp cố định lúc build: APP_ORIGIN)
  src/background.ts        Service worker: hẹn giờ, hỏi việc, quét tuần tự, gửi kết quả
  src/api.ts               Gọi /api/ext/* (xác thực bằng mã kết nối, không dùng cookie)
  src/content/selectors.ts TẤT CẢ cách tìm phần tử/nhãn trên trang Facebook (sửa ở đây khi Facebook đổi)
  src/content/extract.ts   Đọc comment, tác giả bài; bấm nút mở rộng
  src/content/facebook.ts  Luồng quét một bài
  src/popup, src/options   Giao diện nhỏ
```

- `npm run ext:check`: kiểm tra kiểu. `npx vitest run extension`: chạy test (gồm hàng rào chống tự động gửi / che giấu).
- Đổi selector: chỉ sửa `selectors.ts` (nhãn nút, cách tìm phần tử), thêm ca vào `selectors.test.ts`, build lại.
- Mọi logic nặng (tách số, phân loại, chống trùng) nằm ở webapp, không nằm ở extension.
