import { describe, expect, test } from 'bun:test'
import { generateMetadata } from './[...segments]/page'

describe('/word/[language]/[word] routing', () => {
  test('/word/en/casa permanently redirects to the English canonical route', async () => {
    try {
      await generateMetadata({ params: Promise.resolve({ segments: ['en', 'casa'] }) })
      throw new Error('expected redirect')
    } catch (error) {
      const digest = (error as { digest?: string }).digest ?? ''
      expect(digest).toContain('NEXT_REDIRECT')
      expect(digest).toContain('/word/casa')
      expect(digest).toContain('308')
    }
  })

  test('unsupported language segments return not found', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ segments: ['de', 'haus'] }) })
    ).rejects.toThrow()
  })

  test('extra route segments return not found', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ segments: ['it', 'casa', 'extra'] }) })
    ).rejects.toThrow()
  })
})
