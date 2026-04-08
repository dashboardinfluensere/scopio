import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type LogAdminEventInput = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  organizationId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function logAdminEvent(input: LogAdminEventInput) {
  try {
    await prisma.adminLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        organizationId: input.organizationId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    console.error("[adminLogs] Kunne ikke lagre admin-logg:", error);
  }
}