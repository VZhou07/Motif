import { describe, expect, it, vi } from 'vitest'
import { installOfflineGuard } from './offline'

function fakeWindow() {
  const fetch = vi.fn(async () => new Response('ok'))
  const sendBeacon = vi.fn(function (this: unknown) { return this === win.navigator })
  const win = { fetch, location: { href: 'http://127.0.0.1:4317/app' }, navigator: { sendBeacon } } as unknown as Window & { motifBlockedRequests?: number }
  return { win, fetch, sendBeacon }
}

describe('offline guard (R10 revision 3)', () => {
  it('refuses requests to other origins without touching the network, for every input type', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win)
    await expect(win.fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST' })).rejects.toThrow(/never sends data off this device/)
    await expect(win.fetch(new URL('https://example.com/a'))).rejects.toThrow(TypeError)
    await expect(win.fetch(new Request('https://example.com/b'))).rejects.toThrow(TypeError)
    await expect(win.fetch('//example.com/c')).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
    expect(win.motifBlockedRequests).toBe(4)
  })

  it('passes same-origin, relative, blob and data requests through unchanged', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win)
    await win.fetch('/models/face_landmarker.task')
    await win.fetch('http://127.0.0.1:4317/mediapipe/wasm/x.wasm')
    await win.fetch(new URL('blob:http://127.0.0.1:4317/123'))
    await win.fetch('data:text/plain,hi')
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(win.motifBlockedRequests).toBe(0)
  })

  it('blocks beacons to other origins and keeps navigator as `this` for local ones', () => {
    const { win, sendBeacon } = fakeWindow()
    installOfflineGuard(win)
    expect(win.navigator.sendBeacon('https://example.com/beacon')).toBe(false)
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(win.navigator.sendBeacon('/local')).toBe(true)
    expect(win.motifBlockedRequests).toBe(1)
  })

  it('installs once', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win)
    const guarded = win.fetch
    installOfflineGuard(win)
    expect(win.fetch).toBe(guarded)
    await win.fetch('/ok')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
