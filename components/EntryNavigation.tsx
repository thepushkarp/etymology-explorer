'use client'

import type { KeyboardEvent } from 'react'
import { WordLink } from './WordLink'
import type { EntryNavigationModel } from '@/lib/entryNavigation'
import { EntryChoices, EntryChoiceLabel, entryChoiceClass } from './etymology-card/EntryChoices'

function focusLink(event: KeyboardEvent<HTMLElement>) {
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'))
  const index = links.indexOf(event.target as HTMLAnchorElement)
  const moves: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowDown: index + 1,
    ArrowLeft: index - 1,
    ArrowUp: index - 1,
    Home: 0,
    End: links.length - 1,
  }
  if (index < 0 || !(event.key in moves)) return
  event.preventDefault()
  links[(moves[event.key] + links.length) % links.length]?.focus()
}

/** All language and meaning choices use the same URL and keyboard contract. */
export function EntryNavigation({ model }: { model: EntryNavigationModel }) {
  return (
    <div className="mt-8">
      <nav
        aria-label={`Languages for ${model.label}`}
        onKeyDown={focusLink}
        className="flex flex-wrap gap-x-8 gap-y-3 border-b border-rule"
      >
        {model.tabs.map((target) => (
          <WordLink
            key={target.language}
            {...target}
            localNavigation={target.local}
            lang="en"
            aria-current={target.language === model.language ? 'page' : undefined}
            className={`label -mb-px border-b pb-3 transition-colors ${target.language === model.language ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {target.label}
          </WordLink>
        ))}
      </nav>
      {model.choices.length > 1 && (
        <EntryChoices label={`Meanings for ${model.label}`} onKeyDown={focusLink}>
          {model.choices.map((target, index) => {
            const selected = target === model.active
            return (
              <WordLink
                key={`${target.word}:${target.historyId ?? ''}`}
                {...target}
                localNavigation={target.local}
                lang="en"
                aria-current={selected ? 'page' : undefined}
                className={entryChoiceClass(selected)}
              >
                <EntryChoiceLabel index={index} details={target.details ?? 'entry'}>
                  {model.grouped ? (
                    <>
                      <span lang={target.language} dir="auto" className="whitespace-nowrap">
                        {target.word}
                      </span>
                      {target.label.slice(target.word.length)}
                    </>
                  ) : (
                    target.label
                  )}
                </EntryChoiceLabel>
              </WordLink>
            )
          })}
        </EntryChoices>
      )}
    </div>
  )
}
