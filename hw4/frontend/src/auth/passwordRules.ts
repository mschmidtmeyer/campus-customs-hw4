// Live password checklist for the sign-up form. Mirrors password_problems()
// in backend/auth.py; the server re-checks everything (and holds the full
// common-password list), so this is only for instant feedback.

export const MIN_PASSWORD_LENGTH = 10

const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'iloveyou', 'admin',
  'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'abc', 'abcdef',
  'yale', 'yaleuniversity', 'bulldog', 'bulldogs', 'handsomedan', 'boolaboola', 'campuscustoms',
  'harvard', 'newhaven',
])

export interface PasswordContext {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface Rule {
  id: string
  label: string
  ok: boolean
}

export function passwordRules(pw: string, ctx: PasswordContext): Rule[] {
  const lower = pw.toLowerCase()
  const lettersOnly = lower.replace(/[^a-z]/g, '')
  const names = [ctx.firstName, ctx.lastName].map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3)
  const emailLower = ctx.email.trim().toLowerCase()
  const local = emailLower.split('@')[0]
  const phoneDigits = ctx.phone.replace(/\D/g, '')
  const pwDigits = pw.replace(/\D/g, '')

  return [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: pw.length >= MIN_PASSWORD_LENGTH },
    { id: 'number', label: 'At least one number', ok: /\d/.test(pw) },
    { id: 'symbol', label: 'At least one symbol (like ! ? # $)', ok: /[^A-Za-z0-9]/.test(pw) },
    {
      id: 'common',
      label: 'Not a common password',
      ok: pw.length > 0 && !COMMON.has(lower) && !(lettersOnly.length >= 4 && COMMON.has(lettersOnly)),
    },
    {
      id: 'personal',
      label: 'Does not contain your name, email, or phone number',
      ok:
        pw.length > 0 &&
        !names.some((n) => lower.includes(n)) &&
        !(local.length >= 3 && (lower.includes(local) || lower.includes(emailLower))) &&
        !(phoneDigits.length >= 7 && (pwDigits.includes(phoneDigits.slice(-7)) || pwDigits.includes(phoneDigits.slice(-4).repeat(2)))),
    },
  ]
}
