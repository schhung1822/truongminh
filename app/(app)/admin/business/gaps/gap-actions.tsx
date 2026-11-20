"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckIcon, Loader2Icon, PenLineIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteGapAction, setGapStatusAction } from "../actions";
import { ConfirmDeleteButton } from "../confirm-button";

export function GapActions({ id, status, question, writeHref }: { id: string; status: string; question: string; writeHref: string }) {
  const [pending, start] = useTransition();
  const resolved = status === "RESOLVED";

  function toggle() {
    start(async () => {
      const r = await setGapStatusAction(id, resolved ? "OPEN" : "RESOLVED");
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã lưu.");
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link href={writeHref} className={buttonVariants({ size: "sm" })}>
        <PenLineIcon /> Viết bài mới
      </Link>
      <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : resolved ? <RotateCcwIcon /> : <CheckIcon />}
        {resolved ? "Mở lại" : "Đánh dấu đã xử lý"}
      </Button>
      <ConfirmDeleteButton action={deleteGapAction.bind(null, id)} title="Xóa câu hỏi này?" description={`Câu hỏi "${question.slice(0, 120)}" sẽ bị xóa khỏi danh sách. Nếu AI lại không trả lời được, câu hỏi sẽ xuất hiện lại.`} />
    </div>
  );
}
