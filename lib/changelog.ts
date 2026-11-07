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

const SECTION_PREFIX = '## '
const UNRELEASED_HEADING = '## [Unreleased]'
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/
const GROUP_HEADING = /^### (.+)$/
const ITEM = /^- (.+)$/

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`
}

function assertComplete(release: ChangelogRelease | null): void {
  if (!release) return
  if (release.groups.length === 0 || release.groups.some((group) => group.items.length === 0)) {
    throw new Error(`Changelog release ${release.version} has an empty section`)
  }
}

/**
 * Parse CHANGELOG.md into released versions, newest first as written. Throws on
 * any line it cannot place: the dialog renders entries as plain text, so markup
 * this parser does not understand would otherwise disappear from the site.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let release: ChangelogRelease | null = null
  let group: ChangelogGroup | null = null

  for (const [index, rawLine] of markdown.split('\n').entries()) {
    const line = rawLine.trimEnd()

    if (line.startsWith(SECTION_PREFIX)) {
      assertComplete(release)
      release = null
      group = null
      if (line === UNRELEASED_HEADING) continue

      const heading = RELEASE_HEADING.exec(line)
      if (!heading) {
        throw new Error(`Invalid changelog release heading on line ${index + 1}: ${line}`)
      }
      release = { version: heading[1], date: heading[2], groups: [] }
      releases.push(release)
      continue
    }

    // The preamble and Unreleased are free-form; only release sections are structured.
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
  return releases
}
