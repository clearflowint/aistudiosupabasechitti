/**
 * Calculates the active month of a Chitti scheme based on exact calendar cycle crossing.
 * Spawning to month t+1 only occurs when the scheme's anniversary day of month is crossed
 * (or at the end of shorter months like Feb), ensuring a full 30/31-day cycle completes
 * before advancing the month number and generating the new month's bill.
 */
export function calculateChittiMonth(
  startDateStr: string,
  totalMonths: number,
  asOfDate: Date = new Date()
): number {
  if (!startDateStr) return 1;
  const parts = startDateStr.split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return 1;
  }
  const [startYear, startMonthNum, startDay] = parts;
  const startMonth = startMonthNum - 1; // 0-indexed JavaScript month

  const curYear = asOfDate.getFullYear();
  const curMonth = asOfDate.getMonth();
  const curDay = asOfDate.getDate();

  // If current date is strictly before the scheme start date: Month 1
  if (
    curYear < startYear ||
    (curYear === startYear && curMonth < startMonth) ||
    (curYear === startYear && curMonth === startMonth && curDay < startDay)
  ) {
    return 1;
  }

  // Raw calendar months difference
  let fullMonthsElapsed = (curYear - startYear) * 12 + (curMonth - startMonth);

  // Determine effective day of crossing in current month (handling shorter months like Feb)
  const daysInCurMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const effectiveCrossingDay = Math.min(startDay, daysInCurMonth);

  // If today hasn't reached the monthly anniversary day yet, this cycle hasn't completed
  if (curDay < effectiveCrossingDay) {
    fullMonthsElapsed -= 1;
  }

  const activeMonth = fullMonthsElapsed + 1;
  return Math.max(1, Math.min(activeMonth, totalMonths));
}
