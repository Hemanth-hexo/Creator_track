import { transitionOpportunityStatus } from "@photography-outreach/opportunities";
import type { ActivityActor, OpportunityStatus } from "@photography-outreach/shared";
import { createLogger } from "@photography-outreach/shared";

const logger = createLogger("research:status-chain");

/**
 * Walks an opportunity forward through a linear sequence of valid state
 * transitions, one hop at a time, stopping once it reaches (or passes) the
 * target chain. If the opportunity is already past the chain (e.g. drafted,
 * approved) or on an unrelated terminal status, this is a safe no-op rather
 * than an error — both contact-adding and research can be re-run at any
 * point without disturbing an opportunity that's already moved on.
 */
export async function advanceThroughChain(
  opportunityId: string,
  currentStatus: OpportunityStatus,
  chain: OpportunityStatus[],
  entryStatus: OpportunityStatus,
  actor: ActivityActor,
): Promise<void> {
  const startIndex = chain.findIndex((s) => s === currentStatus);
  const remaining = startIndex >= 0 ? chain.slice(startIndex + 1) : chain;

  if (currentStatus !== entryStatus && startIndex === -1) {
    logger.info({ opportunityId, currentStatus, chain }, "advanceThroughChain:skipped_non_linear_status");
    return;
  }

  for (const status of remaining) {
    await transitionOpportunityStatus(opportunityId, status, actor);
  }
}
