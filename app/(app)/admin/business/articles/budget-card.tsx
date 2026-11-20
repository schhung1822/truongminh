"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setBudgetAction } from "../actions";

export type BudgetItem = {
  role: string;
  label: string;
  desc: string;
  budget: number;
  defaultBudget: number;
  /** số ký tự thật sự đưa vào prompt (hồ sơ + bài) */
  used: number;
  usedCount: number;
  droppedCount: number;
};

function BudgetRow({ item }: { item: BudgetItem }) {
  const [value, setValue] = useState(String(item.budget));
  const [saving, start] = useTransition();
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 500 && n <= 60_000;
  const pct = Math.min(100, Math.round((item.used / item.budget) * 100));
  const full = item.droppedCount > 0 || pct >= 90;

  function save() {
    start(async () => {
      const r = await setBudgetAction(item.role, n);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã lưu.");
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground">{item.desc}</p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={item.budget}
        aria-valuenow={item.used}
        aria-label={`Đang dùng ${item.used} trên ${item.budget} ký tự`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Đang dùng <b className="tabular-nums text-foreground">{item.used.toLocaleString("vi-VN")}</b> / {item.budget.toLocaleString("vi-VN")} ký tự ({item.usedCount} bài đưa vào)
        {item.droppedCount > 0 && <b className="text-amber-700 dark:text-amber-400"> · {item.droppedCount} bài bị bỏ vì quá ngân sách</b>}
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={500}
          max={60000}
          step={500}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Ngân sách ký tự: ${item.label}`}
          aria-invalid={!valid}
          className="h-9 w-28"
        />
        <Button type="button" size="sm" className="h-9" onClick={save} disabled={saving || !valid || n === item.budget}>
          {saving && <Loader2Icon className="animate-spin" />}
          Lưu
        </Button>
        {n !== item.defaultBudget && (
          <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setValue(String(item.defaultBudget))}>
            Mặc định {item.defaultBudget.toLocaleString("vi-VN")}
          </button>
        )}
      </div>
      {!valid && <p className="text-xs text-red-600">Nhập số nguyên từ 500 đến 60.000.</p>}
    </li>
  );
}

export function BudgetCard({ items }: { items: BudgetItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ngân sách ký tự cho từng vai AI</CardTitle>
        <CardDescription>
          Mỗi vai chỉ nhận một lượng kiến thức giới hạn (hồ sơ + bài đủ điều kiện). Khi tổng vượt ngân sách, hệ thống bỏ cả bài (không cắt dở) theo thứ tự: bài &quot;luôn kèm&quot;, liên quan tới câu hỏi, ưu tiên cao, mới sửa. Con số
          &quot;đang dùng&quot; tính với kiến thức hiện có, chưa kể câu hỏi cụ thể và danh sách chất liệu. Ngân sách lớn thì tốn nhiều token mỗi lượt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 lg:grid-cols-3">
          {items.map((i) => (
            <BudgetRow key={i.role} item={i} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
