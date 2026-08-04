import type { WorkerOptions } from "bullmq"

const MINUTE = 60

export const IDLE_POLL_SECONDS = 5 * MINUTE

export const STALLED_CHECK_MS = 5 * MINUTE * 1000

export const idleFriendlyWorkerOptions: Omit<WorkerOptions, "connection"> = {
  drainDelay: IDLE_POLL_SECONDS,
  stalledInterval: STALLED_CHECK_MS
}
