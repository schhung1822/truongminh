# Hướng dẫn chi tiết: Lead Facebook (extension Chrome "Data Lead Facebook" + webapp)

Tài liệu này giải thích **cách hệ thống hoạt động từ đầu đến cuối**, bằng ngôn ngữ thường, để đọc, hiểu và nghiên cứu. Nó không thay thế hai tài liệu kỹ thuật:

- `docs/thiet-ke-module-lead-facebook.md`: bản thiết kế gốc (yêu cầu, bảng dữ liệu, API).
- `thiet-ke-module-lead-facebook-v1.1-luong-nha-san-xuat.md` (ở gốc dự án): bản bổ sung v1.1, luồng tìm nhà sản xuất và mời dùng vật liệu.
- `extension/README.md`: hướng dẫn cài đặt nhanh.

Mục lục:
1. Hệ thống này để làm gì
2. Bức tranh tổng thể: ai làm việc gì
3. Một vòng quét diễn ra thế nào (từng bước)
4. Webapp: từng trang dùng để làm gì
5. Ai thấy và làm được gì (vai trò)
6. Cách hệ thống nhận ra số điện thoại và phân loại comment
7. Vòng đời của một lead
8. Những gì extension KHÔNG làm (và được đảm bảo thế nào)
9. Dữ liệu nào đi đâu, lưu ở đâu, giữ bao lâu
10. Các thiết lập và ý nghĩa của từng số
11. Khi có sự cố: hệ thống tự xử lý ra sao
12. Những điều chưa được kiểm chứng và rủi ro thật
13. Bài tập tự thử để hiểu sâu hơn
14. Câu hỏi thường gặp
15. Từ điển thuật ngữ
16. Muốn đọc code thì bắt đầu từ đâu
17. Trả lời comment và luồng nhà sản xuất (bổ sung v1.1)

---

## 1. Hệ thống này để làm gì

Phòng marketing đăng bài lên các nhóm Facebook để tìm khách hoặc tìm bên sản xuất. Khách thường **comment** vào bài: để lại số điện thoại, hoặc viết "ib", "quan tâm". Việc đọc tay từng bài, từng comment, chép số vào sổ rất mất công và dễ sót.

Hệ thống làm thay đúng **phần đọc và ghi chép**:

1. Tự đọc comment trên **các bài người dùng chủ động theo dõi**, kể cả bài do người khác đăng nếu nick đã kết nối xem được.
2. Tách số điện thoại, Zalo, email ra khỏi comment.
3. Đưa vào danh sách **Lead** trên webapp để sale gọi lại.

Hệ thống **không** đăng bài, không nhắn tin, không bấm gửi. Mọi thao tác "gửi" trên Facebook vẫn do người làm bằng tay.

Từ bản 0.4.0 của extension (28/11/2026) có thêm phần **trả lời comment bán tự động**: webapp soạn sẵn câu trả lời, người duyệt, extension điền sẵn vào đúng ô trả lời rồi dừng lại, người đọc lại và tự bấm gửi. Phần này phục vụ **luồng nhà sản xuất** (bổ sung v1.1): xưởng comment vào bài tìm nhà sản xuất thì fanpage vào mời dùng vật liệu. Xem mục 17. Hỗ trợ đăng bài (giai đoạn 3) chưa làm.

---

## 2. Bức tranh tổng thể: ai làm việc gì

Có hai phần chạy ở hai nơi khác nhau:

```
 MÁY CỦA NHÂN SỰ (Chrome)                     VPS (truongminh.activate.vn)
 ┌─────────────────────────────┐              ┌──────────────────────────────┐
 │  EXTENSION  (đôi mắt)       │   HTTPS      │  WEBAPP  (bộ não + sổ sách)  │
 │                             │  ◄────────►  │                              │
 │  - hẹn giờ                  │              │  - nhớ bài nào cần theo dõi  │
 │  - mở bài Facebook          │              │  - quyết định bài nào quét   │
 │  - đọc comment trên trang   │              │  - tách số điện thoại        │
 │  - gửi dữ liệu thô về       │              │  - phân loại, chống trùng    │
 │                             │              │  - tạo lead, thống kê        │
 └──────────────┬──────────────┘              │  - phân quyền                │
                │                             └──────────────┬───────────────┘
                ▼                                            ▼
          FACEBOOK (trang web)                         CƠ SỞ DỮ LIỆU MySQL
```

**Nguyên tắc thiết kế:** extension càng đơn giản càng tốt. Nó chỉ *nhìn trang và báo lại*. Mọi phần "thông minh" (tách số, phân loại, chống trùng, chia lead) nằm ở webapp. Lợi ích: khi Facebook đổi giao diện, chỉ phải sửa một file nhỏ của extension; còn luật nghiệp vụ nằm ở một chỗ duy nhất, có test.

### Các "bộ phận" bên trong extension
| Bộ phận | Làm gì |
|---|---|
| **Background (service worker)** | Bộ điều phối chạy ngầm. Hẹn giờ, hỏi webapp có việc gì, mở tab, gửi kết quả về. Là nơi *duy nhất* nói chuyện với webapp. |
| **Content script** | Đoạn mã chạy *bên trong trang Facebook*. Chỉ làm khi background nhờ: đọc comment, đọc tác giả bài. Không tự chạy gì, không giữ mã kết nối. |
| **Popup** | Cửa sổ nhỏ hiện ra khi bấm biểu tượng extension: trạng thái, tiến độ đang quét, nhật ký gần đây, nút "Quét ngay", "Theo dõi bài này", "Chẩn đoán trang này", đường dẫn nhanh tới webapp. |
| **Cài đặt & hướng dẫn (options)** | Dán mã kết nối; chọn cách mở bài khi quét (cửa sổ nhỏ riêng hay tab nền); bật/tắt thông báo lead mới; hướng dẫn, bảng sự cố, ô sao chép báo cáo chẩn đoán. |

### Webapp biết "ai là ai" bằng gì
Extension không dùng mật khẩu hay cookie của webapp. Nó dùng một **mã kết nối** (chuỗi bắt đầu bằng `tmx_`), mỗi máy một mã, gắn với một nick Facebook. Mỗi lần extension gọi webapp đều gửi mã này; webapp kiểm tra mã còn hiệu lực rồi mới trả lời.

---

## 3. Một vòng quét diễn ra thế nào (từng bước)

Đây là phần quan trọng nhất. Giả sử anh Hùng đã kết nối extension và đã thêm 3 bài vào danh sách theo dõi.

### Bước 0. Ai kích hoạt vòng quét
- **Tự động:** extension đặt một "đồng hồ báo thức" của Chrome. Sau khi kết nối, báo thức đầu tiên reo sau 1 phút, rồi cứ mỗi **10 phút** (số này chỉnh được ở webapp).
- **Thủ công:** bấm **Quét ngay** trong popup. Cách này bỏ qua lịch, quét ngay các bài (vẫn giữ giới hạn số bài mỗi lần).

Nếu một vòng quét khác đang chạy thì vòng mới bị bỏ qua, để không quét chồng nhau.

