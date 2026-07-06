'use client'

import { ModernUsage } from '@/lib/types'
import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface ModernUsageSectionProps {
  modernUsage: ModernUsage
}

export function ModernUsageSection({ modernUsage }: ModernUsageSectionProps) {
  return (
    <MobileSection
      title="Modern Usage"
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <div className="relative rounded-[1rem] border border-border-soft bg-surface/62 p-5">
        {modernUsage.slangDefinition && (
          <p className="mb-3 font-serif text-lg leading-relaxed text-charcoal/82">
            {modernUsage.slangDefinition}
          </p>
        )}
        {modernUsage.popularizedBy && (
          <p className="mb-2 text-sm text-charcoal/60">
            <span className="font-medium">Popularized by:</span> {modernUsage.popularizedBy}
          </p>
        )}
        {modernUsage.contexts && modernUsage.contexts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {modernUsage.contexts.map((ctx) => (
              <span
                key={ctx}
                className="rounded-full border border-[#9c88a2] bg-[#eae2ec] px-2 py-0.5 text-xs text-[#564060] dark:border-[#6a5672] dark:bg-[#262028] dark:text-[#c8b2cc]"
              >
                {ctx}
              </span>
            ))}
          </div>
        )}

        {modernUsage.notableReferences && modernUsage.notableReferences.length > 0 && (
          <div className="mt-5 border-t border-border-soft pt-5">
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-charcoal/50">
              Notable References
            </p>
            <ul className="space-y-1">
              {modernUsage.notableReferences.slice(0, 3).map((reference, idx) => (
                <li
                  key={`${reference}-${idx}`}
                  className="text-sm leading-relaxed text-charcoal/70"
                >
                  {reference}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </MobileSection>
  )
}
