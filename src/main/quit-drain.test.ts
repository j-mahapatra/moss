import { afterEach, describe, expect, it, vi } from 'vitest'
import { WriteQueue } from './storage/atomic-write'
import { installQuitDrain } from './quit-drain'

type Listener = (e: { preventDefault(): void }) => void
function fakeApp(): {
  app: Parameters<typeof installQuitDrain>[0]
  fire: () => boolean
  fireWill: () => boolean
  quit: ReturnType<typeof vi.fn>
} {
  const listeners: Record<string, Listener> = {}
  const quit = vi.fn()
  return {
    app: {
      on: (event: 'before-quit' | 'will-quit', l: Listener) => {
        listeners[event] = l
        return undefined
      },
      quit
    },
    fire: () => {
      let prevented = false
      listeners['before-quit']?.({ preventDefault: () => (prevented = true) })
      return prevented
    },
    fireWill: () => {
      let prevented = false
      listeners['will-quit']?.({ preventDefault: () => (prevented = true) })
      return prevented
    },
    quit
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('installQuitDrain', () => {
  it('prevents quit, waits for the queue, runs onDrained, then quits', async () => {
    const queue = new WriteQueue()
    const { app, fire, quit } = fakeApp()
    const order: string[] = []
    installQuitDrain(app, queue, { onDrained: () => void order.push('drained') })
    let release!: () => void
    const write = queue.run('k', () => new Promise<void>((r) => (release = r)))
    expect(fire()).toBe(true)
    await new Promise((r) => setTimeout(r, 10))
    expect(quit).not.toHaveBeenCalled()
    expect(order).toEqual([])
    release()
    await write
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['drained'])
    expect(fire()).toBe(false)
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('quits after the timeout when a write never finishes', async () => {
    vi.useFakeTimers()
    const queue = new WriteQueue()
    const { app, fire, quit } = fakeApp()
    const onDrained = vi.fn()
    installQuitDrain(app, queue, { timeoutMs: 2000, onDrained })
    void queue.run('k', () => new Promise<void>(() => {}))
    expect(fire()).toBe(true)
    await vi.advanceTimersByTimeAsync(1999)
    expect(quit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(onDrained).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(fire()).toBe(false)
  })

  it('clears the timeout timer once the queue is idle', async () => {
    vi.useFakeTimers()
    const { app, fire, quit } = fakeApp()
    installQuitDrain(app, new WriteQueue())
    fire()
    await vi.advanceTimersByTimeAsync(0)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still quits when onDrained throws, and does not start a second drain mid-wait', async () => {
    const queue = new WriteQueue()
    const { app, fire, quit } = fakeApp()
    installQuitDrain(app, queue, {
      onDrained: () => {
        throw new Error('dispose failed')
      }
    })
    let release!: () => void
    const write = queue.run('k', () => new Promise<void>((r) => (release = r)))
    await Promise.resolve()
    expect(fire()).toBe(true)
    expect(fire()).toBe(true)
    release()
    await write
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
  })

  it('waits for work enqueued by onDrained before quitting', async () => {
    const queue = new WriteQueue()
    const { app, fire, quit } = fakeApp()
    let release!: () => void
    installQuitDrain(app, queue, {
      onDrained: () => void queue.run('late', () => new Promise<void>((r) => (release = r)))
    })
    fire()
    await new Promise((r) => setTimeout(r, 10))
    expect(quit).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
  })

  it('caps the total wait at timeoutMs even when onDrained enqueues stuck work', async () => {
    vi.useFakeTimers()
    const queue = new WriteQueue()
    const { app, fire, quit } = fakeApp()
    installQuitDrain(app, queue, {
      timeoutMs: 1000,
      onDrained: () => void queue.run('late', () => new Promise<void>(() => {}))
    })
    void queue.run('k', async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    fire()
    await vi.advanceTimersByTimeAsync(999)
    expect(quit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds will-quit until a write queued after the windows closed has landed', async () => {
    const queue = new WriteQueue()
    const { app, fireWill, quit } = fakeApp()
    installQuitDrain(app, queue)
    let release!: () => void
    const write = queue.run('k', () => new Promise<void>((r) => (release = r)))
    expect(fireWill()).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(quit).not.toHaveBeenCalled()
    release()
    await write
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
    expect(fireWill()).toBe(false)
  })
})
