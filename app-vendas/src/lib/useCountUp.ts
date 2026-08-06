import { useEffect, useRef, useState } from 'react'

/**
 * Anima um número de 0 até `value` com easing (efeito "contador"), usado nos
 * KPIs do Dashboard. Respeita prefers-reduced-motion (mostra o valor final
 * direto). Reinicia suavemente quando o valor alvo muda (ex.: troca de período).
 */
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || durationMs <= 0) {
      setDisplay(value)
      fromRef.current = value
      return
    }

    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (value - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, durationMs])

  return display
}
