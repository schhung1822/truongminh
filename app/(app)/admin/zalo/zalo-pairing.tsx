"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { approvePairAction, linkStaffUserAction, rejectPairAction, revokeStaffAction } from "./feature-actions";

export type PairRow = { id: string; name: string; requestedAt: string | null };
/** `note` = ghi chú ngắn về bot hoặc lý do nằm ở danh sách này (ví dụ tài khoản web đã khóa) */
export type StaffRow = { id: string; name: string; note: string | null };
export type WebUser = { id: string; name: string };

function UserSelect({ users, value, onChange, label, disabled }: { users: WebUser[]; value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className="h-9 w-48">
      <option value="">Chưa gắn tài khoản web</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function PendingRow({ row, users }: { row: PairRow; users: WebUser[] }) {
  const [code, setCode] = useState("");
  const [userId, setUserId] = useState("");
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
      <UserSelect users={users} value={userId} onChange={setUserId} label={`Tài khoản web của ${row.name}`} disabled={pending} />
      <Button type="button" size="sm" disabled={pending || code.length !== 4} onClick={() => run(() => approvePairAction(row.id, code, userId || undefined))}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Cho phép
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectPairAction(row.id))}>
        <XIcon /> Từ chối
      </Button>
    </li>
  );
}

/**
 * Ghép nối cách cũ (trước D133), giữ cho người chưa có tài khoản web hoặc không tiện xem mã: họ nhắn /ghepnoi không kèm mã,
 * bot trả mã 4 số, quản trị viên nhập mã đó ở đây. `staff` = các Zalo đã ghép nối nhưng chưa gắn tài khoản web (chỉ dùng
 * được lệnh gõ nhanh, chưa ra lệnh được cho trợ lý).
 */
export function PairingBoard({ pending, staff, enabled, users }: { pending: PairRow[]; staff: StaffRow[]; enabled: boolean; users: WebUser[] }) {
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Đang chờ cho phép</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có yêu cầu nào.{enabled ? " Người chưa có mã nhắn /ghepnoi cho bot (không kèm gì) thì yêu cầu hiện ở đây." : " Công tắc Ghép nối nhân viên đang tắt nên chưa ai xin ghép nối được."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <PendingRow key={p.id} row={p} users={users} />
            ))}
          </ul>
        )}
      </div>
      {staff.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Đã ghép nối nhưng chưa gắn tài khoản web</h3>
          <p className="text-xs text-muted-foreground">
            Những Zalo này chỉ dùng được lệnh gõ nhanh. Gắn tài khoản web thì người đó ra lệnh được cho trợ lý, theo quyền và hạn mức của tài khoản ấy. Họ cũng có thể tự nhắn /ghepnoi kèm mã của mình.
          </p>
          <ul className="flex flex-col gap-2">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                {s.note && <Badge variant="outline">{s.note}</Badge>}
                <UserSelect
                  users={users}
                  value=""
                  label={`Tài khoản web của ${s.name}`}
                  disabled={busy}
                  onChange={(v) =>
                    v &&
                    startTransition(async () => {
                      const r = await linkStaffUserAction(s.id, v);
                      if (r.error) toast.error(r.error);
                      else toast.success(r.ok ?? "Đã lưu.");
                    })
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await revokeStaffAction(s.id);
                      if (r.error) toast.error(r.error);
                      else toast.success(r.ok ?? "Đã gỡ.");
                    })
                  }
                >
                  Gỡ ghép nối
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