### Bước 1. Hỏi "mã còn dùng được không?" (`/api/ext/me`)
Extension gửi mã lên. Webapp kiểm tra:
- mã có đúng không, có bị thu hồi không;
- tài khoản nhân sự có bị khóa không;
- nick Facebook có đang ở trạng thái **Đang hoạt động** không (nếu *Tạm dừng* hoặc *Bị hạn chế* thì vòng quét dừng ngay, không làm gì thêm).

Webapp trả về: tên nhân sự, nick, và các thiết lập chạy (chu kỳ, số bài tối đa, độ trễ giữa các bài).

### Bước 2. Hỏi "có bài nào cần quét không?" (`/api/ext/jobs`)
Webapp xem danh sách bài **đang theo dõi của đúng nick này** và chọn ra những bài *đến lượt*:

- **Bài mới đăng** (trong 48 giờ gần đây): quét dày, mỗi 10 phút.
- **Bài cũ hơn:** quét thưa, mỗi 60 phút.
- **Bài chưa quét lần nào:** được ưu tiên số 1.
- Thứ tự ưu tiên: chưa quét lần nào → bài mới → bài lâu chưa quét nhất.
- Mỗi lần tối đa **8 bài**.
- Bài nào quá **7 ngày không có comment mới** thì tự chuyển sang **Đã xong** và không quét nữa.
- Bài thuộc nhóm đã đánh dấu **Bị chặn** thì bỏ qua.

Webapp trả về danh sách: mỗi bài gồm mã bài, đường link, và danh sách mã comment đã biết.

> Quan trọng: extension **chỉ mở những link webapp giao**. Nó không tự đi tìm bài nào khác.

### Bước 3. Quét từng bài, lần lượt, một tab một lúc
Với mỗi bài trong danh sách (theo thứ tự):

Trước hết extension mở bài trong **tab nền không lấy focus** và chỉ đọc tổng comment. Nếu tổng bằng lần quét đầy đủ trước, tab được đóng ngay và không mở cửa sổ quét. Nếu tổng thay đổi, chưa có mốc đủ tin cậy, hoặc đã 24 giờ chưa đọc đầy đủ, chính tab đó mới được chuyển sang cửa sổ nhỏ để làm các bước dưới đây.

1. **Chuyển bài sang một cửa sổ Facebook nhỏ riêng ở góc màn hình** (không lấy mất con trỏ chuột; quét xong tự đóng). Lý do: Facebook chỉ vẽ nốt phần bình luận khi trang đang hiện; tab bị ẩn thì trình duyệt tạm dừng, dễ đọc thiếu. Ở Cài đặt có thể giữ bước đầy đủ trong tab nền nếu cửa sổ gây vướng, đổi lại khả năng đọc thiếu cao hơn.
2. **Chờ trang tải xong** (tối đa 60 giây).
3. **Kiểm tra có bị chuyển trang lạ không:**
   - Nếu Facebook đưa về trang **đăng nhập** → dừng cả vòng, báo về webapp.
   - Nếu Facebook đưa về trang **xác minh (checkpoint)** → dừng cả vòng, báo về webapp, nick bị đánh dấu *Bị hạn chế* (xem mục 11).
4. **Content script bắt đầu đọc trang:**
   1. Chờ phần bài đăng hiện ra (tối đa 25 giây), tìm vùng cuộn thật của dialog Facebook và cuộn vùng đó thay vì chỉ cuộn toàn cửa sổ.
   2. Đổi bộ lọc bình luận sang **"Tất cả bình luận"** (nếu đang ở "Phù hợp nhất").
   3. **Bấm các nút để mở rộng nội dung đã có**: "Xem thêm bình luận", "Xem phản hồi". Sau mỗi lần bấm, `MutationObserver` chờ DOM ngừng thay đổi thay vì đoán bằng một khoảng chờ cố định. Nút chậm được thử lại tối đa hai lần.
   4. **Thu thập cuốn chiếu:** sau từng lần cuộn/mở rộng, comment đang hiện được cộng vào bộ nhớ theo mã. Vì vậy Facebook có gỡ comment cũ khỏi DOM khi cuộn xuống thì phần đã đọc vẫn được giữ. "Xem thêm" được bấm trước khi ghi nhận nội dung bị cắt.
   5. Khi hết nút, bộ đọc cuộn qua đầu/giữa/cuối và chỉ kết thúc sau **3 vòng không có comment hoặc nút mới**. Bài thường có tối đa **160 lần mở rộng / 5 phút**; bài trên 100 comment có tối đa **300 lần / 8 phút**.
   6. **Đọc từng comment:** mã comment (lấy từ tham số `comment_id` trong đường link thời gian của comment; không có link thì dùng nhãn "Bình luận của X" và một mã tạm băm từ người viết + nội dung), tên người viết, link trang cá nhân, nội dung, chuỗi thời gian ("2 giờ"), và comment cha nếu là trả lời.
   7. Đánh dấu comment nào là của *chính nick mình* (so link, hoặc so tên hiển thị khi link khác dạng).
5. **Gửi toàn bộ về webapp** (`/api/ext/posts/{mã bài}/comments`).
6. **Đóng cửa sổ.** Nếu bài được thêm bằng link chia sẻ rút gọn (`share/p/...`), extension báo lại địa chỉ thật của bài để webapp cập nhật.
7. **Chờ 45 giây** (số cố định, chỉnh được) rồi sang bài kế. Chờ để không tạo tải bất thường lên tài khoản, *không phải* để giả làm người.

Nếu đọc dở giữa chừng (quá giới hạn thích ứng 5–8 phút hoặc 160–300 lần bấm), extension vẫn gửi phần đã cộng dồn nhưng báo "chưa trọn vẹn". Webapp lưu phần đó và **không ghi nhận là đã quét xong**, nên vòng sau sẽ quét lại bài đó.

Mốc tổng chỉ được lưu khi bộ đọc đạt ít nhất **95%** số Facebook công bố. Vì vậy trường hợp Facebook báo 75 nhưng mới đọc 10 sẽ tiếp tục được quét sâu, không bị coi là "không đổi" rồi bỏ qua. Quét nhanh giúp giảm ảnh hưởng trên máy, nhưng không thể làm mọi lần đọc sâu hoàn toàn vô hình vì Facebook thường không lazy-load đầy đủ trong tab bị ẩn.

### Bước 4. Webapp xử lý những gì nhận được
Với mỗi comment:

1. **Chống trùng:** mỗi comment có mã Facebook riêng. Webapp lưu theo cặp *(bài, mã comment)*. Comment đã có thì không tạo lại; comment đã có nhưng *nội dung bị sửa* thì cập nhật.
2. **Comment của chính nick mình** → gán loại "Khác", **không tách số**. Lý do: câu trả lời của nhân sự có thể chứa số của xưởng, không được biến thành lead.
3. **Comment của người khác** → tách số điện thoại, Zalo, email; phân loại (mục 6).
4. **Có liên hệ** → tạo **lead**. Nếu số điện thoại đó đã có lead thì *không tạo lead mới*, chỉ ghi thêm "comment này cũng là nguồn của lead đó".
5. Cập nhật bộ đếm của bài (số comment, số lead, lần quét cuối).
6. Ghi nhật ký (quét thành công / quét dở).

