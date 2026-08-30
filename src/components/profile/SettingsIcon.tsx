import { Icon } from '@/components/ui/Icon'

/**
 * The rounded sage tile every settings row is led by.
 *
 * Nine sections down one page, each opening with a bare grey glyph, gave the
 * eye nothing to count by: the headings and their icons carried the same weight
 * as the body text under them, so scrolling for "Meals" meant reading. A filled
 * tile is a fixed-size, fixed-colour landmark at the start of each row, which
 * is what makes a settings list scannable rather than merely ordered.
 *
 * The glyph is sized with an inline style, not a `text-*` utility. That is not
 * a preference: `.material-symbols-outlined` sets `font-size` and is declared
 * after `@tailwind utilities`, so it beats every text utility on an icon —
 * app-wide, and documented at the same workaround in ui/FoodRow. `rem`, so the
 * tile and its glyph grow with the reader's text size; a 36px box beside a
 * label scaled to twice its drawn size reads as a rendering fault.
 */
export function SettingsIcon({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-primary-tint/[0.12] text-primary"
    >
      <Icon name={name} style={{ fontSize: '1.125rem' }} />
    </span>
  )
}
