"use client";

import { useTransition } from "react";
import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { COMMAND_INFO, TOGGLEABLE_COMMANDS, type ToggleableCommand } from "@/lib/zalo/commands";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { resolveWaitingAction } from "./feature-actions";
import { MasterOffNotice, SaveButton, SwitchRow, useZaloSettings } from "./settings-kit";

export function StaffSettings({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);

  function toggleCommand(name: ToggleableCommand, on: boolean) {
    const list = v.enabledCommands as ToggleableCommand[];
    set("enabledCommands", on ? [...list, name] : list.filter((c) => c !== name));
  }

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={v.enabled} tokenSet={tokenSet} />
      <Card>
        <CardHeader>
          <CardTitle>Ghép nối và lệnh gõ nhanh</CardTitle>
          <CardDescription>Nhân viên chat với bot trên Zalo để xem nhanh tình hình mà không cần mở web. Cần bật webhook (mục Tổng quan).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SwitchRow
            checked={v.pairing}
            onChange={(c) => toggle("pairing", c)}
            disabled={off}
            title="Ghép nối nhân viên"
            desc="Nhân viên gõ /ghepnoi với bot để xin mã 4 số, bạn đối chiếu mã và bấm Cho phép ở bảng bên dưới. Tắt thì không ai xin ghép nối được (người đã ghép nối vẫn giữ quyền)."
          />
          <SwitchRow
            checked={v.commands}
            onChange={(c) => toggle("commands", c)}
            disabled={off}
            title="Lệnh gõ nhanh"
            desc="Tắt thì mọi lệnh bên dưới ngừng hoạt động (trừ /ghepnoi, dùng công tắc Ghép nối ở trên)."
          />
          <fieldset className={`flex flex-col gap-3 ${off || !v.commands ? "opacity-50" : ""}`} disabled={off || !v.commands}>
            <legend className="mb-1 text-sm font-medium">Lệnh đang dùng được</legend>
            {TOGGLEABLE_COMMANDS.map((name) => (
              <label key={name} className="flex items-start gap-3">
                <Checkbox
                  checked={(v.enabledCommands as string[]).includes(name)}
                  onCheckedChange={(c) => toggleCommand(name, c === true)}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    <code className="rounded bg-muted px-1 py-0.5">{COMMAND_INFO[name].usage}</code>{" "}
                    <span className="text-xs font-normal text-muted-foreground">{COMMAND_INFO[name].staffOnly ? "chỉ nhân viên" : "ai cũng dùng được"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{COMMAND_INFO[name].desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <SaveButton onClick={() => save(["enabledCommands"])} saving={saving}>
            Lưu danh sách lệnh
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}

export type WaitingRow = { id: string; name: string; isGroup: boolean; lastText: string | null; at: string | null };

/** Khách đang chờ nhân viên: admin xem và bấm xử lý xong ngay trên web (nhân viên cũng có thể gõ /xong trên Zalo). */
export function WaitingBoard({ rows }: { rows: WaitingRow[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Khách đang chờ nhân viên</CardTitle>
        <CardDescription>
          Những khách bot đã chuyển cho người. Nhân viên mở Zalo trả lời khách, xong thì bấm &quot;Xử lý xong&quot; (hoặc gõ /xong với bot) để bot trả lời lại khách đó.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có khách nào đang chờ.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.name}
                    {r.isGroup ? " (nhóm)" : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.lastText ?? "(chưa có tin)"}
                    {r.at ? ` · ${r.at}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await resolveWaitingAction(r.id);
                      if (res.error) toast.error(res.error);
                      else toast.success(res.ok ?? "Xong.");
                    })
                  }
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />} Xử lý xong
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
