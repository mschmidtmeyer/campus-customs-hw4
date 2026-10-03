import { useId, useState } from 'react'
import './RecoveryCodes.css'

interface Props {
  codes: string[]
  /** Called once the shopper ticks "I saved my codes" and presses the button. */
  onDone: () => void
  doneLabel?: string
}

/** One-time display of password recovery codes (they are never shown again). */
export default function RecoveryCodes({ codes, onDone, doneLabel = 'Continue' }: Props) {
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState('')
  const id = useId()
  const text = `Campus Customs recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setStatus('Copied all codes to your clipboard.')
    } catch {
      setStatus('Couldn’t copy automatically. Please select and copy the codes.')
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'campus-customs-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Downloaded campus-customs-recovery-codes.txt.')
  }

  return (
    <section className="rc" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="rc__title">Your recovery codes</h2>
      <p className="rc__warning" role="note">
        <strong>Save these now — each code works once and we won’t show them again.</strong> If you forget your
        password, use one of them on the “Forgot your password?” page.
      </p>
      <ol className="rc__grid" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c} className="rc__code">{c}</li>
        ))}
      </ol>
      <div className="rc__buttons">
        <button type="button" className="auth__secondary" onClick={() => void copyAll()}>Copy all</button>
        <button type="button" className="auth__secondary" onClick={download}>Download .txt</button>
      </div>
      <p className="rc__status" role="status" aria-live="polite">{status}</p>
      <label className="rc__check" htmlFor={`${id}-saved`}>
        <input id={`${id}-saved`} type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I saved my codes
      </label>
      <button type="button" className="auth__submit" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </section>
  )
}