### Bước 5. Extension ghi kết quả vào popup
"Lần quét gần nhất: 3 bài · 12 comment mới · 2 lead mới", kèm lỗi nếu có; mục **Nhật ký gần đây** ghi từng bài đọc được bao nhiêu comment. Có lead mới thì Chrome hiện thông báo nhỏ (tắt được).

**Nhiều máy:** webapp giao việc theo nick. Hai máy cùng một nick không được giao cùng một bài trong 12 phút (giữ chỗ), nên không quét trùng.

### Sơ đồ tóm tắt
```
Chuông báo (10 phút) hoặc bấm "Quét ngay"
        │
        ▼
Extension ──► "mã còn dùng được không?" ──► Webapp kiểm tra mã, nick
        │
        ▼
Extension ──► "có bài nào cần quét?" ─────► Webapp chọn theo lịch
        │                                        (tối đa 8 bài)
        ▼
 ┌─ với từng bài, lần lượt ──────────────────────────────┐
 │  mở tab nền → kiểm tra không phải trang đăng nhập/     │
 │  checkpoint → bấm "xem thêm" cho đến hết → đọc comment │
 │  → gửi về → đóng tab → chờ 45 giây                     │
 └────────────────────────────────────────────────────────┘
        │
        ▼
Webapp: chống trùng → tách số → phân loại → tạo/gộp lead → cập nhật bộ đếm
        │
        ▼
Sale thấy lead ở trang "Lead"
```

---

## 4. Webapp: từng trang dùng để làm gì

Menu **Lead Facebook** có các mục dưới đây, cộng hai mục của phần trả lời comment (Hàng chờ trả lời, Mẫu câu & Fanpage) mô tả ở mục 17.

### 4.1. Lead
Danh sách người đã để lại liên hệ. Mỗi dòng: tên, số điện thoại / Zalo / email, nhóm nguồn, trạng thái, người phụ trách, thời gian.

- **Bộ lọc:** tìm theo tên/số/Zalo/email; theo trạng thái; theo loại (tìm khách / tìm bên sản xuất); theo nhóm; theo người phụ trách; theo khoảng ngày. (Sale chỉ có ô tìm, trạng thái, loại, ngày, vì chỉ thấy lead của mình.)
- **Đổi nhanh trạng thái** ngay trên dòng.
- **Nút Chi tiết** mở cửa sổ gồm:
  - số liên hệ, link trang Facebook của người đó, link bài gốc;
  - **các comment gốc** (một người comment nhiều lần/nhiều bài thì thấy hết);
  - đổi trạng thái, viết ghi chú;
  - **gán sale phụ trách** (chỉ quản trị và marketing);
  - **gắn vào khách hàng có sẵn** trong hệ thống: webapp *gợi ý* những khách có số điện thoại trùng (so sau khi chuẩn hoá), anh bấm để gắn; hoặc tìm theo tên/số;
  - **xóa lead và comment liên quan** (chỉ quản trị): dùng khi khách yêu cầu xóa dữ liệu.

### 4.2. Bài đăng
Danh sách bài đang theo dõi: bài, nhóm, nick dùng để quét, số comment, số lead, lần quét cuối, trạng thái.

- **Thêm bài bằng cách dán link** (permalink) rồi chọn nick dùng để mở và quét bài. Bài có thể do người khác đăng.
- Mỗi bài có **Mục đích** (Tìm khách / Tìm bên sản xuất): quyết định lead sinh ra là "khách" hay "bên sản xuất". Đổi mục đích chỉ ảnh hưởng lead sinh ra *từ lần quét sau*.
- **Tạm dừng / Theo dõi lại / Kết thúc** từng bài.

### 4.3. Nhóm
Danh sách nhóm Facebook, tự tạo khi thêm bài thuộc nhóm đó (tên tạm lấy từ link, anh sửa lại cho dễ nhớ). Mỗi nhóm có: chủ đề, mục đích, **ghi chú quy định của nhóm**, trạng thái (Đang hoạt động / Tạm dừng / Bị chặn), và số liệu: **số bài đã đăng, số lead, lead trên mỗi bài**. Dùng cột cuối để biết nhóm nào hiệu quả.

### 4.4. Kết nối extension
Nằm ở **Hệ thống > Kết nối > Extension Facebook** (link cũ `/fb/connect` tự chuyển về đây). Mỗi nick là một thẻ, bên trong là các máy đang chạy extension bằng nick đó.
- **Nick Facebook:** thêm nick (tên hiển thị + link trang cá nhân), tạm dừng/bật lại. Nick *Bị hạn chế* chỉ quản trị bật lại được.
- **Mã kết nối:** trong thẻ của từng nick, đặt tên máy rồi tạo mã (hiện **một lần duy nhất**); xem danh sách máy, máy nào "Đang chạy", "hoạt động cuối", thu hồi.
- **Cảnh báo từ extension (14 ngày gần đây):** các lần Facebook đòi xác minh, extension không đọc được trang, quét chưa trọn vẹn, và **báo cáo chẩn đoán** do nhân sự bấm gửi (cột Chi tiết là dữ liệu để người phát triển chỉnh bộ đọc, không chứa tên hay nội dung comment).
- **Cấu hình** (chỉ quản trị): các số ở mục 10.

---

## 5. Ai thấy và làm được gì (vai trò)

| | Quản trị | Marketing | Sale |
|---|---|---|---|
| Xem mọi lead | Có | Có | **Không**, chỉ lead được gán cho mình |
| Đổi trạng thái / ghi chú lead | Có | Có | Có (với lead của mình) |
| Gắn lead vào khách hàng | Có | Có | Có (với lead của mình) |
| Gán sale phụ trách | Có | Có | Không |
| Thêm/sửa bài, nhóm | Có | Có | Không |
| Thêm nick, tạo mã kết nối | Cho mọi nick | Cho nick **của mình** | Không |
| Thu hồi mã | Mọi mã | Mã của mình | Không |
| Bật lại nick bị hạn chế | **Có** | Không | Không |
| Sửa cấu hình | Có | Không | Không |
| Xóa lead và comment liên quan | **Có** | Không | Không |

Tạo tài khoản Marketing và đổi vai trò Sale ↔ Marketing ở **Hệ thống > Người dùng** (chỉ quản trị).

---

## 6. Cách hệ thống nhận ra số điện thoại và phân loại comment

### 6.1. Tách số điện thoại
Hệ thống chấp nhận nhiều cách viết:

| Khách viết | Hệ thống hiểu |
|---|---|
| `0912345678` | `0912345678` |
| `0912.345.678`, `0912 345 678`, `0912-345-678` | `0912345678` |
| `+84912345678`, `84912345678`, `0084912345678` | `0912345678` |
| `+84 (0)912 345 678` | `0912345678` |
| `o912345678`, `09l2345678` | `0912345678` (chữ o, l bị gõ nhầm, **chỉ đổi khi cụm có từ 7 chữ số thật trở lên**) |
| `0912345678 - 0987654321` | hai số riêng |

