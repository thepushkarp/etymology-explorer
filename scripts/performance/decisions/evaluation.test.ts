import { describe, expect, test } from 'bun:test'
import {
  decisionCost,
  fixtures,
  MODELS,
  parseAnswers,
  requestFor,
  summarize,
  type Measurement,
} from './evaluation'

describe('decision evaluation contract', () => {
  test('includes separate BYOK charges without double-counting managed inference', () => {
    const usage = { cost: 0.001, cost_details: { upstream_inference_cost: 0.002 } }
    expect(decisionCost(usage, 0.1).costUSD).toBe(0.001)
    expect(decisionCost({ ...usage, is_byok: true }, 0.1).costUSD).toBe(0.003)
    expect(decisionCost({ cost: 0, is_byok: true }, 0.1)).toMatchObject({
      costUSD: 0.1,
      reportedCost: false,
    })
  })
  test('keeps labels private and isolates repeat and option-order experiments', () => {
    const original = requestFor(fixtures[0], MODELS[0], 0)
    expect(requestFor(fixtures[0], MODELS[0], 1)).toEqual(original)
    expect(Object.keys(original)).toEqual(['model', 'state', 'questions'])
    expect(Object.keys(requestFor(fixtures[0], MODELS[0], 2).questions.coverage.criteria)).toEqual(
      Object.keys(original.questions.coverage.criteria).reverse()
    )
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length)
    expect(new Set(fixtures.map((f) => f.state.target.language)).size).toBe(9)
  })

  test('rejects invalid choices and incomplete probability distributions', () => {
    const response = {
      answers: {
        coverage: { type: 'choice', choice: 'present' },
        support: { type: 'choice', choice: 'supported' },
      },
    }
    expect(parseAnswers(response).coverage.choice).toBe('present')
    expect(() =>
      parseAnswers({
        answers: { ...response.answers, coverage: { type: 'choice', choice: 'maybe' } },
      })
    ).toThrow()
    expect(() =>
      parseAnswers({
        answers: {
          ...response.answers,
          coverage: { type: 'choice', choice: 'present', probabilities: { present: 1 } },
        },
      })
    ).toThrow()
  })

  test('counts unsafe approvals, missing probabilities, errors and changed decisions separately', () => {
    const base: Measurement = {
      model: MODELS[0],
      caseId: 'ja-denwa',
      variant: 0,
      latencyMs: 100,
      costUSD: 0.001,
      reportedCost: true,
      requestHash: 'test',
      answers: {
        coverage: { choice: 'present' },
        support: {
          choice: 'supported',
          probabilities: { supported: 0.98, contradicted: 0.01, insufficient: 0.01 },
        },
      },
    }
    const result = summarize([
      base,
      {
        ...base,
        variant: 1,
        answers: { coverage: { choice: 'present' }, support: { choice: 'contradicted' } },
      },
      { ...base, variant: 2, answers: undefined, error: 'timeout' },
    ])[0]
    expect(result.errors).toBe(1)
    expect(result.tasks.support).toMatchObject({
      correct: 1,
      total: 2,
      accepted: 1,
      unsafeAccepted: 1,
      consistency: { repeatPairs: 1, repeatChanged: 1, orderPairs: 0 },
    })
    expect(result.tasks.coverage).toMatchObject({ accepted: 0 })
    expect(result.costUSD).toBeCloseTo(0.003)
  })
})
