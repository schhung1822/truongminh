import { apiUser, isResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/fb/format";
import { parseLeadFilters } from "@/lib/fb/lead-filters";
import { SUPPLIER_TYPE_LABEL } from "@/lib/fb/reply-labels";
import { csvLine } from "@/lib/stats/csv";
import { STATUS_LABEL } from "@/app/(app)/fb/leads/lead-status";

const EXPORT_LIMIT = 20000;

/** Xuất CSV (mở được bằng Excel) danh sách lead đúng theo bộ lọc đang xem ở trang /fb/leads. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const sp = new URL(req.url).searchParams;
  const { where } = parseLeadFilters(user, {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    type: sp.get("type") ?? undefined,
    group: sp.get("group") ?? undefined,
    assigned: sp.get("assigned") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    view: sp.get("view") ?? undefined,
    stype: sp.get("stype") ?? undefined,
  });
  const oldestFirst = sp.get("sort") === "old";

  const leads = await db.fbLead.findMany({
    where,
    orderBy: [{ createdAt: oldestFirst ? "asc" : "desc" }, { id: "asc" }],
    take: EXPORT_LIMIT,
    include: {
      group: { select: { name: true } },
      post: { select: { url: true } },
      customer: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  const lines = [
    csvLine(["Tên", "Số điện thoại", "Zalo", "Email", "Loại", "Trạng thái", "Nhóm", "Phụ trách", "Khách hàng liên kết", "Ghi chú", "Bài đăng", "Ngày tạo", "Loại nhà sản xuất", "Năng lực", "Chào gần nhất", "Đã gọi", "Đã nhắn Zalo", "Đã gửi mẫu"]),
  ];
  for (const l of leads) {
    lines.push(
      csvLine([
        l.name,
        l.phone ?? "",
        l.zalo ?? "",
        l.email ?? "",
        l.leadType === "SUPPLIER" ? "Tìm bên sản xuất" : "Tìm khách",
        STATUS_LABEL[l.status] ?? l.status,
        l.group?.name ?? "Trang cá nhân",
        l.assignedTo?.name ?? "Chưa gán",
        l.customer?.name ?? "",
        l.note ?? "",
        l.post.url,
        fmtDateTime(l.createdAt),
        l.supplierType ? SUPPLIER_TYPE_LABEL[l.supplierType] : "",
        l.capability ?? "",
        l.lastOfferedAt ? fmtDateTime(l.lastOfferedAt) : "",
        l.calledAt ? fmtDateTime(l.calledAt) : "",
        l.zaloMessagedAt ? fmtDateTime(l.zaloMessagedAt) : "",
        l.sampleSentAt ? fmtDateTime(l.sampleSentAt) : "",
      ]),
    );
  }

  // BOM để Excel mở đúng tiếng Việt có dấu
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
