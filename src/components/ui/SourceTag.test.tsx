import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SourceTag } from './SourceTag'
import { SOURCE_LABELS } from '@/lib/foodSources'

describe('SourceTag', () => {
  it('renders the human-readable label for each external source', () => {
    const { rerender } = render(<SourceTag source="usda" />)
    expect(screen.getByText(SOURCE_LABELS.usda)).toBeInTheDocument()

    rerender(<SourceTag source="openfoodfacts" />)
    expect(screen.getByText(SOURCE_LABELS.openfoodfacts)).toBeInTheDocument()

    rerender(<SourceTag source="ciqual" />)
    expect(screen.getByText(SOURCE_LABELS.ciqual)).toBeInTheDocument()

    rerender(<SourceTag source="cofid" />)
    expect(screen.getByText(SOURCE_LABELS.cofid)).toBeInTheDocument()

    rerender(<SourceTag source="crea" />)
    expect(screen.getByText(SOURCE_LABELS.crea)).toBeInTheDocument()

    // Edamam is retired as a search source, but foods logged from it before it
    // was dropped still render their attribution rather than a blank chip.
    rerender(<SourceTag source="edamam" />)
    expect(screen.getByText(SOURCE_LABELS.edamam)).toBeInTheDocument()
  })
})
