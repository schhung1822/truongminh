"use client";

import { useTransition } from "react";
import { Loader2Icon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WEEKDAY_LABELS } from "@/lib/zalo/hours";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { cn } from "@/lib/utils";
import { testChatAction } from "./feature-actions";
import { MasterOffNotice, numberChange, SaveButton, SwitchRow, useZaloSettings } from "./settings-kit";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function BotSettings({ initial, tokenSet, timeZone }: { initial: ZaloSettings; tokenSet: boolean; timeZone: string }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);
  const [testing, startTesting] = useTransition();

  function testAi() {
    startTesting(async () => {
      const r = await testChatAction(v.chatModel);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "AI trả lời được.");
    });
  }

  function setReply(i: number, patch: Partial<ZaloSettings["quickReplyList"][number]>) {
    set("quickReplyList", v.quickReplyList.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  function toggleDay(day: number) {
    const has = v.hoursDays.includes(day);
    set("hoursDays", has ? v.hoursDays.filter((d) => d !== day) : [...v.hoursDays, day].sort((a, b) => a - b));
  }

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={v.enabled} tokenSet={tokenSet} />

      <Card>
        <CardHeader>
          <CardTitle>Bot AI (kie.ai)</CardTitle>
          <CardDescription>
            Bot đọc tin khách nhắn riêng cho bot và tự trả lời bằng model chat của kie.ai. Mỗi lượt trả lời tốn một ít token; có hạn mức mỗi ngày bên dưới để không tốn ngoài ý muốn.
            Cần bật webhook (mục Tổng quan) để bot nhận được tin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow checked={v.chatbot} onChange={(c) => toggle("chatbot", c)} disabled={off} title="Bot AI tự trả lời khách" desc="Bật thì bot trả lời mọi khách nhắn riêng (trừ nhân viên đã ghép nối, khách bị chặn và khách đang chờ nhân viên). Tin của khách được lưu để bot đọc ngữ cảnh." />
          <SwitchRow checked={v.groupReply} onChange={(c) => toggle("groupReply", c)} disabled={off || !v.chatbot} title="Bot trả lời trong nhóm" desc="Chỉ khi có người @bot hoặc trả lời tin của bot (Zalo chỉ gửi những tin đó cho bot)." />
          <SwitchRow checked={v.vision} onChange={(c) => toggle("vision", c)} disabled={off || !v.chatbot} title="Bot xem được ảnh khách gửi" desc="Gửi ảnh cho AI cùng câu hỏi. Cần model hỗ trợ ảnh (gpt-5-2 hỗ trợ ảnh). Tốn thêm token. Tắt thì khách gửi ảnh sẽ được báo nhân viên." />
          <SwitchRow checked={v.includeMaterials} onChange={(c) => toggle("includeMaterials", c)} disabled={off || !v.chatbot} title="Cho bot biết danh sách chất liệu" desc="Bot nói đúng tên, nhóm, công nghệ in của các chất liệu đang bật trong thư viện." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cách bot trả lời</CardTitle>
          <CardDescription>
            Bot chỉ nói dựa trên hướng dẫn, thông tin xưởng và danh sách chất liệu. Gặp câu không chắc, khách đòi gặp người hoặc hỏi báo giá cụ thể thì bot báo nhân viên và dừng.
          </CardDescription>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="botPrompt">Hướng dẫn cho bot (vai trò, giọng điệu)</Label>
            <Textarea id="botPrompt" value={v.botPrompt} onChange={(e) => set("botPrompt", e.target.value)} rows={6} maxLength={6000} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="botKnowledge">Thông tin xưởng bot được phép nói</Label>
            <Textarea
              id="botKnowledge"
              value={v.botKnowledge}
              onChange={(e) => set("botKnowledge", e.target.value)}
              rows={8}
              maxLength={12000}
              placeholder={"Ví dụ:\nĐịa chỉ: ...\nĐặt in tối thiểu 50 sản phẩm.\nThời gian làm mẫu: 2-3 ngày.\nBáo giá: nhân viên báo trực tiếp."}
            />
            <p className="text-xs text-muted-foreground">Bot không bịa ngoài những gì ghi ở đây và danh sách chất liệu. Càng rõ (giá tham khảo, chính sách, thời gian) bot càng ít phải chuyển nhân viên.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unsupportedReply">Câu bot nói khi khách gửi tin thoại, file hoặc ảnh (khi bot chưa xem được)</Label>
            <Input id="unsupportedReply" value={v.unsupportedReply} onChange={(e) => set("unsupportedReply", e.target.value)} maxLength={500} className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="botDailyLimit">Tối đa lượt bot trả lời mỗi ngày</Label>
              <Input id="botDailyLimit" type="number" min={0} value={v.botDailyLimit} onChange={numberChange(set, "botDailyLimit")} className="h-10" />
              <p className="text-xs text-muted-foreground">Cả hệ thống. Hết lượt thì bot im và báo nhân viên. 0 = bot không trả lời.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="botHourly">Tối đa lượt trả lời mỗi giờ cho một người</Label>
              <Input id="botHourly" type="number" min={1} value={v.botHourlyLimitPerContact} onChange={numberChange(set, "botHourlyLimitPerContact")} className="h-10" />
              <p className="text-xs text-muted-foreground">Chống khách nhắn dồn dập.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contextMessages">Số tin gần nhất bot đọc</Label>
              <Input id="contextMessages" type="number" min={1} max={40} value={v.contextMessages} onChange={numberChange(set, "contextMessages")} className="h-10" />
              <p className="text-xs text-muted-foreground">Nhiều hơn thì bot nhớ lâu hơn nhưng tốn token hơn.</p>
            </div>
          </div>
          <SaveButton
            onClick={() => save(["chatModel", "botPrompt", "botKnowledge", "unsupportedReply", "botDailyLimit", "botHourlyLimitPerContact", "contextMessages"])}
            saving={saving}
          >
            Lưu cách trả lời
          </SaveButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lời chào và trả lời nhanh</CardTitle>
          <CardDescription>Hai chức năng này không tốn token và chạy được cả khi chưa bật Bot AI. Trả lời nhanh được thử trước, không khớp từ khóa nào thì mới tới bot AI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SwitchRow checked={v.welcome} onChange={(c) => toggle("welcome", c)} disabled={off} title="Chào khách nhắn lần đầu" desc="Gửi một lần duy nhất khi người lạ nhắn bot lần đầu (chat riêng)." />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="welcomeMessage">Lời chào</Label>
            <Textarea id="welcomeMessage" value={v.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} rows={3} maxLength={1000} />
          </div>

          <SwitchRow checked={v.quickReplies} onChange={(c) => toggle("quickReplies", c)} disabled={off} title="Trả lời nhanh theo từ khóa" desc="Khách nhắn có chứa từ khóa thì bot gửi đúng câu bạn soạn sẵn (ví dụ giờ làm việc, địa chỉ, cách đặt in). Không phân biệt hoa thường và dấu." />
          <div className="flex flex-col gap-3">
            {v.quickReplyList.length === 0 && <p className="text-sm text-muted-foreground">Chưa có câu nào. Bấm &quot;Thêm câu trả lời nhanh&quot;.</p>}
            {v.quickReplyList.map((q, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`qk-${i}`} className="text-xs">Từ khóa (cách nhau bằng dấu phẩy)</Label>
                  <Input id={`qk-${i}`} value={q.keywords} onChange={(e) => setReply(i, { keywords: e.target.value })} maxLength={300} placeholder="địa chỉ, ở đâu, xưởng ở" className="h-10" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`qr-${i}`} className="text-xs">Câu trả lời</Label>
                  <Textarea id={`qr-${i}`} value={q.reply} onChange={(e) => setReply(i, { reply: e.target.value })} rows={2} maxLength={1500} />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="ghost" size="icon" aria-label="Xóa câu trả lời này" onClick={() => set("quickReplyList", v.quickReplyList.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={v.quickReplyList.length >= 30}
                onClick={() => set("quickReplyList", [...v.quickReplyList, { keywords: "", reply: "" }])}
              >
                <PlusIcon /> Thêm câu trả lời nhanh
              </Button>
            </div>
          </div>
          <SaveButton onClick={() => save(["welcomeMessage", "quickReplyList"])} saving={saving}>
            Lưu lời chào và trả lời nhanh
          </SaveButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chuyển khách cho nhân viên</CardTitle>
          <CardDescription>
            Khi bot chuyển khách cho người: bot im ở cuộc trò chuyện đó, khách được đánh dấu &quot;chờ nhân viên&quot; (nhân viên gõ /cho để xem, /xong khi xử lý xong). Nhân viên trả lời khách ngay trên Zalo của mình.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow checked={v.staffNotify} onChange={(c) => toggle("staffNotify", c)} disabled={off} title="Báo nhân viên qua Zalo" desc="Nhắn cho mọi nhân viên đã ghép nối khi có khách cần người (một lần cho mỗi khách). Cần ghép nối nhân viên ở mục Nhân viên và lệnh." />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handoffKeywords">Từ khóa khách gõ là chuyển nhân viên ngay (mỗi dòng một từ hoặc cụm từ)</Label>
            <Textarea id="handoffKeywords" value={v.handoffKeywords} onChange={(e) => set("handoffKeywords", e.target.value)} rows={5} maxLength={2000} placeholder={"gặp nhân viên\nkhiếu nại\nbáo giá"} />
            <p className="text-xs text-muted-foreground">Khớp cả cụm từ, không phân biệt hoa thường và dấu. Không tốn token. Để trống nếu muốn để bot AI tự quyết định.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handoffReply">Câu bot nói khi chuyển nhân viên (trong giờ làm việc)</Label>
            <Input id="handoffReply" value={v.handoffReply} onChange={(e) => set("handoffReply", e.target.value)} maxLength={500} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="botResumeHours">Bot tự trả lời lại sau (giờ)</Label>
            <Input id="botResumeHours" type="number" min={0} max={720} value={v.botResumeHours} onChange={numberChange(set, "botResumeHours")} className="h-10" />
            <p className="text-xs text-muted-foreground">Khách đã chuyển nhân viên mà sau chừng này giờ chưa ai bấm /xong thì bot được trả lời lại. 0 = không tự trả lại, chỉ khi nhân viên gõ /xong.</p>
          </div>
          <SaveButton onClick={() => save(["handoffKeywords", "handoffReply", "botResumeHours"])} saving={saving}>
            Lưu cài đặt chuyển nhân viên
          </SaveButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Giờ làm việc</CardTitle>
          <CardDescription>
            Ngoài giờ, khi cần chuyển nhân viên bot dùng câu &quot;ngoài giờ&quot; và biết để nói nhân viên sẽ trả lời khi vào ca. Múi giờ theo máy chủ: {timeZone}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow checked={v.hoursEnabled} onChange={(c) => toggle("hoursEnabled", c)} disabled={off} title="Bật giờ làm việc" desc="Tắt thì bot coi như lúc nào cũng có nhân viên." />
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hoursStart">Từ giờ</Label>
              <Input id="hoursStart" type="time" value={v.hoursStart} onChange={(e) => set("hoursStart", e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hoursEnd">Đến giờ</Label>
              <Input id="hoursEnd" type="time" value={v.hoursEnd} onChange={(e) => set("hoursEnd", e.target.value)} className="h-10" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Các ngày làm việc</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={v.hoursDays.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors", v.hoursDays.includes(d) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {WEEKDAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="afterHoursReply">Câu bot nói khi chuyển nhân viên mà đang ngoài giờ</Label>
            <Textarea id="afterHoursReply" value={v.afterHoursReply} onChange={(e) => set("afterHoursReply", e.target.value)} rows={2} maxLength={500} />
          </div>
          <SaveButton onClick={() => save(["hoursStart", "hoursEnd", "hoursDays", "afterHoursReply"])} saving={saving}>
            Lưu giờ làm việc
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
