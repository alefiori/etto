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

    rerender(<SourceTag source="edamam" />)
    expect(screen.getByText(SOURCE_LABELS.edamam)).toBeInTheDocument()
  })
})
