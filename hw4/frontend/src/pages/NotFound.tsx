import { Link } from 'react-router-dom'
import './NotFound.css'

export default function NotFound() {
  return (
    <main className="page notfound">
      <p className="notfound__code" aria-hidden="true">404</p>
      <h1>This page wandered off campus</h1>
      <p>We couldn't find what you were looking for. It may have moved, or the link may be mistyped.</p>
      <div className="notfound__links">
        <Link to="/" className="notfound__btn">Back to home</Link>
        <Link to="/products" className="notfound__btn notfound__btn--outline">Browse products</Link>
      </div>
    </main>
  )
}
