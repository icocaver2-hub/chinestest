import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash } from '../../src/app/router';

describe('Hashルーティング', () => {
  it.each([
    ['', { name: 'home' }],
    ['#', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/scenarios', { name: 'scenarios' }],
    ['#/scenarios/', { name: 'scenarios' }],
    ['#/scenarios/family-meal', { name: 'scenario', id: 'family-meal' }],
    ['#/scenarios/family-meal/talk', { name: 'scenario_talk', id: 'family-meal' }],
    ['#/session/abc-123', { name: 'session', id: 'abc-123' }],
    ['#/practice', { name: 'practice' }],
    ['#/review', { name: 'review' }],
    ['#/materials', { name: 'materials' }],
    ['#/settings', { name: 'settings' }],
    ['#/history', { name: 'history' }],
    ['#/settings?x=1', { name: 'settings' }],
  ])('%s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it('未知のURLや不正なIDはnot_found', () => {
    expect(parseHash('#/unknown').name).toBe('not_found');
    expect(parseHash('#/scenarios/Bad%20Id').name).toBe('not_found');
    expect(parseHash('#/scenarios/%E0%A4%A').name).toBe('not_found');
    expect(parseHash('#/scenarios/a/b').name).toBe('not_found');
    expect(parseHash('#/scenarios/a/talk/x').name).toBe('not_found');
  });

  it('hrefForとparseHashが往復する', () => {
    expect(parseHash(hrefFor({ name: 'scenario', id: 'family-meal' }))).toEqual({ name: 'scenario', id: 'family-meal' });
    expect(hrefFor({ name: 'home' })).toBe('#/');
  });
});
