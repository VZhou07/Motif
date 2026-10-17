import { describe, expect, it } from 'vitest'
import { GestureRuntime } from './recognition'
import { ScanController } from './scanner'
import { stream, testModel } from './fixtures.test-support'

describe('deterministic scanning', () => {
  it('latches the visible target when activation dwell spans a scan boundary', () => {
    const scanner = new ScanController(['water', 'help'], 2_000, 0)
    const runtime = new GestureRuntime(testModel)
    const selections: string[] = []
    for (const frame of stream(1_000, 750)) runtime.step(frame)
    for (const frame of stream(1_800, 500, { browOuterUpLeft: 0.8 })) {
      const update = runtime.step(frame)
      if (update.started) scanner.beginSelection(frame.timestampMs)
      scanner.tick(frame.timestampMs)
      if (update.event) selections.push(scanner.commitSelection(frame.timestampMs)!)
    }
    expect(scanner.snapshot.target).toBe('water')
    expect(selections).toEqual(['water'])
    expect(scanner.tick(4_300).target).toBe('help')
  })

  it('discards canceled latches and never selects while paused or suspended', () => {
    const scanner = new ScanController(['a', 'b'])
    scanner.beginSelection(1_900)
    scanner.cancelSelection(2_100)
    expect(scanner.commitSelection(2_200)).toBeUndefined()
    scanner.beginSelection(2_300)
    scanner.setSuspended(true, 2_400)
    expect(scanner.commitSelection(2_500)).toBeUndefined()
    scanner.setSuspended(false, 3_000)
    scanner.beginSelection(3_100)
    scanner.setPaused(true, 3_200)
    expect(scanner.commitSelection(3_300)).toBeUndefined()
    expect(scanner.tick(30_000).target).toBe('a')
    scanner.setPaused(false, 31_000)
    expect(scanner.tick(31_100).target).toBe('a')
  })

  it('never catches up multiple targets after a delayed tick or recovery', () => {
    const scanner = new ScanController(['a', 'b', 'c'])
    expect(scanner.tick(30_000).target).toBe('b')
    expect(scanner.tick(30_001).target).toBe('b')
    scanner.setSuspended(true, 30_100)
    scanner.setSuspended(false, 60_000)
    expect(scanner.tick(60_001).target).toBe('b')
  })

  it('keeps deadlines and pending latches when unchanged safety setters repeat', () => {
    const scanner = new ScanController(['a', 'b'])
    scanner.setSuspended(false, 1_900)
    scanner.setPaused(false, 1_900)
    expect(scanner.tick(2_000).target).toBe('b')
    scanner.beginSelection(2_100)
    scanner.setSuspended(false, 2_150)
    scanner.setPaused(false, 2_150)
    expect(scanner.commitSelection(2_400)).toBe('b')
  })

  it('supports next/previous and safe target or speed changes', () => {
    const scanner = new ScanController(['a', 'b', 'c'])
    scanner.move(-1, 0)
    expect(scanner.snapshot.target).toBe('c')
    scanner.beginSelection(100)
    scanner.setTargets(['comfort', 'retry'], 200)
    expect(scanner.commitSelection(300)).toBeUndefined()
    scanner.setInterval(500, 400)
    expect(scanner.tick(899).target).toBe('comfort')
    expect(scanner.tick(900).target).toBe('retry')
    scanner.setTargets([], 1_000)
    expect(scanner.tick(100_000).target).toBeUndefined()
  })
})
