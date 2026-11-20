import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { CAPTION_PLACEHOLDERS } from "@/lib/zalo/caption";
import { COMMAND_INFO, TOGGLEABLE_COMMANDS } from "@/lib/zalo/commands";

export const metadata: Metadata = { title: "Hướng dẫn Zalo" };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">{children}</code>;
}

/** Liên kết sang trang quản trị: chỉ quản trị viên bấm được; sale thấy tên mục dạng chữ thường. */
function AdminLink({ admin, href, children }: { admin: boolean; href: string; children: React.ReactNode }) {
  return admin ? (
    <Link href={href} className="underline underline-offset-4">
      {children}
    </Link>
  ) : (
    <span className="font-medium">{children}</span>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5">{children}</ol>;
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-relaxed [&_h3]:mt-2 [&_h3]:font-semibold [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
        {children}
      </CardContent>
    </Card>
  );
}

export default async function ZaloGuidePage() {
  const user = await requireUser();
  const admin = user.role === "ADMIN";
  const toc = [
    ["tong-quan", "Zalo làm được gì"],
    ["sale", "Dành cho sale"],
    ["ket-noi", "Kết nối bot lần đầu"],
    ["nhom", "Gửi ảnh vào nhóm"],
    ["bot", "Kho kiến thức và model AI"],
    ["nhan-vien", "Ghép nối nhân viên và lệnh"],
    ["tro-ly", "Tag bot ra lệnh trong nhóm"],
    ["cham-soc", "Kịch bản chăm sóc nhóm"],
    ["gioi-han", "Giới hạn cần biết"],
    ["su-co", "Xử lý sự cố"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hướng dẫn sử dụng Zalo</h1>
        <p className="text-muted-foreground">
          Bot Zalo giúp gửi ảnh mẫu cho khách và đồng nghiệp, làm ảnh theo lệnh của nhân viên, giải thích kỹ thuật cho sale và nhắc việc chăm sóc nhóm. Bot không tự nói chuyện với khách: nhân viên là người nói với khách.
          {admin ? " Bạn là quản trị viên nên xem đủ các phần cấu hình." : " Sale chỉ cần đọc mục “Dành cho sale”; các mục còn lại dành cho quản trị viên."}
        </p>
      </div>

      <nav aria-label="Mục lục" className="flex flex-wrap gap-1.5">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
            {label}
          </a>
        ))}
      </nav>

      <Section id="tong-quan" title="Zalo làm được gì" desc="Mỗi chức năng có công tắc bật/tắt riêng, nên chỉ bật cái bạn cần.">
        <ul>
          <li><b>Gửi ảnh mẫu vào nhóm Zalo</b>: ảnh được gửi vào nhóm khi nhân viên tag bot giao việc (hoặc gửi tay từ Hộp thư), kèm chữ ghi thương hiệu, sale. Ảnh tạo trên web không tự gửi vào nhóm.</li>
          <li><b>Tag bot ra lệnh</b>: nhân viên đã ghép nối tag bot trong nhóm khách để làm catalog, làm ảnh thiết kế hoặc hỏi kỹ thuật; bot làm rồi gửi kết quả lại đúng nhóm đó.</li>
          <li><b>Kho kiến thức</b>: thông tin xưởng (hồ sơ, bài kiến thức) mà các AI dùng chung. Mỗi AI chỉ nhận phần dành cho nó; thông tin chỉ admin thấy không AI nào đọc.</li>
          <li><b>Ghép nối nhân viên</b>: nhân viên nhắn bot lệnh như /status, /today.</li>
          <li><b>Kịch bản chăm sóc nhóm</b>: AI lên sẵn 2-3 bài đăng mỗi ngày cho từng nhóm; bạn chỉnh rồi đăng.</li>
        </ul>
        <p>
          <b>Hộp thư Zalo</b> (menu Zalo): xem mọi hội thoại khách nhắn bot, trả lời ngay trên web, gửi ảnh mẫu của một phiên (từng ảnh, PDF hoặc ZIP), nhờ AI soạn nháp. Bot không tự trả lời khách trong Hộp thư; nhân viên trả lời.
        </p>
      </Section>

      <Section id="sale" title="Dành cho sale" desc="Những việc sale làm hằng ngày với Zalo.">
        <h3>Gửi ảnh mẫu cho khách</h3>
        <Steps>
          <li>Tạo ảnh như bình thường. Ở trang kết quả, bấm biểu tượng <b>Copy</b> dưới từng ảnh, rồi dán (Ctrl+V) vào ô chat Zalo.</li>
          <li>Muốn lấy cả bộ: bấm <b>Copy ảnh để dán Zalo</b>, trình duyệt chỉ copy được một ảnh mỗi lần nên bấm Copy, dán vào Zalo, rồi bấm ảnh kế tiếp.</li>
          <li>Muốn bot làm và gửi thẳng vào nhóm khách thì tag bot trong nhóm (xem mục “Tag bot ra lệnh trong nhóm”). Ảnh tạo trên web không tự gửi vào nhóm.</li>
        </Steps>

        <h3>Chăm sóc nhóm</h3>
        <p>
          Vào <Link href="/zalo/care" className="underline underline-offset-4">Kịch bản chăm sóc</Link>, xem các bài AI đã lên cho nhóm, sửa chữ hoặc đổi ảnh/video đính kèm rồi bấm <b>Đăng ngay</b>. Chi tiết ở mục “Kịch bản chăm sóc nhóm” bên dưới.
        </p>

        <h3>Khi cần hỏi kỹ thuật</h3>
        <p>
          Bạn đã được ghép nối thì tag bot và hỏi, ví dụ <Code>@Bot mẫu dày 0.3 mm khắc được không?</Code>. Bot trả lời cho bạn dựa trên kho kiến thức (phần công khai và nội bộ) và danh sách chất liệu, bạn nói lại với khách. Bot chưa có thông tin thì nói thẳng là chưa có, và câu hỏi được ghi lại để quản trị viên bổ sung kiến thức. Xem thêm mục “Tag bot ra lệnh trong nhóm”.
        </p>
      </Section>

      <Section id="ket-noi" title="Kết nối bot lần đầu" desc="Làm một lần. Cần quản trị viên có quyền sửa file .env trên máy chủ.">
        <Steps>
          <li>Trên điện thoại mở mini app <b>Zalo Bot Creator</b>, tạo bot và lấy <b>token</b> của bot.</li>
          <li>
            Trong file <Code>.env</Code> đặt <Code>ZALO_BOT_TOKEN</Code> là token đó. Muốn nhận tin khách và nhận ra nhóm tự động thì đặt thêm <Code>ZALO_WEBHOOK_SECRET</Code> là một chuỗi tự đặt dài 8-256 ký tự, và <Code>APP_URL</Code> là địa chỉ https công khai của web. Khởi động lại web (<Code>docker compose up -d</Code> trên VPS).
          </li>
          <li>
            Vào <AdminLink admin={admin} href="/admin/zalo">Quản trị &gt; Cài đặt Zalo &gt; Tổng quan</AdminLink>: bấm <b>Kiểm tra token</b> (phải báo kết nối được), rồi <b>Đăng ký webhook với Zalo</b>.
          </li>
          <li>Gạt công tắc <b>Bật Zalo</b>. Sau đó bật từng chức năng bạn muốn ở các mục còn lại.</li>
        </Steps>
        <p>
          Token và chuỗi bí mật chỉ nằm trong <Code>.env</Code>, không nhập trên web để khỏi bị lộ. Máy dev (localhost) không dùng được webhook; vẫn gửi ảnh vào nhóm được nếu thêm nhóm bằng tay.
        </p>
      </Section>

      <Section id="nhom" title="Gửi ảnh vào nhóm" desc={admin ? "Cấu hình ở Cài đặt Zalo > Nhóm và gửi ảnh." : "Quản trị viên cấu hình ở Cài đặt Zalo > Nhóm và gửi ảnh."}>
        <h3>Mời bot vào nhóm</h3>
        <Steps>
          <li>Mở Zalo Bot Creator, chọn bot, lấy link của bot ở trang thông tin bot.</li>
          <li>Gửi link đó vào nhóm Zalo. Trưởng nhóm bấm vào link và xác nhận thêm bot.</li>
          <li>Trong nhóm, nhờ ai đó trả lời tin bot vừa gửi hoặc gõ @tên bot. Nhóm sẽ hiện trong bảng Nhóm Zalo (cần webhook). Chưa có webhook thì lấy mã nhóm (chat.id) rồi thêm bằng tay.</li>
          <li>Bấm <b>Gửi tin thử</b> để chắc bot gửi được, rồi đặt tên nhóm (bot lấy làm tên khách khi nhân viên tag bot ra lệnh).</li>
        </Steps>
        <p>Ảnh không tự gửi vào nhóm khi tạo xong. Chỉ có hai đường: nhân viên tag bot giao việc, hoặc gửi tay từ Hộp thư.</p>

        <h3>Chữ đi kèm mỗi ảnh</h3>
        <p>Soạn mẫu chữ ở ô “Chữ đi kèm mỗi ảnh”; hệ thống tự điền các chỗ trống:</p>
        <ul>
          {CAPTION_PLACEHOLDERS.map((p) => (
            <li key={p.key}>
              <Code>{p.key}</Code>: {p.desc}
            </li>
          ))}
        </ul>
        <p>Dòng nào không có thông tin để điền sẽ tự bỏ. Có ô xem trước ngay bên dưới ô soạn.</p>

        <h3>Nghỉ giữa hai ảnh</h3>
        <p>Ảnh gửi lần lượt từng tấm, mặc định nghỉ 600 mili giây. Hay gặp lỗi 429 (Zalo giới hạn) thì tăng lên 1000-1500.</p>
      </Section>

      <Section id="bot" title="Kho kiến thức và model AI" desc={admin ? "Kiến thức ở Quản trị > Thông tin doanh nghiệp; model ở Cài đặt Zalo > Trợ lý AI." : "Quản trị viên cấu hình kiến thức và model AI."}>
        <p>
          Các AI dùng model chat của kie.ai (chung khóa <Code>KIE_API_KEY</Code> với tạo ảnh, và phải để <Code>IMAGE_PROVIDER=&quot;kie&quot;</Code>). Mỗi lượt hỏi tốn một ít token.
        </p>
        <h3>Bot chỉ làm việc cho nhân viên</h3>
        <ul>
          <li>Bot <b>không</b> tự trả lời khách, không tự chào, không trả lời nhanh. Khách nhắn bot thì tin chỉ hiện ở Hộp thư để nhân viên trả lời.</li>
          <li>Bot chỉ chạy khi nhân viên đã ghép nối và gắn tài khoản web tag bot, hoặc khi nhân viên bấm “AI soạn” trong Hộp thư.</li>
        </ul>
        <h3>Mỗi AI nhận phần kiến thức riêng</h3>
        <ul>
          <li><b>Trợ lý cho sale</b> (tag bot hỏi kỹ thuật): đọc bài <b>Công khai</b> và <b>Nội bộ</b>.</li>
          <li><b>AI soạn nháp</b> và <b>kịch bản chăm sóc nhóm</b>: chỉ đọc bài <b>Công khai</b>, vì chữ này đi tới khách.</li>
          <li>Bài <b>Chỉ admin</b> (giá vốn, công thức tính giá...) không AI trò chuyện nào đọc.</li>
          <li>Mỗi AI có một ngân sách ký tự; kiến thức nhiều hơn mức đó thì chỉ lấy các bài liên quan đến câu hỏi.</li>
        </ul>
        <h3>Khi AI không có thông tin</h3>
        <p>AI không đoán giá, thời gian, số lượng tối thiểu hay khả năng làm được. Câu hỏi đó được gom vào danh sách “Câu hỏi chưa trả lời được” để quản trị viên viết thêm bài kiến thức.</p>
        <h3>Model</h3>
        <ul>
          <li>Bấm <b>Thử AI</b> sau khi đổi model để biết model chạy được không. Đã thử chạy tốt: <Code>gpt-5-2</Code>.</li>
        </ul>
      </Section>

      <Section id="nhan-vien" title="Ghép nối nhân viên và lệnh" desc={admin ? "Cấu hình ở Cài đặt Zalo > Nhân viên và lệnh." : "Quản trị viên cấu hình ở Cài đặt Zalo > Nhân viên và lệnh."}>
        <h3>Ghép nối nhân viên</h3>
        <Steps>
          <li>Nhân viên mở chat với bot trên Zalo, gõ <Code>/ghepnoi</Code>. Bot trả mã 4 số.</li>
          <li>Quản trị viên mở <AdminLink admin={admin} href="/admin/zalo/staff">Nhân viên và lệnh</AdminLink>, thấy yêu cầu ở “Đang chờ cho phép”, hỏi nhân viên mã 4 số, nhập đúng mã rồi bấm <b>Cho phép</b>.</li>
          <li>Nhân viên gõ <Code>/help</Code> để xem lệnh. Muốn thu hồi thì bấm “Thu hồi”.</li>
        </Steps>
        <p>Phải nhập đúng mã để chắc chắn đúng người, tránh cho nhầm người lạ xin ghép nối.</p>
        <h3>Các lệnh</h3>
        <ul>
          {TOGGLEABLE_COMMANDS.map((c) => (
            <li key={c}>
              <Code>{COMMAND_INFO[c].usage}</Code> (chỉ nhân viên): {COMMAND_INFO[c].desc}.
            </li>
          ))}
          <li><Code>/ghepnoi</Code>: xin ghép nối (bật riêng bằng công tắc Ghép nối nhân viên).</li>
        </ul>
        <p>Lệnh gõ được không dấu hoặc có dấu. Từng lệnh bật/tắt riêng bằng ô tích trong trang cài đặt.</p>
      </Section>

      <Section id="tro-ly" title="Tag bot ra lệnh trong nhóm" desc={admin ? "Bật ở Cài đặt Zalo > Trợ lý AI > Trợ lý nhận lệnh; gắn tài khoản web cho nhân viên ở Nhân viên và lệnh." : "Quản trị viên bật và gắn tài khoản web cho bạn trước khi dùng."}>
        <p>Sale đã ghép nối và được gắn tài khoản web tag bot trong nhóm khách để giao việc. Bot làm rồi gửi kết quả lại đúng nhóm đó. Khách trong nhóm tag bot không ra lệnh được.</p>
        <h3>Làm catalog chất liệu cho logo của khách</h3>
        <Steps>
          <li>Lưu ảnh logo khách gửi, rồi gửi lại vào nhóm kèm tag bot và lời dặn, ví dụ: <Code>@Bot làm mẫu chất liệu cho logo này</Code>. Bot nhớ logo gửi trong 24 giờ gần nhất, nên các lệnh sau không cần gửi lại.</li>
          <li>Bot lấy tên nhóm làm tên khách hàng (admin đặt tên nhóm ở Cài đặt Zalo &gt; Nhóm). Nhóm chưa có tên thì dặn kèm, ví dụ <Code>khách Anh Nam, thương hiệu Cà phê Gió</Code>. Khách và thương hiệu chưa có thì bot tự tạo dưới tên bạn.</li>
          <li>Bot dùng các trang mẫu mặc định (hoặc trang bạn gọi tên) để tạo ảnh, báo đã nhận, và khi xong gửi toàn bộ ảnh vào nhóm. Phiên cũng hiện trên web như bình thường.</li>
        </Steps>
        <h3>Chọn vài mẫu để xem thiết kế</h3>
        <ul>
          <li>Tag bot và nói theo số in trên ảnh catalog: <Code>@Bot ảnh 2 số 3 và 5 làm móc khóa</Code>. Thêm <Code>3 phương án</Code> nếu muốn nhiều hơn (mặc định 2, tối đa 4). Cũng gọi được theo mã chất liệu.</li>
          <li>Bot thiết kế từ catalog gần nhất trong nhóm, tối đa 10 chất liệu mỗi lần, rồi gửi ảnh vào nhóm.</li>
        </ul>
        <h3>Hỏi kỹ thuật và hỏi tiến độ</h3>
        <ul>
          <li><Code>@Bot mẫu dày 0.3 mm khắc được không?</Code>: bot trả lời dựa trên kho kiến thức (phần công khai và nội bộ) và danh sách chất liệu (gồm độ dày). Không có trong tài liệu thì bot nói thẳng là chưa có và ghi câu hỏi lại cho quản trị viên.</li>
          <li><Code>@Bot xong chưa?</Code>: bot báo ảnh nào đã xong.</li>
        </ul>
        <h3>Lưu ý</h3>
        <ul>
          <li>Mỗi lệnh tốn một ít token AI để hiểu lời dặn; ảnh tạo tính vào hạn mức ngày của bạn như khi bấm trên web.</li>
          <li>Bot chỉ thấy tin có tag bot (Zalo chỉ gửi những tin đó). Logo phải được gửi kèm tag, hoặc gửi lại vào nhóm sau khi lưu.</li>
          <li>Nhắn riêng cho bot cũng dùng được các lệnh trên (không cần tag), kết quả gửi lại chat riêng.</li>
        </ul>
      </Section>

      <Section id="cham-soc" title="Kịch bản chăm sóc nhóm" desc={admin ? "Bật ở Cài đặt Zalo > Chăm sóc nhóm; dùng ở mục Kịch bản chăm sóc." : "Quản trị viên bật ở Cài đặt Zalo > Chăm sóc nhóm."}>
        <Steps>
          <li>Vào <Link href="/zalo/care" className="underline underline-offset-4">Kịch bản chăm sóc</Link>. Mỗi nhóm có ô <b>insight</b>: mô tả nhóm (khách là ai, quan tâm gì). Viết càng rõ, bài AI lên càng sát.</li>
          <li>Bật chăm sóc cho nhóm và chọn số lượt đăng mỗi ngày (2-3).</li>
          <li>Bấm <b>Lên kịch bản</b>. AI chọn nội dung theo insight, dịp lễ (và thời tiết nếu bật) cho vài ngày tới.</li>
          <li>Xem từng bài: sửa chữ, đổi giờ, gắn ảnh/video từ Thư viện, hoặc bỏ qua. Bài nào ổn thì bấm <b>Đăng ngay</b>, hoặc bấm <b>Đăng các bài đến giờ</b> để đăng mọi bài đã tới giờ.</li>
          <li>Thư viện: tải lên mẫu mã mới hoặc video giới thiệu (mp4, mov, tối đa 50MB) kèm mô tả ngắn để AI biết dùng khi nào.</li>
        </Steps>
        <h3>Tự đăng đúng giờ (chỉ trên VPS)</h3>
        <p>
          Máy cá nhân không tự đăng được vì không có ai gọi định kỳ. Trên VPS: đặt <Code>ZALO_CARE_CRON_SECRET</Code> trong <Code>.env</Code>, bật công tắc “Tự động lên kịch bản và đăng đúng giờ”, rồi thêm lệnh cron theo README (mục “Tự động đăng kịch bản chăm sóc Zalo”).
        </p>
        <h3>Thời tiết</h3>
        <p>Nếu bật, hệ thống lấy dự báo từ Open-Meteo (miễn phí) và chỉ gửi tọa độ địa điểm bạn nhập, không gửi thông tin khách.</p>
      </Section>

      <Section id="gioi-han" title="Giới hạn cần biết">
        <ul>
          <li>Mỗi tin và mỗi ảnh gửi đều tính vào <b>hạn mức tin nhắn theo tháng</b> của bot do Zalo quy định. Hết hạn mức thì Zalo báo lỗi 429 và ngừng gửi tới tháng sau.</li>
          <li>Trong <b>nhóm</b>, Zalo chỉ gửi cho bot những tin có @bot hoặc trả lời tin của bot. Zalo ghi chú tính năng bot trong nhóm đang thử nghiệm nên có thể thay đổi.</li>
          <li>Bot chỉ hiểu lệnh bằng chữ của nhân viên. Tin thoại, file, sticker thì bot không đọc.</li>
          <li>Tin đã gửi không thu hồi được.</li>
          <li>Tin nhắn được lưu khi bật Hộp thư hoặc Trợ lý nhận lệnh. Quản trị viên có thể xóa tin cũ ở Cài đặt Zalo &gt; Tổng quan &gt; Dọn dữ liệu. Nhân viên gõ <Code>/reset</Code> trong chat riêng với bot để AI soạn nháp quên cuộc trò chuyện trước đó.</li>
        </ul>
      </Section>

      <Section id="su-co" title="Xử lý sự cố">
        <ul>
          <li><b>Gửi ảnh báo lỗi 429</b>: hết hạn mức tháng của bot, hoặc gửi quá dồn. Tăng “Nghỉ giữa hai ảnh”.</li>
          <li><b>Gửi ảnh báo lỗi 401</b>: token sai hoặc đã bị đổi. Kiểm tra lại <Code>ZALO_BOT_TOKEN</Code> rồi bấm “Kiểm tra token”.</li>
          <li><b>Nhóm không hiện trong danh sách</b>: chưa có webhook, hoặc chưa có ai @bot / trả lời tin của bot trong nhóm. Có thể thêm nhóm bằng tay bằng mã nhóm.</li>
          <li><b>Bot không nhận lệnh của nhân viên</b>: kiểm tra lần lượt (1) công tắc Bật Zalo và Trợ lý nhận lệnh đều bật, (2) webhook đã đăng ký và <Code>ZALO_WEBHOOK_SECRET</Code> khớp, (3) nhân viên đã ghép nối và được gắn tài khoản web, (4) bấm Thử AI.</li>
          <li><b>AI trả lời “chưa có thông tin”</b>: kho kiến thức chưa có bài đó, hoặc bài đang ở trạng thái Nháp/Ngừng, hoặc bài không dành cho AI đó. Xem “Câu hỏi chưa trả lời được” và trang Thử AI ở Thông tin doanh nghiệp.</li>
          <li><b>Webhook đăng ký không được</b>: <Code>APP_URL</Code> phải là https công khai và có <Code>ZALO_WEBHOOK_SECRET</Code>.</li>
          <li><b>Không đăng được bài chăm sóc</b>: xem dòng lỗi ngay dưới bài (thường do hết hạn mức tháng hoặc bot chưa còn trong nhóm).</li>
        </ul>
      </Section>
    </div>
  );
}
