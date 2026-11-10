import { describe, expect, test } from 'bun:test'
import { generateMetadata } from './[...segments]/page'

describe('/word/[language]/[word] routing', () => {
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
