import { prisma } from "@photography-outreach/database";
import type { Prisma } from "@photography-outreach/database";

export interface ActivityLogFilters {
  opportunityId?: string;
  since?: Date;
}

export async function getActivityLog(filters: ActivityLogFilters, limit = 50) {
  const where: Prisma.ActivityLogWhereInput = {
    opportunityId: filters.opportunityId,
    createdAt: filters.since ? { gte: filters.since } : undefined,
  };
  return prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
}
