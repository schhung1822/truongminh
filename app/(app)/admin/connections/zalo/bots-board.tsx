"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BotIcon, CheckIcon, KeyRoundIcon, Loader2Icon, PencilIcon, PlugIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usageLevel, ZALO_BASIC_LIMITS } from "@/lib/zalo/limits";
import { cn } from "@/lib/utils";
import { StatusPill } from "../status";
import {
  addZaloBotAction,
  checkZaloBotAction,
  deleteZaloBotAction,
  registerZaloWebhookAction,
  replaceZaloBotTokenAction,
  updateZaloBotAction,
  type BotActionResult,
} from "./bot-actions";

export type BotRow = {
  /** null = bot đặt trong file .env (chỉ xem và kiểm tra, không sửa/xóa ở đây) */
  id: string | null;
  name: string;
  accountName: string | null;
  tokenHint: string | null;
  isActive: boolean;
  canJoinGroups: boolean | null;
  groups: number;
  /** số người đã nhắn riêng với bot (Zalo giới hạn số người một bot tương tác) */
  people: number;
  /** tên nhân viên đã ghép nối với bot này */
  staff: string[];
  /** tin đã gửi tháng này do hệ thống đếm; `since` = "28/11" khi bắt đầu đếm giữa tháng; `quotaHit` = lúc Zalo báo hết hạn mức */
  usage: { sent: number; since: string | null; quotaHit: string | null };
  webhookUrl: string;
  /** đủ điều kiện đăng ký webhook (bot .env cần có ZALO_WEBHOOK_SECRET) */
  webhookReady: boolean;
  webhookSetAt: string | null;
  lastChecked: string | null;
  lastError: string | null;
};

function report(r: BotActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

/** Danh sách bot Zalo đã kết nối: mỗi bot một khối, thêm bao nhiêu bot cũng được. */
export function BotsBoard({ bots, isHttps }: { bots: BotRow[]; isHttps: boolean }) {
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<BotRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>Bot Zalo</CardTitle>
          <CardDescription className="mt-1">
            {bots.length === 0 ? "Chưa kết nối bot nào." : `${bots.length} bot.`} Mỗi bot là một token lấy ở mini app Zalo Bot Creator. Kết nối nhiều bot được: mỗi nhóm và mỗi hội thoại tự gắn với bot đang ở trong đó, tin gửi
            đi luôn qua đúng bot ấy. Token lưu trong hệ thống ở dạng mã hóa và không hiện lại.
          </CardDescription>
          <CardDescription className="mt-1">
            Gói miễn phí của Zalo cho mỗi bot gửi {ZALO_BASIC_LIMITS.messagesPerMonth.toLocaleString("vi-VN")} tin mỗi tháng (ảnh cũng tính 1 tin), nhắn với {ZALO_BASIC_LIMITS.usersPerBot} người và vào {ZALO_BASIC_LIMITS.groupsPerBot} nhóm;
            mỗi tài khoản Zalo tạo được {ZALO_BASIC_LIMITS.botsPerAccount} bot. Bot nào sắp đầy thì thêm bot khác rồi chuyển bớt nhóm sang.
          </CardDescription>
        </div>
        <Button type="button" onClick={() => setAdding(true)}>
          <PlusIcon /> Thêm bot
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isHttps && (
          <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            Địa chỉ web (APP_URL) chưa phải https công khai nên Zalo chưa gọi webhook tới được: bot vẫn gửi ảnh vào nhóm thêm bằng tay, nhưng chưa nhận được tin và chưa tự nhận ra nhóm.
          </p>
        )}
        {bots.map((b) => (
          <BotItem key={`${b.id ?? "env"}:${b.name}`} bot={b} isHttps={isHttps} onReplace={() => setReplacing(b)} />
        ))}
        {bots.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
            <BotIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Bấm &quot;Thêm bot&quot; rồi dán token của bot để bắt đầu.</p>
          </div>
        )}

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Cách lấy token và mời bot vào nhóm</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Trên điện thoại mở mini app Zalo Bot Creator, tạo bot (hoặc chọn bot có sẵn) và sao chép token của bot.</li>
            <li>Ở đây bấm &quot;Thêm bot&quot;, đặt tên gợi nhớ, dán token. Hệ thống hỏi Zalo ngay, token đúng mới lưu, rồi tự đăng ký webhook để bot nhận được tin.</li>
            <li>
              Nhân viên mở chat riêng với bot mới và nhắn <code className="rounded bg-muted px-1 py-0.5">/ghepnoi</code> kèm mã của mình (mã ở{" "}
              <Link href="/admin/zalo/staff" className="underline underline-offset-4">
                Cài đặt Zalo &gt; Nhân viên và quyền
              </Link>
              , hoặc ở trang Tài khoản của tôi của từng người). Mỗi người làm một lần cho mỗi bot.
            </li>
            <li>Lấy link của bot ở trang thông tin bot trong Zalo Bot Creator, gửi vào nhóm Zalo. Trưởng nhóm bấm vào link và xác nhận thêm bot.</li>
            <li>Trong nhóm, nhờ ai đó trả lời tin bot vừa gửi hoặc gõ @tên bot. Nhóm sẽ hiện ở Cài đặt Zalo &gt; Nhóm và gửi ảnh, gắn sẵn với bot này.</li>
          </ol>
          <p className="mt-2">Zalo ghi chú tính năng bot trong nhóm đang thử nghiệm nên có thể thay đổi.</p>
        </details>
      </CardContent>

      <AddBotDialog open={adding} onOpenChange={setAdding} />
      <ReplaceTokenDialog bot={replacing} onClose={() => setReplacing(null)} />
    </Card>
  );
}

