import type { SecurityTelemetryEvent } from './types'

/**
 * Emit a structured security telemetry event to stdout.
 * Events are JSON-formatted for log aggregation (CloudWatch, DataDog, Vercel log drain).
 * External observability integration deferred to future PR — stdout is sufficient for v1.
 */
export function emitSecurityEvent(event: SecurityTelemetryEvent): void {
  console.log(JSON.stringify({ _tag: 'security', ...event }))
}