Chỉ nhận **số di động Việt Nam hợp lệ**: đúng 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09. Số bàn (02...), số sai độ dài, giá tiền (`1.500.000`), ngày tháng (`20/11/2026`), số dính liền với chữ (`abc0912345678`) đều bị bỏ.

Ngoài ra tách thêm:
- **Zalo:** số đứng ngay sau chữ "zalo"/"zl", hoặc link `zalo.me/...`.
- **Email.**

**Số viết bằng chữ** ("không chín một hai ba bốn...") hệ thống *không tách bằng luật*. Nó đánh dấu comment là "Câu hỏi" để người đọc xem.

### 6.2. Phân loại comment
Thứ tự kiểm tra (cái nào khớp trước thì lấy):

| Loại | Điều kiện | Việc hệ thống làm |
|---|---|---|
| **Spam** | Có link ra ngoài Facebook/Zalo, hoặc có từ quảng cáo (tuyển CTV, kiếm tiền online...) | Lưu, bỏ qua. *Ưu tiên hơn "có số"*, vì comment quảng cáo thường kèm số của người khác |
| **Có liên hệ** | Tách được số, Zalo hoặc email | **Tạo lead** |
| **Câu hỏi** | Số viết bằng chữ; có dấu "?"; hỏi "bao nhiêu", "ở đâu", "có... không" | Lưu (người đọc kỹ sau) |
| **Quan tâm** | "ib", "inbox", "quan tâm", "cần tư vấn", "báo giá", "xin giá", "chấm", dấu "." đứng riêng | Lưu. Nếu bật công tắc ở Mẫu câu & Fanpage: soạn sẵn câu dẫn về inbox fanpage (mục 17) |
| **Khác** | Còn lại, hoặc comment của chính nick mình | Lưu, bỏ qua |

Từ khóa nằm trong file `lib/fb/keywords.ts`. Hiện sửa từ khóa phải sửa file; trang sửa từ khóa trên webapp sẽ làm ở giai đoạn 2.

---

## 7. Vòng đời của một lead

```
Khách comment kèm số ──► Extension đọc ──► Webapp tạo LEAD (trạng thái: Mới, chưa gán)
                                                     │
                       Marketing/quản trị gán sale ──┘
                                                     ▼
                        Sale gọi ──► Đã liên hệ ──► Có nhu cầu ──► Chốt đơn
                                                     │                  
                                                     └──► Mất / Không hợp lệ
```

- Trạng thái: **Mới → Đã liên hệ → Có nhu cầu → Chốt đơn**, hoặc **Mất**, hoặc **Không hợp lệ** (số sai, spam lọt lưới...).
- **Chống trùng theo số điện thoại:** cùng một số ở nhiều comment/nhiều bài chỉ ra **một lead**. Lead hiện "N comment" để biết khách đã quan tâm nhiều lần. Khách để cả email hoặc Zalo ở comment sau thì lead được bổ sung.
- **Lead chỉ có email** (không có số) được gộp theo email.
- **Gắn khách hàng:** sau khi chốt, gắn lead vào khách hàng trong hệ thống để liền mạch với phần làm ảnh/báo giá.

---

## 8. Những gì extension KHÔNG làm (và được đảm bảo thế nào)

Đây là các giới hạn cố ý. Không chỉ ghi thành quy ước mà còn **ép bằng code**:

| Không làm | Được đảm bảo bằng |
|---|---|
| Tự đăng bài, tự gửi comment, tự bấm gửi | Khi quét, extension chỉ bấm các nút *mở rộng nội dung đã có*. Khi trả lời, nó chỉ **điền sẵn câu người đã duyệt** rồi dừng. Có một **test tự động** (`extension/src/guard.test.ts`) sẽ báo đỏ nếu code có giả lập bàn phím (phím Enter), gửi form, chèn chữ ở ngoài file `fill.ts`, hoặc bấm nút mà không qua bước kiểm tra "đây không phải nút gửi" |
| Tự tìm hoặc quét bài chưa được đăng ký | Webapp chỉ giao đúng permalink người dùng đã chủ động thêm; API chỉ nhận comment cho bài thuộc danh sách theo dõi của nick quét gắn với mã, bài khác bị từ chối 404 |
| Đọc cookie, token đăng nhập Facebook, tin nhắn | Extension không xin quyền đọc cookie; chỉ có quyền ở `facebook.com` và webapp; test chặn dùng `document.cookie` |
| Che giấu việc tự động hóa (độ trễ ngẫu nhiên, đổi user-agent, proxy, vân tay trình duyệt, tài khoản mua lại) | Mọi độ trễ là **số cố định**; test chặn `Math.random`, đụng `navigator.userAgent`, proxy... |
| Lưu comment/số điện thoại trên máy nhân sự | Dữ liệu chỉ nằm trong bộ nhớ khi quét rồi gửi đi. Chỉ lưu mã kết nối và kết quả vòng gần nhất |
| Quét thành viên nhóm, đổi UID ra số điện thoại | Không có chức năng nào như vậy |

**Hai điểm cần hiểu đúng:**
1. Nick gắn với mã kết nối là **nick dùng để quét**, không nhất thiết là tác giả bài. Nick phải có quyền xem bài và comment; nội dung Facebook không hiển thị cho nick thì extension cũng không đọc được.
2. "Che giấu tự động hóa" bị cấm, *không có nghĩa là Facebook không phát hiện được*. Xem mục 12.

---

## 9. Dữ liệu nào đi đâu, lưu ở đâu, giữ bao lâu

### Extension gửi lên webapp
| Khi nào | Dữ liệu |
|---|---|
| Mỗi vòng | Mã kết nối (để xác thực) |
| Sau khi quét một bài | Với từng comment: mã comment, mã comment cha, tên người viết, link trang cá nhân, nội dung, chuỗi thời gian ("2 giờ"), cờ "của chính nick" |
| Bấm "Theo dõi bài này" | Link bài, link nhóm, nội dung bài (tối đa 2000 ký tự), **link và tên tác giả bài** |
| Gặp sự cố | Loại sự cố (đăng nhập, checkpoint, không đọc được trang), link bài, vài chi tiết kỹ thuật |

### Webapp lưu (MySQL)
| Bảng | Nội dung |
|---|---|
| `fb_accounts` | Nick Facebook, trạng thái |
| `fb_groups` | Nhóm, ghi chú quy định |
| `fb_posts` | Bài đang theo dõi, lần quét cuối, số comment/lead |
| `fb_comments` | Comment đã đọc, loại, số đã tách |
| `fb_leads` | Lead (có số, Zalo, email, trạng thái, người phụ trách, khách hàng đã gắn) |
| `fb_lead_sources` | Mỗi comment chứa liên hệ của một lead |
| `ext_tokens` | Mã kết nối (**chỉ lưu bản băm**, không lưu mã gốc) |
| `ext_logs` | Nhật ký extension báo về |

