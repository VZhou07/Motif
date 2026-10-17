import { describe, expect, it } from 'vitest';
import { parseRoute } from './route';

describe('parseRoute', () => {
  it('opens the caregiver surface only for the exact caregiver hash', () => {
    expect(parseRoute('#/caregiver')).toBe('caregiver');
    expect(parseRoute('#/caregiver/')).toBe('caregiver');
  });

  it('treats every other hash, including the skip link and lookalikes, as the participant surface', () => {
    for (const hash of ['', '#', '#/', '#main-content', '#caregiver', '#/caregiver/x', '#/CAREGIVER', '#/caregiver?as=admin', '#/caregiver#', ' #/caregiver']) {
      expect(parseRoute(hash), hash).toBe('participant');
    }
  });
});
