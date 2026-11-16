"use client";

import Link from "next/link";
import { CheckIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon, HomeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lưới các ô thư mục / tệp, dùng chung cho các màn hình duyệt dạng thư mục. */
export function TileGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6", className)}>
      {children}
    </ul>
  );
}

/** Một thư mục: biểu tượng thư mục lớn, tên, dòng phụ và số lượng bên trong. */
export function FolderTile({
  name,
  subtitle,
  count,
  countLabel,
  footer,
  tone = "default",
  onClick,
  href,
}: {
  name: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  /** dòng chú thích dưới cùng thay cho "số lượng", ví dụ "3/3 ảnh xong" */
  footer?: string;
  tone?: "default" | "busy" | "error";
  onClick?: () => void;
  /** nếu có, ô là một liên kết (mở trang) thay vì nút */
  href?: string;
}) {
  const className =
    "group relative flex h-full min-h-36 w-full flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/60 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  const content = (
    <>
      <FolderIcon
        className="size-14 shrink-0 fill-amber-300 text-amber-500 transition-transform group-hover:scale-105"
        strokeWidth={1.5}
      />
      <span className="line-clamp-2 w-full text-sm leading-tight font-medium wrap-break-word">{name}</span>
      {subtitle && <span className="line-clamp-2 w-full text-xs text-muted-foreground">{subtitle}</span>}
      {footer !== undefined ? (
        <span
          className={cn(
            "mt-auto rounded-full px-2 py-0.5 text-[11px]",
            tone === "error" && "bg-red-100 text-red-700",
            tone === "busy" && "bg-amber-100 text-amber-800",
            tone === "default" && "bg-muted text-muted-foreground",
          )}
        >
          {footer}
        </span>
      ) : (
        count !== undefined && (
          <span className="mt-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {count} {countLabel}
          </span>
        )
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(className, "no-underline")}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </li>
  );
}

/** Ô "tạo mới" viền đứt, đặt cuối lưới. */
export function NewTile({
  label,
  icon,
  onClick,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  /** nếu có, dùng làm nội dung thay cho nút (ví dụ ô chọn file) */
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed text-muted-foreground group-hover:border-primary group-hover:text-primary [&_svg]:size-6">
        {icon}
      </span>
      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
    </>
  );
  const cls =
    "group flex h-full min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center transition-colors hover:border-primary hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50";
  return (
    <li>
      {children ? (
        <label className={cls}>
          {inner}
          {children}
        </label>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}

/** Thanh đường dẫn kiểu trình quản lý tệp: Khách hàng / Tên khách / Tên thương hiệu. */
export function PathBar({
  crumbs,
}: {
  crumbs: { label: string; onClick?: () => void }[];
}) {
  return (
    <nav aria-label="Đường dẫn thư mục" className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1.5 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
            <button
              type="button"
              onClick={c.onClick}
              disabled={last || !c.onClick}
              aria-current={last ? "page" : undefined}
              className={cn(
                "flex max-w-48 items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
                last ? "font-semibold" : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              {i === 0 ? (
                <HomeIcon className="size-4 shrink-0" />
              ) : last ? (
                <FolderOpenIcon className="size-4 shrink-0 fill-amber-300 text-amber-500" />
              ) : (
                <FolderIcon className="size-4 shrink-0 fill-amber-300 text-amber-500" />
              )}
              <span className="truncate">{c.label}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

/** Một tệp ảnh (logo) trong thư mục, có nền caro để thấy nền trong suốt. */
export function ImageTile({
  src,
  caption,
  selected,
  onClick,
}: {
  src: string;
  caption: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "relative flex h-full w-full flex-col gap-1.5 rounded-xl border bg-card p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          selected && "border-primary ring-2 ring-primary",
        )}
      >
        <span
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border"
          style={{
            backgroundColor: "#fff",
            backgroundImage:
              "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          }}
        >
          <img src={src} alt="Logo" className="max-h-full max-w-full object-contain" />
        </span>
        <span className="truncate px-0.5 text-xs text-muted-foreground">{caption}</span>
        {selected && (
          <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <CheckIcon className="size-4" />
          </span>
        )}
      </button>
    </li>
  );
}
