"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  FilmIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addPostAction,
  deleteAssetAction,
  deletePostAction,
  generateAllPlansAction,
  generatePlanAction,
  listMediaPicksAction,
  publishPostAction,
  runDueAction,
  saveGroupCareAction,
  skipPostAction,
  updatePostAction,
  type MediaPick,
} from "./actions";

export type PostVM = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  kind: "TEXT" | "IMAGE" | "VIDEO";
  text: string;
  status: "PLANNED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  reason: string | null;
  error: string | null;
  aiGenerated: boolean;
  edited: boolean;
  sentAt: string | null;
  media: { value: string; kind: "IMAGE" | "VIDEO"; label: string; url: string | null } | null;
};
export type GroupVM = { id: string; name: string; insight: string; careEnabled: boolean; postsPerDay: number; posts: PostVM[] };
export type AssetVM = { id: string; kind: "IMAGE" | "VIDEO"; title: string; description: string | null; url: string | null; sizeMb: number };

type R = { error?: string; ok?: string };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function act(fn: () => Promise<R>, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      if (!r.error) after?.();
      router.refresh();
    });
  }
  return { act, pending };
}

const dayLabel = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
};

export function CareBoard({ groups, assets, autoRun, timeZone }: { groups: GroupVM[]; assets: AssetVM[]; autoRun: boolean; timeZone: string }) {
  const { act, pending } = useAct();
  const [includeToday, setIncludeToday] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => act(() => generateAllPlansAction(includeToday))} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Lên kịch bản cho các nhóm đang bật
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeToday} onChange={(e) => setIncludeToday(e.target.checked)} className="size-4" />
            Gồm cả hôm nay
          </label>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Đăng ngay tất cả các bài đã tới giờ vào các nhóm Zalo? Không thu hồi được.")) act(runDueAction);
            }}
          >
            <PlayIcon /> Đăng các bài đến giờ
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Múi giờ {timeZone}. {autoRun ? "Chạy tự động đang bật (khi máy chủ gọi định kỳ)." : "Chạy tự động đang tắt: bạn bấm đăng bằng tay."} Lên lại kịch bản chỉ thay các bài chưa đăng và chưa bị bạn sửa.
          </p>
        </CardContent>
      </Card>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">Chưa có nhóm Zalo nào đang bật. Thêm nhóm ở Quản trị &gt; Zalo.</p>}
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} includeToday={includeToday} />
      ))}

      <AssetLibrary assets={assets} />
    </div>
  );
}

