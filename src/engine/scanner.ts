export interface ScanSnapshot {
  index: number
  target?: string
  latchedTarget?: string
  suspended: boolean
  paused: boolean
  intervalMs: number
}

/** Browser-independent scanner. The orchestrator maps recognized actions into these methods. */
export class ScanController {
  private targets: string[]
  private index = 0
  private intervalMs: number
  private deadlineMs: number
  private latchedTarget: string | undefined
  /** Time left on the highlighted target when the current latch began. */
  private latchRemainingMs: number | undefined
  private suspended = false
  private paused = false

  constructor(targets: readonly string[], intervalMs = 2_000, nowMs = 0) {
    this.targets = [...targets]
    this.intervalMs = this.validInterval(intervalMs)
    this.deadlineMs = nowMs + this.intervalMs
  }

  get snapshot(): ScanSnapshot {
    return { index: this.index, target: this.targets[this.index], latchedTarget: this.latchedTarget,
      suspended: this.suspended, paused: this.paused, intervalMs: this.intervalMs }
  }

  private validInterval(intervalMs: number): number {
    return Number.isFinite(intervalMs) ? Math.max(500, Math.min(8_000, intervalMs)) : 2_000
  }

  private resetDeadline(nowMs: number): void { this.deadlineMs = nowMs + this.intervalMs }

  tick(nowMs: number): ScanSnapshot {
    if (Number.isFinite(nowMs) && !this.suspended && !this.paused && !this.latchedTarget
      && this.targets.length > 0 && nowMs >= this.deadlineMs) {
      this.index = (this.index + 1) % this.targets.length
      this.resetDeadline(nowMs)
    }
    return this.snapshot
  }

  beginSelection(nowMs: number): void {
    if (this.suspended || this.paused) return
    this.latchedTarget = this.targets[this.index]
    this.latchRemainingMs = Number.isFinite(nowMs) ? Math.max(0, this.deadlineMs - nowMs) : undefined
  }

  cancelSelection(nowMs: number): void {
    this.latchedTarget = undefined
    this.latchRemainingMs = undefined
    this.resetDeadline(nowMs)
  }

  /**
   * The person let go before the hold completed (for example an ordinary blink): continue the
   * highlighted target with the time it had left, at least 0.5 s. Every other cancel restarts.
   */
  abandonSelection(nowMs: number): void {
    const remaining = this.latchRemainingMs
    const latched = this.latchedTarget !== undefined
    this.cancelSelection(nowMs)
    if (latched && remaining !== undefined && Number.isFinite(nowMs)) this.deadlineMs = nowMs + Math.max(remaining, 500)
  }

  commitSelection(nowMs: number): string | undefined {
    const selected = !this.suspended && !this.paused ? this.latchedTarget : undefined
    this.cancelSelection(nowMs)
    return selected
  }

  move(delta: 1 | -1, nowMs: number): void {
    this.cancelSelection(nowMs)
    if (!this.suspended && !this.paused && this.targets.length) {
      this.index = (this.index + delta + this.targets.length) % this.targets.length
    }
  }

  setTargets(targets: readonly string[], nowMs: number): void {
    this.targets = [...targets]
    this.index = 0
    this.cancelSelection(nowMs)
  }

  setInterval(intervalMs: number, nowMs: number): void {
    this.intervalMs = this.validInterval(intervalMs)
    this.cancelSelection(nowMs)
  }

  setSuspended(value: boolean, nowMs: number): void {
    if (this.suspended === value) return
    this.suspended = value
    this.cancelSelection(nowMs)
  }

  setPaused(value: boolean, nowMs: number): void {
    if (this.paused === value) return
    this.paused = value
    this.cancelSelection(nowMs)
  }
}
