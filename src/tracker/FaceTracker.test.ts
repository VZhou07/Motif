import { describe, expect, it, vi } from 'vitest'
import { FaceTracker, TrackerError, type FaceDetector, type TrackerRuntime } from './FaceTracker'
import { BLENDSHAPE_FEATURES, type FaceResult } from './extractFeatures'

function fixture(): FaceResult {
  return {
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    faceBlendshapes: [{ categories: BLENDSHAPE_FEATURES.map((categoryName) => ({ categoryName, score: 0.1 })) }],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1] }],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

function harness(overrides: Partial<TrackerRuntime> = {}) {
  let now = 0
  let hidden = false
  let requestId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const track = Object.assign(new EventTarget(), { stop: vi.fn() }) as unknown as MediaStreamTrack
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  const video = {
    srcObject: null,
    muted: false,
    playsInline: false,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 0,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement
  const detector = { detectForVideo: vi.fn(() => fixture()), close: vi.fn() }
  const runtime: TrackerRuntime = {
    createDetector: vi.fn(async () => detector),
    getUserMedia: vi.fn(async () => stream),
    requestFrame: vi.fn((callback) => { callbacks.set(++requestId, callback); return requestId }),
    cancelFrame: vi.fn((id) => { callbacks.delete(id) }),
    now: () => now,
    isHidden: () => hidden,
    ...overrides,
  }
  const tracker = new FaceTracker(runtime)
  const onFrame = vi.fn()
  const onError = vi.fn()
  return {
    tracker, runtime, detector, stream, track, video, callbacks, onFrame, onError,
    setNow: (time: number) => { now = time },
    setHidden: (value: boolean) => { hidden = value },
    start: () => tracker.start(video, onFrame, onError),
    tick: (time: number, videoTime = video.currentTime) => {
      now = time
      video.currentTime = videoTime
      const first = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!first) throw new Error('No scheduled frame')
      callbacks.delete(first[0])
      first[1](time)
    },
  }
}

describe('camera lifecycle', () => {
  it('requests video only and closes tracks, model, video and callbacks on stop', async () => {
    const h = harness()
    await h.start()
    expect(h.runtime.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    expect(h.video.srcObject).toBe(h.stream)
    expect(h.video.muted).toBe(true)
    h.tick(1, 0)
    expect(h.onFrame).toHaveBeenCalledWith(expect.objectContaining({ timestampMs: 1, tracking: 'tracked' }))
    h.tracker.stop()
    expect(h.track.stop).toHaveBeenCalledTimes(1)
    expect(h.detector.close).toHaveBeenCalledTimes(1)
    expect(h.video.srcObject).toBeNull()
    expect(h.video.pause).toHaveBeenCalledTimes(1)
    expect(h.callbacks.size).toBe(0)
    h.tracker.stop()
    expect(h.detector.close).toHaveBeenCalledTimes(1)
  })

  it('reports camera denial and releases the already loaded model', async () => {
    const denial = new Error('Denied')
    denial.name = 'NotAllowedError'
    const h = harness({ getUserMedia: async () => { throw denial } })
    await expect(h.start()).rejects.toMatchObject({ code: 'permission' })
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'permission' }))
    expect(h.detector.close).toHaveBeenCalledTimes(1)
    expect(h.onFrame).not.toHaveBeenCalled()
    expect(h.callbacks.size).toBe(0)
  })

  it('fails visibly when model assets cannot load and never requests the camera', async () => {
    const h = harness({ createDetector: async () => { throw new Error('404') } })
    await expect(h.start()).rejects.toMatchObject({ code: 'model' })
    expect(h.runtime.getUserMedia).not.toHaveBeenCalled()
    expect(h.onError).toHaveBeenCalledWith(expect.any(TrackerError))
  })

  it('closes a late loaded model after cancellation without opening the camera', async () => {
    const pending = deferred<FaceDetector>()
    const h = harness({ createDetector: () => pending.promise })
    const starting = h.start()
    h.tracker.stop()
    pending.resolve(h.detector)
    await starting
    expect(h.detector.close).toHaveBeenCalledTimes(1)
    expect(h.runtime.getUserMedia).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('stops a late permission stream and closes model immediately during cancellation', async () => {
    const pending = deferred<MediaStream>()
    const h = harness({ getUserMedia: () => pending.promise })
    const starting = h.start()
    await Promise.resolve()
    h.tracker.stop()
    expect(h.detector.close).toHaveBeenCalledTimes(1)
    pending.resolve(h.stream)
    await starting
    expect(h.track.stop).toHaveBeenCalledTimes(1)
    expect(h.video.srcObject).toBeNull()
    expect(h.callbacks.size).toBe(0)
  })

  it('releases an acquired stream immediately even while video.play is pending', async () => {
    const pending = deferred<void>()
    const h = harness()
    h.video.play = vi.fn(() => pending.promise)
    const starting = h.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.video.srcObject).toBe(h.stream)
    h.tracker.stop()
    expect(h.track.stop).toHaveBeenCalledTimes(1)
    expect(h.video.srcObject).toBeNull()
    pending.resolve()
    await starting
    expect(h.callbacks.size).toBe(0)
  })

  it('cleans up playback failures and permits a fresh retry', async () => {
    const h = harness()
    h.video.play = vi.fn(async () => { throw new Error('Playback blocked') })
    await expect(h.start()).rejects.toMatchObject({ code: 'playback' })
    expect(h.track.stop).toHaveBeenCalledTimes(1)
    h.video.play = vi.fn(async () => {})
    await h.start()
    h.tick(1, 0)
    expect(h.onFrame).toHaveBeenCalledTimes(1)
    h.tracker.stop()
  })

  it('invalidates and releases everything when the camera track ends', async () => {
    const h = harness()
    await h.start()
    h.track.dispatchEvent(new Event('ended'))
    expect(h.onFrame).toHaveBeenCalledWith(expect.objectContaining({ tracking: 'invalid', values: {} }))
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'camera' }))
    expect(h.callbacks.size).toBe(0)
    expect(h.detector.close).toHaveBeenCalledTimes(1)
  })
})

