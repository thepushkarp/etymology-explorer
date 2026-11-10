import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseChangelog } from './changelog'

const REPO_ROOT = join(import.meta.dir, '..')

test('parseChangelog returns released versions and leaves out the preamble and Unreleased', () => {
  const releases = parseChangelog(`# Changelog

Intro text.

## [Unreleased]

- Not shipped yet.

## [0.2.0] - 2026-12-01

### Added

- One.
- Two.

### Fixed

- Three.

## [0.1.0] - 2026-11-07

### Added

- Four.
`)

  expect(releases).toEqual([
    {
      version: '0.2.0',
      date: '2026-12-01',
      groups: [
        { title: 'Added', items: ['One.', 'Two.'] },
        { title: 'Fixed', items: ['Three.'] },
      ],
    },
    { version: '0.1.0', date: '2026-11-07', groups: [{ title: 'Added', items: ['Four.'] }] },
  ])
})

test('the newest changelog release matches the package version', () => {
  const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8')
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))

  expect(parseChangelog(changelog)[0]?.version).toBe(version)
})

test('beta includes Unreleased first without release metadata', () => {
  const changelog = `# Changelog

## [Unreleased]

### Added

- Available in beta.

## [0.1.0] - 2026-11-07

### Added

- Released.
`

  expect(parseChangelog(changelog, { includeUnreleased: true })).toEqual([
    {
      version: 'Unreleased',
      date: null,
      groups: [{ title: 'Added', items: ['Available in beta.'] }],
    },
    ...parseChangelog(changelog),
  ])
})

test('beta omits empty Unreleased at the next release boundary and end of file', () => {
  const release = `## [0.1.0] - 2026-11-07

### Added

- Released.
`

  expect(parseChangelog(`## [Unreleased]\n\n${release}`, { includeUnreleased: true })).toEqual(
    parseChangelog(release)
  )
  expect(parseChangelog('## [Unreleased]\n', { includeUnreleased: true })).toEqual([])
})

test('beta validates Unreleased groups and entries like released sections', () => {
  for (const contents of ['- Ungrouped.', '### Added\n\nContinuation text.', '### Added']) {
    expect(() =>
      parseChangelog(`## [Unreleased]\n\n${contents}`, { includeUnreleased: true })
    ).toThrow(/Invalid changelog entry|empty section/)
  }
})
