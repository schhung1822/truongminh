"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InfoIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AI_ROLES, categoryInfo, ROLE_INFO, visibilitiesFor, type AiRole, type Visibility } from "@/lib/knowledge/roles";
import { deleteArticleAction, saveArticleAction } from "../actions";
import { CATEGORY_OPTIONS, MAX_BODY, MAX_TAG_LEN, MAX_TAGS, MAX_TITLE, ROLE_SHORT, STATUS_OPTIONS, VISIBILITY_OPTIONS, type ArticleStatus } from "../article-schema";
import { ConfirmDeleteButton } from "../confirm-button";
import { VisibilityBadge } from "../visibility-badge";

export type ArticleFormInitial = {
  id: string | null;
  title: string;
  category: string;
  body: string;
  visibility: Visibility;
  roles: AiRole[];
  /** tag cách nhau dấu phẩy */
  tags: string;
  status: ArticleStatus;
  priority: number;
  alwaysInclude: boolean;
  /** YYYY-MM-DD hoặc rỗng */
  effectiveFrom: string;
  /** "Tên người sửa, ngày giờ" để hiện cuối form (bài đã có) */
  lastEdit: string | null;
};

export function ArticleForm({ initial }: { initial: ArticleFormInitial }) {
  const router = useRouter();
  const isNew = initial.id === null;
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category);
  const [body, setBody] = useState(initial.body);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [roles, setRoles] = useState<AiRole[]>(initial.roles);
  const [tags, setTags] = useState(initial.tags);
  const [status, setStatus] = useState<ArticleStatus>(initial.status);
  const [priority, setPriority] = useState(String(initial.priority));
  const [alwaysInclude, setAlwaysInclude] = useState(initial.alwaysInclude);
  const [effectiveFrom, setEffectiveFrom] = useState(initial.effectiveFrom);
  const [saving, start] = useTransition();

  const info = categoryInfo(category);
  const adminOnly = visibility === "ADMIN_ONLY";
  const shownRoles = adminOnly ? [] : roles;
  const blindRoles = visibility === "INTERNAL" ? shownRoles.filter((r) => !visibilitiesFor(r).includes("INTERNAL")) : [];
  const tagCount = tags.split(",").filter((t) => t.trim()).length;

  function applyCategory(key: string) {
    const c = categoryInfo(key);
    setVisibility(c.visibility);
    setRoles(c.roles);
  }

  function changeCategory(key: string) {
    setCategory(key);
    // bài mới: tự điền mức hiển thị và vai theo gợi ý của danh mục; bài đã có thì hỏi qua nút bên dưới
    if (isNew) applyCategory(key);
  }

  function changeVisibility(v: Visibility) {
    setVisibility(v);
    if (v === "ADMIN_ONLY") setRoles([]);
  }

  function toggleRole(role: AiRole, on: boolean) {
    setRoles((p) => (on ? [...new Set([...p, role])] : p.filter((r) => r !== role)));
  }

  function save() {
    start(async () => {
      const r = await saveArticleAction(initial.id, {
        title,
        category,
        body,
        visibility,
        roles: shownRoles,
        tags,
        status,
        priority: priority.trim() === "" ? 0 : Number(priority),
        alwaysInclude,
        effectiveFrom: effectiveFrom || null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.ok ?? "Đã lưu.");
      if (isNew) router.push("/admin/business/articles");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "Thêm bài kiến thức" : "Sửa bài kiến thức"}</CardTitle>
          <CardDescription>
            Viết ngắn, đúng một chủ đề mỗi bài, có điều kiện rõ ràng (chất liệu, độ dày, số lượng). Không ghi điều chưa chắc chắn: AI sẽ nói lại y như vậy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Tiêu đề</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} className="h-10" autoFocus={isNew && !initial.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Danh mục</Label>
              <NativeSelect id="category" value={category} onChange={(e) => changeCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
              {info.hint && <p className="text-xs text-muted-foreground">{info.hint}</p>}
              {!isNew && (
                <button type="button" onClick={() => applyCategory(category)} className="w-fit text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Dùng mức hiển thị và vai gợi ý của danh mục này
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visibility">Mức hiển thị</Label>
              <NativeSelect id="visibility" value={visibility} onChange={(e) => changeVisibility(e.target.value as Visibility)}>
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <VisibilityBadge visibility={visibility} />
                {visibility === "PUBLIC" && "Được nói với khách; mọi vai AI có thể đọc."}
                {visibility === "INTERNAL" && "Chỉ nhân viên: chỉ trợ lý cho sale đọc."}
                {visibility === "ADMIN_ONLY" && "Chỉ quản trị viên xem."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body">Nội dung (Markdown)</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="min-h-72 font-mono text-sm" />
            <p className={`text-xs ${body.length > MAX_BODY ? "text-red-600" : "text-muted-foreground"}`}>
              {body.length.toLocaleString("vi-VN")} / {MAX_BODY.toLocaleString("vi-VN")} ký tự
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Các vai AI được dùng bài này</legend>
            {adminOnly && (
              <Alert>
                <InfoIcon />
                <AlertDescription>AI không bao giờ đọc bài này. Các vai AI đã được bỏ chọn.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {AI_ROLES.map((r) => (
                <label key={r} className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${adminOnly ? "opacity-50" : "cursor-pointer"}`}>
                  <Checkbox checked={shownRoles.includes(r)} onCheckedChange={(c) => toggleRole(r, c === true)} disabled={adminOnly} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{ROLE_SHORT[r]}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_INFO[r].audience === "CUSTOMER" ? "Chữ tới khách, chỉ đọc bài công khai" : "Chỉ nhân viên đọc, đọc cả bài nội bộ"}</span>
                  </span>
                </label>
              ))}
            </div>
            {blindRoles.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertDescription>
                  Vai &quot;{blindRoles.map((r) => ROLE_SHORT[r]).join(", ")}&quot; chỉ đọc công khai nên sẽ không thấy bài này. Muốn vai đó dùng được, hãy đổi mức hiển thị sang Công khai (chỉ khi nội dung được phép nói với khách).
                </AlertDescription>
              </Alert>
            )}
            {!adminOnly && shownRoles.length === 0 && status === "ACTIVE" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">Chưa chọn vai nào nên chưa AI nào đọc bài này.</p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tag (cách nhau dấu phẩy)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ví dụ: móc khóa, đồng, khắc laser" className="h-10" />
              <p className={`text-xs ${tagCount > MAX_TAGS ? "text-red-600" : "text-muted-foreground"}`}>
                {tagCount}/{MAX_TAGS} tag, mỗi tag tối đa {MAX_TAG_LEN} ký tự. Tag giúp AI chọn đúng bài khi hết ngân sách.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Trạng thái</Label>
              <NativeSelect id="status" value={status} onChange={(e) => setStatus(e.target.value as ArticleStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">Chỉ bài Đang dùng mới được AI và nhân viên sale xem.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Ưu tiên</Label>
              <Input id="priority" type="number" inputMode="numeric" step={1} min={-1000} max={1000} value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10" />
              <p className="text-xs text-muted-foreground">Số lớn hơn được giữ lại trước khi hết ngân sách. Mặc định 0.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effectiveFrom">Ngày hiệu lực (tùy chọn)</Label>
              <Input id="effectiveFrom" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="h-10" />
              <p className="text-xs text-muted-foreground">Trước ngày này AI chưa đọc bài. Bỏ trống = có hiệu lực ngay.</p>
            </div>
          </div>

          <label className="flex items-start gap-3">
            <Switch checked={alwaysInclude} onCheckedChange={setAlwaysInclude} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Luôn kèm</span>
              <span className="text-xs text-muted-foreground">Luôn đưa bài này vào prompt (nếu còn chỗ trong ngân sách của vai). Chỉ nên bật cho bài ngắn và thật quan trọng.</span>
            </span>
          </label>

          {initial.lastEdit && <p className="text-xs text-muted-foreground">Sửa lần cuối: {initial.lastEdit}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="h-10 px-5" onClick={save} disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              {isNew ? "Tạo bài" : "Lưu thay đổi"}
            </Button>
            <Link href="/admin/business/articles" className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Về danh sách
            </Link>
            {initial.id && (
              <div className="ml-auto">
                <ConfirmDeleteButton
                  action={deleteArticleAction.bind(null, initial.id)}
                  title="Xóa bài kiến thức này?"
                  description={`Bài "${initial.title}" sẽ bị xóa hẳn và AI không còn đọc được. Muốn giữ lại thì chuyển sang trạng thái Ngừng thay vì xóa.`}
                  onDone={() => router.push("/admin/business/articles")}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
