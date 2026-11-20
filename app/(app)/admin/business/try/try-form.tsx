"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2Icon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AI_ROLES, ROLE_INFO, type AiRole } from "@/lib/knowledge/roles";
import { askAiAction, type TryAnswer } from "../actions";
import { VisibilityBadge } from "../visibility-badge";

function ArticleList({ items }: { items: TryAnswer["used"] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
          <VisibilityBadge visibility={a.visibility} />
          <Link href={`/admin/business/articles/${a.id}`} className="underline-offset-4 hover:underline">
            {a.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TryForm({ model }: { model: string }) {
  const [role, setRole] = useState<AiRole>("SALE_ASSISTANT");
  const [question, setQuestion] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<TryAnswer | null>(null);

  function ask() {
    setError(null);
    start(async () => {
      const r = await askAiAction(role, question);
      if (r.error) {
        setError(r.error);
        setAnswer(null);
      } else setAnswer(r.answer ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Thử AI với kho kiến thức</CardTitle>
          <CardDescription>
            Chọn một vai rồi hỏi như nhân viên hoặc khách sẽ hỏi, để xem AI trả lời gì và đã dùng những bài nào. Câu trả lời dùng đúng kiến thức mà vai đó được đọc. Model đang dùng: <b>{model}</b> (đổi ở Cài đặt Zalo).{" "}
            <b>Mỗi lượt hỏi tốn một ít token kie.ai.</b> Lượt hỏi được ghi vào Nhật ký dùng, và câu AI không trả lời được sẽ vào mục Câu hỏi chưa trả lời.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 sm:max-w-xl">
            <Label htmlFor="role">Vai AI</Label>
            <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value as AiRole)}>
              {AI_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_INFO[r].label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {ROLE_INFO[role].desc} {ROLE_INFO[role].audience === "CUSTOMER" ? "Vai này chỉ đọc kiến thức công khai." : "Vai này đọc kiến thức công khai và nội bộ."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question">Câu hỏi</Label>
            <Textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1500} placeholder="Ví dụ: Nhận làm tối thiểu bao nhiêu cái?" />
          </div>
          <div>
            <Button type="button" className="h-10" onClick={ask} disabled={pending || !question.trim()}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              {pending ? "Đang hỏi..." : "Hỏi"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Không hỏi được AI</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {answer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Câu trả lời
              {answer.unknown && <Badge variant="destructive">AI báo chưa có thông tin</Badge>}
              <span className="text-xs font-normal text-muted-foreground">{answer.tokens.toLocaleString("vi-VN")} token</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{answer.text || "(AI không trả lời chữ nào)"}</p>
            {answer.unknown && (
              <p className="text-sm text-muted-foreground">
                Câu hỏi này đã được ghi vào{" "}
                <Link href="/admin/business/gaps" className="underline">
                  Câu hỏi chưa trả lời
                </Link>{" "}
                để bạn bổ sung bài kiến thức.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Bài kiến thức đã dùng ({answer.used.length})</h3>
              {answer.used.length === 0 ? <p className="text-sm text-muted-foreground">Không có bài nào (chưa có bài Đang dùng hợp vai và mức hiển thị).</p> : <ArticleList items={answer.used} />}
            </div>
            {answer.dropped.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400">Bài bị bỏ vì quá ngân sách ({answer.dropped.length})</h3>
                <ArticleList items={answer.dropped} />
                <p className="text-xs text-muted-foreground">Tăng ngân sách ở mục Bài kiến thức, hoặc rút gọn và đặt ưu tiên cho bài quan trọng.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
