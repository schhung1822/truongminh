"use client";

import { useTransition } from "react";
import { CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { regenMyPairCodeAction } from "./actions";

export type MyZaloView = {
  /** tên quyền đang có, ví dụ "Đầy đủ" */
  accessLabel: string;
  accessDesc: string;
  /** null = tài khoản đang ở quyền "Không dùng bot" */
  code: string | null;
  botNames: string[];
  zalo: { contactId: string; zaloName: string; botName: string }[];
  /** lệnh /ghepnoi đang chạy được (Zalo bật và công tắc Ghép nối nhân viên bật) */
  pairingOn: boolean;
};

/** Phần "Dùng hệ thống qua Zalo" của trang Tài khoản của tôi: mã ghép nối của chính mình và các Zalo đã ghép (D133). */
export function ZaloCard({ data }: { data: MyZaloView }) {
  const [pending, startTransition] = useTransition();

  if (!data.code) {
    return <p className="text-sm text-muted-foreground">Tài khoản của bạn chưa được cấp quyền dùng bot Zalo. Cần dùng thì báo quản trị viên.</p>;
  }
  const command = `/ghepnoi ${data.code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Đã chép. Mở Zalo, dán vào chat riêng với bot rồi gửi.");
    } catch {
      toast.error("Trình duyệt không cho chép tự động. Hãy gõ lại dòng lệnh trong Zalo.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.pairingOn && (
        <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">Việc ghép nối qua Zalo đang tắt. Báo quản trị viên bật rồi mới làm theo các bước dưới đây.</p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          Mở Zalo, vào chat <b className="text-foreground">riêng</b> với bot của xưởng{data.botNames.length > 0 && <> ({data.botNames.join(", ")})</>}.
        </li>
        <li>Nhắn đúng dòng lệnh bên dưới. Bot báo ghép nối xong là dùng được.</li>
        <li>Xưởng có nhiều bot thì nhắn dòng này cho từng bot bạn làm việc cùng. Trong nhóm khách, tag bot rồi nói việc cần làm.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-muted px-3 py-2 font-mono text-base font-semibold tracking-wider">{command}</code>
        <Button type="button" variant="outline" onClick={copy}>
          <CopyIcon /> Chép
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Đổi mã ghép nối? Mã cũ sẽ không dùng được nữa; các tài khoản Zalo đã ghép vẫn giữ.")) return;
            startTransition(async () => {
              const r = await regenMyPairCodeAction();
              if (r.error) toast.error(r.error);
              else toast.success(r.ok ?? "Đã đổi mã.");
            });
          }}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Đổi mã
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Mã này là của riêng bạn: ai có mã là ra lệnh được cho bot dưới tên bạn. Đừng gửi vào nhóm; nghi lộ thì bấm Đổi mã.</p>

      <div className="flex flex-col gap-1.5 text-sm">
        <p>
          Quyền của bạn: <Badge variant="secondary">{data.accessLabel}</Badge> <span className="text-muted-foreground">{data.accessDesc}</span>
        </p>
        {data.zalo.length === 0 ? (
          <p className="text-muted-foreground">Chưa có tài khoản Zalo nào ghép với tài khoản này.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.zalo.map((z) => (
              <li key={z.contactId} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Đã ghép:</span>
                <span className="font-medium">{z.zaloName}</span>
                <Badge variant="outline">{z.botName}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
