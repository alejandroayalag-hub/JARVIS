import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayIn, periodsDue } from '../src/periodos.js';

test('dayIn recorta al último día del mes', () => {
  assert.equal(dayIn('2027-02', 31), '2027-02-28');
  assert.equal(dayIn('2028-02', 31), '2028-02-29');
  assert.equal(dayIn('2026-11', 30), '2026-11-30');
  assert.equal(dayIn('2026-11', 5), '2026-11-05');
});

test('periodsDue bimestral', () => {
  const p = { every_months: 2, start_month: '2026-10' };
  assert.deepEqual(periodsDue(p, '2026-10', '2027-03'), ['2026-10', '2026-12', '2027-02']);
});

test('periodsDue anual y nada antes del inicio', () => {
  const p = { every_months: 1 * 12, start_month: '2026-03' };
  assert.deepEqual(periodsDue(p, '2026-01', '2027-12'), ['2026-03', '2027-03']);
});
