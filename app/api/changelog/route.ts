import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { parseChangelog, type ChangelogRelease } from '@/lib/changelog'
import type { ApiResponse } from '@/lib/types'

// Prerendered, so CHANGELOG.md is read only during the build, where a malformed
// file fails the deploy. It is not traced into a serverless bundle, and a
// dynamic route could not read it at runtime.
export const dynamic = 'force-static'

export function GET() {
  const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8')

  return NextResponse.json<ApiResponse<ChangelogRelease[]>>({
    success: true,
    data: parseChangelog(changelog),
  })
}
