import { prisma } from "@photography-outreach/database";

export async function getOutreachHistory(opportunityId: string) {
  return prisma.outreach.findMany({
    where: { opportunityId },
    include: { emailDraft: true, followups: true },
    orderBy: { createdAt: "desc" },
  });
}
