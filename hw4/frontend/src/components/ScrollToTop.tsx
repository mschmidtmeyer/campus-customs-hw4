import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Start each new page at the top (filter changes on /products keep their position). */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
