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
    ["bot", "Bot AI trả lời khách"],
    ["nhan-vien", "Chuyển nhân viên, ghép nối, lệnh"],
    ["cham-soc", "Kịch bản chăm sóc nhóm"],
    ["gioi-han", "Giới hạn cần biết"],
    ["su-co", "Xử lý sự cố"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hướng dẫn sử dụng Zalo</h1>
        <p className="text-muted-foreground">
          Bot Zalo giúp gửi ảnh mẫu cho khách và đồng nghiệp, trả lời khách tự động và nhắc việc chăm sóc nhóm.
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
          <li><b>Gửi ảnh mẫu vào nhóm Zalo</b>: ảnh tạo xong tự gửi (hoặc sale bấm gửi) vào nhóm của khách hay nhóm nội bộ, kèm chữ ghi thương hiệu, sale.</li>
          <li><b>Bot AI trả lời khách</b>: khách nhắn riêng cho bot, bot trả lời theo thông tin xưởng bạn nhập; không chắc thì chuyển nhân viên.</li>
          <li><b>Lời chào, trả lời nhanh, từ khóa chuyển nhân viên</b>: các câu soạn sẵn, không tốn token.</li>
          <li><b>Giờ làm việc</b>: ngoài giờ bot nói rõ nhân viên sẽ trả lời khi vào ca.</li>
          <li><b>Nhân viên ghép nối</b>: nhân viên nhắn bot lệnh như /status, /today, /cho, và nhận thông báo khi có khách cần người.</li>
          <li><b>Kịch bản chăm sóc nhóm</b>: AI lên sẵn 2-3 bài đăng mỗi ngày cho từng nhóm; bạn chỉnh rồi đăng.</li>
        </ul>
        <p>
          Lưu ý: không còn <b>Hộp thư Zalo</b> trên web. Khi bot chuyển khách cho người, nhân viên trả lời khách trực tiếp trên Zalo của mình; web chỉ giữ danh sách “khách đang chờ”.
        </p>
      </Section>

      <Section id="sale" title="Dành cho sale" desc="Những việc sale làm hằng ngày với Zalo.">
        <h3>Gửi ảnh mẫu cho khách</h3>
        <Steps>
          <li>Tạo ảnh như bình thường. Ở trang kết quả, bấm biểu tượng <b>Copy</b> dưới từng ảnh, rồi dán (Ctrl+V) vào ô chat Zalo.</li>
          <li>Muốn lấy cả bộ: bấm <b>Copy ảnh để dán Zalo</b>, trình duyệt chỉ copy được một ảnh mỗi lần nên bấm Copy, dán vào Zalo, rồi bấm ảnh kế tiếp.</li>
          <li>Nhóm Zalo đặt chế độ <b>Tự động gửi</b> vẫn nhận ảnh mới tạo xong như trước (xem phần quản trị).</li>
        </Steps>
        <p>Nếu nhóm được bật “Tự động gửi”, mỗi ảnh tạo xong tự vào nhóm, bạn không cần bấm gì.</p>

        <h3>Chăm sóc nhóm</h3>
        <p>
          Vào <Link href="/zalo/care" className="underline underline-offset-4">Kịch bản chăm sóc</Link>, xem các bài AI đã lên cho nhóm, sửa chữ hoặc đổi ảnh/video đính kèm rồi bấm <b>Đăng ngay</b>. Chi tiết ở mục “Kịch bản chăm sóc nhóm” bên dưới.
        </p>

        <h3>Khi bot báo có khách cần người</h3>
        <p>
          Nếu bạn đã được ghép nối, bot nhắn bạn trên Zalo: “Khách … cần nhân viên”. Mở Zalo trả lời khách trực tiếp. Xong thì nhắn bot <Code>/xong</Code> để bot được trả lời lại các khách đó.
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
          <li>Bấm <b>Gửi tin thử</b> để chắc bot gửi được, rồi bật <b>Tự động gửi</b> cho nhóm nào muốn.</li>
        </Steps>
        <p>Nhóm mới luôn ở chế độ không tự động gửi, để tránh gửi nhầm.</p>

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

      <Section id="bot" title="Bot AI trả lời khách" desc={admin ? "Cấu hình ở Cài đặt Zalo > Bot AI và trả lời." : "Quản trị viên cấu hình ở Cài đặt Zalo > Bot AI và trả lời."}>
        <p>
          Bot dùng model chat của kie.ai (chung khóa <Code>KIE_API_KEY</Code> với tạo ảnh, và phải để <Code>IMAGE_PROVIDER=&quot;kie&quot;</Code>). Mỗi lượt trả lời tốn một ít token.
        </p>
        <h3>Thứ tự bot xử lý một tin của khách</h3>
        <Steps>
          <li>Khách mới nhắn lần đầu: gửi <b>lời chào</b> (nếu bật).</li>
          <li>Tin có <b>từ khóa chuyển nhân viên</b>: chuyển người ngay.</li>
          <li>Tin có từ khóa <b>trả lời nhanh</b>: gửi câu soạn sẵn, dừng.</li>
          <li>Còn lại: <b>bot AI</b> trả lời. AI gặp câu không chắc, khách đòi gặp người hoặc hỏi báo giá cụ thể thì chuyển nhân viên.</li>
        </Steps>
        <h3>Để bot trả lời tốt</h3>
        <ul>
          <li>Ô <b>Thông tin xưởng bot được phép nói</b>: ghi địa chỉ, giờ làm việc, giá tham khảo, số lượng tối thiểu, thời gian làm mẫu, chính sách. Bot không bịa ngoài những gì ghi ở đây và danh sách chất liệu.</li>
          <li>Ô <b>Hướng dẫn cho bot</b>: vai trò và giọng điệu (xưng em, gọi anh/chị...).</li>
          <li>Bấm <b>Thử AI</b> sau khi đổi model để biết model chạy được không. Đã thử chạy tốt: <Code>gpt-5-2</Code>.</li>
          <li>Bot chỉ xem được ảnh khách gửi nếu bật “Bot xem được ảnh” (tốn thêm token). Tin thoại và file thì bot chưa đọc được, sẽ báo nhân viên.</li>
        </ul>
        <h3>Hạn mức để không tốn ngoài ý muốn</h3>
        <ul>
          <li><b>Tối đa lượt bot trả lời mỗi ngày</b> (cả hệ thống): hết lượt thì bot im và báo nhân viên. Đặt 0 để bot ngừng trả lời.</li>
          <li><b>Tối đa lượt trả lời mỗi giờ cho một người</b>: chống khách nhắn dồn dập.</li>
          <li><b>Số tin gần nhất bot đọc</b>: nhiều thì nhớ lâu nhưng tốn token.</li>
        </ul>
        <h3>Giờ làm việc</h3>
        <p>Bật “Giờ làm việc”, chọn giờ và các ngày. Ngoài giờ, khi cần chuyển nhân viên bot dùng câu “ngoài giờ” và nói nhân viên sẽ trả lời khi vào ca. Giờ tính theo múi giờ của máy chủ (<Code>APP_TIMEZONE</Code>, mặc định Asia/Ho_Chi_Minh).</p>
      </Section>

      <Section id="nhan-vien" title="Chuyển nhân viên, ghép nối, lệnh" desc={admin ? "Cấu hình ở Cài đặt Zalo > Nhân viên và lệnh." : "Quản trị viên cấu hình ở Cài đặt Zalo > Nhân viên và lệnh."}>
        <h3>Khi bot chuyển khách cho người</h3>
        <ul>
          <li>Bot im ở cuộc trò chuyện đó và đánh dấu khách “chờ nhân viên”.</li>
          <li>Nếu bật “Báo nhân viên qua Zalo”, bot nhắn cho mọi nhân viên đã ghép nối (một lần cho mỗi khách).</li>
          <li>Nhân viên trả lời khách ngay trên Zalo của mình, xong thì gõ <Code>/xong</Code> với bot (hoặc quản trị viên bấm “Xử lý xong” ở trang Nhân viên và lệnh).</li>
          <li>Nếu quên, bot tự trả lời lại khách sau số giờ ở ô “Bot tự trả lời lại sau” (mặc định 12 giờ; 0 là không bao giờ tự trả lại).</li>
        </ul>
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
              <Code>{COMMAND_INFO[c].usage}</Code> ({COMMAND_INFO[c].staffOnly ? "chỉ nhân viên" : "ai cũng dùng được"}): {COMMAND_INFO[c].desc}.
            </li>
          ))}
          <li><Code>/ghepnoi</Code>: xin ghép nối (bật riêng bằng công tắc Ghép nối nhân viên).</li>
        </ul>
        <p>Lệnh gõ được không dấu hoặc có dấu. Từng lệnh bật/tắt riêng bằng ô tích trong trang cài đặt.</p>
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
          <li>Bot chỉ trả lời văn bản (và ảnh nếu bật). Tin thoại, file, sticker thì bot không đọc.</li>
          <li>Tin đã gửi không thu hồi được.</li>
          <li>Tin nhắn chỉ được lưu khi bật Bot AI, để bot đọc ngữ cảnh. Quản trị viên có thể xóa tin cũ ở Cài đặt Zalo &gt; Tổng quan &gt; Dọn dữ liệu. Khách gõ <Code>/reset</Code> là bot quên cuộc trò chuyện trước đó.</li>
        </ul>
      </Section>

      <Section id="su-co" title="Xử lý sự cố">
        <ul>
          <li><b>Gửi ảnh báo lỗi 429</b>: hết hạn mức tháng của bot, hoặc gửi quá dồn. Tăng “Nghỉ giữa hai ảnh”.</li>
          <li><b>Gửi ảnh báo lỗi 401</b>: token sai hoặc đã bị đổi. Kiểm tra lại <Code>ZALO_BOT_TOKEN</Code> rồi bấm “Kiểm tra token”.</li>
          <li><b>Nhóm không hiện trong danh sách</b>: chưa có webhook, hoặc chưa có ai @bot / trả lời tin của bot trong nhóm. Có thể thêm nhóm bằng tay bằng mã nhóm.</li>
          <li><b>Bot không trả lời khách</b>: kiểm tra lần lượt (1) công tắc Bật Zalo và Bot AI đều bật, (2) webhook đã đăng ký và <Code>ZALO_WEBHOOK_SECRET</Code> khớp, (3) hạn mức ngày chưa hết, (4) khách đó không đang “chờ nhân viên” (bot im), không bị chặn, (5) bấm Thử AI.</li>
          <li><b>Bot im với một khách</b>: khách đang chờ nhân viên. Gõ <Code>/xong</Code>, hoặc bấm “Xử lý xong” ở Nhân viên và lệnh.</li>
          <li><b>Nhân viên không nhận thông báo</b>: chưa ghép nối, hoặc công tắc “Báo nhân viên qua Zalo” đang tắt.</li>
          <li><b>Webhook đăng ký không được</b>: <Code>APP_URL</Code> phải là https công khai và có <Code>ZALO_WEBHOOK_SECRET</Code>.</li>
          <li><b>Không đăng được bài chăm sóc</b>: xem dòng lỗi ngay dưới bài (thường do hết hạn mức tháng hoặc bot chưa còn trong nhóm).</li>
        </ul>
      </Section>
    </div>
  );
}