### Thời hạn lưu
- Comment loại **Khác** và **Spam**: tự xóa sau **90 ngày** (chỉ khi đã bật việc định kỳ `FB_CRON_SECRET` trên VPS; chưa bật thì chưa tự xóa). Comment đã thành lead hoặc là nguồn của lead **không bị xóa**.
- Nhật ký quét thường: 30 ngày. Cảnh báo (checkpoint, không đọc được trang): 180 ngày. Việc dọn nhật ký cũng chỉ chạy khi đã bật việc định kỳ nói trên.
- Lead: giữ cho đến khi quản trị xóa tay (khi khách yêu cầu).

> Nhắc lại: số điện thoại là dữ liệu cá nhân. Chỉ dùng để liên hệ đúng nhu cầu khách đã nêu trong comment. Bản thiết kế khuyến nghị hỏi luật sư về nghĩa vụ theo Luật Bảo vệ dữ liệu cá nhân trước khi chạy quy mô lớn.

---

## 10. Các thiết lập và ý nghĩa của từng số

Ở **Hệ thống > Kết nối > Extension Facebook > Cấu hình quét** (chỉ quản trị). Áp dụng cho mọi extension ở lần hỏi việc kế tiếp.

| Thiết lập | Mặc định | Ý nghĩa |
|---|---|---|
| Chu kỳ hỏi việc | 10 phút | Extension hỏi webapp mỗi bấy nhiêu phút; cũng là chu kỳ quét lại bài mới |
| Số bài tối đa mỗi chu kỳ | 8 | Quét tuần tự từng bài, tối đa bấy nhiêu bài mỗi vòng |
| Chờ giữa hai bài | 45 giây | Số cố định; tăng lên nếu muốn nhẹ nhàng hơn nữa |
| Bài mới đăng trong | 48 giờ | Bài trong mốc này được quét dày |
| Chu kỳ quét bài cũ | 60 phút | Bài quá mốc trên được quét thưa hơn |
| Tự kết thúc theo dõi sau | 7 ngày | Bài không có comment mới sau bấy nhiêu ngày thì chuyển "Đã xong" |
| Xóa comment Khác/Spam sau | 90 ngày | `0` = không tự xóa |

**Cách chọn:** thiên về *nhẹ nhàng* (chu kỳ dài, độ trễ dài, ít bài mỗi vòng) thì an toàn cho nick hơn nhưng lead đến chậm hơn. Với vài chục bài và 6-8 nhân sự, mặc định là hợp lý. Thay đổi từng chút một.

---

## 11. Khi có sự cố: hệ thống tự xử lý ra sao

| Tình huống | Extension làm | Webapp làm | Anh/chị cần làm |
|---|---|---|---|
| Facebook hiện trang **đăng nhập** (hết phiên) | Dừng cả vòng, báo "Facebook đang hiện trang đăng nhập" | Ghi nhật ký | Đăng nhập lại Facebook trên Chrome đó, bấm Quét ngay |
| Facebook hiện **checkpoint** (yêu cầu xác minh nick) | Dừng cả vòng, báo về | Đổi nick sang **Bị hạn chế** và **ngừng giao việc**; hiện cảnh báo ở trang Kết nối | Vào Facebook xử lý xác minh bằng tay. Khi nick ổn, **quản trị** bấm "Bật lại nick" |
| Không tìm thấy phần tử trên trang (Facebook đổi giao diện) | Dừng vòng, báo tên mục hỏng, **không đoán mò** | Ghi cảnh báo ở trang Kết nối | Mở bài đó, bấm **Chẩn đoán trang này**, **Sao chép báo cáo** và gửi người phát triển để chỉnh file `selectors.ts` |
| Bộ đọc trang chưa có trong tab (tab mở trước khi cài, hoặc Facebook ở `web.facebook.com`) | Tự nạp bổ sung bộ đọc rồi làm tiếp | — | Không cần làm gì |
| Mã kết nối bị **thu hồi** | Lần gọi kế tiếp nhận lỗi 401, **tắt hẹn giờ**, popup báo "Mã đã bị thu hồi" | Mã không còn dùng được ngay lập tức | Tạo mã mới, dán lại ở Cài đặt |
| Tài khoản nhân sự bị khóa | Giống trên | Mã ngừng hoạt động | Mở khóa ở trang Người dùng |
| Mất mạng / webapp không phản hồi | Báo lỗi vòng đó, vòng sau thử lại | — | Không cần làm gì |
| Quét một bài quá lâu | Gửi phần đã đọc, báo chưa trọn vẹn | Lưu phần đó; vòng sau quét lại bài | Không cần làm gì |

Ngoài ra webapp tự giới hạn: mỗi mã tối đa 120 lần gọi/phút; gọi sai mã nhiều lần từ một địa chỉ bị chặn tạm thời. Nhờ vậy mã bị dò hoặc extension lỗi lặp cũng không làm quá tải.

---

## 12. Những điều chưa được kiểm chứng và rủi ro thật

### Chưa kiểm chứng
Phần webapp (API, lưu, tách số, tạo lead, phân quyền, các trang) đã được kiểm thử kỹ, kể cả chạy đầu cuối. Nhưng:

1. **Cách đọc trang Facebook thật chưa được thử.** Các "cách nhận ra phần tử" và nhãn nút trong `extension/src/content/selectors.ts` được viết theo hiểu biết về giao diện Facebook (dùng `role`, `aria-label`, tham số `comment_id`...), và đã chạy thử trên **một trang HTML mô phỏng**, chưa phải trang Facebook thật. Rất có thể cần chỉnh sau lần thử thật đầu tiên. Đây là chuyện bình thường với mọi công cụ đọc Facebook: giao diện đổi liên tục.
2. **Chạy thật trong Chrome** (hẹn giờ, cửa sổ quét, nạp bổ sung bộ đọc, thông báo) mới chỉ được kiểm bằng lý thuyết và build, chưa chạy thật.

Lần thử đầu tiên (21/11/2026) cho thấy extension nói chuyện được với webapp nhưng chưa gửi được kết quả quét nào. Nguyên nhân xác định được từ code: extension chỉ được phép chạy trên `www.facebook.com`, trong khi Facebook ở Việt Nam hay chuyển sang `web.facebook.com`; tab mở trước khi cài extension cũng không có bộ đọc. Bản 0.2.0 đã sửa (cho phép mọi host con của facebook.com, tự nạp bổ sung bộ đọc, mở bài ở cửa sổ riêng, thêm nút Chẩn đoán).

### Rủi ro cần biết (không giấu)
- **Facebook có thể coi việc mở nhiều bài, bấm "xem thêm" liên tục là hành vi tự động**, dù chậm và có chờ. Hệ thống giảm tải (chậm, tuần tự, có giới hạn, dừng khi gặp xác minh) nhưng **không thể đảm bảo nick không bao giờ bị hạn chế**. Hãy:
  - dùng nick *ổn định, lâu năm*, không dùng nick quan trọng nhất cho lần thử đầu;
  - bắt đầu với ít bài, chu kỳ dài;
  - nếu nick bị checkpoint, dừng lại và xử lý bằng tay trước khi tiếp.
- **Điều khoản của Meta** hạn chế việc thu thập tự động. Hệ thống chỉ quét permalink được thêm chủ động, không che giấu và dừng khi bị yêu cầu xác minh, nhưng theo dõi bài người khác vẫn làm tăng rủi ro tuân thủ và dữ liệu cá nhân; cần sử dụng có mục đích hợp pháp và xem lại chính sách áp dụng.
- **Dữ liệu cá nhân:** xem lưu ý ở mục 9.