describe('inference scheduling', () => {
  it('caps rate, skips duplicate frames, and never builds a backlog', async () => {
    const h = harness()
    await h.start()
    h.tick(1, 0)
    h.tick(30, 0.033)
    h.tick(70, 0.066)
    h.tick(150, 0.066)
    expect(h.detector.detectForVideo).toHaveBeenCalledTimes(2)
    expect(h.callbacks.size).toBe(1)
    h.tracker.stop()
  })

  it('emits stale invalidity when the camera stops producing new frames', async () => {
    const h = harness()
    await h.start()
    h.tick(1, 0)
    h.tick(300, 0)
    expect(h.onFrame).toHaveBeenLastCalledWith({ timestampMs: 300, tracking: 'stale', values: {} })
    expect(h.detector.detectForVideo).toHaveBeenCalledTimes(1)
    h.tracker.stop()
  })

  it('rejects backward video time without inferring an older frame', async () => {
    const h = harness()
    await h.start()
    h.tick(1, 1)
    h.tick(100, 0.5)
    expect(h.detector.detectForVideo).toHaveBeenCalledTimes(1)
    expect(h.onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ tracking: 'stale', values: {} }))
    h.tracker.stop()
  })

  it('never infers while hidden and resumes only with a newly observed frame', async () => {
    const h = harness()
    await h.start()
    h.setHidden(true)
    h.tick(1, 0)
    expect(h.detector.detectForVideo).not.toHaveBeenCalled()
    expect(h.onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ tracking: 'stale' }))
    h.setHidden(false)
    h.tick(100, 0.1)
    expect(h.onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ tracking: 'tracked' }))
    h.tracker.stop()
  })

  it('rejects an inference that returns too late without disguising its capture time', async () => {
    const h = harness()
    h.detector.detectForVideo.mockImplementation(() => { h.setNow(301); return fixture() })
    await h.start()
    h.tick(1, 0)
    expect(h.onFrame).toHaveBeenLastCalledWith({ timestampMs: 1, tracking: 'stale', values: {} })
    h.tracker.stop()
  })

  it('stops and reports inference errors rather than retaining valid old values', async () => {
    const h = harness()
    h.detector.detectForVideo.mockImplementation(() => { throw new Error('Inference failed') })
    await h.start()
    h.tick(1, 0)
    expect(h.onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ tracking: 'invalid', values: {} }))
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'inference' }))
    expect(h.track.stop).toHaveBeenCalledTimes(1)
    expect(h.callbacks.size).toBe(0)
  })
})
