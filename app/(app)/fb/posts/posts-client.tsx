"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, PackageIcon, PauseIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addPostAction, draftExistingOffersAction, setPostOfferAction, setPurposeAction, setTrackingAction, type PostFormState } from "./actions";
import { MaterialPicker, type PickerMaterial } from "./material-picker";

export function AddPostForm({ accounts, materials }: { accounts: { id: string; displayName: string }[]; materials: PickerMaterial[] }) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(addPostAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [purpose, setPurpose] = useState("FIND_CUSTOMER");
  const [materialIds, setMaterialIds] = useState<string[]>([]);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đưa phần chọn của form về ban đầu sau khi thêm bài xong
      setPurpose("FIND_CUSTOMER");
      setMaterialIds([]);
    }
  }, [state]);

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có nick Facebook nào. Hãy thêm nick ở Hệ thống &gt; Kết nối &gt; Extension Facebook trước.</p>;
  }

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="post-url">Link bài đăng (permalink)</Label>
        <Input id="post-url" name="url" required maxLength={600} className="h-10" placeholder="https://www.facebook.com/groups/.../posts/..." />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-acc">Nick dùng để quét bài</Label>
        <NativeSelect id="post-acc" name="accountId" required defaultValue={accounts[0].id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-purpose">Mục đích bài</Label>
        <NativeSelect id="post-purpose" name="purpose" required value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          <option value="FIND_CUSTOMER">Tìm khách</option>
          <option value="FIND_SUPPLIER">Tìm bên sản xuất</option>
        </NativeSelect>
      </div>
      {purpose === "FIND_SUPPLIER" && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            Bài tìm nhà sản xuất: khi xưởng comment (thường kèm số điện thoại), hệ thống tạo lead nhà sản xuất và soạn sẵn câu mời dùng vật liệu để bạn duyệt ở Hàng chờ trả lời.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-product">Mẫu áo / sản phẩm đang tìm nhà sản xuất</Label>
            <Input id="post-product" name="productRef" maxLength={200} className="h-10" placeholder="Ví dụ: Áo polo mẫu P01" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vật liệu gợi ý cho sản phẩm này</Label>
            <MaterialPicker materials={materials} value={materialIds} onChange={setMaterialIds} />
            <input type="hidden" name="materialIds" value={JSON.stringify(materialIds)} />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-date">Ngày đăng (không bắt buộc)</Label>
        <Input id="post-date" name="postedDate" type="date" className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="post-content">Nội dung bài (không bắt buộc, để đối chiếu sau này)</Label>
        <Textarea id="post-content" name="content" rows={3} maxLength={20000} />
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Bài có thể do người khác đăng. Nick đã chọn cần có quyền xem bài và comment; extension chỉ quét những nội dung đang hiển thị cho nick đó.
      </p>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Thêm bài theo dõi
        </Button>
      </div>
    </form>
  );
}

export function PurposeSelect({ id, purpose }: { id: string; purpose: "FIND_CUSTOMER" | "FIND_SUPPLIER" }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={purpose}
      disabled={pending}
      className="h-8 w-40 text-xs"
      aria-label="Mục đích bài"
      onChange={(e) =>
        startTransition(async () => {
          const r = await setPurposeAction(id, e.target.value as "FIND_CUSTOMER" | "FIND_SUPPLIER");
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      <option value="FIND_CUSTOMER">Tìm khách</option>
      <option value="FIND_SUPPLIER">Tìm bên sản xuất</option>
    </NativeSelect>
  );
}

/** Sản phẩm và vật liệu gợi ý của một bài tìm nhà sản xuất: xem nhanh trên dòng, bấm để sửa. */
export function PostOfferDialog({ id, productRef, materialIds, materials }: { id: string; productRef: string; materialIds: string[]; materials: PickerMaterial[] }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState(productRef);
  const [ids, setIds] = useState(materialIds);
  const [pending, startTransition] = useTransition();
  const names = materialIds.map((mid) => materials.find((m) => m.id === mid)?.name).filter(Boolean);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setProduct(productRef);
          setIds(materialIds);
        }
      }}
    >
      <DialogTrigger render={<button type="button" className="mt-1 flex w-full max-w-56 items-start gap-1 rounded-md border border-dashed px-2 py-1 text-left text-xs hover:bg-muted" />}>
        <PackageIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate">{productRef || <span className="text-muted-foreground">Chưa ghi sản phẩm</span>}</span>
          <span className="block truncate text-muted-foreground">{names.length > 0 ? `${names.length} vật liệu: ${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""}` : "Chưa chọn vật liệu gợi ý"}</span>
        </span>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sản phẩm và vật liệu gợi ý</DialogTitle>
          <DialogDescription>Dùng để soạn câu mời khi xưởng comment vào bài này. Câu đã nằm trong hàng chờ không đổi.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`po-product-${id}`}>Mẫu áo / sản phẩm đang tìm nhà sản xuất</Label>
            <Input id={`po-product-${id}`} value={product} maxLength={200} className="h-10" onChange={(e) => setProduct(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vật liệu gợi ý</Label>
            <MaterialPicker materials={materials} value={ids} onChange={setIds} />
          </div>
          <Button
            className="h-10"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setPostOfferAction(id, { productRef: product, materialIds: ids });
                if (r.error) toast.error(r.error);
                else {
                  toast.success(r.ok ?? "Đã lưu.");
                  setOpen(false);
                }
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Nút trên dòng một bài tìm nhà sản xuất: soạn câu mời cho các comment đã quét từ trước. Lần quét chỉ soạn cho comment MỚI,
 * nên bài vừa đổi mục đích cần nút này để dùng được các comment đã có.
 */
export function DraftExistingButton({ id, commentCount }: { id: string; commentCount: number }) {
  const [pending, startTransition] = useTransition();
  if (commentCount === 0) return null;
  return (
    <button
      type="button"
      disabled={pending}
      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      onClick={() => {
        if (
          !window.confirm(
            "Soạn câu mời cho các comment đã quét của bài này?\n\n- Comment có số điện thoại: soạn ngay một câu, lead của người đó chuyển thành lead nhà sản xuất (nếu còn ở trạng thái Mới).\n- AI (nếu đang bật) xem từng comment, mỗi comment một lượt gọi, tối đa 60 comment mỗi lần bấm.\n- Chỉ tạo câu chờ duyệt ở Hàng chờ trả lời, không gửi gì lên Facebook.",
          )
        )
          return;
        startTransition(async () => {
          const r = await draftExistingOffersAction(id);
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok, { duration: 10_000 });
        });
      }}
    >
      {pending ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
      Soạn câu mời cho comment đã có
    </button>
  );
}

export function TrackingActions({ id, status }: { id: string; status: "TRACKING" | "PAUSED" | "DONE" }) {
  const [pending, startTransition] = useTransition();
  const run = (next: "TRACKING" | "PAUSED" | "DONE") =>
    startTransition(async () => {
      const r = await setTrackingAction(id, next);
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "TRACKING" ? (
        <Button variant="outline" size="sm" onClick={() => run("PAUSED")} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PauseIcon />}
          Tạm dừng
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => run("TRACKING")} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Theo dõi lại
        </Button>
      )}
      {status !== "DONE" && (
        <Button variant="outline" size="sm" onClick={() => run("DONE")} disabled={pending}>
          <CheckIcon />
          Kết thúc
        </Button>
      )}
    </div>
  );
}
