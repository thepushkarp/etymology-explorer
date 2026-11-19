import type { ReactNode } from 'react'
import { WordTraceProvider } from '@/lib/hooks/useStreamingEtymology'

export default function WordLayout({ children }: { children: ReactNode }) {
  return <WordTraceProvider>{children}</WordTraceProvider>
}
