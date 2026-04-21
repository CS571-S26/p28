import { useMemo } from 'react'
import type { StoredVideoNote } from '../lib/noteStorage'
import { formatHms } from '../lib/time'

type NotesTimelineProps = {
  notes: StoredVideoNote[]
  currentTime: number
  onJumpTo: (seconds: number) => void
}

type NotePreviewProps = {
  label: string
  note: StoredVideoNote
  onJumpTo: (seconds: number) => void
}

function NotePreview({ label, note, onJumpTo }: NotePreviewProps) {
  return (
    <button
      type="button"
      className="btn btn-outline-secondary text-start w-100 d-flex flex-column align-items-start gap-1"
      onClick={() => onJumpTo(note.timestampSeconds)}
    >
      <span className="text-xs text-uppercase tracking-[0.15em] text-slate-500">{label}</span>
      <span className="fw-semibold text-slate-900">{formatHms(note.timestampSeconds)}</span>
      <span className="text-slate-700">{note.text}</span>
    </button>
  )
}

function NotesTimeline({ notes, currentTime, onJumpTo }: NotesTimelineProps) {
  const { previousNote, upcomingNotes } = useMemo(() => {
    let previous: StoredVideoNote | null = null
    const upcoming: StoredVideoNote[] = []

    for (const note of notes) {
      if (note.timestampSeconds < currentTime) {
        previous = note
        continue
      }

      if (upcoming.length < 2) {
        upcoming.push(note)
      }
    }

    return {
      previousNote: previous,
      upcomingNotes: upcoming
    }
  }, [notes, currentTime])

  const isFirstUpcomingCurrent = upcomingNotes.length > 0
    && upcomingNotes[0].timestampSeconds === currentTime

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm d-flex flex-column gap-2">
      <h2 className="h6 mb-1 text-slate-900">Timeline focus</h2>
      {previousNote ? (
        <NotePreview label="Previous note" note={previousNote} onJumpTo={onJumpTo} />
      ) : (
        <p className="mb-0 text-slate-600">No previous note at this time.</p>
      )}

      {upcomingNotes.map((note, index) => (
        <NotePreview
          key={note.id}
          label={isFirstUpcomingCurrent
            ? (index === 0 ? 'Current' : `Upcoming ${index}`)
            : `Upcoming ${index + 1}`}
          note={note}
          onJumpTo={onJumpTo}
        />
      ))}

      {upcomingNotes.length === 0 ? (
        <p className="mb-0 text-slate-600">No upcoming notes.</p>
      ) : null}
    </section>
  )
}

export default NotesTimeline
