export const RELEASES_URL = 'https://github.com/thepushkarp/etymology-explorer/releases'

export interface ChangelogGroup {
  title: string
  items: string[]
}

export interface ChangelogRelease {
  version: string
  date: string
  groups: ChangelogGroup[]
}

export interface ChangelogUnreleased {
  version: 'Unreleased'
  date: null
  groups: ChangelogGroup[]
}

export type ChangelogEntry = ChangelogRelease | ChangelogUnreleased

const SECTION_PREFIX = '## '
const UNRELEASED_HEADING = '## [Unreleased]'
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/
const GROUP_HEADING = /^### (.+)$/
const ITEM = /^- (.+)$/

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`
}

function assertComplete(release: ChangelogEntry | null): void {
  if (!release || (release.date === null && release.groups.length === 0)) return
  if (release.groups.length === 0 || release.groups.some((group) => group.items.length === 0)) {
    throw new Error(`Changelog release ${release.version} has an empty section`)
  }
}

/**
 * Parse CHANGELOG.md into released versions, opting into Unreleased for beta builds. Throws on
 * any line it cannot place: the dialog renders entries as plain text, so markup
 * this parser does not understand would otherwise disappear from the site.
 */
export function parseChangelog(
  markdown: string,
  { includeUnreleased = false }: { includeUnreleased?: boolean } = {}
): ChangelogEntry[] {
  const releases: ChangelogEntry[] = []
  let release: ChangelogEntry | null = null
  let group: ChangelogGroup | null = null

  for (const [index, rawLine] of markdown.split('\n').entries()) {
    const line = rawLine.trimEnd()

    if (line.startsWith(SECTION_PREFIX)) {
      assertComplete(release)
      release = null
      group = null
      if (line === UNRELEASED_HEADING) {
        if (includeUnreleased) {
          release = { version: 'Unreleased', date: null, groups: [] }
          releases.unshift(release)
        }
        continue
      }

      const heading = RELEASE_HEADING.exec(line)
      if (!heading) {
        throw new Error(`Invalid changelog release heading on line ${index + 1}: ${line}`)
      }
      release = { version: heading[1], date: heading[2], groups: [] }
      releases.push(release)
      continue
    }

    // The preamble and excluded Unreleased section do not appear in the dialog.
    if (!release || line === '') continue

    const groupHeading = GROUP_HEADING.exec(line)
    if (groupHeading) {
      group = { title: groupHeading[1], items: [] }
      release.groups.push(group)
      continue
    }

    const item = ITEM.exec(line)
    if (!item || !group) {
      throw new Error(`Invalid changelog entry on line ${index + 1}: ${line}`)
    }
    group.items.push(item[1])
  }

  assertComplete(release)
  return releases.filter((entry) => entry.date !== null || entry.groups.length > 0)
}
