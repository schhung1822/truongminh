"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon, PlugZapIcon, PlusIcon, QrCodeIcon, Trash2Icon, UnplugIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { connectAccountAction, disconnectAccountAction, removeAccountAction } from "./account-actions";

export type AccountRow = {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "LOGGED_OUT";
  lastError: string | null;
  lastConnectedAt: string | null;
  autoConnect: boolean;
  contacts: number;
};

const STATUS: Record<AccountRow["status"], { label: string; className: string }> = {
  CONNECTED: { label: "Đang kết nối", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  CONNECTING: { label: "Đang nối...", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  DISCONNECTED: { label: "Đã ngắt", className: "bg-muted text-muted-foreground hover:bg-muted" },
  LOGGED_OUT: { label: "Cần quét QR lại", className: "bg-red-100 text-red-800 hover:bg-red-100" },
};

const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function AccountsBoard({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, startBusy] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // có tài khoản đang nối thì tự làm mới danh sách vài giây một lần
  const connecting = accounts.some((a) => a.status === "CONNECTING");
  useEffect(() => {
    if (!connecting) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [connecting, router]);

  function act(fn: () => Promise<{ error?: string; ok?: string }>) {
    startBusy(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertTitle>Tài khoản Zalo cá nhân (dùng thử nghiệm)</AlertTitle>
        <AlertDescription>
          <p>
            Đăng nhập bằng mã QR như Zalo Web, mỗi số điện thoại là một tài khoản; hội thoại của mọi tài khoản gom về <b>Hộp thư Zalo</b>, trả lời qua đúng số
            của hội thoại. Đây là cách <b>không chính thức</b> (thư viện mô phỏng Zalo Web), có nguy cơ tài khoản bị khóa, chỉ nên dùng thử nghiệm.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            <li>Mỗi tài khoản chỉ giữ được MỘT kết nối nghe tin: mở Zalo Web cùng tài khoản sẽ làm kết nối ở đây bị ngắt (bấm Kết nối lại).</li>
            <li>Máy chủ khởi động lại thì tự nối lại bằng cookie đã lưu (mã hóa), không cần quét lại nếu phiên còn hạn.</li>
            <li>Tin được nhận từ lúc kết nối; chưa tải lại tin cũ trước đó.</li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Tài khoản đã đăng nhập</CardTitle>
            <CardDescription>{accounts.length === 0 ? "Chưa có tài khoản nào." : `${accounts.length} tài khoản.`}</CardDescription>
          </div>
          <Button type="button" onClick={() => setAdding(true)}>
            <PlusIcon /> Thêm tài khoản (quét QR)
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {accounts.map((a) => {
            const st = STATUS[a.status];
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="size-11 shrink-0 rounded-full border object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-muted">
                    <UserRoundIcon className="size-5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {a.name} <Badge className={st.className}>{st.label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.phone ? `${a.phone} · ` : ""}
                    {a.contacts} hội thoại
                    {a.lastConnectedAt ? ` · kết nối lần cuối ${fmt.format(new Date(a.lastConnectedAt))}` : ""}
                    {!a.autoConnect && " · không tự nối lại"}
                  </p>
                  {a.lastError && a.status !== "CONNECTED" && <p className="mt-1 text-xs text-red-600">{a.lastError}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.status === "CONNECTED" || a.status === "CONNECTING" ? (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act(() => disconnectAccountAction(a.id))}>
                      <UnplugIcon /> Ngắt
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act(() => connectAccountAction(a.id))}>
                      <PlugZapIcon /> Kết nối lại
                    </Button>
                  )}
                  {a.status === "LOGGED_OUT" && (
                    <Button type="button" size="sm" onClick={() => setAdding(true)}>
                      <QrCodeIcon /> Quét QR
                    </Button>
                  )}
                  {confirmRemove === a.id ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setConfirmRemove(null);
                        act(() => removeAccountAction(a.id));
                      }}
                    >
                      <Trash2Icon /> Bấm lại để xóa
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(a.id)} title="Xóa tài khoản và các hội thoại của nó">
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <QrDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

type LoginView = { id: string; status: "STARTING" | "QR" | "SCANNED" | "SUCCESS" | "FAILED" | "EXPIRED"; qr: string | null; scannedName: string | null; error: string | null };

/** Hộp quét QR: tạo lượt đăng nhập, hiện mã QR, theo dõi tới khi đăng nhập xong. */
function QrDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [view, setView] = useState<LoginView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginId = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled || !loginId.current) return;
      try {
        const res = await fetch(`/api/zalo/personal/login/${loginId.current}`, { cache: "no-store" });
        const body = (await res.json()) as LoginView & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Không lấy được trạng thái đăng nhập.");
          return;
        }
        setView(body);
        if (body.status === "SUCCESS") {
          toast.success("Đã đăng nhập tài khoản Zalo.");
          onDoneRef.current();
          return;
        }
        if (body.status === "FAILED" || body.status === "EXPIRED") return;
      } catch {
        /* thử lại lần sau */
      }
      timer = setTimeout(poll, 1500);
    }

    (async () => {
      setView(null);
      setError(null);
      try {
        const res = await fetch("/api/zalo/personal/login", { method: "POST" });
        const body = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !body.id) throw new Error(body.error ?? "Không bắt đầu được đăng nhập.");
        loginId.current = body.id;
        void poll();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không bắt đầu được đăng nhập.");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      const id = loginId.current;
      loginId.current = null;
      if (id) void fetch(`/api/zalo/personal/login/${id}`, { method: "DELETE" }).catch(() => {});
    };
  }, [open]);

  const done = view?.status === "SUCCESS";
  const failed = view?.status === "FAILED" || view?.status === "EXPIRED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đăng nhập Zalo bằng QR</DialogTitle>
          <DialogDescription>Mở Zalo trên điện thoại của số cần thêm, vào mục quét mã QR và quét mã dưới đây, rồi xác nhận đăng nhập.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-64 flex-col items-center justify-center gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : done ? (
            <p className="text-center text-emerald-700">Đăng nhập thành công. Tài khoản đang kết nối, tin nhắn sẽ về Hộp thư Zalo.</p>
          ) : failed ? (
            <p className="text-center text-red-600">{view?.error ?? "Đăng nhập không thành công."}</p>
          ) : view?.status === "SCANNED" ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
              <p className="font-medium">{view.scannedName ?? "Đã quét"}</p>
              <p className="text-sm text-muted-foreground">Hãy bấm xác nhận đăng nhập trên điện thoại.</p>
            </div>
          ) : view?.qr ? (
            <img src={view.qr} alt="Mã QR đăng nhập Zalo" className={cn("size-56 rounded-lg border bg-white p-2")} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-6 animate-spin" /> Đang tạo mã QR...
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {(failed || error) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setTimeout(() => onOpenChange(true), 50);
              }}
            >
              Thử lại
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            {done ? "Xong" : "Đóng"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
