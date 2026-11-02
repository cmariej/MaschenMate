const nameCollator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function compareNames(left: string, right: string): number {
  return nameCollator.compare(left.trim(), right.trim());
}
