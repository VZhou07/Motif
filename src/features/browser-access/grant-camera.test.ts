import { describe, expect, it, vi } from 'vitest';
import { requestCameraGrant } from './grant-camera';

const track = () => ({ stop: vi.fn() });

describe('camera grant page', () => {
  it('stops every track immediately and reads nothing else', async () => {
    const tracks = [track(), track()];
    const getUserMedia = vi.fn(async () => ({ getTracks: () => tracks }) as unknown as MediaStream);
    const result = await requestCameraGrant({ getUserMedia });
    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
  });
  it('reports a denied prompt and a missing camera plainly', async () => {
    const denied = await requestCameraGrant({ getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError'); } });
    expect(denied).toMatchObject({ ok: false });
    expect(denied.message).toMatch(/not allowed/);
    expect((await requestCameraGrant({ getUserMedia: async () => { throw new Error('x'); } })).message).toMatch(/No camera/);
    expect((await requestCameraGrant(undefined)).ok).toBe(false);
  });
});
