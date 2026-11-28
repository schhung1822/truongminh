"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { testChatAction } from "./feature-actions";
import { MasterOffNotice, numberChange, SaveButton, SwitchRow, useZaloSettings } from "./settings-kit";

export function BotSettings({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);
  const [testing, startTesting] = useTransition();

  function testAi() {
    startTesting(async () => {
      const r = await testChatAction(v.chatModel);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "AI trả lời được.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={v.enabled} tokenSet={tokenSet} />

      <Card>
        <CardHeader>
          <CardTitle>Bot chỉ làm việc cho nhân viên</CardTitle>
          <CardDescription>
            Bot không tự nói chuyện với khách: không tự trả lời, không chào, không trả lời nhanh. Nhân viên là người nói với khách. Bot chỉ chạy khi nhân viên đã ghép nối tag bot (hoặc nhắn riêng cho bot) để nhờ làm ảnh,
            giải thích kỹ thuật, hoặc khi nhân viên bấm “AI soạn” trong Hộp thư. Kiến thức bot dùng nằm ở{" "}
            <Link href="/admin/business" className="underline underline-offset-4">
              Thông tin doanh nghiệp
            </Link>
            , mỗi AI chỉ nhận phần dành cho nó.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trợ lý nhận lệnh (tag bot trong nhóm)</CardTitle>
          <CardDescription>
            Nhân viên đã ghép nối và gắn tài khoản web tag bot trong nhóm khách (hoặc nhắn riêng cho bot) rồi nói việc cần làm bằng lời thường. Bot tự tra khách, xem lịch sử, tạo ảnh và hỏi lại khi thiếu
            thông tin: &quot;tạo ảnh cho khách Minh theo mẫu khách từng ưng&quot;, làm catalog cho logo vừa gửi (AI chọn chất liệu hợp logo), chọn ô trên catalog để thiết kế, gửi lại mẫu cũ, hỏi tiến độ, hỏi kỹ thuật.
            Việc bot tự suy ra từ lịch sử hoặc tốn từ 12 lượt trở lên thì bot hỏi xác nhận trước khi làm. Ảnh tạo xong bot gửi lại đúng cuộc chat đó. Khách trong nhóm không ra lệnh được. Mỗi tin tốn 1-3 lượt hỏi AI
            (mỗi lượt khoảng 5-10 giây); ảnh tạo thuộc hạn mức của nhân viên. Xem ví dụ ở Hướng dẫn sử dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow checked={v.agent} onChange={(c) => toggle("agent", c)} disabled={off} title="Bật trợ lý nhận lệnh" desc="Cần webhook, và nhân viên đã ghép nối Zalo với tài khoản web của mình (Nhân viên và quyền). Bot chỉ nhận được tin trong nhóm khi có người @bot." />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agentTagName">Tên bot trên Zalo (để nhận ra @tag)</Label>
            <Input id="agentTagName" value={v.agentTagName} onChange={(e) => set("agentTagName", e.target.value)} maxLength={60} className="h-10 sm:max-w-sm" placeholder="Ví dụ: Trợ lý xưởng" />
            <p className="text-xs text-muted-foreground">
              Điền đúng tên bot hiển thị trên Zalo thì chỉ tin nhắc tên này mới là lệnh (chữ @tên bị bỏ trước khi hiểu lệnh). Bỏ trống thì mọi tin nhân viên gửi mà bot nhận được đều là lệnh.
            </p>
          </div>
          <SaveButton onClick={() => save(["agentTagName"])} saving={saving}>
            Lưu tên bot
          </SaveButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hộp thư Zalo trên web</CardTitle>
          <CardDescription>
            Nhân viên xem hội thoại khách nhắn bot, trả lời và gửi ảnh mẫu ngay trên web (menu Zalo &gt; Hộp thư Zalo). Tin của khách bị chặn không hiện ở hộp thư.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow checked={v.inbox} onChange={(c) => toggle("inbox", c)} disabled={off} title="Bật Hộp thư Zalo" desc="Tắt thì mục Hộp thư Zalo ẩn khỏi menu của mọi người và tin khách nhắn bot không còn được lưu. Công tắc này cũng có ở Hệ thống > Cấu hình." />
          <SwitchRow checked={v.aiDraft} onChange={(c) => toggle("aiDraft", c)} disabled={off || !v.inbox} title="Nút “AI soạn” cho nhân viên" desc="AI soạn sẵn câu trả lời (chỉ dùng kiến thức công khai) để nhân viên xem và sửa rồi mới gửi, không tự gửi. Tốn một ít token mỗi lần bấm." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model AI</CardTitle>
          <CardDescription>Model chat của kie.ai dùng cho trợ lý nhận lệnh, nút “AI soạn” và kịch bản chăm sóc nhóm.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chatModel">Model chat của kie.ai</Label>
              <Input id="chatModel" value={v.chatModel} onChange={(e) => set("chatModel", e.target.value)} maxLength={100} className="h-10" />
              <p className="text-xs text-muted-foreground">
                Đã thử chạy được: gpt-5-2. Một số model (ví dụ gemini-2.5-flash) kie.ai báo &quot;channel is not supported&quot;. Bấm Thử AI để kiểm tra model trước khi dùng. Danh sách model ở kie.ai/market.
              </p>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="h-10" onClick={testAi} disabled={testing}>
                {testing ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                Thử AI
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="contextMessages">Số tin gần nhất AI đọc khi soạn nháp</Label>
            <Input id="contextMessages" type="number" min={1} max={40} value={v.contextMessages} onChange={numberChange(set, "contextMessages")} className="h-10" />
            <p className="text-xs text-muted-foreground">Nhiều hơn thì AI hiểu ngữ cảnh rõ hơn nhưng tốn token hơn.</p>
          </div>
          <SaveButton onClick={() => save(["chatModel", "contextMessages"])} saving={saving}>
            Lưu cài đặt model
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
