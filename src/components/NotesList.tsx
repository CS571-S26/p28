import { useMemo, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { StoredVideoNote } from '../lib/noteStorage'
import { formatHms, validateTimestampInput } from '../lib/time'

type EditPatch = {
  text: string
  timestampSeconds: number
}

type NotesListProps = {
  notes: StoredVideoNote[]
  videoDuration: number | null
  onJumpTo: (seconds: number) => void
  onEdit: (noteId: string, patch: EditPatch) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onEmptyStateClick: () => void
}

function NotesList({
  notes,
  videoDuration,
  onJumpTo,
  onEdit,
  onDelete,
  onEmptyStateClick
}: NotesListProps) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editTimestamp, setEditTimestamp] = useState('')
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const editValidation = useMemo(
    () => validateTimestampInput(editTimestamp, videoDuration),
    [editTimestamp, videoDuration]
  )

  const notePendingDelete = notes.find((note) => note.id === pendingDeleteNoteId) ?? null

  function beginEdit(note: StoredVideoNote) {
    setActionError(null)
    setEditingNoteId(note.id)
    setEditText(note.text)
    setEditTimestamp(formatHms(note.timestampSeconds))
  }

  function cancelEdit() {
    setEditingNoteId(null)
    setEditText('')
    setEditTimestamp('')
  }

  async function handleSaveEdit(noteId: string) {
    const trimmedText = editText.trim()

    if (!trimmedText || !editValidation.ok) {
      return
    }

    setIsSavingEdit(true)
    setActionError(null)

    try {
      await onEdit(noteId, {
        text: trimmedText,
        timestampSeconds: editValidation.seconds
      })
      cancelEdit()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update this note.'
      setActionError(message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteNoteId) {
      return
    }

    setIsDeleting(true)
    setActionError(null)

    try {
      await onDelete(pendingDeleteNoteId)
      setPendingDeleteNoteId(null)
      if (editingNoteId === pendingDeleteNoteId) {
        cancelEdit()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete this note.'
      setActionError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm h-100 d-flex flex-column">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h2 className="h5 mb-0 text-slate-900">Notes</h2>
      </div>

      {notes.length === 0 ? (
        <button
          type="button"
          className="btn btn-outline-primary w-100 py-4 mt-2"
          onClick={onEmptyStateClick}
        >
          No notes yet - click to add your first note
        </button>
      ) : (
        <div className="d-flex flex-column gap-2 overflow-auto pe-1" style={{ maxHeight: '28rem' }}>
          {notes.map((note) => {
            const isEditing = editingNoteId === note.id
            const isEditingDisabled = isSavingEdit || !editValidation.ok || editText.trim().length === 0

            return (
              <article
                key={note.id}
                className="border rounded-3 p-2 d-flex flex-column gap-2 bg-light-subtle"
              >
                {isEditing ? (
                  <>
                    <label htmlFor={`note-text-${note.id}`} className="form-label mb-1 text-slate-700">
                      Note text
                    </label>
                    <textarea
                      id={`note-text-${note.id}`}
                      className="form-control form-control-sm"
                      rows={2}
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                    />

                    <label htmlFor={`note-time-${note.id}`} className="form-label mb-1 text-slate-700">
                      Timestamp
                    </label>
                    <input
                      id={`note-time-${note.id}`}
                      type="text"
                      className={`form-control form-control-sm ${!editValidation.ok ? 'is-invalid' : ''}`}
                      value={editTimestamp}
                      onChange={(event) => setEditTimestamp(event.target.value)}
                      aria-invalid={!editValidation.ok}
                    />
                    {!editValidation.ok ? (
                      <div className="invalid-feedback d-block">{editValidation.error}</div>
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
                          void handleSaveEdit(note.id)
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
                      onClick={() => onJumpTo(note.timestampSeconds)}
                    >
                      <p className="mb-1 fw-semibold text-primary">{formatHms(note.timestampSeconds)}</p>
                      <p className="mb-0 text-slate-800">{note.text}</p>
                    </button>
                    <div className="d-flex justify-content-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          beginEdit(note)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDeleteNoteId(note.id)
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
        isOpen={pendingDeleteNoteId !== null}
        title="Delete note?"
        message={notePendingDelete ? `Delete the note at ${formatHms(notePendingDelete.timestampSeconds)}?` : 'Delete this note?'}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => {
          if (!isDeleting) {
            setPendingDeleteNoteId(null)
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
