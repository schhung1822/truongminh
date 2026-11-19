"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { slugifyValue, type OptionType } from "@/lib/materials/option-types";
import { createOptionAction, deleteOptionAction, updateOptionAction, type OptionResult } from "./actions";

type Item = { id: string; value: string; label: string; sortOrder: number; isActive: boolean; used: number };
type Group = { type: OptionType; title: string; hint: string; items: Item[] };

export function OptionsBoard({ groups }: { groups: Group[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((g) => (
        <GroupCard key={g.type} group={g} />
      ))}
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<OptionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      if (r.ok) toast.success(r.ok);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

function GroupCard({ group }: { group: Group }) {
  const { pending, run } = useRun();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const preview = slugifyValue(value.trim() || label.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {group.title} <span className="text-sm font-normal text-muted-foreground">({group.items.length})</span>
        </CardTitle>
        <CardDescription>{group.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y rounded-lg border">
          {group.items.length === 0 && <li className="p-3 text-sm text-muted-foreground">Chưa có giá trị nào.</li>}
          {group.items.map((it) => (
            <OptionRow key={`${it.value}-${it.label}-${it.sortOrder}-${it.isActive}`} item={it} />
          ))}
        </ul>

        <form
          className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createOptionAction(group.type, label, value), () => {
              setLabel("");
              setValue("");
            });
          }}
        >
          <p className="text-sm font-medium">Thêm giá trị mới</p>
          <div className="flex flex-wrap gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhãn tiếng Việt, ví dụ Kim loại" maxLength={100} className="h-9 min-w-40 flex-1" aria-label="Nhãn" />
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Mã không dấu (tự sinh nếu để trống)" maxLength={60} className="h-9 min-w-40 flex-1" aria-label="Mã không dấu" />
            <Button type="submit" className="h-9" disabled={pending || !label.trim()}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Thêm
            </Button>
          </div>
          {label.trim() && <p className="text-xs text-muted-foreground">Mã sẽ là: <code>{preview || "(không hợp lệ)"}</code>. Mã không đổi được sau khi tạo.</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function OptionRow({ item }: { item: Item }) {
  const { pending, run } = useRun();
  const [label, setLabel] = useState(item.label);
  const [sort, setSort] = useState(String(item.sortOrder));
  const [active, setActive] = useState(item.isActive);
  const dirty = label !== item.label || sort !== String(item.sortOrder) || active !== item.isActive;

  return (
    <li className="flex flex-wrap items-center gap-2 p-2">
      <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} className="h-9 min-w-40 flex-1" aria-label={`Nhãn của ${item.value}`} />
      <code className="text-xs text-muted-foreground" title="Mã không dấu, không đổi được">
        {item.value}
      </code>
      <Input value={sort} onChange={(e) => setSort(e.target.value)} inputMode="numeric" className="h-9 w-16" aria-label={`Thứ tự của ${item.value}`} title="Thứ tự hiển thị (số nhỏ lên trước)" />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" /> Bật
      </label>
      <Badge variant="outline" title="Số chất liệu đang dùng giá trị này">
        {item.used} dùng
      </Badge>
      <Button
        type="button"
        size="sm"
        className="h-9"
        disabled={pending || !dirty}
        onClick={() => run(() => updateOptionAction(item.id, { label, sortOrder: Number(sort), isActive: active }))}
      >
        {pending && <Loader2Icon className="animate-spin" />} Lưu
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending || item.used > 0}
        title={item.used > 0 ? "Đang được dùng, chỉ tắt được" : "Xóa giá trị này"}
        onClick={() => confirm(`Xóa "${item.label}"?`) && run(() => deleteOptionAction(item.id))}
        aria-label={`Xóa ${item.label}`}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}

