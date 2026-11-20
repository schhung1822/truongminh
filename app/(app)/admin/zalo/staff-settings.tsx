"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { COMMAND_INFO, TOGGLEABLE_COMMANDS, type ToggleableCommand } from "@/lib/zalo/commands";
import type { ZaloSettings } from "@/lib/zalo/settings";
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
                    <span className="text-xs font-normal text-muted-foreground">chỉ nhân viên</span>
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
