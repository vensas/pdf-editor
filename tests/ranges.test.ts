import { describe, expect, it } from 'vitest';
import { formatPageLabel, parseRanges } from '../src/pdf-core/ranges';

describe('parseRanges', () => {
  it('parses single pages into their own groups', () => {
    expect(parseRanges('1, 3, 5', 10)).toEqual([[0], [2], [4]]);
  });

  it('parses ranges into groups of consecutive indices', () => {
    expect(parseRanges('1-3, 8-10', 10)).toEqual([
      [0, 1, 2],
      [7, 8, 9],
    ]);
  });

  it('mixes pages and ranges', () => {
    expect(parseRanges('1-3, 5', 10)).toEqual([[0, 1, 2], [4]]);
  });

  it('tolerates whitespace and empty parts', () => {
    expect(parseRanges('  1 - 2 ,, 4 ', 5)).toEqual([[0, 1], [3]]);
  });

  it('accepts a single-page range like 4-4', () => {
    expect(parseRanges('4-4', 5)).toEqual([[3]]);
  });

  it('rejects empty input', () => {
    expect(() => parseRanges('', 5)).toThrow(/at least one page/i);
    expect(() => parseRanges(' , ', 5)).toThrow(/at least one page/i);
  });

  it('rejects malformed parts', () => {
    expect(() => parseRanges('a-b', 5)).toThrow(/not a valid/i);
    expect(() => parseRanges('1-2-3', 5)).toThrow(/not a valid/i);
    expect(() => parseRanges('-3', 5)).toThrow(/not a valid/i);
  });

  it('rejects zero page numbers', () => {
    expect(() => parseRanges('0-2', 5)).toThrow(/start at 1/i);
  });

  it('rejects reversed ranges with a helpful hint', () => {
    expect(() => parseRanges('5-2', 5)).toThrow(/reversed.*2-5/i);
  });

  it('rejects out-of-range pages and reports the page count', () => {
    expect(() => parseRanges('6', 5)).toThrow(/document has 5 pages/i);
    expect(() => parseRanges('2', 1)).toThrow(/document has 1 page\./i);
  });
});

describe('formatPageLabel', () => {
  it('collapses consecutive runs', () => {
    expect(formatPageLabel([0, 1, 2])).toBe('1-3');
  });

  it('joins non-consecutive parts with underscores', () => {
    expect(formatPageLabel([0, 1, 2, 4])).toBe('1-3_5');
  });

  it('sorts unsorted input', () => {
    expect(formatPageLabel([4, 0, 2, 1])).toBe('1-3_5');
  });

  it('handles single pages and empty input', () => {
    expect(formatPageLabel([6])).toBe('7');
    expect(formatPageLabel([])).toBe('');
  });
});
