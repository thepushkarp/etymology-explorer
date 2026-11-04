import { randomUUID } from 'node:crypto'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { getRedis } from './redis'

export interface ExaBudgetRedis {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
  hgetall(key: string): Promise<Record<string, unknown> | null>
}

export interface ExaReservation {
  key: string
  token: string
  micros: number
}

export type ExaBudgetDecision =
  | { status: 'reserved'; reservation: ExaReservation }
  | { status: 'unavailable' | 'exhausted' | 'stopped' | 'invalid' }

const RESERVE = `
local fields = redis.call('HMGET', KEYS[1], 'committed', 'held', 'stopped')
local committed = tonumber(fields[1] or '0')
local held = tonumber(fields[2] or '0')
if not committed or not held or committed < 0 or held < 0
  or committed % 1 ~= 0 or held % 1 ~= 0 then return 'invalid' end
if fields[3] and fields[3] ~= '0' then return 'stopped' end
local amount = tonumber(ARGV[2])
if committed + held + amount > tonumber(ARGV[3]) then return 'exhausted' end
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 'invalid' end
redis.call('HSET', KEYS[1], ARGV[1], amount)
redis.call('HINCRBY', KEYS[1], 'held', amount)
redis.call('EXPIREAT', KEYS[1], ARGV[4])
return 'reserved'
`

// An unknown provider charge retains the full tariff debit. Exa's reported cost
// is an estimate, so it cannot safely authorize a refund of the hard allowance.
const SETTLE = `
local fields = redis.call('HMGET', KEYS[1], ARGV[1], 'held', 'committed', 'calls', 'reported', 'reportedCalls')
if not fields[1] then return 0 end
local values = {}
for i = 1, 6 do
  values[i] = tonumber(fields[i] or '0')
  if not values[i] or values[i] < 0 or values[i] % 1 ~= 0 then
    return redis.error_reply('Invalid Exa allowance')
  end
end
local amount = values[1]
if values[2] < amount then return redis.error_reply('Invalid Exa held allowance') end
local reported = tonumber(ARGV[3])
local charge = amount
if ARGV[2] == 'release' then charge = 0 end
if reported and reported > amount then
  charge = reported
  redis.call('HSET', KEYS[1], 'stopped', 1)
end
redis.call('HSET', KEYS[1], 'held', values[2] - amount, 'committed', values[3] + charge,
  'calls', values[4] + (ARGV[2] == 'release' and 0 or 1),
  'reported', values[5] + (reported or 0), 'reportedCalls', values[6] + (reported and 1 or 0))
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`

function monthKey(now: Date): string {
  return `exa:budget:v1:${now.toISOString().slice(0, 7)}`
}

export async function reserveExaBudget(
  micros: number,
  client: ExaBudgetRedis | null = getRedis(),
  now = new Date()
): Promise<ExaBudgetDecision> {
  if (!Number.isSafeInteger(micros) || micros <= 0) return { status: 'invalid' }
  if (!client) return { status: 'unavailable' }
  const reservation = { key: monthKey(now), token: `reservation:${randomUUID()}`, micros }
  const expiresAt = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 3) / 1000)
  try {
    const status = await client.eval(
      RESERVE,
      [reservation.key],
      [reservation.token, micros, Math.round(CONFIG.exa.monthlyLimitUSD * 1_000_000), expiresAt]
    )
    if (status === 'reserved') return { status, reservation }
    if (status === 'exhausted' || status === 'stopped' || status === 'invalid') return { status }
    return { status: 'unavailable' }
  } catch (error) {
    console.error('[ExaBudget] reserve failed:', safeError(error))
    return { status: 'unavailable' }
  }
}

export async function settleExaBudget(
  reservation: ExaReservation,
  options: { sent: boolean; costUSD?: number },
  client: ExaBudgetRedis | null = getRedis()
): Promise<void> {
  if (!client) return
  const reported = options.costUSD
  const micros =
    typeof reported === 'number' && Number.isFinite(reported) && reported >= 0
      ? Math.ceil(reported * 1_000_000)
      : undefined
  try {
    await client.eval(
      SETTLE,
      [reservation.key],
      [
        reservation.token,
        options.sent ? 'commit' : 'release',
        micros !== undefined && Number.isSafeInteger(micros) ? micros : '',
      ]
    )
  } catch (error) {
    // The reservation remains charged if settlement is unavailable or ambiguous.
    console.error('[ExaBudget] settle failed:', safeError(error))
  }
}

export async function getExaSpendStats(
  client: ExaBudgetRedis | null = getRedis(),
  now = new Date()
) {
  if (!client) return null
  try {
    const values = (await client.hgetall(monthKey(now))) ?? {}
    const numeric = (field: string) => {
      const value = Number(values[field] ?? 0)
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid Exa budget state')
      return value
    }
    const committed = numeric('committed')
    const held = numeric('held')
    return {
      period: now.toISOString().slice(0, 7),
      limitUSD: CONFIG.exa.monthlyLimitUSD,
      committedUSD: committed / 1_000_000,
      heldUSD: held / 1_000_000,
      reportedUSD: numeric('reported') / 1_000_000,
      calls: numeric('calls'),
      reportedCalls: numeric('reportedCalls'),
      stopped: Boolean(numeric('stopped')),
      exhausted: committed + held >= CONFIG.exa.monthlyLimitUSD * 1_000_000,
      enabled: process.env.EXA_ENABLED !== 'false' && Boolean(process.env.EXA_API_KEY),
    }
  } catch (error) {
    console.error('[ExaBudget] stats failed:', safeError(error))
    return null
  }
}
