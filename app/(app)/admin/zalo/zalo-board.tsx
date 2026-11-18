"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, Loader2Icon, PlugIcon, PlusIcon, SendIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addGroupAction,
  checkConnectionAction,
  deleteGroupAction,
  registerWebhookAction,
  testGroupAction,
  updateGroupAction,
  type ActionResult,
} from "./actions";

function report(r: ActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2Icon : XCircleIcon;
  return (
    <p className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-700" : "text-muted-foreground"}`}>
      <Icon className="size-4 shrink-0" /> {children}
    </p>
  );
}

export function ConnectionCard({
  tokenSet,
  secretSet,
  webhookUrl,
  isHttps,
}: {
  tokenSet: boolean;
  secretSet: boolean;
  webhookUrl: string;
  isHttps: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(name: string, fn: () => Promise<ActionResult>) {
    setBusy(name);
    startTransition(async () => {
      report(await fn());
      setBusy(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết nối bot</CardTitle>
        <CardDescription>
          Token và chuỗi bí mật đặt trong file .env trên máy chủ (không nhập ở đây để khỏi lộ), rồi khởi động lại.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Status ok={tokenSet}>{tokenSet ? "Đã có ZALO_BOT_TOKEN" : "Chưa có ZALO_BOT_TOKEN trong .env (tính năng Zalo đang tắt)"}</Status>
        <Status ok={secretSet}>
          {secretSet ? "Đã có ZALO_WEBHOOK_SECRET" : "Chưa có ZALO_WEBHOOK_SECRET (không dùng được webhook, vẫn thêm nhóm bằng tay được)"}
        </Status>
        <p className="text-sm text-muted-foreground">
          Địa chỉ webhook: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{webhookUrl}</code>
          {!isHttps && " (APP_URL chưa phải https công khai nên Zalo chưa gọi được)"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9" disabled={!tokenSet || pending} onClick={() => run("check", checkConnectionAction)}>
            {busy === "check" ? <Loader2Icon className="animate-spin" /> : <PlugIcon />} Kiểm tra token
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!tokenSet || !secretSet || !isHttps || pending}
            onClick={() => run("webhook", registerWebhookAction)}
          >
            {busy === "webhook" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Đăng ký webhook với Zalo
          </Button>
        </div>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Cách mời bot vào nhóm</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Mở mini app Zalo Bot Creator, chọn bot, lấy link của bot ở trang thông tin bot.</li>
            <li>Gửi link đó vào nhóm Zalo. Trưởng nhóm bấm vào link và xác nhận thêm bot vào nhóm.</li>
            <li>
              Trong nhóm, nhờ ai đó trả lời tin bot vừa gửi hoặc gõ @tên bot. Nhóm sẽ hiện ở danh sách bên dưới (cần bật webhook). Nếu chưa
              bật webhook, lấy mã nhóm (chat.id) rồi thêm bằng tay.
            </li>
            <li>Bấm &quot;Gửi tin thử&quot; để chắc chắn bot gửi được, rồi bật &quot;Tự động gửi&quot; nếu muốn.</li>
          </ol>
          <p className="mt-2">Zalo ghi chú tính năng bot trong nhóm đang thử nghiệm nên có thể thay đổi.</p>
        </details>
      </CardContent>
    </Card>
  );
}

type Group = {
  id: string;
  chatId: string;
  name: string;
  isActive: boolean;
  autoSend: boolean;
  lastSeen: string | null;
};

function GroupRow({ group, tokenSet }: { group: Group; tokenSet: boolean }) {
  const [name, setName] = useState(group.name);
  const [pending, startTransition] = useTransition();

  function patch(p: Parameters<typeof updateGroupAction>[1]) {
    startTransition(async () => report(await updateGroupAction(group.id, p)));
  }

  return (
    <TableRow>
      <TableCell className="min-w-48">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== group.name && patch({ name })}
          aria-label="Tên nhóm"
          className="h-9"
        />
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {group.chatId}
          {group.lastSeen ? ` · thấy lần cuối ${group.lastSeen}` : ""}
        </p>
      </TableCell>
      <TableCell>
        <Switch checked={group.isActive} disabled={pending} onCheckedChange={(v) => patch({ isActive: v })} aria-label="Bật nhóm" />
      </TableCell>
      <TableCell>
        <Switch
          checked={group.autoSend}
          disabled={pending || !group.isActive}
          onCheckedChange={(v) => patch({ autoSend: v })}
          aria-label="Tự động gửi ảnh vừa tạo xong"
        />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button
          variant="outline"
          size="sm"
          disabled={!tokenSet || pending}
          onClick={() => startTransition(async () => report(await testGroupAction(group.id)))}
        >
          <SendIcon /> Gửi tin thử
        </Button>{" "}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label="Xóa nhóm"
          onClick={() => {
            if (confirm(`Xóa nhóm "${group.name}" khỏi danh sách? Lịch sử gửi của nhóm này cũng bị xóa.`)) {
              startTransition(async () => report(await deleteGroupAction(group.id)));
            }
          }}
        >
          <Trash2Icon />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function GroupsBoard({ groups, tokenSet }: { groups: Group[]; tokenSet: boolean }) {
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const r = await addGroupAction({ name, chatId });
      report(r);
      if (r.ok) {
        setName("");
        setChatId("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Chưa có nhóm nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhóm</TableHead>
                <TableHead>Bật</TableHead>
                <TableHead>Tự động gửi</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRow key={`${g.id}:${g.name}`} group={g} tokenSet={tokenSet} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Tên nhóm
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nhóm chốt đơn" className="h-10" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Mã nhóm (chat id)
          <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Dán chat.id của nhóm" className="h-10" />
        </label>
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Thêm nhóm
        </Button>
      </form>
    </div>
  );
}
