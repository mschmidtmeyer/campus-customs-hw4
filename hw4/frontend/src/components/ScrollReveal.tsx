import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Apple-style reveal-on-scroll. Mounted once in App.
 *
 * Mark blocks with `data-reveal="up|fade|left|right|zoom"` (and optionally
 * `data-reveal-delay="1..4"` to stagger siblings). Each element animates
 * opacity/transform exactly once, then is unobserved. Content stays visible if
 * JS never runs, because the hidden state only applies under `html.js-reveal`.
 */
export default function ScrollReveal() {
  const { pathname } = useLocation()

  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      root.classList.remove('js-reveal')
      return
    }
    root.classList.add('js-reveal')
    // Tell the index.html failsafe that the observer is alive.
    ;(window as Window & { __ccReveal?: boolean }).__ccReveal = true

    // State lives in data-revealed (not a class): React rewrites className on re-render,
    // which used to drop the reveal and leave cards stuck invisible.
    const reveal = (el: Element) => {
      el.setAttribute('data-revealed', 'in')
      el.addEventListener(
        'transitionend',
        () => el.setAttribute('data-revealed', 'done'),
        { once: true },
      )
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target)
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )

    const scan = (scope: ParentNode) => {
      scope.querySelectorAll('[data-reveal]:not([data-revealed])').forEach((el) => io.observe(el))
    }
    scan(document)

    // Catch blocks rendered later (async data, route changes, lazy lists).
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return
          if (n.matches('[data-reveal]:not([data-revealed])')) io.observe(n)
          scan(n)
        })
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [pathname])

  return null
}
