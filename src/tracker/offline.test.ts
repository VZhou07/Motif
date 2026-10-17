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

describe('deliberately configured care traffic (R16)', () => {
  const origin = 'https://project123.supabase.co'
  const config = { url: origin, publishableKey: 'sb_publishable_test_public_key_1234567890' }

  it('allows only the configured Auth/REST API and prevents redirect escape', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win, config)
    await win.fetch(`${origin}/auth/v1/token?grant_type=password`, { method: 'POST' })
    await win.fetch(new URL(`${origin}/rest/v1/rpc/motif_access`))
    await win.fetch(new Request(`${origin}/rest/v1/care_requests`), { redirect: 'follow' })
    expect(fetch).toHaveBeenCalledTimes(3)
    for (const call of fetch.mock.calls as unknown as [unknown, RequestInit][]) expect(call[1].redirect).toBe('error')
    expect(win.motifBlockedRequests).toBe(0)
  })

  it.each([
    'https://different.supabase.co/rest/v1/care_requests',
    'https://project123.supabase.co.evil.test/auth/v1/token',
    'https://person:password@project123.supabase.co/auth/v1/token',
    `${origin}/storage/v1/object`, `${origin}/realtime/v1/websocket`, `${origin}/auth/v10/token`,
    `${origin}/rest/v1`, `${origin}/rest/v1/../../storage/v1/object`,
    'https://odml.pa.googleapis.com/v1/log',
  ])('refuses unapproved connection %s before touching the network', async (url) => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win, config)
    await expect(win.fetch(url)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
    expect(win.motifBlockedRequests).toBe(1)
  })

  it('never permits remote beacons, even to the configured project', () => {
    const { win, sendBeacon } = fakeWindow()
    installOfflineGuard(win, config)
    expect(win.navigator.sendBeacon(`${origin}/rest/v1/care_requests`, 'private')).toBe(false)
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('validates URL-like objects from another realm by their actual URL', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win, config)
    const otherRealmUrl = { toString: () => 'https://evil.test/collect' } as unknown as URL
    await expect(win.fetch(otherRealmUrl)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not broaden permissions for forged or later replacement configuration', async () => {
    const { win, fetch } = fakeWindow()
    installOfflineGuard(win, { url: 'https://evil.test', publishableKey: config.publishableKey })
    await expect(win.fetch('https://evil.test/auth/v1/token')).rejects.toThrow(TypeError)
    installOfflineGuard(win, config)
    await expect(win.fetch(`${origin}/auth/v1/token`)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
