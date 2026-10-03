import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  changePassword as changePasswordApi,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  resetPassword as resetPasswordApi,
  type UserWithCodes,
} from '../api'
import type { RegisterInput, User } from '../types'
import { AuthContext, type AuthState } from './authContext'

/** Keep the one-time recovery codes out of the long-lived user state. */
function withoutCodes(u: UserWithCodes): User {
  const { recovery_codes: _codes, ...user } = u
  return user
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchMe()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginAccount(email, password)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const u = await registerAccount(input)
    setUser(withoutCodes(u))
    return u
  }, [])

  const logout = useCallback(async () => {
    await logoutAccount()
    setUser(null)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const u = await changePasswordApi(currentPassword, newPassword)
    setUser(withoutCodes(u))
    return u
  }, [])

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    const u = await resetPasswordApi(email, code, newPassword)
    setUser(withoutCodes(u))
    return u
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, changePassword, resetPassword }),
    [user, loading, login, register, logout, changePassword, resetPassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
