import type { Metadata } from "next";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { getFbReplyConfig } from "@/lib/fb/reply-config";
import { DEFAULT_TEMPLATES, TEMPLATE_KINDS } from "@/lib/fb/reply-text";
import { PageActions, PageForm, ReplyConfigForm, SeedTemplatesButton, TemplateForm, TemplateItem } from "./templates-client";

export const metadata: Metadata = { title: "Mẫu câu & Fanpage" };

export default async function FbTemplatesPage() {
  const user = await requireFbManager();
  const isAdmin = user.role === "ADMIN";
  const [pages, templates, config, joinedGroups, groupCount] = await Promise.all([
    db.fbPage.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    db.fbReplyTemplate.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    getFbReplyConfig(),
    db.fbGroup.count({ where: { pageJoined: true } }),
    db.fbGroup.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mẫu câu &amp; Fanpage</h1>
        <p className="max-w-3xl text-muted-foreground">
          Fanpage đứng ra trả lời, mẫu câu soạn sẵn, và cách hệ thống soạn câu mời khi xưởng sản xuất comment vào bài tìm nhà sản xuất. Câu soạn ra luôn nằm ở Hàng chờ trả lời để người duyệt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fanpage trả lời</CardTitle>
          <CardDescription>
            Tên phải đúng từng chữ như hiện trên Facebook: extension tìm fanpage trong danh sách chuyển danh tính bình luận theo tên này. Nick quét bài phải là người quản lý fanpage, và fanpage phải đã tham gia nhóm (đánh dấu ở trang Nhóm; hiện {joinedGroups}/{groupCount} nhóm đã đánh dấu).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pages.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Chưa có fanpage nào. Khi chưa có fanpage, câu mời đứng tên nick hoặc không được soạn, tùy cấu hình bên dưới.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pages.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      {p.isDefault && <Badge>Mặc định</Badge>}
                      {p.status === "PAUSED" && <Badge variant="secondary">Tạm dừng</Badge>}
                    </p>
                    <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4">
                      {p.url.replace("https://www.facebook.com/", "facebook.com/")} <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                  <PageActions page={{ id: p.id, name: p.name, isDefault: p.isDefault, status: p.status }} canDelete={isAdmin} />
                </li>
              ))}
            </ul>
          )}
          <PageForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình soạn câu trả lời</CardTitle>
          <CardDescription>{isAdmin ? "Áp dụng cho comment quét được từ lúc lưu." : "Chỉ quản trị viên sửa được phần này."}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReplyConfigForm values={config} canEdit={isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mẫu câu</CardTitle>
          <CardDescription>
            Biến dùng được: <code className="rounded bg-muted px-1">{"{ten}"}</code> tên người comment, <code className="rounded bg-muted px-1">{"{ten_page}"}</code> tên fanpage,{" "}
            <code className="rounded bg-muted px-1">{"{link_page}"}</code> link fanpage, <code className="rounded bg-muted px-1">{"{san_pham}"}</code> sản phẩm của bài,{" "}
            <code className="rounded bg-muted px-1">{"{vat_lieu_goi_y}"}</code> một hoặc hai vật liệu gợi ý của bài. Có từ hai mẫu trở lên thì hai comment liền nhau trong cùng bài không dùng chung một mẫu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {TEMPLATE_KINDS.map((k) => {
            const key = `${k.purpose}:${k.category}`;
            const list = templates.filter((t) => t.purpose === k.purpose && t.category === k.category);
            const builtin = DEFAULT_TEMPLATES.filter((t) => t.purpose === k.purpose && t.category === k.category);
            return (
              <section key={key} className="flex flex-col gap-2" aria-label={k.label}>
                <h3 className="font-medium">
                  {k.label} <span className="text-sm font-normal text-muted-foreground">({list.filter((t) => t.active).length} đang bật)</span>
                </h3>
                {list.length === 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    <p>Chưa có mẫu riêng: hệ thống đang dùng {builtin.length} mẫu có sẵn dưới đây. Nạp vào để sửa cho đúng giọng của xưởng.</p>
                    <ul className="list-disc pl-5">
                      {builtin.map((t, i) => (
                        <li key={i}>{t.text}</li>
                      ))}
                    </ul>
                    <SeedTemplatesButton kind={key} />
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {list.map((t) => (
                      <TemplateItem key={t.id} template={{ id: t.id, text: t.text, active: t.active }} />
                    ))}
                  </ul>
                )}
                {list.length > 0 && list.every((t) => !t.active) && <p className="text-xs text-amber-700 dark:text-amber-300">Mọi mẫu của loại này đang tắt: hệ thống dùng lại mẫu có sẵn.</p>}
              </section>
            );
          })}
          <div className="border-t pt-4">
            <h3 className="mb-2 font-medium">Thêm mẫu câu</h3>
            <TemplateForm kinds={TEMPLATE_KINDS.map((k) => ({ value: `${k.purpose}:${k.category}`, label: k.label }))} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
