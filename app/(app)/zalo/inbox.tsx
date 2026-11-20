"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  BanIcon,
  CheckCheckIcon,
  FileArchiveIcon,
  ImageIcon,
  Loader2Icon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AccountOption, ContactItem } from "@/app/api/zalo/contacts/route";
import type { MessageItem } from "@/app/api/zalo/contacts/[id]/route";
import {
  draftReplyAction,
  listSessionsForSendAction,
  markHandledAction,
  sendReplyAction,
  sendSessionAction,
  setBlockedAction,
  type SessionChoice,
} from "./actions";

type Filter = "all" | "unread" | "waiting" | "blocked";
type ThreadData = {
  contact: {
    id: string;
    name: string;
    isGroup: boolean;
    botPaused: boolean;
    needsHuman: boolean;
    blocked: boolean;
    account: { id: string; name: string; status: AccountOption["status"] } | null;
  };
  messages: MessageItem[];
  features: { aiDraft: boolean };
};

const POLL_MS = 5000;
const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function Inbox({ initial, initialAccounts }: { initial: ContactItem[]; initialAccounts: AccountOption[] }) {
  const [contacts, setContacts] = useState(initial);
  const [accounts, setAccounts] = useState(initialAccounts);
  // "" = mọi tài khoản, "bot" = chỉ bot, còn lại là mã một tài khoản cá nhân
  const [account, setAccount] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (filter !== "all") sp.set("filter", filter);
      if (account) sp.set("account", account);
      const res = await fetch(`/api/zalo/contacts?${sp}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { contacts: ContactItem[]; accounts?: AccountOption[] };
        setContacts(body.contacts);
        if (body.accounts) setAccounts(body.accounts);
      }
    } catch {
      /* mất mạng tạm thời: lần sau thử lại */
    }
  }, [q, filter, account]);

  useEffect(() => {
    // tải lại khi đổi bộ lọc/tìm kiếm, rồi cứ vài giây một lần
    const first = setTimeout(() => void loadList(), q ? 250 : 0);
    const t = setInterval(() => void loadList(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList, q]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "unread", label: "Chưa đọc" },
    { key: "waiting", label: "Chờ nhân viên" },
    { key: "blocked", label: "Đã chặn" },
  ];

  return (
    <div className="grid h-[calc(100svh-11rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card md:grid-cols-[20rem_1fr]">
      <aside className={cn("flex min-h-0 flex-col border-r", activeId && "hidden md:flex")}>
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên" className="h-9 pl-9" aria-label="Tìm hội thoại" />
          </div>
          {accounts.length > 0 && (
            <NativeSelect value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Lọc theo tài khoản Zalo">
              <option value="">Tất cả tài khoản</option>
              <option value="bot">Bot Zalo</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.unread > 0 ? ` (${a.unread} chưa đọc)` : ""}
                  {a.status !== "CONNECTED" ? " (chưa kết nối)" : ""}
                </option>
              ))}
            </NativeSelect>
          )}
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {contacts.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Chưa có hội thoại nào.</li>}
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={cn("flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60", activeId === c.id && "bg-muted")}
              >
                <span className="flex items-center gap-2">
                  {c.isGroup && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}>{c.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(c.lastAt)}</span>
                </span>
                {c.accountName && accounts.length > 0 && (
                  <span className="truncate text-[11px] text-primary">{c.accountName}</span>
                )}
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.lastText ?? ""}</span>
                  {c.needsHuman && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Chờ người</Badge>}
                  {c.unread > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{c.unread}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn("flex min-h-0 flex-col", !activeId && "hidden md:flex")}>
        {activeId ? (
          <Thread key={activeId} id={activeId} onBack={() => setActiveId(null)} onChanged={loadList} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Chọn một hội thoại để xem và trả lời.</div>
        )}
      </section>
    </div>
  );
}

function Bubble({ m }: { m: MessageItem }) {
  if (m.failed) {
    return (
      <div className="mx-auto max-w-[90%] rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs text-red-700">
        {m.text ?? "Gửi không thành công."} {m.error && <span className="block opacity-80">{m.error}</span>}
      </div>
    );
  }
  if (m.author === "SYSTEM") {
    return <div className="mx-auto max-w-[90%] rounded-lg bg-muted px-3 py-1.5 text-center text-xs whitespace-pre-line text-muted-foreground">{m.text}</div>;
  }
  const mine = m.direction === "OUT";
  const who = m.author === "BOT" ? "Bot AI" : m.author === "HUMAN" ? (m.byName ?? "Nhân viên") : null;
  return (
    <div className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}>
      {who && <span className="px-1 text-[10px] text-muted-foreground">{who}</span>}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
          !mine && "rounded-bl-sm bg-muted",
          m.author === "BOT" && "rounded-br-sm bg-amber-100 text-amber-950",
          m.author === "HUMAN" && "rounded-br-sm bg-primary text-primary-foreground",
        )}
      >
        {m.mediaUrl && (
          <img src={m.mediaUrl} alt="Ảnh trong hội thoại" className="mb-1 max-h-64 rounded-lg" loading="lazy" />
        )}
        {m.text}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground">{timeFmt.format(new Date(m.at))}</span>
    </div>
  );
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, startSend] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [busy, startBusy] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/zalo/contacts/${id}?read=${firstLoad.current ? 1 : 0}`, { cache: "no-store" });
      const body = (await res.json()) as ThreadData & { error?: string };
      if (!res.ok) return setError(body.error ?? "Không tải được hội thoại.");
      setError(null);
      setData(body);
      if (firstLoad.current) {
        firstLoad.current = false;
        onChanged();
      }
    } catch {
      /* thử lại lần sau */
    }
  }, [id, onChanged]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    if (data && data.messages.length !== lastCount.current) {
      lastCount.current = data.messages.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [data]);

  function act(fn: () => Promise<{ error?: string; ok?: string }>) {
    startBusy(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      await load();
      onChanged();
    });
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    startSend(async () => {
      const r = await sendReplyAction(id, t);
      if (r.error) return void toast.error(r.error);
      setText("");
      await load();
      onChanged();
    });
  }

  function draft() {
    startDraft(async () => {
      const r = await draftReplyAction(id);
      if (r.error) toast.error(r.error);
      else if (r.text) setText(r.text);
    });
  }

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="flex flex-1 items-center justify-center"><Loader2Icon className="animate-spin text-muted-foreground" /></div>;
  const { contact, messages, features } = data;

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Quay lại danh sách">
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            {contact.isGroup && <UsersIcon className="size-4 text-muted-foreground" />} {contact.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {contact.account
              ? `Qua tài khoản Zalo: ${contact.account.name}${contact.account.status !== "CONNECTED" ? " (chưa kết nối, chưa gửi được)" : ""}`
              : contact.blocked
                ? "Đã chặn"
                : "Nhân viên trả lời khách (bot không tự trả lời)"}
          </p>
        </div>
        {!contact.account && contact.needsHuman && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => markHandledAction(id))}>
            <CheckCheckIcon /> Đã xử lý
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => setBlockedAction(id, !contact.blocked))} title={contact.blocked ? "Bỏ chặn" : "Chặn"}>
          <BanIcon /> <span className="hidden sm:inline">{contact.blocked ? "Bỏ chặn" : "Chặn"}</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/20 p-3">
        {messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">Chưa có tin nhắn.</p>}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={bottom} />
      </div>

      {!contact.blocked && (
        <footer className="flex flex-col gap-2 border-t p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
            rows={3}
            maxLength={6000}
            placeholder="Nhập câu trả lời (Ctrl+Enter để gửi)"
            aria-label="Nội dung trả lời"
          />
          <div className="flex flex-wrap items-center gap-2">
            {features.aiDraft && (
              <Button type="button" variant="outline" size="sm" onClick={draft} disabled={drafting}>
                {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} AI soạn
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <ImageIcon /> Gửi ảnh mẫu
            </Button>
            <Button type="button" size="sm" className="ml-auto" onClick={send} disabled={sending || !text.trim()}>
              {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Gửi
            </Button>
          </div>
        </footer>
      )}

      <SessionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSend={(sessionId, mode) =>
          act(async () => {
            const r = await sendSessionAction(id, sessionId, mode);
            if (!r.error) setPickerOpen(false);
            return r;
          })
        }
        busy={busy}
      />
    </>
  );
}

function SessionPicker({
  open,
  onOpenChange,
  onSend,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSend: (sessionId: string, mode: "images" | "pdf" | "zip") => void;
  busy: boolean;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SessionChoice[] | null>(null);
  const [mode, setMode] = useState<"images" | "pdf" | "zip">("pdf");

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const r = await listSessionsForSendAction(q);
      setItems(r.sessions);
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q]);

  const modes: { key: "images" | "pdf" | "zip"; label: string; icon: React.ReactNode }[] = [
    { key: "pdf", label: "File PDF", icon: <FileArchiveIcon /> },
    { key: "images", label: "Từng ảnh", icon: <ImageIcon /> },
    { key: "zip", label: "File ZIP", icon: <FileArchiveIcon /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gửi ảnh mẫu cho khách</DialogTitle>
          <DialogDescription>Chọn phiên đã tạo ảnh, rồi chọn cách gửi. Ảnh gửi là ảnh đã hoàn thiện (có nhãn chất liệu).</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs [&_svg]:size-3.5", mode === m.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên thương hiệu hoặc khách" className="h-9" aria-label="Tìm phiên" />
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {items === null && <li className="p-4 text-center text-sm text-muted-foreground">Đang tải...</li>}
          {items?.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Không có phiên nào có ảnh.</li>}
          {items?.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.subtitle} · {s.images} ảnh</span>
              </span>
              <Button size="sm" disabled={busy || (mode === "images" && s.images > 20)} onClick={() => onSend(s.id, mode)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Gửi
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
