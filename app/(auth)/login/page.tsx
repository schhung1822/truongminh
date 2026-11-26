import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/dal";
// Nhập ảnh trực tiếp để Next phục vụ từ /_next/static (không cần đăng nhập). Đường dẫn /images/... bị proxy.ts chặn khi
// chưa có cookie đăng nhập nên không dùng được ở trang này.
import logo from "@/public/images/logo_truongminh.png";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };
export const instant = false;

// Đã đăng nhập mà vào /login thì chuyển về trang chính. Đọc cookie nên phải nằm trong Suspense.
async function RedirectIfSignedIn() {
  if (await getSessionUser()) redirect("/");
  return null;
}

const FEATURES: { title: string; desc: string }[] = [
  { title: "Ảnh mẫu trên chất liệu của xưởng", desc: "AI đặt logo của khách lên từng chất liệu, xem trước khi làm." },
  { title: "Thiết kế theo mẫu Pinterest", desc: "Lấy board của xưởng làm phong cách tham khảo." },
  { title: "Báo giá sản xuất", desc: "Tính giá theo tấm vật liệu, máy và thời gian chạy." },
  { title: "Gửi khách qua Zalo", desc: "Ảnh vào đúng nhóm khách, nhân viên tag bot là có." },
  { title: "Lead từ Facebook", desc: "Gom comment hỏi mua trên các bài đang theo dõi." },
];

/** Logo chữ trắng nền trong suốt: chỉ đặt trên nền tối. */
function Logo({ className }: { className?: string }) {
  return <img src={logo.src} width={logo.width} height={logo.height} alt="Trường Minh" className={className} />;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>

      {/* Nửa trái (màn hình rộng): giới thiệu hệ thống trên nền tối */}
      <section aria-label="Giới thiệu hệ thống" className="relative hidden overflow-hidden bg-neutral-950 text-white lg:flex lg:items-center lg:justify-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_65%)]"
        />
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-[#d21628]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-[#d21628]/10 blur-3xl" />

        <div className="relative flex w-full max-w-lg flex-col gap-6 px-10 py-16">
          <Logo className="-ml-2 h-16 w-auto self-start" />
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-white/70 uppercase">Hệ thống nội bộ · Xưởng Trường Minh</span>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              Ảnh mẫu in logo, <span className="text-white/60">dựng bằng AI</span>
            </h1>
            <p className="text-base leading-relaxed text-white/60">Tải logo của khách lên, AI chọn chất liệu hợp và dựng ảnh mẫu để gửi khách ngay, kèm báo giá sản xuất.</p>
          </div>
          <ul className="mt-2 flex flex-col gap-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[#d21628] shadow-[0_0_18px_rgba(210,22,40,0.45)]">
                  <CheckIcon className="size-4" strokeWidth={3} />
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{f.title}</span>
                  <span className="text-sm text-white/55">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-white/40">Xưởng in logo Trường Minh</p>
        </div>
      </section>

      {/* Màn hình hẹp: chỉ một dải logo nền tối ở trên cùng */}
      <div className="flex items-center justify-center bg-neutral-950 px-6 py-4 lg:hidden">
        <Logo className="h-12 w-auto" />
      </div>

      <section aria-label="Đăng nhập" className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
        <Card className="w-full max-w-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Đăng nhập</CardTitle>
            <CardDescription>Dùng tài khoản do quản trị viên cấp.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
