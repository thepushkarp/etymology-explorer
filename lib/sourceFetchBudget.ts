import { AsyncLocalStorage } from 'node:async_hooks'

const sourceBudget = new AsyncLocalStorage<SourceFetchBudget>()

export class SourceFetchBudgetExceeded extends Error {
  constructor() {
    super('Source HTTP request budget exhausted')
    this.name = 'SourceFetchBudgetExceeded'
  }
}

/** Scoped to source adapters, never to synthesis or root-extraction LLM calls. */
export class SourceFetchBudget {
  attempts = 0
  rateLimited = false

  constructor(readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 0) throw new Error('Invalid source budget')
  }

  get exhausted(): boolean {
    return this.attempts >= this.maximum
  }

  get remaining(): number {
    return this.maximum - this.attempts
  }

  reserve(): void {
    if (this.exhausted) throw new SourceFetchBudgetExceeded()
    this.attempts++
  }

  run<T>(fn: () => T): T {
    return sourceBudget.run(this, fn)
  }
}

export function currentSourceFetchBudget(): SourceFetchBudget | undefined {
  return sourceBudget.getStore()
}
