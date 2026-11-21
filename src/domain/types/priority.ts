export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Higher number = more urgent. Used for sorting. */
export const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
