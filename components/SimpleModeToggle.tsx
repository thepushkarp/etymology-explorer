'use client'

interface SimpleModeToggleProps {
  isSimple: boolean
  onToggle: () => void
}

export default function SimpleModeToggle({ isSimple, onToggle }: SimpleModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSimple}
      aria-label={`Switch to ${isSimple ? 'expert' : 'simple'} mode`}
      className="
        inline-flex items-center gap-1.5
        px-2.5 py-1 rounded-md
        border border-charcoal/15 bg-surface/80
        text-[11px] font-semibold uppercase tracking-widest
        text-charcoal-light hover:text-charcoal
        hover:border-charcoal/25 hover:bg-cream-dark/60
        transition-all duration-200
      "
    >
      <span
        className={`rounded px-1.5 py-0.5 transition-colors duration-200 ${
          isSimple ? 'bg-charcoal text-cream' : 'text-charcoal/60'
        }`}
      >
        Simple
      </span>
      <span aria-hidden="true" className="text-charcoal/45">
        &middot;
      </span>
      <span
        className={`rounded px-1.5 py-0.5 transition-colors duration-200 ${
          !isSimple ? 'bg-charcoal text-cream' : 'text-charcoal/60'
        }`}
      >
        Expert
      </span>
    </button>
  )
}
