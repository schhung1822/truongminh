"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approvePairAction, rejectPairAction, revokeStaffAction } from "./feature-actions";

export type PairRow = { id: string; name: string; requestedAt: string | null };
export type StaffRow = { id: string; name: string };

function PendingRow({ row }: { row: PairRow }) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string; ok?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Xong.");
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">Xin ghép nối{row.requestedAt ? ` lúc ${row.requestedAt}` : ""}. Hỏi người đó mã 4 số bot vừa nhắn rồi nhập vào đây.</p>
      </div>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="Mã 4 số"
        aria-label={`Mã ghép nối của ${row.name}`}
        className="h-9 w-28 text-center tracking-widest"
      />
      <Button type="button" size="sm" disabled={pending || code.length !== 4} onClick={() => run(() => approvePairAction(row.id, code))}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Cho phép
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectPairAction(row.id))}>
        <XIcon /> Từ chối
      </Button>
    </li>
  );
}

export function PairingBoard({ pending, staff, enabled }: { pending: PairRow[]; staff: StaffRow[]; enabled: boolean }) {
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {!enabled && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Chức năng ghép nối đang tắt. Bật công tắc &quot;Ghép nối nhân viên&quot; ở phần trên để nhân viên xin ghép nối được.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Đang chờ cho phép</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có yêu cầu nào. Nhân viên mở chat với bot trên Zalo rồi gõ /ghepnoi.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <PendingRow key={p.id} row={p} />
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Nhân viên đã ghép nối</h3>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có ai.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <Badge variant="secondary">Nhân viên</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await revokeStaffAction(s.id);
                      if (r.error) toast.error(r.error);
                      else toast.success(r.ok ?? "Đã thu hồi.");
                    })
                  }
                >
                  Thu hồi
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
