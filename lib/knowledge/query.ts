import type { Prisma } from "@/generated/prisma/client";
import { visibilitiesFor, type AiRole } from "./roles";

/**
 * Điều kiện truy vấn bài kiến thức cho một vai AI. Việc lọc mức hiển thị và vai nằm NGAY TRONG câu truy vấn:
 * bài không được phép không bao giờ được tải lên bộ nhớ, nên không thể lọt vào prompt dù prompt dặn gì.
 */
export function articleWhere(role: AiRole, now: Date): Prisma.KnowledgeArticleWhereInput {
  return {
    status: "ACTIVE",
    visibility: { in: visibilitiesFor(role) },
    roles: { some: { role } },
    OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
  };
}
