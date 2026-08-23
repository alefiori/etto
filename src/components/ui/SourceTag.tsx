import { Icon } from './Icon'
import { SOURCE_ICONS, SOURCE_LABELS } from '@/lib/foodSources'
import type { ExternalSource } from '@/lib/database.types'

/** Attribution tag shown on foods imported from an external database. */
export function SourceTag({ source }: { source: ExternalSource }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full glass-chip px-2 py-0.5 text-[0.6875rem] font-semibold text-on-surface-variant">
      <Icon name={SOURCE_ICONS[source]} className="text-[0.875rem]" />
      {SOURCE_LABELS[source]}
    </span>
  )
}
