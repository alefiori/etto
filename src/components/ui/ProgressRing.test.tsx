import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressRing } from './ProgressRing'
import { RING, ringOffset } from '@/lib/macros'
import { MOTION } from '@/lib/motion'

/**
 * jsdom implements no Web Animations, so `Element.prototype.animate` is absent
 * entirely — which is also the branch the component guards for. Installing a
 * spy is therefore both the stub and the assertion surface.
 */
function spyOnAnimate() {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  })
  return animate
}

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate
})

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

  it('draws the arc from empty, after the stagger it was given', () => {
    const animate = spyOnAnimate()
    render(
      <ProgressRing consumed={50} target={100} color="#000" trackColor="#eee" drawDelay={190} />,
    )

    expect(animate).toHaveBeenCalledTimes(1)
    const [keyframes, options] = animate.mock.calls[0]
    expect(keyframes).toEqual([
      { strokeDashoffset: RING.circumference },
      { strokeDashoffset: ringOffset(50, 100) },
    ])
    expect(options).toMatchObject({
      duration: MOTION.draw.duration,
      delay: 190,
      // Holds the empty ring through the stagger rather than showing the
      // finished arc and then snapping back to zero to draw it.
      fill: 'backwards',
    })
  })

  it('waits for real numbers rather than spending the entrance on an empty dial', () => {
    const animate = spyOnAnimate()
    // What the dashboard actually mounts: targets have resolved, the day's logs
    // have not, so there is no arc yet.
    const { rerender } = render(
      <ProgressRing consumed={0} target={100} color="#000" trackColor="#eee" />,
    )
    expect(animate).not.toHaveBeenCalled()

    rerender(<ProgressRing consumed={50} target={100} color="#000" trackColor="#eee" />)
    expect(animate).toHaveBeenCalledTimes(1)

    // And every change after that belongs to the CSS transition, not to another
    // draw from zero — logging a food must sweep the arc, not reset it.
    rerender(<ProgressRing consumed={70} target={100} color="#000" trackColor="#eee" />)
    expect(animate).toHaveBeenCalledTimes(1)
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
