import { Link } from 'react-router-dom'
import { STORE_ADDRESS, STORE_HOURS } from '../storeInfo'
import './VisitUs.css'

const IN_STORE = [
  { title: 'Custom orders', copy: 'Planning shirts for a team, club or family reunion? Stop by and talk through names, crests or class years with our team.' },
  { title: 'Accessories', copy: 'Caps, totes, mugs and scarves are sold in the shop only. Ask at the counter for what is on the shelf today.' },
  { title: 'Try before you buy', copy: 'Most styles come in XS to XXL. Try a crewneck and a quarter-zip side by side; stock varies by size, so check the product page first.' },
  { title: 'Group & team pickups', copy: 'Ordered for a whole team or residential college? Collect it all at once at the counter.' },
]

export default function VisitUs() {
  return (
    <main className="page visit">
      <header className="visit__head" data-reveal="up">
        <p className="visit__eyebrow">Visit us</p>
        <h1>Find us on Broadway</h1>
        <p>We're a short walk from Old Campus — come try things on and say hello.</p>
      </header>

      <div className="visit__grid">
        <section className="map-card" aria-labelledby="map-title" data-reveal="up" data-reveal-delay="1">
          <div className="map-card__map" aria-hidden="true">
            <span className="map-road map-road--h1" />
            <span className="map-road map-road--h2" />
            <span className="map-road map-road--v1" />
            <span className="map-road map-road--diag" />
            <span className="map-green" />
            <span className="map-label map-label--broadway">Broadway</span>
            <span className="map-label map-label--green">Old Campus</span>
            <span className="map-pin"><span /></span>
          </div>
          <div className="map-card__body">
            <h2 id="map-title">Campus Customs</h2>
            <address>
              {STORE_ADDRESS.street}
              <br />
              {STORE_ADDRESS.cityLine}
            </address>
            <a href={STORE_ADDRESS.mapsUrl} target="_blank" rel="noopener noreferrer" className="visit__btn">
              Open in Google Maps<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </section>

        <section className="hours-card" aria-labelledby="hours-title" data-reveal="up" data-reveal-delay="2">
          <h2 id="hours-title">Store hours</h2>
          <table className="hours-table">
            <tbody>
              {STORE_HOURS.map((h) => (
                <tr key={h.days}>
                  <th scope="row">{h.days}</th>
                  <td>{h.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hours-card__note">Holiday and game-day hours may vary.</p>
        </section>
      </div>

      <section className="instore" aria-labelledby="instore-title">
        <h2 id="instore-title" data-reveal="up">What you can do in the shop</h2>
        <ul>
          {IN_STORE.map((i, idx) => (
            <li key={i.title} data-reveal="up" data-reveal-delay={String((idx % 4) + 1)}>
              <h3>{i.title}</h3>
              <p>{i.copy}</p>
            </li>
          ))}
        </ul>
        <p className="instore__more">
          Not sure about sizing before you come in? Check our <Link to="/size-guide">size guide</Link>.
        </p>
      </section>
    </main>
  )
}
