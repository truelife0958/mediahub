import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDashboardClock } from '../src/utils/dashboardClock.ts';

describe('dashboard clock helpers', () => {
  it('formats dashboard date and time for the top bar', () => {
    const result = formatDashboardClock(new Date('2026-06-26T08:09:05+08:00'));

    assert.equal(result.date, '2026-06-26');
    assert.equal(result.time, '08:09:05');
    assert.equal(result.weekday, '周五');
  });
});
