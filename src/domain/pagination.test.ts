import { describe, expect, it } from 'vitest';
import { getPagination } from './pagination';

describe('bounded pagination', () => {
  it('gives an honest empty range while keeping navigation on its only page', () => {
    expect(getPagination(0, 8, 20)).toEqual({ page: 1, pageSize: 20, pageCount: 1,
      totalItems: 0, startIndex: 0, endIndex: 0, from: 0, to: 0 });
  });

  it('does not add an empty last page for exact page multiples', () => {
    expect(getPagination(40, 2, 20)).toMatchObject({ page: 2, pageCount: 2,
      startIndex: 20, endIndex: 40, from: 21, to: 40 });
    expect(getPagination(41, 3, 20)).toMatchObject({ page: 3, pageCount: 3,
      startIndex: 40, endIndex: 41, from: 41, to: 41 });
  });

  it('clamps an old last page when reports shrink and preserves valid pages when reports grow', () => {
    const current = getPagination(300, 15, 20);
    const shrunken = getPagination(41, current.page, 20);
    expect(shrunken).toMatchObject({ page: 3, from: 41, to: 41 });
    expect(getPagination(301, shrunken.page, 20)).toMatchObject({ page: 3, from: 41, to: 60 });
    expect(getPagination(301, 7, 20).page).toBe(7);
  });

  it.each([1, 19, 20, 21, 100, 257, 300, 1001])('visits all %i records exactly once across pages', (count) => {
    const source = Array.from({ length: count }, (_, index) => `run-${index}`);
    const visited: string[] = [];
    const { pageCount } = getPagination(source.length, 1, 20);
    for (let page = 1; page <= pageCount; page += 1) {
      const range = getPagination(source.length, page, 20);
      const visible = source.slice(range.startIndex, range.endIndex);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThanOrEqual(20);
      visited.push(...visible);
    }
    expect(visited).toEqual(source);
    expect(new Set(visited).size).toBe(count);
  });

  it('uses the same boundaries for a 12-seat office and a 10-event timeline', () => {
    expect(getPagination(100, 9, 12)).toMatchObject({ pageCount: 9, from: 97, to: 100 });
    expect(getPagination(200, 20, 10)).toMatchObject({ pageCount: 20, from: 191, to: 200 });
  });

  it('normalizes invalid inputs without negative slice bounds or non-finite navigation', () => {
    expect(getPagination(-5, -2, 0)).toMatchObject({ page: 1, pageSize: 1, totalItems: 0, startIndex: 0 });
    expect(getPagination(30.9, 2.8, 10.7)).toMatchObject({ page: 2, pageSize: 10, totalItems: 30, from: 11, to: 20 });
    expect(getPagination(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)).toMatchObject({ page: 1, pageSize: 20, pageCount: 1, totalItems: 0 });
  });
});
