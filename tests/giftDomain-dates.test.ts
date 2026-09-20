import { describe, it, expect } from 'vitest';
import { daysUntilNextOccurrence, isCurationDispatchWindow, mapRecipientToDashboardShape } from '@/lib/giftDomain';
import type { RecipientRow } from '@/lib/giftDomain';

// Fixed "today" so every case is deterministic regardless of when the
// suite runs: Thursday, July 9, 2026.
const TODAY = new Date(2026, 6, 9);

function isoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

describe('daysUntilNextOccurrence', () => {
  it('returns 0 when the occasion is today', () => {
    expect(daysUntilNextOccurrence(isoDate(2026, 6, 9), TODAY)).toBe(0);
  });

  it('returns 14 for an occasion exactly 14 days out', () => {
    // July 9 + 14 days = July 23
    expect(daysUntilNextOccurrence(isoDate(2026, 6, 23), TODAY)).toBe(14);
  });

  it('does NOT match at 13 days out', () => {
    expect(daysUntilNextOccurrence(isoDate(2026, 6, 22), TODAY)).toBe(13);
    expect(isCurationDispatchWindow(isoDate(2026, 6, 22), TODAY)).toBe(false);
  });

  it('does NOT match at 15 days out', () => {
    expect(daysUntilNextOccurrence(isoDate(2026, 6, 24), TODAY)).toBe(15);
    expect(isCurationDispatchWindow(isoDate(2026, 6, 24), TODAY)).toBe(false);
  });

  it('rolls over to next year when the month/day has already passed this year', () => {
    // Jan 1 has already passed as of July 9, 2026 -> next occurrence is Jan 1, 2027.
    const days = daysUntilNextOccurrence(isoDate(2026, 0, 1), TODAY);
    const expectedNextOccurrence = new Date(2027, 0, 1);
    const expectedDiff = Math.ceil((expectedNextOccurrence.getTime() - TODAY.getTime()) / 86400000);
    expect(days).toBe(expectedDiff);
    expect(days).toBeGreaterThan(14); // sanity check it actually rolled to next year, not stayed negative
  });

  it('handles a recurring occasion stored with a birth/founding year in the past', () => {
    // Same rollover behavior should apply regardless of what year is stored
    // (recurring occasions keep their original creation year in the date column).
    const days = daysUntilNextOccurrence(isoDate(1990, 0, 1), TODAY);
    const expectedNextOccurrence = new Date(2027, 0, 1);
    const expectedDiff = Math.ceil((expectedNextOccurrence.getTime() - TODAY.getTime()) / 86400000);
    expect(days).toBe(expectedDiff);
  });

  it('handles Feb 29 by overflowing into Mar 1 in a non-leap year', () => {
    // 2026 and 2027 are not leap years, so "Feb 29" as month=1,day=29
    // overflows to March 1 when constructed via new Date(year, 1, 29).
    // Building "this year's" occurrence (2026) overflows to Mar 1, 2026,
    // which has already passed relative to TODAY (Jul 9, 2026), so it rolls
    // forward another year to Mar 1, 2027.
    const days = daysUntilNextOccurrence(isoDate(2024, 1, 29), TODAY);
    const expectedNextOccurrence = new Date(2027, 1, 29); // overflows to Mar 1, 2027
    expect(expectedNextOccurrence.getMonth()).toBe(2); // March
    expect(expectedNextOccurrence.getDate()).toBe(1);
    const expectedDiff = Math.ceil((expectedNextOccurrence.getTime() - TODAY.getTime()) / 86400000);
    expect(days).toBe(expectedDiff);
  });

  it('correctly matches T-14 for a Feb 29 occasion in an actual leap year', () => {
    // Set "today" to Feb 15 of a leap year (2028), so Feb 29, 2028 is exactly 14 days out.
    const leapYearToday = new Date(2028, 1, 15);
    const days = daysUntilNextOccurrence(isoDate(2000, 1, 29), leapYearToday);
    expect(days).toBe(14);
    expect(isCurationDispatchWindow(isoDate(2000, 1, 29), leapYearToday)).toBe(true);
  });

  it('throws on an unparseable date string', () => {
    expect(() => daysUntilNextOccurrence('not-a-date', TODAY)).toThrow();
  });
});

describe('isCurationDispatchWindow', () => {
  it('is true only at exactly T-14', () => {
    expect(isCurationDispatchWindow(isoDate(2026, 6, 23), TODAY)).toBe(true);
  });
});

describe('mapRecipientToDashboardShape — budgetTier', () => {
  function baseRecipient(budget_tier: string): RecipientRow {
    return {
      id: 'recipient-1',
      profile_id: 'profile-1',
      name: 'Jamie',
      relationship: 'Partner',
      hobbies_and_interest: 'hiking',
      quirks: null,
      dynamic: null,
      budget_tier,
      occasions: [],
    };
  }

  it('passes through the new GiftTier representation unchanged, including LUXURY', () => {
    // Previously LUXURY collapsed into GRAND: db-onboard/route.ts mapped
    // both GRAND and LUXURY to the same '500-1000' range string, and the old
    // read side here mapped anything that wasn't '100-500' to 'GRAND'. Now
    // that budget_tier stores the GiftTier value directly, LUXURY must round-trip.
    expect(mapRecipientToDashboardShape(baseRecipient('LUXURY')).budgetTier).toBe('LUXURY');
    expect(mapRecipientToDashboardShape(baseRecipient('GRAND')).budgetTier).toBe('GRAND');
    expect(mapRecipientToDashboardShape(baseRecipient('CLASSIC')).budgetTier).toBe('CLASSIC');
  });

  it('falls back to the old range-string scheme for any not-yet-migrated legacy rows', () => {
    expect(mapRecipientToDashboardShape(baseRecipient('100-500')).budgetTier).toBe('CLASSIC');
    // '500-1000' could originally have been GRAND or LUXURY under the old
    // scheme — there's no way to recover which, so this conservatively
    // reads as GRAND, matching the one-time data migration's own choice.
    expect(mapRecipientToDashboardShape(baseRecipient('500-1000')).budgetTier).toBe('GRAND');
  });
});