---

## 13. Bài tập tự thử để hiểu sâu hơn

Làm theo thứ tự. Mỗi bài tập nhỏ, an toàn.

1. **Xem hai phía của cùng một việc.** Mở **Hệ thống > Kết nối > Extension Facebook**, tạo mã, dán vào extension. Mở popup rồi tải lại trang web: thấy "Hoạt động cuối" của máy đổi thành "vừa xong". Đó là extension đã gọi webapp.
2. **Thử thu hồi.** Bấm **Thu hồi** mã vừa tạo trên web, rồi mở lại popup của extension. Popup đổi sang "Chưa kết nối" kèm lý do "Mã kết nối đã bị thu hồi" và nút Quét ngay bị mờ: thấy rõ mã mất hiệu lực *ngay lập tức*. Tạo mã mới và dán lại ở Cài đặt.
3. **Xem lịch quét.** Thêm 2 bài rồi bấm **Quét ngay** một lần. Ở **Bài đăng**, nhìn cột "Quét cuối" đổi thành "vừa xong". Vòng tự động (mỗi 10 phút) sẽ *không quét lại* bài vừa quét trong 10 phút đầu, vì chưa đến lượt. Còn bấm **Quét ngay** thì quét lại ngay, vì nút này bỏ qua lịch (nhưng vẫn giữ giới hạn số bài).
4. **Hiểu chống trùng.** Quét một bài hai lần liên tiếp. Số comment và số lead **không đổi**. Rồi nhờ người comment thêm một comment mới: chỉ comment mới được thêm.
5. **Hiểu gộp lead.** Tạo hai comment từ hai nick khác nhau cùng ghi số `0912 345 678` và `+84912345678`. Kết quả là **một lead**, hiện "2 comment" ở cột Nguồn.
6. **Hiểu comment của chính mình.** Dùng chính nick đăng bài, tự comment `liên hệ 0987654321`. Quét xong, số này **không thành lead**.
7. **Hiểu phân quyền.** Tạo một tài khoản Sale thử. Đăng nhập: chỉ thấy mục Lead và danh sách trống. Gán một lead cho Sale đó: giờ Sale thấy đúng lead đó và không thấy lead khác.
8. **Thử bài của người khác.** Mở permalink một bài công khai hoặc bài trong nhóm mà nick đã kết nối xem được, bấm "Theo dõi bài này", rồi bấm "Quét ngay". Bài phải xuất hiện ở trang Bài đăng và comment đọc được phải tăng; nếu bằng 0, dùng "Thử đọc sâu" hoặc "Chẩn đoán trang này".
9. **Xem dữ liệu thô** (cho ai muốn): mở Chrome DevTools (F12) ở tab webapp > Network, hoặc ở `chrome://extensions` bấm "service worker" của extension > Console/Network, để xem extension gọi `/api/ext/...` thế nào.

---

## 14. Câu hỏi thường gặp

**Có cần để Chrome mở không?** Có. Extension chạy trong Chrome nên phải mở Chrome (thu nhỏ được) và máy không ngủ.

**Có cần đăng nhập Facebook trên Chrome đó không?** Có, bằng đúng nick đã thêm. Extension không đăng nhập hộ.

**Extension có đọc được tin nhắn Messenger không?** Không. Nó chỉ mở những link bài webapp giao và chỉ đọc phần bình luận.

**Có đăng bài hộ, comment hộ, hay trả lời "ib" hộ không?** Không tự gửi gì, và có test chặn. Extension chỉ *điền sẵn* câu trả lời đã được duyệt trên webapp rồi **dừng lại để người bấm gửi** (mục 17).

**Nhiều nhân sự dùng thế nào?** Mỗi nhân sự một tài khoản webapp, một hoặc nhiều nick, mỗi máy một mã kết nối riêng. Thấy hết lead ở chung một nơi, phân quyền theo vai trò.

**Đổi máy thì sao?** Cài extension trên máy mới, tạo mã mới, thu hồi mã máy cũ.

**Một người có hai nick?** Thêm cả hai nick; mỗi nick một mã, cài ở Chrome có đăng nhập nick đó (hai hồ sơ Chrome riêng sẽ gọn).

**Sao có comment mà không ra lead?** Các lý do thường gặp: comment không có số hợp lệ (viết bằng chữ, thiếu số); có link ngoài nên bị xếp Spam; comment do chính nick mình viết; hoặc quét chưa tới. Xem loại của comment ở dữ liệu hoặc nhờ tôi tra.

**Quét xong mà cột Comment vẫn 0 dù bài có comment?** Mở bài đó trên Facebook, bấm biểu tượng extension > **Chẩn đoán trang này**, rồi **Sao chép báo cáo** và gửi cho người phát triển. Báo cáo chỉ có số đếm và mẫu cấu trúc trang, không có tên hay nội dung.

**Cửa sổ Facebook nhỏ tự bật lên là gì?** Là extension đang quét một bài. Đừng đóng tay; quét xong nó tự đóng. Không thích thì đổi sang "Tab nền" ở Cài đặt, nhưng khi đó Facebook có thể không vẽ hết bình luận.

**Sao một khách mà thấy nhiều comment?** Vì họ đã comment nhiều lần; hệ thống gộp thành **một lead**, hiện số comment.

**Facebook đổi giao diện thì sao?** Extension sẽ báo "không đọc được trang" và dừng, webapp hiện cảnh báo. Chỉ cần sửa một file (`selectors.ts`), build lại, tải lại extension. Không mất dữ liệu cũ.

**Sửa mục đích bài có đổi lead cũ không?** Không, chỉ ảnh hưởng lead sinh ra sau đó.

---

## 15. Từ điển thuật ngữ

| Từ | Nghĩa dễ hiểu |
|---|---|
| **Lead** | Một người tiềm năng đã để lại liên hệ, cần sale gọi lại |
| **Nick** | Tài khoản Facebook dùng để đăng bài |
| **Permalink** | Đường link riêng của một bài đăng (mở bài ở trang riêng của nó) |
| **Mã kết nối / token** | Chuỗi bí mật `tmx_...` để extension chứng minh với webapp "tôi là máy của anh Hùng, nick X" |
| **Băm (hash)** | Biến mã gốc thành một chuỗi khác không dịch ngược được; webapp chỉ lưu bản băm nên lộ CSDL cũng không dùng lại được mã |
| **Thu hồi** | Vô hiệu hóa mã ngay lập tức |
| **Extension** | Tiện ích mở rộng của Chrome |
| **Service worker (background)** | Phần chạy ngầm của extension, không có giao diện |
| **Content script** | Mã của extension chạy bên trong trang Facebook để đọc nội dung ("bộ đọc trang") |
| **Chẩn đoán** | Báo cáo cấu trúc trang Facebook (số đếm, nhãn nút, mẫu link) để chỉnh bộ đọc; không có dữ liệu cá nhân |
| **Hẹn giờ / alarm** | Chuông báo của Chrome gọi extension định kỳ |
| **API** | "Cửa" để extension nói chuyện với webapp |
| **Selector** | Cách chỉ cho code biết "phần tử nào trên trang là cái nào" (ví dụ "đây là link thời gian của comment") |
| **Checkpoint** | Trang Facebook yêu cầu xác minh khi nghi ngờ bất thường |
| **Quét dở (complete = false)** | Đọc chưa hết bài vì quá giới hạn; vòng sau quét lại |
| **Chống trùng** | Không lưu hai lần cùng một comment hoặc cùng một người |
| **Nguồn của lead** | Comment đã dẫn tới lead đó (một lead có thể có nhiều nguồn) |
| **RESTRICTED (Bị hạn chế)** | Trạng thái nick khi gặp checkpoint; ngừng giao việc cho tới khi quản trị bật lại |

