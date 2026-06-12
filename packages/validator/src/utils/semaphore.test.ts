import { describe, expect, test } from 'vitest'

import { runWithConcurrency } from './semaphore'

describe('runWithConcurrency', () => {
  test('respects the configured concurrency cap', async () => {
    let activeCount = 0
    let highestActiveCount = 0

    const results = await runWithConcurrency([1, 2, 3, 4], 2, async value => {
      activeCount += 1
      highestActiveCount = Math.max(highestActiveCount, activeCount)

      await delay(5)

      activeCount -= 1
      return value * 2
    })

    expect(highestActiveCount).toBeLessThanOrEqual(2)
    expect(results).toEqual([2, 4, 6, 8])
  })

  test('propagates worker errors', async () => {
    await expect(
      runWithConcurrency([1, 2], 1, async value => {
        if (value === 2) {
          throw new Error('worker failed')
        }

        return value
      }),
    ).rejects.toThrow('worker failed')
  })
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
