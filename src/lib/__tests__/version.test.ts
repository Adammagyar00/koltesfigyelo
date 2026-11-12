import { describe, expect, it } from 'vitest';

import { compareVersions } from '../version';

describe('compareVersions', () => {
  it.each([
    ['v1.0.2', '1.0.1', 1],
    ['1.0.1', '1.0.1', 0],
    ['1.0.1', '1.0.10', -1],
    ['1.10.0', '1.9.9', 1],
    ['2.0', '1.9.9', 1],
    ['v1.0.0', 'v1.0.0-beta', 0],
  ])('%s vs %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});
