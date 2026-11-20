import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { listMachineTimeLogs } from "@/lib/quoting/store";
import { loadTechniqueChoices } from "../data";
import { formatDateTime, groupDigits } from "../format";
import { DeleteLogButton } from "./delete-log-button";
import { TimeForm } from "./time-form";

export const metadata: Metadata = { title: "Thời gian máy thực tế" };

type Params = { technique?: string };

export default async function QuotingTimesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const technique = (params.technique ?? "").trim().slice(0, 60);

  const [logs, techniques] = await Promise.all([listMachineTimeLogs(technique || undefined, 200), loadTechniqueChoices()]);
  const userIds = [...new Set(logs.map((l) => l.createdById))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  const label = new Map(techniques.map((t) => [t.value, t.label]));

  return (
    <div className="flex flex-col gap-6">
      <TimeForm techniques={techniques} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Các lần đã ghi</h2>
            <p className="text-sm text-muted-foreground">{logs.length >= 200 ? "200 bản ghi mới nhất." : `${logs.length} bản ghi.`}</p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <NativeSelect name="technique" defaultValue={technique} aria-label="Lọc theo công nghệ" className="w-56">
              <option value="">Tất cả công nghệ</option>
              {techniques.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" className="h-10">
              Lọc
            </Button>
          </form>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">Chưa có bản ghi nào{technique ? " cho công nghệ này" : ""}.</div>
        ) : (
          <Card>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Thời gian ghi</TableHead>
                    <TableHead>Mô tả</TableHead>
                    <TableHead>Công nghệ</TableHead>
                    <TableHead className="text-right">Chiều dài cắt (mm)</TableHead>
                    <TableHead className="text-right">Diện tích khắc (mm2)</TableHead>
                    <TableHead className="text-right">Số tấm</TableHead>
                    <TableHead className="text-right">Thực tế (phút)</TableHead>
                    <TableHead>Người ghi</TableHead>
                    <TableHead className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-4 text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal">{l.description}</TableCell>
                      <TableCell>{label.get(l.technique) ?? l.technique}</TableCell>
                      <TableCell className="text-right tabular-nums">{groupDigits(l.totalCutMm, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{groupDigits(l.engraveAreaMm2, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{groupDigits(l.sheets)}</TableCell>
                      <TableCell className="text-right tabular-nums">{groupDigits(l.actualMinutes, 2)}</TableCell>
                      <TableCell>{names.get(l.createdById) ?? "(đã xóa)"}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <DeleteLogButton id={l.id} description={l.description} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