function GroupCard({ group, includeToday }: { group: GroupVM; includeToday: boolean }) {
  const { act, pending } = useAct();
  const [insight, setInsight] = useState(group.insight);
  const [enabled, setEnabled] = useState(group.careEnabled);
  const [perDay, setPerDay] = useState(group.postsPerDay);
  const dirty = insight !== group.insight || perDay !== group.postsPerDay;

  const byDate = new Map<string, PostVM[]>();
  for (const p of group.posts) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {group.name}
          <label className="flex items-center gap-2 text-sm font-normal">
            <Switch
              checked={enabled}
              onCheckedChange={(c) => {
                setEnabled(c);
                act(() => saveGroupCareAction(group.id, { insight, careEnabled: c, postsPerDay: perDay }));
              }}
            />
            Chăm sóc nhóm này
          </label>
        </CardTitle>
        <CardDescription>Mô tả càng rõ (khách là ai, làm nghề gì, thích gì, hay hỏi gì), kịch bản càng sát.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Textarea
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Insight nhóm. Ví dụ: Nhóm chủ quán cafe và nhà hàng ở Hà Nội, hay làm bảng hiệu, ly sứ, thẻ tên nhân viên. Quan tâm giá tốt và làm nhanh."
            aria-label={`Insight nhóm ${group.name}`}
          />
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">Số lượt đăng mỗi ngày</label>
            <NativeSelect value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="h-9">
              <option value={2}>2 lượt</option>
              <option value={3}>3 lượt</option>
            </NativeSelect>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => act(() => saveGroupCareAction(group.id, { insight, careEnabled: enabled, postsPerDay: perDay }))}
            >
              <SaveIcon /> Lưu mô tả
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending || !enabled} onClick={() => act(() => generatePlanAction(group.id, includeToday))}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Lên kịch bản nhóm này
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(() => addPostAction(group.id))}>
            <PlusIcon /> Thêm bài tay
          </Button>
          {!enabled && <span className="self-center text-xs text-muted-foreground">Bật &quot;Chăm sóc nhóm này&quot; để AI lên kịch bản.</span>}
        </div>

        {byDate.size === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có kịch bản. Bấm &quot;Lên kịch bản nhóm này&quot;.</p>
        ) : (
          [...byDate.entries()].map(([date, posts]) => (
            <section key={date} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold capitalize text-muted-foreground">
                <CalendarClockIcon className="size-4" /> {dayLabel(date)}
              </h3>
              {posts.map((p) => (
                <PostCard key={p.id + p.date + p.time + p.text.length + (p.media?.value ?? "")} post={p} groupName={group.name} />
              ))}
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const KIND_LABEL = { TEXT: "Chỉ chữ", IMAGE: "Kèm ảnh", VIDEO: "Kèm video" } as const;

function PostCard({ post, groupName }: { post: PostVM; groupName: string }) {
  const { act, pending } = useAct();
  const [text, setText] = useState(post.text);
  const [date, setDate] = useState(post.date);
  const [time, setTime] = useState(post.time);
  const [media, setMedia] = useState(post.media);
  const [pickerOpen, setPickerOpen] = useState(false);
  const locked = post.status === "SENT" || post.status === "SENDING";
  const dirty = text !== post.text || date !== post.date || time !== post.time || (media?.value ?? null) !== (post.media?.value ?? null);

  const save = () => act(() => updatePostAction(post.id, { text, date, time, media: media?.value ?? null }));
  const statusBadge =
    post.status === "SENT" ? <Badge className="gap-1"><CheckCircle2Icon className="size-3" /> Đã đăng {post.sentAt}</Badge>
    : post.status === "FAILED" ? <Badge variant="destructive">Lỗi</Badge>
    : post.status === "SKIPPED" ? <Badge variant="secondary">Bỏ qua</Badge>
    : post.status === "SENDING" ? <Badge variant="secondary">Đang đăng...</Badge>
    : <Badge variant="outline">Chờ đăng</Badge>;

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-3", (post.status === "SENT" || post.status === "SKIPPED") && "bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={locked} className="h-8 w-36" aria-label="Ngày đăng" />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={locked} className="h-8 w-32" aria-label="Giờ đăng" />
        <Badge variant="secondary">{media ? KIND_LABEL[media.kind] : KIND_LABEL.TEXT}</Badge>
        {statusBadge}
        {post.edited && <span className="text-[11px] text-muted-foreground">đã chỉnh tay</span>}
      </div>

      {post.reason && <p className="text-xs text-muted-foreground">Vì sao: {post.reason}</p>}
      {post.error && <p className="text-xs text-red-600">{post.error}</p>}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} disabled={locked} aria-label="Nội dung bài đăng" />
        <div className="flex w-full flex-col gap-1.5 sm:w-36">
          <button
            type="button"
            disabled={locked}
            onClick={() => setPickerOpen(true)}
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground hover:bg-muted disabled:cursor-default"
            aria-label="Chọn ảnh hoặc video đính kèm"
          >
            {media?.url ? (
              <img src={media.url} alt="" className="size-full object-cover" />
            ) : media ? (
              <span className="flex flex-col items-center gap-1 p-2 text-center"><FilmIcon className="size-6" /> {media.label}</span>
            ) : (
              <span className="flex flex-col items-center gap-1"><ImageIcon className="size-6" /> Chỉ chữ</span>
            )}
          </button>
          {media && !locked && (
            <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setMedia(null)}>
              Bỏ đính kèm
            </button>
          )}
        </div>
      </div>

      {post.status !== "SENT" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending || post.status === "SENDING"} onClick={() => {
            if (dirty) return void toast.error("Bạn vừa sửa bài, hãy bấm Lưu trước khi đăng.");
            if (window.confirm(`Đăng bài này vào nhóm "${groupName}" ngay bây giờ? Không thu hồi được.`)) act(() => publishPostAction(post.id));
          }}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Đăng ngay
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending || !dirty} onClick={save}>
            <SaveIcon /> Lưu
          </Button>
          {post.status === "SKIPPED" ? (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => act(() => skipPostAction(post.id, false))}>
              <RotateCcwIcon /> Khôi phục
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => act(() => skipPostAction(post.id, true))}>
              <XIcon /> Bỏ qua
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="text-red-600" disabled={pending} onClick={() => act(() => deletePostAction(post.id))}>
            <Trash2Icon /> Xóa
          </Button>
        </div>
      )}

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(m) => { setMedia(m); setPickerOpen(false); }} />
    </div>
  );
}

function MediaPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (m: PostVM["media"]) => void }) {
  const [picks, setPicks] = useState<MediaPick[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listMediaPicksAction().then((r) => alive && setPicks(r.picks));
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn ảnh hoặc video đính kèm</DialogTitle>
          <DialogDescription>Gồm tư liệu trong thư viện và ảnh mẫu đã tạo 30 ngày gần đây.</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onPick(null)}>
          Chỉ đăng chữ (không đính kèm)
        </Button>
        <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {picks === null && <p className="col-span-full p-4 text-center text-sm text-muted-foreground">Đang tải...</p>}
          {picks?.length === 0 && <p className="col-span-full p-4 text-center text-sm text-muted-foreground">Chưa có tư liệu. Tải lên ở mục Thư viện bên dưới.</p>}
          {picks?.map((p) => (
            <button key={p.value} type="button" onClick={() => onPick({ value: p.value, kind: p.kind, label: p.label, url: p.url })} className="flex flex-col gap-1 rounded-lg border p-1.5 text-left hover:border-primary">
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted">
                {p.url ? (
                  <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <FilmIcon className="size-8 text-muted-foreground" />
                )}
              </span>
              <span className="line-clamp-2 text-[11px] leading-tight">{p.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetLibrary({ assets }: { assets: AssetVM[] }) {
  const { act, pending } = useAct();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return void toast.error("Vui lòng chọn một file ảnh hoặc video.");
    const isVideo = file.type.startsWith("video/") || /.(mp4|mov|m4v)$/i.test(file.name);
    const sizeMb = file.size / 1024 / 1024;
    if (isVideo && sizeMb > 50) return void toast.error(`Video ${sizeMb.toFixed(1)}MB vượt giới hạn 50MB của Zalo. Hãy nén video nhỏ lại rồi tải lên.`);
    if (!isVideo && sizeMb > 10) return void toast.error(`Ảnh ${sizeMb.toFixed(1)}MB quá lớn (tối đa 10MB).`);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title);
      fd.set("description", description);
      const res = await fetch("/api/zalo/assets", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return void toast.error(body.error ?? `Không tải lên được (mã lỗi ${res.status}). Thử file nhỏ hơn.`);
      toast.success("Đã thêm vào thư viện.");
      setTitle("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      toast.error("Mất kết nối khi tải lên. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thư viện ảnh và video</CardTitle>
        <CardDescription>
          Tải lên mẫu mã mới, video giới thiệu để AI chọn đính kèm. Mô tả ngắn giúp AI biết dùng khi nào. Ảnh đã tạo trong hệ thống 30 ngày gần đây tự có sẵn để chọn. Video gửi dạng file (mp4, mov, tối đa 50MB).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mp4,.mov,.m4v" className="h-10 pt-1.5" aria-label="File ảnh hoặc video" />
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên (ví dụ: Ly sứ in logo mẫu mới)" maxLength={150} className="h-10" aria-label="Tên tư liệu" />
          <Button type="button" className="h-10" onClick={upload} disabled={uploading}>
            {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Tải lên
          </Button>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả cho AI (không bắt buộc): dịp nào, hợp với nhóm nào..." maxLength={1000} className="h-10 sm:col-span-3" aria-label="Mô tả tư liệu" />
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Thư viện đang trống.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {assets.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5 rounded-lg border p-2">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted">
                  {a.url ? (
                    <img src={a.url} alt={a.title} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <FilmIcon className="size-8 text-muted-foreground" />
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-medium">{a.title}</span>
                <span className="text-[11px] text-muted-foreground">{a.kind === "VIDEO" ? "Video" : "Ảnh"} · {a.sizeMb} MB</span>
                <Button type="button" variant="ghost" size="sm" className="text-red-600" disabled={pending} onClick={() => { if (window.confirm(`Xóa "${a.title}" khỏi thư viện?`)) act(() => deleteAssetAction(a.id)); }}>
                  <Trash2Icon /> Xóa
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
