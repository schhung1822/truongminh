import type { Prisma } from "@/generated/prisma/client";

/** Dữ liệu một ảnh sắp tạo (chưa gắn phiên và người tạo). */
export type BuiltImage = Omit<Prisma.GeneratedImageUncheckedCreateInput, "sessionId" | "createdById">;
