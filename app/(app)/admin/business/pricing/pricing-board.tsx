"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deletePricingParamAction, savePricingParamAction } from "../actions";
import { ConfirmDeleteButton } from "../confirm-button";

export type PricingRow = { id: string; key: string; label: string; value: string | null; unit: string; note: string };

const EMPTY = { id: undefined as string | undefined, key: "", label: "", value: "", unit: "", note: "" };

function EditDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: typeof EMPTY }) {
  const [form, setForm] = useState(initial);
  const [saving, start] = useTransition();
  const set = (k: keyof typeof EMPTY, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      const r = await savePricingParamAction(form);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.ok ?? "Đã lưu.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Sửa thông số" : "Thêm thông số"}</DialogTitle>
          <DialogDescription>Để trống giá trị nếu chưa có số liệu: hệ thống hiện &quot;Chưa có dữ liệu&quot; và không tự điền số nào.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-label">Tên thông số</Label>
            <Input id="p-label" value={form.label} onChange={(e) => set("label", e.target.value)} maxLength={200} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-key">Mã khóa (không trùng, không dấu)</Label>
            <Input id="p-key" value={form.key} onChange={(e) => set("key", e.target.value)} maxLength={60} placeholder="ví dụ: gia_dong_tam" className="h-10 font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-value">Giá trị</Label>
              <Input id="p-value" value={form.value} onChange={(e) => set("value", e.target.value)} inputMode="decimal" placeholder="Chưa có dữ liệu" className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-unit">Đơn vị</Label>
              <Input id="p-unit" value={form.unit} onChange={(e) => set("unit", e.target.value)} maxLength={40} placeholder="ví dụ: đ/cm2" className="h-10" />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Dùng dấu chấm cho phần thập phân, không dùng dấu ngăn cách hàng nghìn (viết 1500, không viết 1.500). Tối đa 4 chữ số thập phân.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-note">Ghi chú</Label>
            <Textarea id="p-note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={3} maxLength={5000} />
          </div>
          <div>
            <Button type="button" className="h-10" onClick={save} disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PricingBoard({ rows }: { rows: PricingRow[] }) {
  const [editing, setEditing] = useState<{ n: number; initial: typeof EMPTY } | null>(null);
  const [seq, setSeq] = useState(0);
  const openNew = () => {
    setSeq((n) => n + 1);
    setEditing({ n: seq + 1, initial: EMPTY });
  };
  const openEdit = (r: PricingRow) => {
    setSeq((n) => n + 1);
    setEditing({ n: seq + 1, initial: { id: r.id, key: r.key, label: r.label, value: r.value ?? "", unit: r.unit, note: r.note } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông số tính giá</CardTitle>
        <CardDescription>Thêm, sửa, xóa từng dòng. Chỉ là khung ghi số liệu, hệ thống không tự thêm số nào.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="px-4">
          <Button type="button" className="h-10" onClick={openNew}>
            <PlusIcon /> Thêm thông số
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">Chưa có dữ liệu. Bấm &quot;Thêm thông số&quot; để bắt đầu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Thông số</TableHead>
                <TableHead>Mã khóa</TableHead>
                <TableHead className="text-right">Giá trị</TableHead>
                <TableHead>Đơn vị</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead className="pr-4 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-64 py-2 pl-4 font-medium whitespace-normal">{r.label}</TableCell>
                  <TableCell className="font-mono text-xs">{r.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value === null ? <span className="text-muted-foreground">Chưa có dữ liệu</span> : r.value}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">{r.note}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <PencilIcon /> Sửa
                      </Button>
                      <ConfirmDeleteButton
                        action={deletePricingParamAction.bind(null, r.id)}
                        title="Xóa thông số này?"
                        description={`Dòng "${r.label}" sẽ bị xóa hẳn.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {editing && <EditDialog key={editing.n} open onOpenChange={(o) => !o && setEditing(null)} initial={editing.initial} />}
    </Card>
  );
}
