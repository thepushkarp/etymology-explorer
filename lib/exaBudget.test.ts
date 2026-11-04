import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getExaSpendStats,
  reserveExaBudget,
  settleExaBudget,
  type ExaBudgetRedis,
} from './exaBudget'

const server = Bun.which('redis-server')
const cli = Bun.which('redis-cli')

describe.skipIf(!server || !cli)('Exa budget against isolated Redis', () => {
  let directory: string
  let socket: string
  let process: ReturnType<typeof Bun.spawn>
  const now = new Date('2090-05-31T23:59:59Z')
  const key = 'exa:budget:v1:2090-05'
  async function command(...args: string[]): Promise<unknown> {
    const child = Bun.spawn([cli!, '-s', socket, '--json', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(child.stdout).text()
    if ((await child.exited) !== 0) throw new Error('Local Redis command failed')
    return JSON.parse(output)
  }
  const client: ExaBudgetRedis = {
    eval: (script, keys, args) =>
      command('EVAL', script, String(keys.length), ...keys, ...args.map(String)),
    hgetall: async (name) => (await command('HGETALL', name)) as Record<string, unknown>,
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'exa-budget-'))
    socket = join(directory, 'redis.sock')
    process = Bun.spawn(
      [server!, '--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'],
      { stdout: 'ignore', stderr: 'ignore' }
    )
    for (let i = 0; i < 100; i++) {
      try {
        if ((await command('PING')) === 'PONG') return
      } catch {
        await Bun.sleep(10)
      }
    }
    throw new Error('Isolated Redis did not start')
  })
  beforeEach(async () => {
    await command('FLUSHDB')
  })
  afterAll(async () => {
    process?.kill()
    if (process) await process.exited
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  test('concurrent reservations cannot exceed the monthly ceiling', async () => {
    await command('HSET', key, 'committed', '9990000')
    const decisions = await Promise.all(
      Array.from({ length: 10 }, () => reserveExaBudget(7000, client, now))
    )
    expect(decisions.filter((decision) => decision.status === 'reserved')).toHaveLength(1)
    expect(decisions.filter((decision) => decision.status === 'exhausted')).toHaveLength(9)
    expect((await getExaSpendStats(client, now))?.heldUSD).toBe(0.007)
  })

  test('settlement is idempotent and estimates never refund tariff', async () => {
    const decision = await reserveExaBudget(7000, client, now)
    if (decision.status !== 'reserved') throw new Error('Expected reservation')
    await Promise.all([
      settleExaBudget(decision.reservation, { sent: true, costUSD: 0.002 }, client),
      settleExaBudget(decision.reservation, { sent: true, costUSD: 0.002 }, client),
    ])
    expect(await getExaSpendStats(client, now)).toMatchObject({
      committedUSD: 0.007,
      heldUSD: 0,
      reportedUSD: 0.002,
      calls: 1,
      reportedCalls: 1,
    })
  })

  test('only proven unsent requests release allowance; missing settlement keeps hold', async () => {
    const first = await reserveExaBudget(7000, client, now)
    const second = await reserveExaBudget(1000, client, now)
    if (first.status !== 'reserved' || second.status !== 'reserved') throw new Error('reserve')
    await settleExaBudget(first.reservation, { sent: false }, client)
    expect(await getExaSpendStats(client, now)).toMatchObject({ committedUSD: 0, heldUSD: 0.001 })
    await settleExaBudget(second.reservation, { sent: true }, client)
    expect(await getExaSpendStats(client, now)).toMatchObject({ committedUSD: 0.001, heldUSD: 0 })
  })

  test('unexpected provider pricing stops further requests', async () => {
    const decision = await reserveExaBudget(1000, client, now)
    if (decision.status !== 'reserved') throw new Error('reserve')
    await settleExaBudget(decision.reservation, { sent: true, costUSD: 0.002 }, client)
    expect((await getExaSpendStats(client, now))?.stopped).toBe(true)
    expect(await reserveExaBudget(1000, client, now)).toEqual({ status: 'stopped' })
  })

  test('UTC rollover keeps in-flight settlement in its reservation month', async () => {
    const decision = await reserveExaBudget(7000, client, now)
    if (decision.status !== 'reserved') throw new Error('reserve')
    const next = new Date('2090-06-01T00:00:01Z')
    expect((await getExaSpendStats(client, next))?.heldUSD).toBe(0)
    await settleExaBudget(decision.reservation, { sent: true }, client)
    expect((await getExaSpendStats(client, now))?.committedUSD).toBe(0.007)
    expect((await getExaSpendStats(client, next))?.committedUSD).toBe(0)
  })

  test('corrupt counters and unavailable Redis fail closed', async () => {
    await command('HSET', key, 'held', '0.5')
    expect(await reserveExaBudget(1000, client, now)).toEqual({ status: 'invalid' })
    expect(await reserveExaBudget(1000, null, now)).toEqual({ status: 'unavailable' })
  })
})
