import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type SyntheticEvent
} from 'react'
import { saveVideoNote, type StoredVideoNote } from '../lib/noteStorage'
import { formatHms, validateTimestampInput } from '../lib/time'

export type NoteComposerHandle = {
  focus: () => void
}

type NoteComposerProps = {
  videoId: string
  getCurrentTime: () => number
  videoDuration: number | null
  onNoteSaved: (note: StoredVideoNote) => void
  onStartComposing: () => void
}

function NoteComposerInner({
  videoId,
  getCurrentTime,
  videoDuration,
  onNoteSaved,
  onStartComposing
}: NoteComposerProps, ref: ForwardedRef<NoteComposerHandle>) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [useCurrentTime, setUseCurrentTime] = useState(true)
  const [manualTimestamp, setManualTimestamp] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useImperativeHandle(ref, () => ({
    focus() {
      textAreaRef.current?.focus()
    }
  }), [])

  const manualValidation = useMemo(
    () => validateTimestampInput(manualTimestamp, videoDuration),
    [manualTimestamp, videoDuration]
  )

  const isTextValid = text.trim().length > 0
  const isManualTimeValid = useCurrentTime || manualValidation.ok
  const isSubmitDisabled = !isTextValid || !isManualTimeValid || isSaving

  const timestampPlaceholder = videoDuration !== null && Number.isFinite(videoDuration)
    ? `00:00:00 - ${formatHms(videoDuration)}`
    : 'hh:mm:ss'

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitDisabled) {
      return
    }

    const resolvedTimestampSeconds = useCurrentTime
      ? Math.max(0, Math.floor(getCurrentTime()))
      : manualValidation.ok
        ? manualValidation.seconds
        : null

    if (resolvedTimestampSeconds === null) {
      return
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      const savedNote = await saveVideoNote({
        videoId,
        text: text.trim(),
        timestampSeconds: resolvedTimestampSeconds
      })
      setText('')
      setManualTimestamp('')
      setUseCurrentTime(true)
      onNoteSaved(savedNote)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this note.'
      setSubmitError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm">
      <h2 className="h5 mb-3 text-slate-900">Add note</h2>
      <form className="d-flex flex-column gap-3" onSubmit={(event) => { void handleSubmit(event) }}>
        <div>
          <label htmlFor="note-text" className="form-label">
            Note
          </label>
          <textarea
            id="note-text"
            ref={textAreaRef}
            className="form-control"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={onStartComposing}
            placeholder="Write your note for this moment in the film."
          />
        </div>

        <div className="form-check">
          <input
            id="use-current-time"
            type="checkbox"
            className="form-check-input"
            checked={useCurrentTime}
            onChange={(event) => setUseCurrentTime(event.target.checked)}
          />
          <label htmlFor="use-current-time" className="form-check-label">
            Use current video time
          </label>
        </div>

        {!useCurrentTime ? (
          <div>
            <label htmlFor="manual-timestamp" className="form-label">
              Manual timestamp
            </label>
            <input
              id="manual-timestamp"
              type="text"
              className={`form-control ${!manualValidation.ok ? 'is-invalid' : ''}`}
              value={manualTimestamp}
              onChange={(event) => setManualTimestamp(event.target.value)}
              aria-invalid={!manualValidation.ok}
              placeholder={timestampPlaceholder}
            />
            {!manualValidation.ok ? (
              <div className="invalid-feedback d-block">{manualValidation.error}</div>
            ) : null}
          </div>
        ) : null}

        <div className="d-flex justify-content-end">
          <button type="submit" className="btn btn-primary" disabled={isSubmitDisabled}>
            {isSaving ? 'Saving note...' : 'Save note'}
          </button>
        </div>

        {submitError ? (
          <div className="alert alert-danger mb-0" role="alert">
            {submitError}
          </div>
        ) : null}
      </form>
    </section>
  )
}

const NoteComposer = forwardRef(NoteComposerInner)

export default NoteComposer
