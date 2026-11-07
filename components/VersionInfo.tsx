'use client'

import { useId, useRef, useState, type MouseEvent } from 'react'
import { RELEASES_URL, releaseUrl, type ChangelogRelease } from '@/lib/changelog'
import type { ApiResponse } from '@/lib/types'

// Inlined from package.json by next.config.ts, so it names the build this tab is
// running even when a newer release has since been deployed.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION

type ChangelogState =
  { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; releases: ChangelogRelease[] }

async function fetchChangelog(): Promise<ChangelogRelease[]> {
  const response = await fetch('/api/changelog')
  if (!response.ok) throw new Error(`GET /api/changelog returned ${response.status}`)

  const body = (await response.json()) as ApiResponse<ChangelogRelease[]>
  if (!body.data) throw new Error(`GET /api/changelog failed: ${body.error}`)
  return body.data
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })
}

function ReleaseEntry({ release }: { release: ChangelogRelease }) {
  return (
    <li className="border-t border-rule py-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-serif text-lg">
          <a
            href={releaseUrl(release.version)}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            v{release.version}
          </a>
        </h3>
        <time dateTime={release.date} className="text-sm text-muted">
          {formatDate(release.date)}
        </time>
        {release.version === APP_VERSION && <span className="label ml-auto">Current</span>}
      </div>
      {release.groups.map((group) => (
        <section key={group.title} className="mt-4">
          <h4 className="label">{group.title}</h4>
          <ul className="mt-2 list-disc space-y-2 pl-4 font-serif text-sm leading-relaxed marker:text-faint">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </li>
  )
}

export function VersionInfo() {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [changelog, setChangelog] = useState<ChangelogState>({ status: 'idle' })

  function openDialog() {
    dialogRef.current?.showModal()
    if (changelog.status === 'ready' || changelog.status === 'loading') return

    setChangelog({ status: 'loading' })
    fetchChangelog()
      .then((releases) => setChangelog({ status: 'ready', releases }))
      .catch((error: unknown) => {
        console.error('[VersionInfo] Changelog load failed:', error)
        setChangelog({ status: 'error' })
      })
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  // The content wrapper fills the dialog, so only a backdrop click targets the dialog itself.
  function closeOnBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeDialog()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={`v${APP_VERSION}, open changelog`}
        className="-m-2 cursor-pointer p-2 font-sans text-sm text-muted transition-colors hover:text-ink"
      >
        v{APP_VERSION}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={closeOnBackdropClick}
        className="m-auto w-[calc(100%-2rem)] max-w-xl border border-rule bg-paper text-ink backdrop:bg-paper/80"
      >
        <div className="max-h-[80dvh] overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 id={titleId} className="font-serif text-2xl tracking-tight">
              Changelog
            </h2>
            <button
              type="button"
              onClick={closeDialog}
              className="label -m-2 cursor-pointer p-2 transition-colors hover:text-ink"
            >
              Close
            </button>
          </div>
          {changelog.status === 'ready' && (
            <ol>
              {changelog.releases.map((release) => (
                <ReleaseEntry key={release.version} release={release} />
              ))}
            </ol>
          )}
          {changelog.status === 'loading' && (
            <p role="status" className="border-t border-rule py-5 font-serif italic text-muted">
              Loading the changelog…
            </p>
          )}
          {changelog.status === 'error' && (
            <p role="alert" className="border-t border-rule py-5 font-serif text-accent">
              The changelog could not be loaded.
            </p>
          )}
          <p className="border-t border-rule pt-5 text-sm text-muted">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="link">
              All releases on GitHub
            </a>
          </p>
        </div>
      </dialog>
    </>
  )
}
