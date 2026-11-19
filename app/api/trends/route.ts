import { getTrends } from '@/lib/trends'
import { safeError } from '@/lib/errorUtils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    return Response.json(await getTrends(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[Trends] Snapshot unavailable:', safeError(error))
    return Response.json(
      { error: 'Trends unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
