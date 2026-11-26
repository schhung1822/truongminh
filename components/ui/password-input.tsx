"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/** Ô nhập mật khẩu có nút con mắt để hiện / ẩn nội dung đang gõ. Nhận mọi thuộc tính của <input> trừ `type`. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  const label = show ? "Ẩn mật khẩu" : "Hiện mật khẩu";
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("h-10 pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={label}
        aria-pressed={show}
        title={label}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}
