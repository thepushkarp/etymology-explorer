import { describe, expect, test } from 'bun:test'
import { generateMetadata } from './[language]/[word]/page'

describe('/word/[language]/[word] routing', () => {
  test('/word/en/casa permanently redirects to the English canonical route', async () => {
    try {
      await generateMetadata({ params: Promise.resolve({ language: 'en', word: 'casa' }) })
      throw new Error('expected redirect')
    } catch (error) {
      const digest = (error as { digest?: string }).digest ?? ''
      expect(digest).toContain('NEXT_REDIRECT')
      expect(digest).toContain('/word/casa')
      expect(digest).toContain('308')
    }
  })
})
