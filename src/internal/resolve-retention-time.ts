export const DEFAULT_RETENTION_MS = 60_000;

/** Maximum delay supported by `setTimeout` in browsers and Node (2^31 − 1 ms). */
export const MAX_RETENTION_MS = 2_147_483_647;

export function resolveRetentionTimeMs(retentionTime?: number): number {
  if (retentionTime === undefined) {
    return DEFAULT_RETENTION_MS;
  }

  if (
    typeof retentionTime !== "number" ||
    !Number.isFinite(retentionTime) ||
    retentionTime < 0
  ) {
    throw new Error(
      "Invalid query `retentionTime`: must be a finite non-negative number of milliseconds."
    );
  }

  if (retentionTime > MAX_RETENTION_MS) {
    throw new Error(
      `Invalid query \`retentionTime\`: must not exceed ${MAX_RETENTION_MS} milliseconds (maximum supported timer delay).`
    );
  }

  return retentionTime;
}
