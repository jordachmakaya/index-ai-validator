export class InvalidConcurrencyError extends Error {
  override name = 'InvalidConcurrencyError'

  constructor(maxConcurrency: number) {
    super(
      `Invalid max concurrency: ${maxConcurrency}. Provide a positive integer greater than zero.`,
    )
  }
}

export class Semaphore {
  readonly maxConcurrency: number

  private activeCount = 0
  private readonly queue: Array<() => void> = []

  constructor(maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new InvalidConcurrencyError(maxConcurrency)
    }

    this.maxConcurrency = maxConcurrency
  }

  async run<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    await this.acquire()

    try {
      return await task()
    }
    finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1
      return Promise.resolve()
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.activeCount += 1
        resolve()
      })
    })
  }

  private release(): void {
    this.activeCount -= 1

    const next = this.queue.shift()
    if (next) {
      next()
    }
  }
}

export async function runWithConcurrency<Item, Result>(
  items: readonly Item[],
  maxConcurrency: number,
  worker: (item: Item, index: number) => Result | Promise<Result>,
): Promise<Result[]> {
  const semaphore = new Semaphore(maxConcurrency)

  return Promise.all(items.map((item, index) =>
    semaphore.run(() => worker(item, index)),
  ))
}
