const AREA = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COUNT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Area in square metres with two decimals, for example "20.00". */
export function formatArea(value: number): string {
  return AREA.format(value);
}

/** Whole number with thousands grouping, for example "1,234". */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** "1 corner", "6 corners". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
