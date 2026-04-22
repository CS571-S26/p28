import { useMemo, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { StoredTagCatalogEntry, StoredVideoEvent } from '../lib/noteStorage'
import { formatHms, validateTimestampInput } from '../lib/time'

type EditPatch = {
  text?: string
  timestampSeconds: number
  tagKeys?: string[]
}

type NotesListProps = {
  events: StoredVideoEvent[]
  tagCatalog: StoredTagCatalogEntry[]
  videoDuration: number | null
  onJumpTo: (seconds: number) => void
  onPlayClip: (eventId: string) => void
  onEdit: (eventId: string, patch: EditPatch) => Promise<void>
  onDelete: (eventId: string) => Promise<void>
  onEmptyStateClick: () => void
}

function NotesList({
  events,
  tagCatalog,
  videoDuration,
  onJumpTo,
  onPlayClip,
  onEdit,
  onDelete,
  onEmptyStateClick
}: NotesListProps) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editTimestamp, setEditTimestamp] = useState('')
  const [editTagKeys, setEditTagKeys] = useState<string[]>([])
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const editValidation = useMemo(
    () => validateTimestampInput(editTimestamp, videoDuration),
    [editTimestamp, videoDuration]
  )

  const tagMap = useMemo(
    () => new Map(tagCatalog.map((tag) => [tag.key, tag])),
    [tagCatalog]
  )

  const eventPendingDelete = events.find((event) => event.id === pendingDeleteEventId) ?? null

  function beginEdit(event: StoredVideoEvent) {
    setActionError(null)
    setEditingEventId(event.id)
    setEditText(event.text)
    setEditTimestamp(formatHms(event.timestampSeconds))
    setEditTagKeys(event.tagKeys)
  }

  function cancelEdit() {
    setEditingEventId(null)
    setEditText('')
    setEditTimestamp('')
    setEditTagKeys([])
  }

  function toggleEditTag(tagKey: string) {
    setEditTagKeys((previousTagKeys) => (
      previousTagKeys.includes(tagKey)
        ? previousTagKeys.filter((existingTagKey) => existingTagKey !== tagKey)
        : [...previousTagKeys, tagKey]
    ))
  }

  async function handleSaveEdit(eventId: string, eventType: StoredVideoEvent['type']) {
    const trimmedText = editText.trim()

    if (!editValidation.ok || (eventType === 'note' && !trimmedText)) {
      return
    }

    setIsSavingEdit(true)
    setActionError(null)

    try {
      await onEdit(eventId, {
        text: eventType === 'note' ? trimmedText : undefined,
        timestampSeconds: editValidation.seconds,
        tagKeys: editTagKeys
      })
      cancelEdit()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update this event'
      setActionError(message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteEventId) {
      return
    }

    setIsDeleting(true)
    setActionError(null)

    try {
      await onDelete(pendingDeleteEventId)
      setPendingDeleteEventId(null)
      if (editingEventId === pendingDeleteEventId) {
        cancelEdit()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete this event'
      setActionError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm h-100 d-flex flex-column">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h2 className="h5 mb-0 text-slate-900">Event feed</h2>
      </div>

      {events.length === 0 ? (
        <button
          type="button"
          className="btn btn-outline-primary w-100 py-4 mt-2"
          onClick={onEmptyStateClick}
        >
          No events yet - click to add your first event
        </button>
      ) : (
        <div className="d-flex flex-column gap-2 overflow-auto pe-1" style={{ maxHeight: '28rem' }}>
          {events.map((event) => {
            const isEditing = editingEventId === event.id
            const isEditingDisabled = isSavingEdit
              || !editValidation.ok
              || (event.type === 'note' && editText.trim().length === 0)
            const displayText = event.type === 'tag'
              ? 'Tagged moment'
              : (event.type === 'clip' ? (event.text || 'Recorded clip') : event.text)

            return (
              <article
                key={event.id}
                className="border rounded-3 p-2 d-flex flex-column gap-2 bg-light-subtle"
              >
                {isEditing ? (
                  <>
                    {event.type === 'note' ? (
                      <>
                        <label htmlFor={`event-text-${event.id}`} className="form-label mb-1 text-slate-700">
                          Event text
                        </label>
                        <textarea
                          id={`event-text-${event.id}`}
                          className="form-control form-control-sm"
                          rows={2}
                          value={editText}
                          onChange={(changeEvent) => setEditText(changeEvent.target.value)}
                        />
                      </>
                    ) : (
                      <p className="mb-0 text-sm text-slate-700">Quick tag events use the default title "Tagged moment"</p>
                    )}

                    <label htmlFor={`event-time-${event.id}`} className="form-label mb-1 text-slate-700">
                      Timestamp
                    </label>
                    <input
                      id={`event-time-${event.id}`}
                      type="text"
                      className={`form-control form-control-sm ${!editValidation.ok ? 'is-invalid' : ''}`}
                      value={editTimestamp}
                      onChange={(changeEvent) => setEditTimestamp(changeEvent.target.value)}
                      aria-invalid={!editValidation.ok}
                    />
                    {!editValidation.ok ? (
                      <div className="invalid-feedback d-block">{editValidation.error}</div>
                    ) : null}

                    {tagCatalog.length > 0 ? (
                      <div>
                        <p className="mb-1 text-sm text-slate-700">Tags</p>
                        <div className="d-flex flex-wrap gap-2">
                          {tagCatalog.map((tag) => {
                            const isSelected = editTagKeys.includes(tag.key)
                            return (
                              <button
                                key={tag.key}
                                type="button"
                                className={`btn btn-sm ${isSelected ? 'btn-dark' : 'btn-outline-secondary'}`}
                                onClick={() => toggleEditTag(tag.key)}
                              >
                                <span
                                  className="d-inline-block rounded-circle me-2 align-middle"
                                  style={{ width: '0.6rem', height: '0.6rem', backgroundColor: tag.color }}
                                  aria-hidden="true"
                                />
                                {tag.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="d-flex justify-content-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={cancelEdit}
                        disabled={isSavingEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          void handleSaveEdit(event.id, event.type)
                        }}
                        disabled={isEditingDisabled}
                      >
                        {isSavingEdit ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-link text-start text-decoration-none p-0 text-reset"
                      onClick={() => onJumpTo(event.timestampSeconds)}
                    >
                      <p className="mb-1 fw-semibold text-primary">{formatHms(event.timestampSeconds)}</p>
                      <p className="mb-1 text-slate-800">{displayText}</p>
                      {event.tagKeys.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {event.tagKeys.map((tagKey) => {
                            const tag = tagMap.get(tagKey)
                            const label = tag?.name ?? tagKey
                            const color = tag?.color ?? '#E5E7EB'
                            return (
                              <span
                                key={`${event.id}-${tagKey}`}
                                className="px-2 py-1 rounded text-xs border"
                                style={{ backgroundColor: color, color: '#111111' }}
                              >
                                {label}
                              </span>
                            )
                          })}
                        </div>
                      ) : null}
                    </button>
                    <div className="d-flex justify-content-end gap-2">
                      {event.type === 'clip' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            onPlayClip(event.id)
                          }}
                        >
                          View clip
                        </button>
                      ) : null}
                      {event.type === 'note' ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            beginEdit(event)
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          setPendingDeleteEventId(event.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}

      {actionError ? (
        <div className="alert alert-danger mt-3 mb-0" role="alert">
          {actionError}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDeleteEventId !== null}
        title="Delete event?"
        message={eventPendingDelete ? `Delete the event at ${formatHms(eventPendingDelete.timestampSeconds)}?` : 'Delete this event?'}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => {
          if (!isDeleting) {
            setPendingDeleteEventId(null)
          }
        }}
        onConfirm={() => {
          if (!isDeleting) {
            void handleConfirmDelete()
          }
        }}
      />
    </section>
  )
}

export default NotesList
