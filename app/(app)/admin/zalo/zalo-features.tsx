"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { saveZaloSettingsAction, testChatAction, toggleZaloFeatureAction } from "./feature-actions";

type BoolKey = {
  [K in keyof ZaloSettings]: ZaloSettings[K] extends boolean ? K : never;
}[keyof ZaloSettings];

type Feature = { key: BoolKey; title: string; desc: string; needsToken?: boolean };

const FEATURE_GROUPS: { title: string; features: Feature[] }[] = [
  {
    title: "Gửi ảnh mẫu",
    features: [
      {
        key: "groupSend",
        title: "Gửi ảnh vào nhóm Zalo",
        desc: "Tự động (nhóm bật \"Tự động gửi\") hoặc sale bấm nút \"Gửi Zalo\" ở trang kết quả.",
      },
    ],
  },
  {
    title: "Hộp thư và nhân viên",
    features: [
      { key: "inbox", title: "Hộp thư Zalo", desc: "Lưu tin khách nhắn bot, xem và trả lời ngay trên web (mục Hộp thư Zalo ở menu). Cần bật webhook." },
      { key: "takeoverOnReply", title: "Nhân viên trả lời thì bot tạm dừng", desc: "Khi nhân viên gửi tin từ web, bot im ở hội thoại đó cho tới khi bấm \"Trả lại cho bot\"." },
      { key: "pairing", title: "Ghép nối nhân viên", desc: "Nhân viên gõ /ghepnoi với bot để xin mã 4 số, bạn đối chiếu và bấm Cho phép ở bên dưới." },
      { key: "commands", title: "Lệnh gõ nhanh", desc: "Nhân viên đã ghép nối gõ /status, /today, /inbox... để xem nhanh tình hình. Khách có /help, /reset, /nhanvien." },
    ],
  },
  {
    title: "Kịch bản chăm sóc nhóm",
    features: [
      { key: "care", title: "Kịch bản chăm sóc nhóm Zalo", desc: "AI lên kịch bản đăng 2-3 lượt mỗi ngày cho từng nhóm (chữ, kèm ảnh, kèm video) theo insight nhóm, thời tiết, dịp lễ. Người dùng chỉnh rồi đăng (mục Kịch bản chăm sóc ở menu)." },
      { key: "careWeather", title: "Cho AI biết dự báo thời tiết", desc: "Lấy dự báo 5 ngày từ Open-Meteo (miễn phí, chỉ gửi tọa độ địa điểm bên dưới) để bài hợp thời tiết: rét, mưa, nắng nóng." },
      { key: "careAutoRun", title: "Tự động lên kịch bản và đăng đúng giờ", desc: "Chỉ chạy khi máy chủ (VPS) gọi /api/jobs/zalo-care định kỳ với ZALO_CARE_CRON_SECRET (xem README). Máy cá nhân thì để tắt và bấm đăng bằng tay." },
    ],
  },
  {
    title: "Bot AI (kie.ai)",
    features: [
      { key: "chatbot", title: "Bot AI tự trả lời khách", desc: "Dùng model chat của kie.ai, mỗi lượt trả lời tốn một ít token. Có hạn mức mỗi ngày bên dưới để không tốn ngoài ý muốn." },
      { key: "groupReply", title: "Bot trả lời trong nhóm", desc: "Chỉ khi có người @bot hoặc trả lời tin của bot (Zalo chỉ gửi những tin đó cho bot)." },
      { key: "vision", title: "Bot xem được ảnh khách gửi", desc: "Gửi ảnh cho AI cùng câu hỏi. Cần model hỗ trợ ảnh (gpt-5-2 hỗ trợ ảnh). Tốn thêm token." },
      { key: "aiDraft", title: "Nút \"AI soạn\" trong Hộp thư", desc: "Gợi ý sẵn câu trả lời để nhân viên chỉnh rồi mới gửi. Không tự gửi." },
      { key: "includeMaterials", title: "Cho bot biết danh sách chất liệu", desc: "Bot nói đúng tên, nhóm, công nghệ in của các chất liệu đang bật." },
    ],
  },
];

