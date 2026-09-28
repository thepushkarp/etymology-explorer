import type { Metadata } from 'next'
import { Landing } from '@/components/Landing'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Static: legacy /?q=word deep links are redirected in proxy.ts.
export default function Home() {
  return <Landing />
}