---

## 16. Muốn đọc code thì bắt đầu từ đâu

Đọc theo thứ tự này sẽ dễ theo:

| Muốn hiểu | Đọc file |
|---|---|
| Luồng quét của extension | `extension/src/background.ts` (đọc từ hàm `runCycle`) |
| Extension đọc comment trên trang | `extension/src/content/facebook.ts`, `extension/src/content/extract.ts` |
| Cách nhận ra phần tử/nhãn Facebook (nơi hay phải sửa) | `extension/src/content/selectors.ts` |
| Hàng rào chống tự gửi/che giấu | `extension/src/guard.test.ts` |
| Các "cửa" API cho extension | `app/api/ext/` (`me`, `jobs`, `posts`, `posts/[postId]/comments`, `logs`) |
| Kiểm tra mã kết nối, giới hạn tần suất | `lib/ext/auth.ts`, `lib/ext/token.ts` |
| Tách số điện thoại | `lib/fb/phone.ts` (và test `phone.test.ts` để xem ví dụ) |
| Phân loại comment, từ khóa | `lib/fb/classify.ts`, `lib/fb/keywords.ts` |
| Lưu comment, tạo/gộp lead | `lib/fb/ingest.ts` |
| Lịch chọn bài cần quét | `lib/fb/schedule.ts` |
| Các trang web | `app/(app)/fb/` (`leads`, `posts`, `groups`, `connect`) |
| Cấu trúc bảng dữ liệu | `prisma/schema.prisma` (cuối file, phần "Module Lead Facebook") |
| Các quyết định và lý do | `docs/DECISIONS.md` mục D91 (giai đoạn 1), D131 (trả lời và luồng nhà sản xuất) |
| Soạn câu mời, chống chào lặp, AI phân loại nhà sản xuất | `lib/fb/offers.ts`, `lib/fb/offer-rules.ts`, `lib/fb/reply-text.ts`, `lib/fb/supplier-ai.ts` |
| Nhận kết quả extension báo về, khép hàng chờ sau lần quét | `lib/fb/reply-result.ts`, `lib/fb/reply-jobs.ts` |
| Extension điền câu, chọn danh tính | `extension/src/content/reply.ts`, `fill.ts`, `identity.ts`; phần điều phối ở `background.ts` (hàm `runReplies`) |

Các file `*.test.ts` đi kèm là cách đọc dễ nhất: mỗi test là một ví dụ "đầu vào → kết quả đúng".

---

## 17. Trả lời comment và luồng nhà sản xuất (bổ sung v1.1)

### 17.1. Bài toán
1. Nhân sự đăng bài "tìm nhà sản xuất cho mẫu áo / sản phẩm X" vào nhóm, rồi thêm bài vào danh sách theo dõi với mục đích **Tìm bên sản xuất**, ghi sản phẩm và chọn vật liệu gợi ý.
2. Xưởng vào comment, thường để lại số điện thoại.
3. Hệ thống tạo **lead nhà sản xuất** và soạn sẵn một **câu mời dùng vật liệu**.
4. Nhân sự duyệt câu đó. Extension điền sẵn vào ô trả lời của đúng comment, **dưới tên fanpage**, rồi dừng. Nhân sự đọc lại và tự bấm gửi.
5. Sale gọi hoặc nhắn Zalo theo số điện thoại. Comment chỉ là bước làm nóng.

### 17.2. Cần chuẩn bị gì (một lần)
| Việc | Ở đâu |
|---|---|
| Thêm fanpage, đặt mặc định | **Lead Facebook > Mẫu câu & Fanpage**. Tên phải đúng từng chữ như trên Facebook |
| Đánh dấu nhóm nào fanpage đã vào | **Lead Facebook > Nhóm > Sửa**: "Nhóm cho fanpage tham gia", "Fanpage của xưởng đã vào nhóm" |
| Sửa mẫu câu cho đúng giọng của xưởng | **Mẫu câu & Fanpage** > Nạp mẫu có sẵn để sửa |
| Bật/tắt AI, số ngày không chào lại, cách xử lý khi nhóm chưa có fanpage | **Mẫu câu & Fanpage** > Cấu hình (chỉ quản trị viên) |
| Nick quét bài phải là người quản lý fanpage | Trên Facebook |

### 17.3. Hệ thống soạn câu thế nào
Khi lần quét thấy comment mới của người khác trên bài **Tìm bên sản xuất**:

- **Có số điện thoại (hoặc Zalo, email):** tạo hoặc cập nhật lead nhà sản xuất, và soạn ngay một câu từ mẫu. Câu có tên fanpage, sản phẩm của bài và **một hoặc hai vật liệu đứng đầu** danh sách gợi ý của bài.
- **Không có liên hệ:** nếu AI đang bật và AI xếp người comment là **xưởng trực tiếp**, cũng tạo lead (chưa có số) và soạn câu mời.
- **AI (nếu bật)** chạy nền sau đó, mỗi comment một lượt: xếp *xưởng trực tiếp / môi giới / chưa rõ*, tóm tắt năng lực (làm mặt hàng gì, quy mô), và soạn một câu riêng thay cho câu mẫu. Câu của AI chỉ được dùng khi đạt đủ: 1-2 câu, có tên fanpage, nhắc ít nhất một vật liệu gợi ý của bài, không nhắc số điện thoại của người comment, không có link, không trùng nguyên văn câu đã có trong bài. AI chỉ nhận nội dung comment **đã che số điện thoại và email**, không nhận tên hay link người comment. AI tắt hoặc lỗi thì giữ câu mẫu, loại để "chưa rõ".
- **Chống chào lặp:** một nhà sản xuất (theo số điện thoại) đã có câu chào đang chờ hoặc đã gửi trong **30 ngày** (chỉnh được) thì comment ở bài khác vẫn ghi thêm vào lead, nhưng không soạn câu chào mới.
- **Ai đứng tên:** fanpage mặc định, nếu bài thuộc nhóm đã đánh dấu "fanpage đã vào" (hoặc bài không thuộc nhóm nào). Nhóm chưa có fanpage: theo cấu hình, hoặc đứng tên nick đã quét bài, hoặc không soạn câu (vẫn có lead).

Câu soạn ra nằm ở **Hàng chờ trả lời**, trạng thái **Chờ duyệt**. Không có gì được gửi đi.

