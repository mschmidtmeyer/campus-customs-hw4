import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import './PasswordBanner.css'

/** Site-wide warning for accounts that still use an old, insecure password. */
export default function PasswordBanner() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (!user?.password_needs_update || pathname === '/account/password') return null
  return (
    <div className="pw-banner" role="alert">
      <div className="pw-banner__inner">
        <span className="pw-banner__icon" aria-hidden="true">!</span>
        <p>
          <strong>Hey {user.first_name ?? 'there'}, this password isn’t secure.</strong> It was set before our
          current security rules. Please update it.
        </p>
        <Link to="/account/password" className="pw-banner__btn">
          Update password
        </Link>
      </div>
    </div>
  )
}
