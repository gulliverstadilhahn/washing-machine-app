import { describe, expect, it } from 'vitest'
import {
  addDays,
  copenhagenDate,
  copenhagenWallTime,
  formatTime,
  slotBounds,
  slotLabel,
} from './time'

describe('copenhagenWallTime', () => {
  it('resolves summer time (UTC+2)', () => {
    expect(copenhagenWallTime('2026-08-05', 7).toISOString()).toBe('2026-08-05T05:00:00.000Z')
  })

  it('resolves winter time (UTC+1)', () => {
    expect(copenhagenWallTime('2026-01-15', 7).toISOString()).toBe('2026-01-15T06:00:00.000Z')
  })

  it('resolves the day the clocks go forward', () => {
    // 29 March 2026: 02:00 becomes 03:00. Every slot is after the change.
    expect(copenhagenWallTime('2026-03-29', 7).toISOString()).toBe('2026-03-29T05:00:00.000Z')
  })

  it('resolves the day the clocks go back', () => {
    // 25 October 2026: 03:00 becomes 02:00. Every slot is after the change.
    expect(copenhagenWallTime('2026-10-25', 7).toISOString()).toBe('2026-10-25T06:00:00.000Z')
  })
})

describe('slotBounds', () => {
  it('gives three-hour slots in Copenhagen wall-clock time', () => {
    const { startsAt, endsAt } = slotBounds('2026-08-05', 1)
    expect(startsAt.toISOString()).toBe('2026-08-05T05:00:00.000Z')
    expect(endsAt.toISOString()).toBe('2026-08-05T08:00:00.000Z')
  })

  it('keeps the last slot ending at 22:00 local in winter', () => {
    const { endsAt } = slotBounds('2026-01-15', 5)
    expect(formatTime(endsAt)).toBe('22:00')
  })

  it('stays three hours long across the spring change', () => {
    // The change happens at 02:00, outside every slot, so no slot is short.
    for (const index of [1, 2, 3, 4, 5] as const) {
      const { startsAt, endsAt } = slotBounds('2026-03-29', index)
      expect(endsAt.getTime() - startsAt.getTime()).toBe(3 * 60 * 60 * 1000)
    }
  })
})

describe('copenhagenDate', () => {
  it('uses Copenhagen, not UTC, near midnight', () => {
    // 22:30 UTC in August is 00:30 the next day in Copenhagen.
    expect(copenhagenDate(new Date('2026-08-05T22:30:00Z'))).toBe('2026-08-06')
  })

  it('uses Copenhagen, not UTC, just before midnight local', () => {
    expect(copenhagenDate(new Date('2026-08-05T21:30:00Z'))).toBe('2026-08-05')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-25', 14)).toBe('2026-09-08')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-28', 14)).toBe('2027-01-11')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('slotLabel', () => {
  it('labels every slot', () => {
    expect([1, 2, 3, 4, 5].map((i) => slotLabel(i as 1))).toEqual([
      '07:00–10:00',
      '10:00–13:00',
      '13:00–16:00',
      '16:00–19:00',
      '19:00–22:00',
    ])
  })
})

describe('formatTime', () => {
  it('formats in Copenhagen regardless of the runtime timezone', () => {
    expect(formatTime('2026-08-05T05:45:00Z')).toBe('07:45')
  })
})
