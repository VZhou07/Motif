import type { FeatureFrame } from '../domain/types'
import { extractFeatureFrame, type FaceResult } from './extractFeatures'

export type TrackerErrorCode = 'unsupported' | 'model' | 'permission' | 'camera' | 'playback' | 'inference'

export class TrackerError extends Error {
  constructor(public readonly code: TrackerErrorCode, message: string) {
    super(message)
    this.name = 'TrackerError'
  }
}

export interface FaceDetector {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceResult
  close(): void
}

/** Runtime adapters are injectable for tests; production always uses a camera. */
export interface TrackerRuntime {
  createDetector(): Promise<FaceDetector>
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(id: number): void
  now(): number
  isHidden(): boolean
}

async function createLocalDetector(): Promise<FaceDetector> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  })
}

const defaults: TrackerRuntime = {
  createDetector: createLocalDetector,
  getUserMedia: (constraints) => {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new TrackerError('unsupported', 'Camera access needs desktop Chrome or Edge on localhost or HTTPS.'))
    return navigator.mediaDevices.getUserMedia(constraints)
  },
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  isHidden: () => document.hidden,
}

const FRAME_INTERVAL_MS = 1000 / 15
const MAX_FRAME_AGE_MS = 250

/** Local MediaPipe camera lifecycle with no frame storage or network upload. */
export class FaceTracker {
  private readonly runtime: TrackerRuntime
  private generation = 0
  private stream: MediaStream | null = null
  private detector: FaceDetector | null = null
  private video: HTMLVideoElement | null = null
  private frameRequest: number | null = null
  private removeTrackListeners: (() => void) | null = null

  constructor(runtime: Partial<TrackerRuntime> = {}) {
    this.runtime = { ...defaults, ...runtime }
  }

  async start(video: HTMLVideoElement, onFrame: (frame: FeatureFrame) => void, onError: (error: TrackerError) => void): Promise<void> {
    this.stop()
    const generation = this.generation
    let stage: TrackerErrorCode = 'model'
    try {
      const detector = await this.runtime.createDetector()
      if (generation !== this.generation) { detector.close(); return }
      this.detector = detector
      stage = 'camera'
      const stream = await this.runtime.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      })
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return }
      this.stream = stream
      this.video = video
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      stage = 'playback'
      await video.play()
      if (generation !== this.generation) return

      const reportFailure = (error: TrackerError) => {
        if (generation !== this.generation) return
        onFrame({ timestampMs: this.runtime.now(), tracking: 'invalid', values: {} })
        this.stop()
        onError(error)
      }
      const ended = () => reportFailure(new TrackerError('camera', 'The camera stopped. Retry camera access or use assisted input.'))
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', ended))
      this.removeTrackListeners = () => stream.getVideoTracks().forEach((track) => track.removeEventListener('ended', ended))

      let lastInference = -Infinity
      let lastVideoTime = -1
      let lastFreshFrame = this.runtime.now()
      let lastStaleReport = -Infinity
      const loop = () => {
        if (generation !== this.generation) return
        const now = this.runtime.now()
        const hidden = this.runtime.isHidden()
        const validVideoTime = Number.isFinite(video.currentTime) && video.currentTime >= 0
        const reversedVideoTime = video.currentTime < lastVideoTime
        const ready = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && validVideoTime
        const newFrame = ready && video.currentTime > lastVideoTime
        if (hidden || !ready || !newFrame) {
          if ((hidden || !validVideoTime || reversedVideoTime || now - lastFreshFrame > MAX_FRAME_AGE_MS) && now - lastStaleReport >= MAX_FRAME_AGE_MS) {
            onFrame({ timestampMs: now, tracking: 'stale', values: {} })
            lastStaleReport = now
          }
        } else if (now - lastInference >= FRAME_INTERVAL_MS) {
          lastInference = now
          lastVideoTime = video.currentTime
          try {
            const result = detector.detectForVideo(video, now)
            if (generation !== this.generation) return
            lastFreshFrame = now
            onFrame(this.runtime.now() - now > MAX_FRAME_AGE_MS
              ? { timestampMs: now, tracking: 'stale', values: {} }
              : extractFeatureFrame(result, now))
          } catch {
            reportFailure(new TrackerError('inference', 'Face tracking could not continue. Retry the camera or use assisted input.'))
            return
          }
        }
        if (generation === this.generation) this.frameRequest = this.runtime.requestFrame(loop)
      }
      this.frameRequest = this.runtime.requestFrame(loop)
    } catch (cause) {
      if (generation !== this.generation) return
      this.stop()
      const error = normalizeError(cause, stage)
      onError(error)
      throw error
    }
  }

  stop(): void {
    this.generation += 1
    if (this.frameRequest !== null) this.runtime.cancelFrame(this.frameRequest)
    this.frameRequest = null
    this.removeTrackListeners?.()
    this.removeTrackListeners = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
    }
    this.video = null
    this.detector?.close()
    this.detector = null
  }
}

function normalizeError(cause: unknown, stage: TrackerErrorCode): TrackerError {
  if (cause instanceof TrackerError) return cause
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return new TrackerError('permission', 'Camera permission was not granted. You can retry or choose assisted input.')
  if (stage === 'model') return new TrackerError('model', 'The local face model could not load. Check model assets and retry; assisted input is available.')
  if (stage === 'playback') return new TrackerError('playback', 'The camera preview could not start. Retry the camera or choose assisted input.')
  if (name === 'NotReadableError' || name === 'TrackStartError') return new TrackerError('camera', 'The camera may be in use by another app. Close it and retry, or choose assisted input.')
  return new TrackerError('camera', 'No usable camera was found. Check the camera connection or choose assisted input.')
}
