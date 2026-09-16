import type { TrackVariant } from '../track/defs';

/**
 * v9 P1 free-play ledger policy: only the DAY variant writes records.
 * Non-day free-play variants run dry — PB/ghost/friend/drift/traffic ledgers
 * untouched (mirrors the rival/traffic writesRecords=false pattern).
 */
export function variantWritesRecords(variant: TrackVariant): boolean {
  return variant === 'day';
}
