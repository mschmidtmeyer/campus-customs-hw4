import { Link } from 'react-router-dom'
import './SizeGuide.css'

// Approximate unisex garment measurements in inches (body chest, garment body length).
const CHART = [
  { size: 'XS', chest: '31–33', length: '26' },
  { size: 'S', chest: '34–36', length: '27' },
  { size: 'M', chest: '38–40', length: '28' },
  { size: 'L', chest: '42–44', length: '29' },
  { size: 'XL', chest: '46–48', length: '30' },
  { size: 'XXL', chest: '50–52', length: '31' },
]

const FIT_NOTES = [
  { type: 'Crewneck sweatshirt', note: 'Classic relaxed fit with ribbed cuffs and hem. Heavyweight styles may shrink slightly on a hot dryer — wash cold.' },
  { type: 'Short-sleeve t-shirt', note: 'True to size. Tri-blend tees drape softer and a little closer to the body.' },
  { type: 'Pullover hoodie', note: 'Roomy through the body with a front pouch pocket. Size up for an oversized look.' },
  { type: 'Full-zip hoodie', note: 'Similar to our pullovers but cut to layer over a tee; zips comfortably over a light shirt.' },
  { type: 'Quarter-zip pullover', note: 'Tailored, slightly trimmer fit. If you are between sizes, go up one.' },
  { type: 'Fleece jacket', note: 'Cut generously for layering over a sweater. Most people stay with their usual size.' },
  { type: 'Long-sleeve performance shirt', note: 'Athletic fit that sits close to the body for training. Size up for a looser feel.' },
  { type: 'Mockneck sweatshirt', note: 'Boxy, slightly cropped silhouette with a short funnel collar.' },
  { type: 'Bomber jacket', note: 'Structured fit with ribbed cuffs and waistband; leaves room for a hoodie underneath.' },
]

const MEASURE = [
  { what: 'Chest', how: 'Wrap a soft tape measure around the fullest part of your chest, under the arms, keeping it level.' },
  { what: 'Length', how: 'Lay a favorite top flat and measure from the highest point of the shoulder down to the hem.' },
  { what: 'Between sizes?', how: 'Pick the larger size for layering or a relaxed look, the smaller for a closer fit.' },
]

export default function SizeGuide() {
  return (
    <main className="page sizes">
      <header className="sizes__head" data-reveal="up">
        <p className="sizes__eyebrow">Size guide</p>
        <h1>Find your fit</h1>
        <p>Every style in the shop comes in XS through XXL. Use the chart below as a starting point.</p>
      </header>

      <section aria-labelledby="chart-title" className="sizes__card" data-reveal="up" data-reveal-delay="1">
        <h2 id="chart-title">Unisex size chart</h2>
        <div className="sizes__table-wrap">
          <table className="sizes__table">
            <caption>Approximate measurements in inches. Individual styles may vary by about ±1".</caption>
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Chest (in)</th>
                <th scope="col">Body length (in)</th>
              </tr>
            </thead>
            <tbody>
              {CHART.map((r) => (
                <tr key={r.size}>
                  <th scope="row">{r.size}</th>
                  <td>{r.chest}</td>
                  <td>{r.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="measure-title" className="sizes__section">
        <h2 id="measure-title" data-reveal="up">How to measure</h2>
        <ol className="sizes__measure">
          {MEASURE.map((m, i) => (
            <li key={m.what} data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
              <h3>{m.what}</h3>
              <p>{m.how}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fit-title" className="sizes__section">
        <h2 id="fit-title" data-reveal="up">Fit notes by style</h2>
        <dl className="sizes__fits">
          {FIT_NOTES.map((f, i) => (
            <div key={f.type} data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
              <dt>{f.type}</dt>
              <dd>{f.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="sizes__foot">
        Still unsure? <Link to="/visit">Visit the shop</Link> and try everything on, or{' '}
        <Link to="/products">browse the collection</Link>.
      </p>
    </main>
  )
}
