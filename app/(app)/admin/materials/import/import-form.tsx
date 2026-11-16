"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importMaterialsCsvAction, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importMaterialsCsvAction, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file">File CSV</Label>
          <Input id="file" name="file" type="file" accept=".csv,text/csv" required className="h-10 pt-1.5" />
        </div>
        <Button type="submit" className="h-10 self-start px-5" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {pending ? "Đang nhập..." : "Nhập chất liệu"}
        </Button>
      </form>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.created !== undefined && (
        <Alert>
          <AlertTitle>Đã nhập xong: thêm mới {state.created} chất liệu</AlertTitle>
          <AlertDescription>
            {state.skipped && state.skipped.length > 0 && (
              <p>Bỏ qua {state.skipped.length} mã đã có: {state.skipped.join(", ")}.</p>
            )}
            <Link href="/admin/materials" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}>
              Xem danh sách chất liệu
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {state.errors && state.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{state.errors.length} dòng bị bỏ qua vì lỗi</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {state.errors.slice(0, 30).map((e, i) => (
                <li key={i}>
                  Dòng {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
