"use client";

import { useState, useTransition } from "react";
import { LockIcon, Loader2Icon, PlusIcon, PowerIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createStyleAction, deleteStyleAction, setStyleActiveAction, updateStyleAction } from "./actions";

export type StyleItem = { id: string; name: string; description: string; isActive: boolean; sortOrder: number; usedCount: number };

export function StylesBoard({ styles }: { styles: StyleItem[] }) {
  return (
    <div className="flex flex-col gap-6">
      <NewStyleForm />
      {styles.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có kiểu thiết kế nào. Hãy thêm ít nhất một kiểu để sale dùng được bước thiết kế.
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {styles.map((s) => (
            <li key={s.id}>
              <StyleCard style={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewStyleForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const r = await createStyleAction({ name, description });
      if (r.error) return setError(r.error);
      toast.success(r.ok);
      setName("");
      setDescription("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thêm kiểu thiết kế</CardTitle>
        <CardDescription>
          Ở bước 2, mỗi ảnh thiết kế dùng một kiểu trong danh sách. Phần mô tả được gửi cho AI nên viết bằng tiếng Anh sẽ tốt hơn.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="new-style-name">Tên kiểu (sale nhìn thấy)</Label>
          <Input id="new-style-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-style-desc">Mô tả cho AI</Label>
          <Textarea
            id="new-style-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="Ví dụ: minimalist modern look, clean white studio background, soft natural shadow, centered product, lots of negative space"
          />
        </div>
        <Button type="button" className="h-10 self-start px-5" onClick={add} disabled={pending || !name.trim() || !description.trim()}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Thêm kiểu
        </Button>
      </CardContent>
    </Card>
  );
}

function StyleCard({ style }: { style: StyleItem }) {
  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description);
  const [sortOrder, setSortOrder] = useState(style.sortOrder);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name !== style.name || description !== style.description || sortOrder !== style.sortOrder;

  function run(fn: () => Promise<{ error?: string; ok?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success(r.ok);
    });
  }

  return (
    <Card className={cn(!style.isActive && "opacity-80")}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {style.isActive ? <Badge>Đang bật</Badge> : <Badge variant="secondary">Đã tắt</Badge>}
          {style.usedCount > 0 && <Badge variant="outline">Đã dùng cho {style.usedCount} ảnh</Badge>}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`n-${style.id}`}>Tên kiểu</Label>
            <Input id={`n-${style.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`o-${style.id}`}>Thứ tự</Label>
            <Input
              id={`o-${style.id}`}
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="h-10"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`d-${style.id}`}>Mô tả cho AI</Label>
          <Textarea id={`d-${style.id}`} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1500} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={pending || !dirty}
            onClick={() => run(() => updateStyleAction(style.id, { name, description, sortOrder }))}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Lưu
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={pending}
            onClick={() => run(() => setStyleActiveAction(style.id, !style.isActive))}
          >
            <PowerIcon /> {style.isActive ? "Tắt" : "Bật"}
          </Button>
          {style.usedCount > 0 ? (
            <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground" title="Đã dùng để tạo ảnh nên không xóa được, chỉ tắt được">
              <LockIcon className="size-3.5" /> Không xóa được
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Xóa kiểu "${style.name}"? Không thể hoàn tác.`)) run(() => deleteStyleAction(style.id));
              }}
            >
              <Trash2Icon /> Xóa
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
