export function remainingAllowance(input: {
  accountDailyLimit: number;
  accountSentToday: number;
  campaignDailyLimit: number;
  campaignSentToday: number;
  slotsThisRun: number;
}): number {
  const n = Math.min(
    input.accountDailyLimit - input.accountSentToday,
    input.campaignDailyLimit - input.campaignSentToday,
    input.slotsThisRun,
  );
  return Math.max(0, Math.floor(n));
}

export function assignAccounts(
  accounts: { id: string; remaining: number }[],
  count: number,
): string[] {
  const left = new Map(accounts.map((a) => [a.id, Math.max(0, a.remaining)]));
  const out: string[] = [];
  let progressed = true;
  while (out.length < count && progressed) {
    progressed = false;
    for (const a of accounts) {
      if (out.length >= count) break;
      const r = left.get(a.id) ?? 0;
      if (r > 0) {
        out.push(a.id);
        left.set(a.id, r - 1);
        progressed = true;
      }
    }
  }
  return out;
}

export const SENDS_PER_RUN = 1;
export const RUNS_PER_HOUR = 60;
export const MANUAL_BATCH_SIZE = 5;
