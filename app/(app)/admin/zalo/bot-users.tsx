"use client";

import { useState, useTransition } from "react";
import { CopyIcon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { ZaloBotAccess } from "@/generated/prisma/enums";
import { BOT_ACCESS_DESC, BOT_ACCESS_LABELS, BOT_ACCESS_LEVELS } from "@/lib/zalo/access";
import { pairInstruction } from "@/lib/zalo/pairing";
import { regenPairCodeAction, revokeStaffAction, setBotAccessAction } from "./feature-actions";

export type PairedZaloView = {
  contactId: string;
  zaloName: string;
  botName: string;
  botActive: boolean;
  /** "2 giờ trước", hoặc null nếu chưa ra lệnh lần nào */
  lastCommand: string | null;
};

export type BotUserView = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  isSelf: boolean;
  access: ZaloBotAccess;
  /** null khi quyền là "Không dùng bot" */
  code: string | null;
  zalo: PairedZaloView[];
};

type Result = { error?: string; ok?: string };

function report(r: Result) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

/** Chép chữ vào bộ nhớ tạm; trình duyệt không cho (trang không phải https) thì báo để người dùng tự chép. */
async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Trình duyệt không cho chép tự động. Hãy bôi đen mã rồi chép tay.");
  }
}

/**
 * Ai được dùng bot Zalo (docs/DECISIONS.md D133): mỗi tài khoản web một dòng, gồm quyền dùng bot, mã ghép nối để gửi cho người
 * đó, và các tài khoản Zalo người đó đã ghép. Quyền đổi là có hiệu lực ngay.
 */
export function BotUsersBoard({ users, botNames, pairingOn }: { users: BotUserView[]; botNames: string[]; pairingOn: boolean }) {
  const allowed = users.filter((u) => u.access !== "NONE").length;
  const paired = users.filter((u) => u.zalo.length > 0).length;

  return (
    <div className="flex flex-col gap-4">
      {!pairingOn && (
        <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Công tắc &quot;Ghép nối nhân viên&quot; đang tắt nên lệnh /ghepnoi chưa chạy: nhân viên chưa tự ghép nối được bằng mã. Bật ở khối cấu hình cuối trang.
        </p>
      )}

      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <p className="font-medium">Cách cho một người dùng bot</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>Chọn quyền cho người đó ở cột Quyền dùng bot.</li>
          <li>
            Bấm <b>Chép hướng dẫn</b> rồi dán gửi cho người đó. Họ mở chat riêng với bot và nhắn <code className="rounded bg-background px-1 py-0.5">/ghepnoi</code> kèm mã của mình.
          </li>
          <li>Bot báo ghép nối xong là dùng được ngay, không cần duyệt. Có thêm bot mới thì họ nhắn lại đúng dòng đó cho bot mới.</li>
        </ol>
      </div>

      <p className="text-sm text-muted-foreground">
        {allowed}/{users.length} tài khoản được dùng bot, {paired} người đã ghép nối Zalo.
      </p>

      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <UserRow key={`${u.id}:${u.access}:${u.code ?? ""}`} user={u} botNames={botNames} />
        ))}
      </ul>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Ba mức quyền khác nhau thế nào</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {BOT_ACCESS_LEVELS.map((a) => (
            <li key={a}>
              <b className="text-foreground">{BOT_ACCESS_LABELS[a]}</b>: {BOT_ACCESS_DESC[a]}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Ngoài mức này, bot làm việc đúng như chính người đó thao tác trên web: sale chỉ thêm logo cho khách mình phụ trách, mỗi ảnh tạo qua bot tính vào hạn mức ngày của người đó. Khóa tài khoản ở trang Người dùng thì bot cũng thôi nhận lệnh của họ.
        </p>
      </details>
    </div>
  );
}

function UserRow({ user, botNames }: { user: BotUserView; botNames: string[] }) {
  const [access, setAccess] = useState(user.access);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(what: string, fn: () => Promise<Result>, onError?: () => void) {
    setBusy(what);
    startTransition(async () => {
      const r = await fn();
      report(r);
      if (r.error) onError?.();
      setBusy(null);
    });
  }

  function changeAccess(next: ZaloBotAccess) {
    if (next === "NONE" && user.zalo.length > 0 && !window.confirm(`Bot sẽ thôi nhận lệnh từ ${user.zalo.length} tài khoản Zalo của ${user.name} ngay bây giờ. Tiếp tục?`)) return;
    setAccess(next);
    run("access", () => setBotAccessAction(user.id, next), () => setAccess(user.access));
  }

  const blocked = access === "NONE";

  return (
    <li className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1.4fr)] lg:items-start">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {user.name}
          {user.isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {user.roleLabel} · {user.email}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <NativeSelect value={access} onChange={(e) => changeAccess(e.target.value as ZaloBotAccess)} disabled={pending} aria-label={`Quyền dùng bot của ${user.name}`} className="h-9 w-full">
            {BOT_ACCESS_LEVELS.map((a) => (
              <option key={a} value={a}>
                {BOT_ACCESS_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
          {busy === "access" && <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">{BOT_ACCESS_DESC[access]}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {user.code && !blocked ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Mã ghép nối</span>
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold tracking-widest">{user.code}</code>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => copyText(pairInstruction(user.code!, botNames), `Đã chép hướng dẫn, dán gửi cho ${user.name}.`)}>
              <CopyIcon /> Chép hướng dẫn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Dùng khi nghi mã bị lộ. Zalo đã ghép vẫn giữ."
              onClick={() => {
                if (!window.confirm(`Đổi mã ghép nối của ${user.name}? Mã cũ sẽ không dùng được nữa; các tài khoản Zalo đã ghép vẫn giữ.`)) return;
                run("code", () => regenPairCodeAction(user.id));
              }}
            >
              {busy === "code" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Đổi mã
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Không cấp mã ghép nối khi quyền là &quot;{BOT_ACCESS_LABELS.NONE}&quot;.</p>
        )}

        {user.zalo.length === 0 ? (
          <p className="text-sm text-muted-foreground">{blocked ? "Chưa ghép nối Zalo nào." : "Chưa ghép nối Zalo nào: gửi hướng dẫn cho người này."}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {user.zalo.map((z) => (
              <li key={z.contactId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{z.zaloName}</span>
                <Badge variant={z.botActive ? "secondary" : "outline"}>{z.botName}</Badge>
                <span className="text-xs text-muted-foreground">{blocked ? "đang bị chặn" : z.lastCommand ? `ra lệnh ${z.lastCommand}` : "chưa ra lệnh lần nào"}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-muted-foreground"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Gỡ ghép nối Zalo "${z.zaloName}" khỏi tài khoản ${user.name}?\n\nNgười này còn giữ mã thì tự ghép nối lại được. Muốn chặn hẳn thì bấm Đổi mã, hoặc đặt quyền "Không dùng bot".`)) return;
                    run(`unpair:${z.contactId}`, () => revokeStaffAction(z.contactId));
                  }}
                >
                  {busy === `unpair:${z.contactId}` ? <Loader2Icon className="animate-spin" /> : <XIcon />} Gỡ
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
