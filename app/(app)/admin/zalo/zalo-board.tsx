"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, RotateCwIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addGroupAction, deleteGroupAction, retryPinDeliveryAction, testGroupAction, updateGroupAction, type ActionResult } from "./actions";

function report(r: ActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

/** Bot để gán cho nhóm. value rỗng = bot trong .env (hoặc bot mặc định khi .env không có token). */
export type BotOption = { value: string; label: string };

type Group = {
  id: string;
  chatId: string;
  name: string;
  isActive: boolean;
  lastSeen: string | null;
  /** bot đang ở trong nhóm; rỗng = bot trong .env / bot mặc định */
  botId: string;
  /** nhóm nhận mẫu Pinterest mới (pin vừa lưu vào board đang theo dõi) */
  pinFeed: boolean;
};

function GroupRow({ group, tokenSet, bots }: { group: Group; tokenSet: boolean; bots: BotOption[] }) {
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
      {bots.length > 1 && (
        <TableCell>
          <NativeSelect value={group.botId} disabled={pending} onChange={(e) => patch({ botId: e.target.value })} aria-label={`Bot của nhóm ${group.name}`} className="h-9 min-w-40">
            {bots.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </NativeSelect>
        </TableCell>
      )}
      <TableCell>
        <Switch checked={group.isActive} disabled={pending} onCheckedChange={(v) => patch({ isActive: v })} aria-label="Bật nhóm" />
      </TableCell>
      <TableCell>
        <Switch
          checked={group.pinFeed}
          disabled={pending || !group.isActive}
          onCheckedChange={(v) => patch({ pinFeed: v })}
          aria-label={`Nhóm ${group.name} nhận mẫu Pinterest mới`}
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

/** Nút gửi lại một mẫu Pinterest đã gửi lỗi vào nhóm. */
export function PinDeliveryRetryButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => report(await retryPinDeliveryAction(id)))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />} Gửi lại
    </Button>
  );
}

/**
 * Danh sách nhóm. `bots` có từ hai lựa chọn trở lên (đã kết nối nhiều bot) thì mỗi nhóm hiện thêm ô chọn bot: nhóm tự nhận
 * qua webhook đã gắn sẵn đúng bot, nhóm thêm bằng tay thì quản trị viên chọn bot đang ở trong nhóm đó.
 */
export function GroupsBoard({ groups, tokenSet, bots }: { groups: Group[]; tokenSet: boolean; bots: BotOption[] }) {
  const multi = bots.length > 1;
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState("");
  const [botId, setBotId] = useState(bots[0]?.value ?? "");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const r = await addGroupAction({ name, chatId, botId: multi ? botId : null });
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
                {multi && <TableHead>Bot</TableHead>}
                <TableHead>Bật</TableHead>
                <TableHead>Nhận mẫu Pinterest</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRow key={`${g.id}:${g.name}`} group={g} tokenSet={tokenSet} bots={bots} />
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
        {multi && (
          <label className="flex min-w-40 flex-col gap-1 text-sm">
            Bot đang ở trong nhóm
            <NativeSelect value={botId} onChange={(e) => setBotId(e.target.value)} className="h-10">
              {bots.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Thêm nhóm
        </Button>
      </form>
    </div>
  );
}
