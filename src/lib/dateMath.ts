// UTC-safe calendar arithmetic. mfg_date/best_before are date-only strings
// (YYYY-MM-DD) that parse as UTC midnight, but Date.prototype.setDate()
// operates in local time — mixing the two can land on the wrong calendar
// date across a daylight-saving transition. Always do this arithmetic in UTC.
export function computeBestBefore(mfgDate: string, shelfLifeDays: number): string {
  const best = new Date(`${mfgDate}T00:00:00.000Z`);
  best.setUTCDate(best.getUTCDate() + shelfLifeDays);
  return best.toISOString().slice(0, 10);
}
