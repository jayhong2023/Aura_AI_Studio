import type { OptionItem } from '../lib/jewelry'

interface OptionGridProps<T extends string> {
  label: string
  options: OptionItem<T>[]
  value: T
  onChange: (value: T) => void
  columns?: 2 | 3 | 4 | 5 | 6
  showColor?: boolean
}

export function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 3,
  showColor = false,
}: OptionGridProps<T>) {
  const colClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3',
  }[columns]

  return (
    <div className="space-y-2.5">
      <label className="text-sm font-medium tracking-wider text-stone uppercase">
        {label}
      </label>
      <div className={`grid gap-2 ${colClass}`}>
        {options.map((opt) => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`group relative min-h-11 rounded-xl border px-3 py-2.5 text-left transition-all ${
                selected
                  ? 'border-champagne bg-gradient-to-b from-champagne/15 to-champagne/5 shadow-[0_6px_16px_rgba(169,139,61,0.18)]'
                  : 'border-cream-dark bg-white/60 hover:border-champagne/40 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {showColor && opt.color && (
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 shadow-inner"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <span
                  className={`text-base font-medium ${
                    selected ? 'text-ink' : 'text-ink-soft'
                  }`}
                >
                  {opt.label}
                </span>
              </div>
              {opt.desc && (
                <p className="mt-0.5 text-xs leading-snug text-stone">
                  {opt.desc}
                </p>
              )}
              {selected && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-champagne" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
