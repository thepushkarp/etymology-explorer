import { AsyncLocalStorage } from 'node:async_hooks'

const sourceBudget = new AsyncLocalStorage<SourceFetchBudget>()
const phaseBudget = new AsyncLocalStorage<{ budget: SourceFetchBudget; maximum: number }>()

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

  private _maximum: number

  constructor(maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 0) throw new Error('Invalid source budget')
    this._maximum = maximum
  }

  get maximum(): number {
    return this._maximum
  }

  /** Resolution and research retain one counter while the resolved language count sets its cap. */
  tighten(maximum: number): void {
    if (!Number.isInteger(maximum) || maximum < this.attempts || maximum > this.maximum)
      throw new Error('Source budget cap must not increase or fall below consumed attempts')
    this._maximum = maximum
  }

  private get effectiveMaximum(): number {
    const phase = phaseBudget.getStore()
    return phase?.budget === this ? Math.min(this.maximum, phase.maximum) : this.maximum
  }

  get exhausted(): boolean {
    return this.attempts >= this.effectiveMaximum
  }

  get remaining(): number {
    return Math.max(0, this.effectiveMaximum - this.attempts)
  }

  /** Bound a resolution phase without replacing the entry-wide counter or Exa's reference. */
  runLimited<T>(allowance: number, fn: () => T): T {
    if (!Number.isInteger(allowance) || allowance < 0) throw new Error('Invalid phase budget')
    const maximum = Math.min(this.effectiveMaximum, this.attempts + allowance)
    return phaseBudget.run({ budget: this, maximum }, () => this.run(fn))
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
