import cron from "node-cron";
import { prisma } from "@photography-outreach/database";
import { discoverEvents, getDefaultEventProvider } from "@photography-outreach/events";
import { processDiscoveredEvents } from "@photography-outreach/opportunities";
import { getDueFollowups } from "@photography-outreach/email";
import { createLogger } from "@photography-outreach/shared";

const logger = createLogger("api:jobs");

async function withJobRun<T>(jobName: string, fn: () => Promise<T>): Promise<T | undefined> {
  const run = await prisma.jobRun.create({ data: { jobName, status: "running" } });
  try {
    const result = await fn();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "success", finishedAt: new Date(), stats: result as never },
    });
    logger.info({ jobId: run.id, jobName, status: "success" }, "job_run");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: message },
    });
    logger.error({ jobId: run.id, jobName, status: "failed", err: message }, "job_run");
    return undefined;
  }
}

/**
 * Same bookkeeping as `withJobRun`, but returns as soon as the `job_runs` row
 * exists instead of waiting for `fn` to finish. Used for HTTP-triggered runs
 * (e.g. the "Run event discovery" button): a multi-query discovery pass is a
 * handful of real search+LLM round trips and can run past a host's proxy
 * timeout (e.g. Render returns 502 rather than waiting), so the request must
 * return immediately and the caller polls `job_runs` for completion instead.
 */
async function triggerJobAsync<T>(jobName: string, fn: () => Promise<T>): Promise<string> {
  const run = await prisma.jobRun.create({ data: { jobName, status: "running" } });
  void fn()
    .then(async (result) => {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { status: "success", finishedAt: new Date(), stats: result as never },
      });
      logger.info({ jobId: run.id, jobName, status: "success" }, "job_run");
    })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), error: message },
      });
      logger.error({ jobId: run.id, jobName, status: "failed", err: message }, "job_run");
    });
  return run.id;
}

/** Daily event discovery: OpenAI web search against every active discovery query, then score any new opportunities. */
async function runDiscoveryJob() {
  let provider;
  try {
    provider = getDefaultEventProvider();
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error }, "discovery job skipped — provider unavailable");
    return;
  }
  const discovery = await discoverEvents(provider);
  const opportunities = await processDiscoveredEvents();
  return { discovery, opportunities };
}

/** Surfaces due follow-ups as a job-run record for observability; sending still requires explicit human approval. */
async function runFollowupCheckJob() {
  const due = await getDueFollowups();
  return { dueCount: due.length };
}

export function startScheduler() {
  // Daily at 8am server time.
  cron.schedule("0 8 * * *", () => void withJobRun("daily_event_discovery", runDiscoveryJob));
  // Every hour, check for follow-ups that have come due.
  cron.schedule("0 * * * *", () => void withJobRun("followup_check", runFollowupCheckJob));

  logger.info("cron scheduler started");
}

export { runDiscoveryJob, runFollowupCheckJob, withJobRun, triggerJobAsync };
