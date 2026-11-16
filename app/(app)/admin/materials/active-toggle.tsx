"use client";

import { useTransition } from "react";
import { Loader2Icon, PowerIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setMaterialActiveAction } from "./actions";

export function ActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={isActive ? "ghost" : "secondary"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await setMaterialActiveAction(id, !isActive);
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <PowerIcon />}
      {isActive ? "Tắt" : "Bật"}
    </Button>
  );
}
