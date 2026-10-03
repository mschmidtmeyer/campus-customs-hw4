import { Link } from 'react-router-dom'
import './About.css'

const VALUES = [
  {
    title: 'Right on Broadway',
    copy: 'We are a short walk from Old Campus, so you can see a hoodie up close, feel the fabric and pick it up the same day.',
  },
  {
    title: 'Licensed, always',
    copy: 'Every Yale mark we carry is officially licensed, from residential college crests to team wordmarks and the classic block Y.',
  },
  {
    title: 'Built for every Bulldog',
    copy: 'First-years, grad students, coaches, alumni, and the families who drive in for move-in day — we stock sizes XS through XXL and help you find the right one.',
  },
  {
    title: 'Honest answers',
    copy: 'Ask us about price, sizes or stock and you get the real numbers. If something is sold out in your size, we will tell you, and point you to what is in stock.',
  },
]

const CUSTOM = [
  { who: 'Residential colleges', what: 'Crests for Branford, Saybrook, Pierson, Davenport, Grace Hopper and the rest — on crews, quarter-zips and tees.' },
  { who: 'Teams & clubs', what: 'Left-chest sport marks for varsity, club and intramural squads, plus bulk orders for the whole roster.' },
  { who: 'Graduate & professional schools', what: 'Law, Medicine, Management, Nursing, Art, Music and more, finished with clean embroidery.' },
  { who: 'Families', what: 'Our Mom, Dad, Grandpa, Grandma, Aunt, Uncle, Brother and Cousin lines — so the whole cheering section matches.' },
]

export default function About() {
  return (
    <main className="about">
      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-hero__inner" data-reveal="up">
          <p className="about-eyebrow">Our story</p>
          <h1 id="about-title">A small shop with a lot of Bulldog in it</h1>
          <p>
            Campus Customs is a neighborhood Yale shop at 57 Broadway built on a simple idea: everyone who
            loves this place — students, alumni, teams and families — should find gear that feels like
            theirs. Crests for every residential college, lines for every sport, and a sweatshirt for
            Mom, Dad and Grandpa too. We are always happy to chat about which crewneck runs warmest.
          </p>
        </div>
      </section>

      <section className="about-section" aria-labelledby="values-title">
        <h2 id="values-title" data-reveal="up">What we care about</h2>
        <ul className="about-values">
          {VALUES.map((v, i) => (
            <li key={v.title} data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
              <h3>{v.title}</h3>
              <p>{v.copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section about-section--tint" aria-labelledby="custom-title">
        <div className="about-split">
          <div data-reveal="left">
            <h2 id="custom-title">Custom work for every corner of campus</h2>
            <p>
              Need forty matching hoodies for a team banquet, or one crewneck with a grandparent's class
              year? Bring us your idea. We'll help with layout, pick a garment that fits the occasion and
              tell you honestly how long it'll take.
            </p>
            <Link to="/visit" className="about-btn">Start a custom order in store</Link>
          </div>
          <dl className="about-custom" data-reveal="right" data-reveal-delay="1">
            {CUSTOM.map((c) => (
              <div key={c.who}>
                <dt>{c.who}</dt>
                <dd>{c.what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="about-section about-cta" aria-labelledby="about-cta-title">
        <h2 id="about-cta-title" data-reveal="up">Come find your blue</h2>
        <p>Browse the collection online, then swing by 57 Broadway to try it on.</p>
        <div className="about-cta__btns" data-reveal="up" data-reveal-delay="1">
          <Link to="/products" className="about-btn">Shop products</Link>
          <Link to="/size-guide" className="about-btn about-btn--outline">Check the size guide</Link>
        </div>
      </section>
    </main>
  )
}
