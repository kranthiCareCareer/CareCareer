import { describe, expect, it } from 'vitest';

import { add, err, getFirst, ok, safeParseJson } from './index.js';

describe('engineering-smoke-test', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(add(-1, 1)).toBe(0);
    });

    it('should handle zero', () => {
      expect(add(0, 0)).toBe(0);
    });
  });

  describe('getFirst', () => {
    it('should return the first element', () => {
      const result = getFirst(['a', 'b', 'c']);
      expect(result).toBe('a');
    });

    it('should return undefined for empty array', () => {
      const result = getFirst([]);
      expect(result).toBeUndefined();
    });
  });

  describe('safeParseJson', () => {
    it('should parse valid JSON', () => {
      const result = safeParseJson('{"key":"value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should return undefined for invalid JSON', () => {
      const result = safeParseJson('not json');
      expect(result).toBeUndefined();
    });

    it('should parse arrays', () => {
      const result = safeParseJson('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('Result type', () => {
    it('should create ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should create error result', () => {
      const result = err(new Error('failed'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('failed');
      }
    });
  });
});
