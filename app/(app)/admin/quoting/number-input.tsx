"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupDigits, numToText } from "./format";
import { parseGrouped, parsePlain } from "./parse";

/** Chuẩn hóa chữ đã gõ khi rời ô: "1500000" → "1.500.000" (tiền), "59.5" → "59,5" (số thường). Gõ sai thì giữ nguyên để người dùng sửa. */
export function normalizeNumberText(v: string, kind: "plain" | "money"): string {
  const p = kind === "money" ? parseGrouped(v) : parsePlain(v);
  if (typeof p !== "number") return v;
  return kind === "money" ? groupDigits(p, 2) : numToText(p);
}

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (v: string) => void;
  kind?: "plain" | "money";
  /** đơn vị hiện cuối ô (không nằm trong giá trị) */
  unit?: string;
};

/** Ô nhập số kiểu Việt: gõ dấu phẩy thập phân, tiền gõ "1.500.000". Ô trống = chưa có dữ liệu. */
export function NumberInput({ value, onChange, kind = "plain", unit, className, onBlur, ...rest }: Props) {
  const input = (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const n = normalizeNumberText(e.target.value, kind);
        if (n !== e.target.value) onChange(n);
        onBlur?.(e);
      }}
      className={cn(unit ? "pr-16" : "", className)}
    />
  );
  if (!unit) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}
