import { describe, expect, test } from 'bun:test'
import { buildSystemPrompt, buildUserPrompt } from './prompts'

describe('synthesis prompts', () => {
  test('pins a non-English lexeme to its language and keeps the prose English', () => {
    const french = buildSystemPrompt('fr')
    expect(french.startsWith(buildSystemPrompt('en'))).toBe(true)
    expect(french).toContain('explicitly French; never reinterpret it as an English word')
    expect(french).toContain('Write every prose field in English')
    expect(buildSystemPrompt('en')).not.toContain('LEXEME LANGUAGE')
    expect(buildUserPrompt('fenêtre', 'fr', 'data')).toContain('French (fr) lexeme: "fenêtre"')
  })

  test('appends a language’s own notes only to that language', () => {
    expect(buildSystemPrompt('pt')).toContain('neutral Portuguese')
    expect(buildSystemPrompt('es')).not.toContain('PORTUGUESE')
  })
})
