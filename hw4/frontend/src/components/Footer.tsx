import { Link } from 'react-router-dom'
import { STORE_ADDRESS, STORE_HOURS } from '../storeInfo'
import './Footer.css'

const YEAR = new Date().getFullYear()

/** A low Gothic skyline (halls, elms, spires, Harkness Tower in the middle) that the footer rises from. */
const SKYLINE_D = (() => {
  const G = 72 // ground line
  const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`
  const peak = (x: number, base: number, w: number, h: number) => `M${x} ${base}L${x + w / 2} ${base - h}L${x + w} ${base}Z`
  const tree = (cx: number, r: number) =>
    `${rect(cx - 2, G - 16, 4, 16)}M${cx - r} ${G - 16 - r * 0.6}a${r} ${r * 0.8} 0 1 1 ${2 * r} 0a${r} ${r * 0.8} 0 1 1 ${-2 * r} 0Z`
  const battlements = (x1: number, x2: number, top: number) => {
    let d = `M${x1} ${G}V${top - 5}`
    for (let x = x1; x < x2; x += 14) d += `H${Math.min(x + 8, x2)}V${top}H${Math.min(x + 14, x2)}V${top - 5}`
    return `${d}H${x2}V${G}Z`
  }
  const d: string[] = []
  for (let m = 0; m < 5; m++) {
    const o = m * 480
    d.push(rect(o + 4, 48, 116, 24), peak(o + 4, 48, 116, 18), rect(o + 30, 34, 9, 14)) // gabled hall + chimney
    d.push(tree(o + 152, 15))
    d.push(battlements(o + 186, o + 330, 50)) // crenellated hall
    if (m !== 2) d.push(rect(o + 362, 42, 18, 30), peak(o + 360, 42, 22, 30)) // spire
    d.push(tree(o + 420, 18), tree(o + 452, 12))
  }
  // Harkness Tower at the center
  const c = 1200
  d.push(rect(c - 20, 30, 40, 42), rect(c - 16, 18, 32, 12), rect(c - 12, 8, 24, 10))
  d.push(peak(c - 15, 8, 6, 8), peak(c - 3, 8, 6, 12), peak(c + 9, 8, 6, 8), peak(c - 18, 30, 5, 8), peak(c + 13, 30, 5, 8))
  return d.join('')
})()

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__skyline" aria-hidden="true">
        <svg viewBox="0 0 2400 72" preserveAspectRatio="xMidYMax slice" focusable="false">
          <path d={SKYLINE_D} />
        </svg>
      </div>
      <div className="footer__inner">
        <section className="footer__col footer__about" aria-labelledby="footer-brand">
          <h2 id="footer-brand" className="footer__brand">Campus Customs</h2>
          <p>Officially licensed Yale apparel, a short walk from Old Campus.</p>
          <p className="footer__licensed">
            <span aria-hidden="true">✓</span> Officially licensed Yale merchandise
          </p>
        </section>

        <section className="footer__col" aria-labelledby="footer-visit">
          <h2 id="footer-visit">Visit the shop</h2>
          <address>
            {STORE_ADDRESS.street}
            <br />
            {STORE_ADDRESS.cityLine}
          </address>
          <Link to="/visit" className="footer__link">Directions &amp; details →</Link>
        </section>

        <section className="footer__col" aria-labelledby="footer-hours">
          <h2 id="footer-hours">
            Store hours
          </h2>
          <dl className="footer__hours">
            {STORE_HOURS.map((h) => (
              <div key={h.days}>
                <dt>{h.days}</dt>
                <dd>{h.hours}</dd>
              </div>
            ))}
          </dl>
          <p className="footer__note">Holiday and game-day hours may vary.</p>
        </section>

        <nav className="footer__col" aria-labelledby="footer-links">
          <h2 id="footer-links">Quick links</h2>
          <ul>
            <li><Link to="/products">Shop all products</Link></li>
            <li><Link to="/size-guide">Size guide</Link></li>
            <li><Link to="/about">About us</Link></li>
            <li><Link to="/visit">Visit us</Link></li>
            <li><Link to="/login">Login</Link></li>
          </ul>
        </nav>
      </div>
      <div className="footer__bottom">
        <p>© {YEAR} Campus Customs. All rights reserved.</p>
        <p>Officially licensed Yale merchandise · 57 Broadway, New Haven</p>
      </div>
    </footer>
  )
}