function BotItem({ bot, isHttps, onReplace }: { bot: BotRow; isHttps: boolean; onReplace: () => void }) {
  const fromEnv = bot.id === null;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bot.name);

  function run(what: string, fn: () => Promise<BotActionResult>, after?: (r: BotActionResult) => void) {
    setBusy(what);
    startTransition(async () => {
      const r = await fn();
      report(r);
      after?.(r);
      setBusy(null);
    });
  }

  function saveName() {
    const next = name.trim();
    setEditing(false);
    if (!next || next === bot.name || !bot.id) return setName(bot.name);
    run("name", () => updateZaloBotAction(bot.id!, { name: next }), (r) => r.error && setName(bot.name));
  }

  const facts = [bot.accountName ? `Tên trên Zalo: ${bot.accountName}` : null, bot.tokenHint ? `Token kết thúc bằng ${bot.tokenHint}` : null, bot.lastChecked ? `Kiểm tra ${bot.lastChecked}` : null].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted">
          <BotIcon className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <Input
                autoFocus
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setName(bot.name);
                    setEditing(false);
                  }
                }}
                aria-label="Tên gợi nhớ của bot"
                className="h-8 w-56"
              />
            ) : (
              <span className="font-medium">{name}</span>
            )}
            {!fromEnv && !editing && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Đổi tên bot" title="Đổi tên" disabled={pending} onClick={() => setEditing(true)}>
                <PencilIcon />
              </Button>
            )}
            <StatusPill tone={bot.isActive ? "ok" : "off"}>{bot.isActive ? "Đang bật" : "Đang tắt"}</StatusPill>
            {fromEnv && <Badge variant="outline">Từ file .env</Badge>}
            {bot.canJoinGroups === false && <Badge variant="destructive">Chưa được phép vào nhóm</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{facts.join(" · ")}</p>
        </div>
        {!fromEnv && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={bot.isActive}
              disabled={pending}
              onCheckedChange={(v) => run("active", () => updateZaloBotAction(bot.id!, { isActive: v }))}
              aria-label={`Bật bot ${bot.name}`}
            />
            Bật
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="Tin đã gửi tháng này" used={bot.usage.sent} limit={ZALO_BASIC_LIMITS.messagesPerMonth} note={bot.usage.since ? `đếm từ ${bot.usage.since}` : undefined} />
        <Meter label="Người đã nhắn riêng" used={bot.people} limit={ZALO_BASIC_LIMITS.usersPerBot} />
        <Meter label="Nhóm" used={bot.groups} limit={ZALO_BASIC_LIMITS.groupsPerBot} />
      </div>
      {bot.usage.quotaHit && (
        <Alert variant="destructive">
          <AlertDescription>
            Zalo báo bot này đã hết hạn mức tin nhắn tháng (lúc {bot.usage.quotaHit}). Bot không gửi được cho tới khi Zalo làm mới hạn mức: thêm bot khác và chuyển nhóm sang, hoặc chờ sang tháng.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        {bot.staff.length === 0 ? "Chưa có nhân viên nào ghép nối với bot này." : `Nhân viên đang dùng (${bot.staff.length}): ${bot.staff.join(", ")}.`}{" "}
        <Link href="/admin/zalo/staff" className="underline underline-offset-4">
          Nhân viên và quyền
        </Link>
      </p>

      <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Webhook</span>
          {fromEnv ? (
            <StatusPill tone={bot.webhookReady ? "off" : "warn"}>{bot.webhookReady ? "Đăng ký bằng nút bên dưới" : "Thiếu ZALO_WEBHOOK_SECRET trong .env"}</StatusPill>
          ) : (
            <StatusPill tone={bot.webhookSetAt ? "ok" : "warn"}>{bot.webhookSetAt ? `Đã đăng ký ${bot.webhookSetAt}` : "Chưa đăng ký"}</StatusPill>
          )}
        </div>
        <code className="text-xs break-all text-muted-foreground">{bot.webhookUrl}</code>
      </div>

      {bot.lastError && (
        <Alert variant="destructive">
          <AlertDescription>Lỗi gần nhất: {bot.lastError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run("check", () => checkZaloBotAction(bot.id))}>
          {busy === "check" ? <Loader2Icon className="animate-spin" /> : <PlugIcon />} Kiểm tra token
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !isHttps || !bot.webhookReady}
          title={!isHttps ? "Cần APP_URL là https công khai" : undefined}
          onClick={() => run("webhook", () => registerZaloWebhookAction(bot.id))}
        >
          {busy === "webhook" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Đăng ký webhook
        </Button>
        {!fromEnv && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onReplace}>
              <KeyRoundIcon /> Đổi token
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
              onClick={() => {
                const used =
                  bot.groups + bot.people > 0
                    ? ` ${bot.groups} nhóm và ${bot.people} hội thoại của bot này vẫn được giữ nhưng sẽ không gửi được cho tới khi gán bot khác.${bot.staff.length > 0 ? ` ${bot.staff.length} nhân viên đang ghép nối với bot này sẽ phải ghép nối lại với bot khác.` : ""}`
                    : "";
                if (!window.confirm(`Gỡ bot "${bot.name}" khỏi hệ thống?${used}`)) return;
                run("delete", () => deleteZaloBotAction(bot.id!));
              }}
            >
              {busy === "delete" ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Gỡ bot
            </Button>
          </>
        )}
      </div>
      {fromEnv && <p className="text-xs text-muted-foreground">Bot này đặt trong file .env trên máy chủ (ZALO_BOT_TOKEN): muốn đổi hoặc gỡ thì sửa file đó rồi khởi động lại.</p>}
    </div>
  );
}

/** Một con số so với giới hạn của Zalo: thanh đầy dần, đổi màu khi từ 80% và khi chạm giới hạn. */
function Meter({ label, used, limit, note }: { label: string; used: number; limit: number; note?: string }) {
  const level = usageLevel(used, limit);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium tabular-nums", level === "full" && "text-destructive", level === "warn" && "text-amber-700")}>
          {used.toLocaleString("vi-VN")} / {limit.toLocaleString("vi-VN")}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div className={cn("h-full rounded-full", level === "full" ? "bg-destructive" : level === "warn" ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {(note || level !== "ok") && (
        <p className="text-xs text-muted-foreground">
          {[level === "full" ? "Đã chạm giới hạn của Zalo" : level === "warn" ? "Sắp chạm giới hạn của Zalo" : null, note].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TokenField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Token của bot</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete="off"
        spellCheck={false}
        maxLength={300}
        placeholder="Dán token lấy ở Zalo Bot Creator"
        className="h-10 font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">Token được kiểm tra với Zalo ngay khi bấm lưu, sau đó lưu ở dạng mã hóa và không hiện lại.</p>
    </div>
  );
}

function AddBotDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close(o: boolean) {
    if (!o) {
      setName("");
      setToken("");
      setError(null);
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm bot Zalo</DialogTitle>
          <DialogDescription>Kết nối thêm một bot bằng token của nó. Các bot đang chạy không bị ảnh hưởng.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const r = await addZaloBotAction({ name, token });
              if (r.error) return setError(r.error);
              report(r);
              close(false);
            });
          }}
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-name">Tên gợi nhớ</Label>
            <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Ví dụ: Bot nhóm khách sỉ" className="h-10" />
          </div>
          <TokenField id="bot-token" value={token} onChange={setToken} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Kiểm tra và lưu
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceTokenDialog({ bot, onClose }: { bot: BotRow | null; onClose: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setToken("");
    setError(null);
    onClose();
  }

  return (
    <Dialog open={!!bot} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi token của {bot?.name}</DialogTitle>
          <DialogDescription>Dùng khi bạn đã tạo lại token cho chính bot này trên Zalo. Nhóm, hội thoại và webhook của bot giữ nguyên.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bot?.id) return;
            const id = bot.id;
            setError(null);
            startTransition(async () => {
              const r = await replaceZaloBotTokenAction(id, token);
              if (r.error) return setError(r.error);
              report(r);
              close();
            });
          }}
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <TokenField id="bot-token-new" value={token} onChange={setToken} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Kiểm tra và lưu
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
