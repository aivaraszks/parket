const DAY_MS = 86_400_000;
const SAME_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const OTHER_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday", "3 Oct" (with the year when it is not this year). */
export function formatEdited(updatedAt: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(updatedAt)) / DAY_MS);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  const sameYear = new Date(updatedAt).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? SAME_YEAR : OTHER_YEAR).format(updatedAt);
}
