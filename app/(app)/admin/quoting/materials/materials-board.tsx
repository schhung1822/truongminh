"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { foldKey } from "@/lib/materials/option-types";
import type { MaterialRow } from "../data";
import { MAX_BULK_ROWS } from "../bulk";
import { MATERIAL_MISSING_CODES, MATERIAL_MISSING_SHORT } from "../status";
import { BulkTools } from "./bulk-tools";
import { StockRow } from "./stock-row";

const PAGE_SIZE = 50;
const NO_TECH = "__none";

export type MaterialFilters = { q: string; group: string; tech: string; miss: string };

const machineBad = (r: MaterialRow) => r.machine === "none" || r.machine === "missing";

function matchMiss(r: MaterialRow, miss: string): boolean {
  if (!miss) return true;
  if (miss === "any") return r.missing.length > 0 || machineBad(r);
  if (miss === "complete") return r.missing.length === 0 && !machineBad(r) && r.machine !== null;
  if (miss === "machine") return machineBad(r);
  return r.missing.includes(miss);
}

export function MaterialsBoard({ rows, defaultGapMm, truncated, initial }: { rows: MaterialRow[]; defaultGapMm: number | null; truncated: boolean; initial: MaterialFilters }) {
  const [f, setF] = useState<MaterialFilters>(initial);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const techs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.technique) m.set(r.technique, r.techniqueLabel || r.technique);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [rows]);

  const filtered = useMemo(() => {
    const key = foldKey(f.q);
    return rows.filter((r) => {
      if (key && !foldKey(`${r.code} ${r.name}`).includes(key)) return false;
      if (f.group && r.group !== f.group) return false;
      if (f.tech === NO_TECH ? r.technique !== null : f.tech && r.technique !== f.tech) return false;
      return matchMiss(r, f.miss);
    });
  }, [rows, f]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function setFilter(patch: Partial<MaterialFilters>) {
    setF((p) => ({ ...p, ...patch }));
    setPage(1);
  }
  function toggle(id: string) {
    setNotice(null);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleVisible() {
    setNotice(null);
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.add(r.id));
      return n;
    });
  }
  function selectFiltered() {
    if (filtered.length > MAX_BULK_ROWS) {
      setNotice(`Đang lọc ${filtered.length} dòng, vượt giới hạn ${MAX_BULK_ROWS} dòng mỗi lần. Hãy lọc thêm (theo nhóm, công nghệ hoặc tìm kiếm) rồi chọn lại.`);
      return;
    }
    setNotice(null);
    setSelected(new Set(filtered.map((r) => r.id)));
  }

  const hasFilter = !!(f.q || f.group || f.tech || f.miss);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Chỉ hiện chất liệu đang bật. Kích thước tấm nhập bằng <b>cm</b>, lề và khoảng cách giữa logo bằng <b>mm</b>, giá một tấm bằng <b>đồng</b>. Ô trống là &quot;chưa có dữ liệu&quot; (chưa báo giá được). Khoảng cách để trống thì dùng mặc định chung
        {defaultGapMm !== null ? ` (hiện là ${defaultGapMm} mm)` : " (chưa đặt ở Cấu hình giá)"}. Mỗi dòng có nút Lưu riêng.
      </p>
      {truncated && <p className="text-sm text-amber-700 dark:text-amber-400">Có rất nhiều chất liệu đang bật; chỉ hiện {rows.length} chất liệu đầu tiên.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.4fr)_1fr_1fr_1fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={f.q} onChange={(e) => setFilter({ q: e.target.value })} placeholder="Tìm theo mã hoặc tên" className="h-10 pl-9" aria-label="Tìm chất liệu theo mã hoặc tên" />
        </div>
        <NativeSelect value={f.group} onChange={(e) => setFilter({ group: e.target.value })} aria-label="Lọc theo nhóm">
          <option value="">Tất cả nhóm</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={f.tech} onChange={(e) => setFilter({ tech: e.target.value })} aria-label="Lọc theo công nghệ">
          <option value="">Tất cả công nghệ</option>
          {techs.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          <option value={NO_TECH}>Chưa có công nghệ</option>
        </NativeSelect>
        <NativeSelect value={f.miss} onChange={(e) => setFilter({ miss: e.target.value })} aria-label="Lọc theo tình trạng thông số">
          <option value="">Mọi tình trạng</option>
          <option value="any">Chỉ chất liệu còn thiếu thông số</option>
          <option value="complete">Chỉ chất liệu đã đủ</option>
          {MATERIAL_MISSING_CODES.map((c) => (
            <option key={c} value={c}>
              Thiếu {MATERIAL_MISSING_SHORT[c]}
            </option>
          ))}
          <option value="machine">Thông số máy chưa đủ</option>
        </NativeSelect>
        {hasFilter && (
          <Button type="button" variant="ghost" className="h-10" onClick={() => setFilter({ q: "", group: "", tech: "", miss: "" })}>
            Xóa bộ lọc
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {filtered.length}/{rows.length} chất liệu
        </span>
        <Button type="button" variant="outline" size="sm" onClick={selectFiltered} disabled={filtered.length === 0}>
          Chọn tất cả đang lọc ({filtered.length})
        </Button>
        {selected.size > 0 && (
          <>
            <span className="font-medium">Đã chọn {selected.size}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </>
        )}
      </div>
      {notice && <p className="text-sm text-red-700 dark:text-red-400">{notice}</p>}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">{rows.length === 0 ? "Chưa có chất liệu nào đang bật." : "Không có chất liệu khớp bộ lọc."}</div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-3">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleVisible} aria-label="Chọn cả trang này" />
                  </TableHead>
                  <TableHead>Chất liệu</TableHead>
                  <TableHead className="text-right">Rộng tấm (cm)</TableHead>
                  <TableHead className="text-right">Cao tấm (cm)</TableHead>
                  <TableHead className="text-right">Giá một tấm (đồng)</TableHead>
                  <TableHead className="text-right">Lề tấm (mm)</TableHead>
                  <TableHead className="text-right">Khoảng cách (mm)</TableHead>
                  <TableHead>Cho xoay</TableHead>
                  <TableHead>Còn thiếu</TableHead>
                  <TableHead className="pr-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <StockRow key={r.id} row={r} defaultGapMm={defaultGapMm} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Phân trang">
          <Button type="button" variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Trang trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {current}/{pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            Trang sau
          </Button>
        </nav>
      )}

      <BulkTools rows={selectedRows} onApplied={() => setSelected(new Set())} />
    </div>
  );
}
