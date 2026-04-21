import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type SyntheticEvent
} from 'react'
import {
  TAG_COLOR_PALETTE,
  saveNoteEvent,
  saveQuickTagEvent,
  type StoredTagCatalogEntry,
  type StoredVideoEvent
} from '../lib/noteStorage'
import TagCreationModal from './TagCreationModal'
import { formatHms, validateTimestampInput } from '../lib/time'

export type NoteComposerHandle = {
  focus: () => void
}

type NoteComposerProps = {
  videoId: string
  getCurrentTime: () => number
  videoDuration: number | null
  tagCatalog: StoredTagCatalogEntry[]
  onCreateTag: (name: string, color: (typeof TAG_COLOR_PALETTE)[number]) => Promise<StoredTagCatalogEntry>
  onEventSaved: (event: StoredVideoEvent) => void
  onStartComposing: () => void
}

function NoteComposerInner({
  videoId,
  getCurrentTime,
  videoDuration,
  tagCatalog,
  onCreateTag,
  onEventSaved,
  onStartComposing
}: NoteComposerProps, ref: ForwardedRef<NoteComposerHandle>) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [useCurrentTime, setUseCurrentTime] = useState(true)
  const [manualTimestamp, setManualTimestamp] = useState('')
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<(typeof TAG_COLOR_PALETTE)[number]>(TAG_COLOR_PALETTE[0])
  const [isCreateTagModalOpen, setIsCreateTagModalOpen] = useState(false)
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
  const isSaveNoteDisabled = !isTextValid || !isManualTimeValid || isSaving
  const isSaveQuickTagDisabled = selectedTagKeys.length === 0 || !isManualTimeValid || isSaving
  const isCreateTagDisabled = newTagName.trim().length === 0 || isSaving
  const createTagPreviewLabel = newTagName.trim() || 'Tag preview'

  const timestampPlaceholder = videoDuration !== null && Number.isFinite(videoDuration)
    ? `00:00:00 - ${formatHms(videoDuration)}`
    : 'hh:mm:ss'

  function resolveTimestampSeconds(): number | null {
    return useCurrentTime
      ? Math.max(0, Math.floor(getCurrentTime()))
      : manualValidation.ok
        ? manualValidation.seconds
        : null
  }

  function toggleTagSelection(tagKey: string) {
    setSelectedTagKeys((previousTagKeys) => {
      if (previousTagKeys.includes(tagKey)) {
        return previousTagKeys.filter((existingTagKey) => existingTagKey !== tagKey)
      }
      return [...previousTagKeys, tagKey]
    })
  }

  async function handleSaveNote(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaveNoteDisabled) {
      return
    }

    const resolvedTimestampSeconds = resolveTimestampSeconds()
    if (resolvedTimestampSeconds === null) {
      return
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      const savedEvent = await saveNoteEvent({
        videoId,
        text: text.trim(),
        timestampSeconds: resolvedTimestampSeconds,
        tagKeys: selectedTagKeys
      })
      setText('')
      setManualTimestamp('')
      setUseCurrentTime(true)
      setSelectedTagKeys([])
      onEventSaved(savedEvent)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this event'
      setSubmitError(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveQuickTag() {
    if (isSaveQuickTagDisabled) {
      return
    }

    const resolvedTimestampSeconds = resolveTimestampSeconds()
    if (resolvedTimestampSeconds === null) {
      return
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      const savedEvent = await saveQuickTagEvent({
        videoId,
        timestampSeconds: resolvedTimestampSeconds,
        tagKeys: selectedTagKeys
      })
      setManualTimestamp('')
      setUseCurrentTime(true)
      setSelectedTagKeys([])
      onEventSaved(savedEvent)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this event'
      setSubmitError(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateTag() {
    if (isCreateTagDisabled) {
      return
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      const createdTag = await onCreateTag(newTagName, newTagColor)
      setNewTagName('')
      setNewTagColor(TAG_COLOR_PALETTE[0])
      setSelectedTagKeys((previousTagKeys) => (
        previousTagKeys.includes(createdTag.key)
          ? previousTagKeys
          : [...previousTagKeys, createdTag.key]
      ))
      setIsCreateTagModalOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create this tag'
      setSubmitError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm">
      <h2 className="h5 mb-3 text-slate-900">Add event</h2>
      <form className="d-flex flex-column gap-3" onSubmit={(event) => { void handleSaveNote(event) }}>
        <div>
          <label htmlFor="note-text" className="form-label">
            Note text
          </label>
          <textarea
            id="note-text"
            ref={textAreaRef}
            className="form-control"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={onStartComposing}
            placeholder="Add a note to your film at a specific moment"
          />
        </div>

        <div>
          <p className="form-label mb-2">Tags</p>
          {tagCatalog.length === 0 ? (
            <p className="mb-0 text-sm text-slate-600">Create a global tag to start tagging events</p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {tagCatalog.map((tag) => {
                const isSelected = selectedTagKeys.includes(tag.key)
                return (
                  <button
                    key={tag.key}
                    type="button"
                    className={`btn btn-sm ${isSelected ? 'btn-dark' : 'btn-outline-secondary'}`}
                    onClick={() => toggleTagSelection(tag.key)}
                  >
                    <span
                      className="d-inline-block rounded-circle me-2 align-middle"
                      style={{ width: '0.6rem', height: '0.6rem', backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm mt-2"
            onClick={() => {
              setSubmitError(null)
              setIsCreateTagModalOpen(true)
            }}
          >
            Create global tag
          </button>
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

        <div className="d-flex flex-column flex-sm-row justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => {
              void handleSaveQuickTag()
            }}
            disabled={isSaveQuickTagDisabled}
          >
            {isSaving ? 'Saving...' : 'Save quick tag event'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaveNoteDisabled}>
            {isSaving ? 'Saving...' : 'Save note event'}
          </button>
        </div>

        {submitError ? (
          <div className="alert alert-danger mb-0" role="alert">
            {submitError}
          </div>
        ) : null}
      </form>
      <TagCreationModal
        isOpen={isCreateTagModalOpen}
        isSaving={isSaving}
        tagName={newTagName}
        selectedColor={newTagColor}
        previewLabel={createTagPreviewLabel}
        isCreateDisabled={isCreateTagDisabled}
        onTagNameChange={setNewTagName}
        onColorChange={setNewTagColor}
        onClose={() => setIsCreateTagModalOpen(false)}
        onCreate={() => {
          void handleCreateTag()
        }}
      />
    </section>
  )
}

const NoteComposer = forwardRef(NoteComposerInner)

export default NoteComposer
