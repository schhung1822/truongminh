"use client";

import { useTransition } from "react";
import { Loader2Icon, PlugIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkKieAction } from "./actions";

export function KieCheckButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const r = await checkKieAction();
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
      Kiểm tra kết nối
    </Button>
  );
}
