"use client";

import { useState, useTransition } from "react";
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
  contacts: number;
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
            <li>Ở đây bấm &quot;Thêm bot&quot;, đặt tên gợi nhớ, dán token. Hệ thống hỏi Zalo ngay, token đúng mới lưu.</li>
            <li>Bấm &quot;Đăng ký webhook&quot; ở bot vừa thêm để bot nhận được tin và tự nhận ra nhóm.</li>
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

  const facts = [
    bot.accountName ? `Tên trên Zalo: ${bot.accountName}` : null,
    bot.tokenHint ? `Token kết thúc bằng ${bot.tokenHint}` : null,
    `${bot.groups} nhóm`,
    `${bot.contacts} hội thoại`,
    bot.lastChecked ? `Kiểm tra ${bot.lastChecked}` : null,
  ].filter(Boolean);

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
                const used = bot.groups + bot.contacts > 0 ? ` ${bot.groups} nhóm và ${bot.contacts} hội thoại của bot này vẫn được giữ nhưng sẽ không gửi được cho tới khi gán bot khác.` : "";
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
