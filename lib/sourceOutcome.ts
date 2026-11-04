import { safeError } from './errorUtils'
import { SourceFetchBudgetExceeded } from './sourceFetchBudget'
import type { SourceFetchOutcome } from './types'

/** Caller cancellation is control flow; other failures remain visible source outcomes. */
export function sourceFailure(error: unknown, signal?: AbortSignal): SourceFetchOutcome {
  signal?.throwIfAborted()
  return {
    status: error instanceof SourceFetchBudgetExceeded ? 'budget_skipped' : 'unavailable',
    reason: safeError(error),
  }
}

export function sourceHttpFailure(response: Response, provider: string): SourceFetchOutcome {
  return {
    status:
      response.status === 404 ? 'not_found' : response.status === 403 ? 'blocked' : 'unavailable',
    reason:
      response.headers.get('cf-mitigated') === 'challenge'
        ? `${provider} requires a Cloudflare browser challenge`
        : `${provider} returned HTTP ${response.status}`,
    httpStatus: response.status,
  }
}
