import { createContext, useContext } from 'react'
import type { UserWithCodes } from '../api'
import type { RegisterInput, User } from '../types'

export interface AuthState {
  user: User | null
  /** True until the first /api/auth/me check finishes. */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  /** Resolves with the user and their one-time recovery codes. */
  register: (input: RegisterInput) => Promise<UserWithCodes>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<UserWithCodes>
  /** Forgotten password: reset with a recovery code and sign in. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<UserWithCodes>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
