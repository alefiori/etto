import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressRing } from './ProgressRing'
import { RING, ringOffset } from '@/lib/macros'

describe('ProgressRing', () => {
  it('drives the progress arc offset from consumed/target', () => {
    const { container } = render(
      <ProgressRing consumed={50} target={100} color="#000" trackColor="#eee" />,
    )
    const arc = container.querySelector('.macro-ring') as SVGCircleElement
    expect(arc).toBeTruthy()
    expect(arc.getAttribute('stroke-dashoffset')).toBe(String(ringOffset(50, 100)))
    expect(arc.getAttribute('stroke-dasharray')).toBe(String(RING.circumference))
  })

  it('shows an empty ring (full offset) when the target is zero', () => {
    const { container } = render(
      <ProgressRing consumed={10} target={0} color="#000" trackColor="#eee" />,
    )
    const arc = container.querySelector('.macro-ring') as SVGCircleElement
    expect(arc.getAttribute('stroke-dashoffset')).toBe(String(RING.circumference))
  })

  it('renders children in the center', () => {
    render(
      <ProgressRing consumed={1} target={2} color="#000" trackColor="#eee">
        <span>42g</span>
      </ProgressRing>,
    )
    expect(screen.getByText('42g')).toBeInTheDocument()
  })
})