export function ZaloFeatures({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  function toggle(key: BoolKey, value: boolean) {
    setV((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      const r = await toggleZaloFeatureAction(key, value);
      if (r.error) {
        setV((prev) => ({ ...prev, [key]: !value }));
        toast.error(r.error);
      }
    });
  }

  function save() {
    startSaving(async () => {
      const r = await saveZaloSettingsAction(v);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã lưu.");
    });
  }

  function testAi() {
    startTesting(async () => {
      const r = await testChatAction(v.chatModel);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "AI trả lời được.");
    });
  }

  const off = !v.enabled;
  const set = <K extends keyof ZaloSettings>(key: K, value: ZaloSettings[K]) => setV((p) => ({ ...p, [key]: value }));
  const num = (key: "botDailyLimit" | "botHourlyLimitPerContact" | "contextMessages") => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, Number(e.target.value) as never);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Bật/tắt chức năng Zalo</CardTitle>
          <CardDescription>Mỗi công tắc lưu ngay khi bật hoặc tắt. Công tắc tổng tắt thì không gửi, nhận hay trả lời gì qua Zalo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
            <Switch checked={v.enabled} onCheckedChange={(c) => toggle("enabled", c)} disabled={!tokenSet} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Bật Zalo</span>
              <span className="text-sm text-muted-foreground">
                {tokenSet ? "Công tắc tổng cho mọi chức năng Zalo bên dưới." : "Chưa có ZALO_BOT_TOKEN trong .env nên chưa bật được."}
              </span>
            </span>
          </label>

          {FEATURE_GROUPS.map((g) => (
            <div key={g.title} className={`flex flex-col gap-3 ${off ? "opacity-50" : ""}`}>
              <h3 className="text-sm font-semibold text-muted-foreground">{g.title}</h3>
              {g.features.map((f) => (
                <label key={f.key} className="flex items-start gap-3">
                  <Switch checked={v[f.key]} onCheckedChange={(c) => toggle(f.key, c)} disabled={off} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{f.title}</span>
                    <span className="text-xs text-muted-foreground">{f.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
          {pending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2Icon className="size-3 animate-spin" /> Đang lưu...</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kịch bản chăm sóc: địa điểm và thời gian</CardTitle>
          <CardDescription>Địa điểm dùng để lấy dự báo thời tiết. Insight của từng nhóm nhập ở trang Kịch bản chăm sóc.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="careLocationName">Địa điểm (tên gọi)</Label>
              <Input id="careLocationName" value={v.careLocationName} onChange={(e) => set("careLocationName", e.target.value)} maxLength={100} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="careLatitude">Vĩ độ</Label>
              <Input id="careLatitude" type="number" step="0.0001" value={v.careLatitude} onChange={(e) => set("careLatitude", Number(e.target.value))} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="careLongitude">Kinh độ</Label>
              <Input id="careLongitude" type="number" step="0.0001" value={v.careLongitude} onChange={(e) => set("careLongitude", Number(e.target.value))} className="h-10" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="careHorizonDays">Lên kịch bản trước mấy ngày (1-3)</Label>
            <Input id="careHorizonDays" type="number" min={1} max={3} value={v.careHorizonDays} onChange={(e) => set("careHorizonDays", Number(e.target.value))} className="h-10" />
          </div>
          <div>
            <Button type="button" className="h-10" onClick={save} disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              Lưu cài đặt chăm sóc
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot AI: cách trả lời</CardTitle>
          <CardDescription>
            Bot chỉ nói dựa trên hướng dẫn, thông tin xưởng và danh sách chất liệu. Gặp câu không chắc, khách đòi gặp người hoặc hỏi báo giá cụ thể thì bot báo nhân viên và dừng.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chatModel">Model chat của kie.ai</Label>
              <Input id="chatModel" value={v.chatModel} onChange={(e) => set("chatModel", e.target.value)} maxLength={100} className="h-10" />
              <p className="text-xs text-muted-foreground">Đã thử chạy được: gpt-5-2. Một số model (ví dụ gemini-2.5-flash) kie.ai báo &quot;channel is not supported&quot;. Bấm Thử AI để kiểm tra model trước khi dùng. Danh sách model ở kie.ai/market.</p>
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
              placeholder={"Ví dụ:\nGiờ làm việc: 8h-17h30, nghỉ Chủ nhật.\nĐịa chỉ: ...\nĐặt in tối thiểu 50 sản phẩm.\nThời gian làm mẫu: 2-3 ngày.\nBáo giá: nhân viên báo trực tiếp."}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoffReply">Câu bot nói khi chuyển nhân viên</Label>
              <Input id="handoffReply" value={v.handoffReply} onChange={(e) => set("handoffReply", e.target.value)} maxLength={500} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unsupportedReply">Câu bot nói khi khách gửi tin thoại hoặc file</Label>
              <Input id="unsupportedReply" value={v.unsupportedReply} onChange={(e) => set("unsupportedReply", e.target.value)} maxLength={500} className="h-10" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="botDailyLimit">Tối đa lượt bot trả lời mỗi ngày</Label>
              <Input id="botDailyLimit" type="number" min={0} value={v.botDailyLimit} onChange={num("botDailyLimit")} className="h-10" />
              <p className="text-xs text-muted-foreground">Cả hệ thống. Hết lượt thì bot im và đánh dấu hội thoại chờ nhân viên. 0 = bot không trả lời.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="botHourly">Tối đa lượt trả lời mỗi giờ cho một người</Label>
              <Input id="botHourly" type="number" min={1} value={v.botHourlyLimitPerContact} onChange={num("botHourlyLimitPerContact")} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contextMessages">Số tin gần nhất bot đọc</Label>
              <Input id="contextMessages" type="number" min={1} max={40} value={v.contextMessages} onChange={num("contextMessages")} className="h-10" />
            </div>
          </div>
          <div>
            <Button type="button" className="h-10" onClick={save} disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              Lưu cấu hình bot
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