**Quét mà không thấy câu nào?** Kiểm tra theo thứ tự:
1. Bài có đúng mục đích **Tìm bên sản xuất** không (trang Bài đăng). Bài thêm bằng nút "Theo dõi bài này" trên extension mặc định là Tìm khách.
2. Lần quét chỉ soạn cho comment **mới**. Bài vừa đổi mục đích thì bấm **Soạn câu mời cho comment đã có** ngay dưới ô sản phẩm của bài đó: hệ thống xét lại các comment đã quét (comment có số được soạn ngay; AI xem tiếp ở nền, tối đa 60 comment mỗi lần bấm).
3. Comment không có số điện thoại chỉ có câu mời khi AI xếp người comment là **xưởng trực tiếp**. Comment chung chung ("bên mình có cung cấp, liên hệ nhé") hoặc quá ngắn ("ib") thì không.
4. Comment của chính nick quét bài, hoặc của fanpage đã khai ở Mẫu câu & Fanpage, không bao giờ thành lead.
5. Trên máy chủ, mỗi lượt AI ghi một dòng vào nhật ký: `pm2 logs truongminh --lines 200 --nostream | grep "AI nhà sản xuất"`.

### 17.4. Vòng đời của một câu trả lời
```
Chờ duyệt ──(người duyệt)──► Đã duyệt ──(extension điền, dừng lại)──► Đã điền ──(NGƯỜI bấm gửi)──► Đã gửi
     │                            │                                        │
     └──► Bỏ qua                  └──► Lỗi (kèm lý do)                     └──► quá 15 phút không gửi: giao lại
```
- **Hàng chờ trả lời**: lọc theo trạng thái, người đứng tên (nick / fanpage), loại câu; sửa câu ngay trong ô (lưu khi bấm ra ngoài); duyệt từng câu hoặc **duyệt cả lô**; bỏ qua; đổi người đứng tên; đưa câu bị bỏ qua hoặc lỗi về chờ duyệt.
- **Trên extension**: popup có hai nút riêng, **Trả lời bằng nick** và **Trả lời bằng fanpage**, kèm số câu đang chờ. Bấm một nút: extension mở bài (các câu cùng bài chỉ mở một lần), tìm comment theo mã, bấm "Phản hồi", chọn danh tính, điền câu vào ô có viền cam, rồi **dừng**. Một bảng nhỏ ở góc trang nhắc đọc lại và có nút **Bỏ qua câu này**, **Dừng**. Sau khi người bấm gửi và câu trả lời hiện ra, extension báo "đã gửi" và sang câu kế.
- **Nếu extension không kịp thấy** (đóng tab, tắt máy): lần quét sau thấy câu trả lời của nick hoặc fanpage dưới comment đó thì tự ghi **Đã gửi**. Comment đã có trả lời tay thì câu đang chờ tự chuyển **Bỏ qua**.
- Khi một câu mời **đã gửi**, lead ghi "lần chào gần nhất": mốc này và các câu còn chờ là căn cứ chống chào lặp.

### 17.5. Trả lời dưới tên fanpage: "không chắc thì không điền"
Với câu đứng tên fanpage, extension tìm nút chuyển danh tính bình luận, chọn fanpage theo đúng tên đã khai, rồi **kiểm tra lại** danh tính đang dùng trước khi điền.

| Tình huống | Extension làm | Webapp làm |
|---|---|---|
| Không thấy nút chuyển danh tính, hoặc fanpage không có trong danh sách | Không điền. Báo lỗi `page_not_available` | Câu chuyển **Lỗi**; nhóm tự bỏ đánh dấu "fanpage đã vào"; các câu fanpage còn chờ của nhóm đó chuyển sang nick và về chờ duyệt (hoặc bỏ qua, theo cấu hình) |
| Chọn được nhưng không xác nhận lại được danh tính | Không điền. Báo `identity_unverified` | Câu chuyển **Lỗi**, ghi cảnh báo ở Kết nối extension để chỉnh bộ đọc |
| Trả lời bằng nick nhưng ô trả lời đang ở danh tính fanpage | Chuyển về nick trước; không chuyển được thì không điền | Như trên |

### 17.6. Việc của sale
**Lead Facebook > Lead > tab Nhà sản xuất**: mỗi dòng có số điện thoại (bấm để gọi, mở Zalo), loại (sửa tay được), năng lực tóm tắt, sản phẩm nguồn, vật liệu gợi ý, trạng thái chào và lần chào gần nhất, và ba nút **Đã gọi**, **Đã nhắn Zalo**, **Đã gửi mẫu** (bấm lần nữa để bỏ đánh dấu). Đánh dấu đã gọi hoặc đã nhắn Zalo cho lead còn "Mới" thì lead chuyển sang "Đã liên hệ". Sale vẫn chỉ thấy lead được gán cho mình.

**Thống kê Lead** có thêm **phễu bài tìm nhà sản xuất**: comment → xưởng thật → đã chào → đã liên hệ được → đã gửi mẫu → có đơn vật liệu (lead ở trạng thái Chốt đơn).

### 17.7. Điều chưa được kiểm chứng (đọc trước khi dùng thật)
Phần webapp (soạn câu, chống chào lặp, hàng chờ, API, phễu) đã chạy thử đầu-cuối trên một CSDL tạm với AI giả. Phần extension **chưa chạy trên Facebook thật**; nó mới được thử trên trang HTML mô phỏng theo hiểu biết của người viết:

1. **Nút "Phản hồi" và ô trả lời.** Nếu Facebook dựng khác, extension báo lỗi "không thấy nút Phản hồi / ô nhập" và không làm gì thêm.
2. **Cách chèn chữ vào trình soạn thảo của Facebook.** Extension thử lệnh chèn chữ của trình duyệt rồi tới sự kiện dán, và chỉ báo "đã điền" khi thấy đúng câu đó trong ô.
3. **Nút chuyển danh tính trong nhóm.** Đây là phần ít chắc nhất: lúc viết không có trình duyệt nào đăng nhập Facebook để xem giao diện thật. Nhãn nhận diện nằm ở `REPLY_LABELS.identitySwitcher` trong `extension/src/content/selectors.ts`. Chừng nào chưa khớp, mọi câu fanpage sẽ báo `page_not_available` (và không điền gì).

**Cách khép vòng:** mở một bài trong nhóm mà fanpage đã vào, bấm "Phản hồi" dưới một comment cho ô trả lời hiện ra, rồi bấm **Chẩn đoán trang này** trên popup và gửi báo cáo. Mục `reply` của báo cáo ghi số nút Phản hồi, nhãn ô nhập và các nút ứng viên của bộ chọn danh tính; tên nick thành `{nick}`, tên fanpage thành `{page}`, tên người khác thành `{…}`.

**Rủi ro:** comment mời hàng dưới tên fanpage trong nhóm của người khác có thể bị quản trị viên nhóm coi là quảng cáo; đọc quy định nhóm (ghi ở trang Nhóm) trước khi duyệt. Giữ nhịp thấp: mỗi câu đều có người đọc và bấm gửi, không có chế độ gửi hàng loạt.
