"use client";

import { useState, useTransition } from "react";
import { CheckIcon, EyeIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { finishRuleOf } from "@/lib/prompts/finish";
import { buildMaterialsList, renderDesignPrompt, renderPrompt, validateTemplate } from "@/lib/prompts/render";
import { activatePromptAction, savePromptAction } from "./actions";

/** Dữ liệu giả để xem thử prompt (không phải dữ liệu thật, chỉ để kiểm tra trước khi lưu). */
const SAMPLE_MATERIALS = [
  { printTech: "Khắc laser", technique: "khac-laser" },
  { printTech: "Cắt laser", technique: "cat-laser" },
];
const SAMPLE_GRID = { cols: 5, rows: 2 };

/** Dựng prompt mẫu để xem trước; trả lỗi tiếng Việt nếu prompt có vấn đề (biến lạ, thiếu biến bắt buộc...). */
function buildPreview(kind: "CATALOG" | "DESIGN", body: string): { ok: true; text: string } | { ok: false; error: string } {
  const problem = validateTemplate(kind, body);
  if (problem) return { ok: false, error: problem };
  try {
    if (kind === "CATALOG") {
      return {
        ok: true,
        text: renderPrompt(body, { rows: SAMPLE_GRID.rows, cols: SAMPLE_GRID.cols, materials_list: buildMaterialsList(SAMPLE_MATERIALS, SAMPLE_GRID) }),
      };
    }
    return {
      ok: true,
      text: renderDesignPrompt(
        body,
        { product_type: "Bình giữ nhiệt 500ml", design_style: "Tối giản, khắc tên viết tay ở giữa", note: "Khách muốn chữ nhỏ, không quá 3cm" },
        finishRuleOf(SAMPLE_MATERIALS[0]),
      ),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type PromptVersion = {
  id: string;
  version: number;
  body: string;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  author: string;
};

const VARIABLE_HELP: Record<"CATALOG" | "DESIGN", { name: string; desc: string }[]> = {
  CATALOG: [
    { name: "{{cols}}", desc: "số cột của trang mẫu" },
    { name: "{{rows}}", desc: "số hàng của trang mẫu" },
    { name: "{{materials_list}}", desc: "định nghĩa kiểu hàng khắc/cắt và danh sách ô kèm kiểu của từng ô theo công nghệ chất liệu (bắt buộc, hệ thống tự sinh)" },
  ],
  DESIGN: [
    { name: "{{product_type}}", desc: "loại sản phẩm sale nhập" },
    { name: "{{design_style}}", desc: "mô tả kiểu thiết kế được chọn" },
    { name: "{{note}}", desc: "ghi chú thêm của sale" },
    { name: "{{material_finish}}", desc: "kiểu hàng theo công nghệ của chất liệu (khắc laser hai lớp hoặc cắt laser một lớp) và theo ô \"logo dạng huy hiệu\" của logo, hệ thống tự sinh; thiếu biến này thì hệ thống tự nối vào cuối prompt" },
  ],
};

export function PromptEditor({
  kind,
  title,
  description,
  versions,
}: {
  kind: "CATALOG" | "DESIGN";
  title: string;
  description: string;
  versions: PromptVersion[];
}) {
  const active = versions.find((v) => v.isActive);
  const [body, setBody] = useState(active?.body ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof buildPreview> | null>(null);
  const dirty = body.trim() !== (active?.body ?? "").trim();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await savePromptAction(kind, body, note);
      if (r.error) return setError(r.error);
      toast.success(r.ok);
      setNote("");
    });
  }

  function activate(id: string) {
    startTransition(async () => {
      const r = await activatePromptAction(id);
      if (r.error) return void toast.error(r.error);
      toast.success(r.ok);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} {active && <Badge className="ml-2">Đang dùng: phiên bản {active.version}</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {VARIABLE_HELP[kind].map((v) => (
            <li key={v.name}>
              <code className="rounded bg-muted px-1.5 py-0.5">{v.name}</code> {v.desc}
            </li>
          ))}
        </ul>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setPreview(null);
          }}
          rows={14}
          className="font-mono text-xs"
          aria-label={`Nội dung prompt ${title}`}
        />

        <div>
          <Button type="button" variant="outline" className="h-9" onClick={() => setPreview(buildPreview(kind, body))}>
            <EyeIcon /> Xem thử với dữ liệu mẫu
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">Dùng số liệu giả để kiểm tra prompt ra câu lệnh như thế nào trước khi lưu, không tốn token, không gọi AI.</p>
        </div>

        {preview &&
          (preview.ok ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Prompt sẽ gửi cho AI (dữ liệu mẫu, không phải khách thật):</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs">{preview.text}</pre>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{preview.error}</AlertDescription>
            </Alert>
          ))}

        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor={`note-${kind}`}>Ghi chú cho phiên bản mới (không bắt buộc)</Label>
          <Input id={`note-${kind}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-10" />
        </div>
        <Button type="button" className="h-10 self-start px-5" onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2Icon className="animate-spin" />}
          Lưu thành phiên bản mới
        </Button>

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="font-medium">Lịch sử phiên bản</p>
          <ul className="flex flex-col gap-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Phiên bản {v.version}</span>
                  {v.isActive && (
                    <Badge>
                      <CheckIcon className="size-3" /> Đang dùng
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {v.createdAt} · {v.author}
                    {v.note ? ` · ${v.note}` : ""}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(expanded === v.id ? null : v.id)}>
                      {expanded === v.id ? "Ẩn" : "Xem"}
                    </Button>
                    {!v.isActive && (
                      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => activate(v.id)}>
                        Dùng bản này
                      </Button>
                    )}
                  </span>
                </div>
                {expanded === v.id && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{v.body}</pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
