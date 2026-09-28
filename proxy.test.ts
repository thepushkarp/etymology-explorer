import { describe, expect, test } from 'bun:test'
import { legacySearchRedirect } from './proxy'

const redirect = (path: string) => legacySearchRedirect(new URL(path, 'https://etymex.com'))

describe('legacy /?q= redirect', () => {
  test('canonicalizes and encodes the word', () => {
    expect(redirect('/?q=nice')).toBe('/word/nice')
    expect(redirect('/?q=%20%20CafÉ%20')).toBe(`/word/${encodeURIComponent('café')}`)
  })

  test('leaves bare /, invalid words, and other paths alone', () => {
    expect(redirect('/')).toBeNull()
    expect(redirect('/?q=not%20a%20word!!')).toBeNull()
    expect(redirect('/faq?q=nice')).toBeNull()
  })
})
