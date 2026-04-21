import { useMemo } from 'react'
import type { StoredTagCatalogEntry, StoredVideoEvent } from '../lib/noteStorage'
import { formatHms } from '../lib/time'

type NotesTimelineProps = {
  events: StoredVideoEvent[]
  tagCatalog: StoredTagCatalogEntry[]
  currentTime: number
  onJumpTo: (seconds: number) => void
}

type NotePreviewProps = {
  label: string
  event: StoredVideoEvent
  tagCatalogMap: Map<string, StoredTagCatalogEntry>
  onJumpTo: (seconds: number) => void
}

function NotePreview({ label, event, tagCatalogMap, onJumpTo }: NotePreviewProps) {
  const displayText = event.type === 'tag' ? 'Tagged moment' : event.text
  return (
    <button
      type="button"
      className="btn btn-outline-secondary text-start w-100 d-flex flex-column align-items-start gap-1"
      onClick={() => onJumpTo(event.timestampSeconds)}
    >
      <span className="text-xs text-uppercase tracking-[0.15em] text-slate-500">{label}</span>
      <span className="fw-semibold text-slate-900">{formatHms(event.timestampSeconds)}</span>
      <span className="text-slate-700">{displayText}</span>
      {event.tagKeys.length > 0 ? (
        <div className="d-flex flex-wrap gap-1">
          {event.tagKeys.map((tagKey) => {
            const tag = tagCatalogMap.get(tagKey)
            const labelText = tag?.name ?? tagKey
            const color = tag?.color ?? '#E5E7EB'
            return (
              <span
                key={`${event.id}-${tagKey}`}
                className="px-2 py-1 rounded text-xs border"
                style={{ backgroundColor: color, color: '#111111' }}
              >
                {labelText}
              </span>
            )
          })}
        </div>
      ) : null}
    </button>
  )
}

function NotesTimeline({ events, tagCatalog, currentTime, onJumpTo }: NotesTimelineProps) {
  const tagCatalogMap = useMemo(
    () => new Map(tagCatalog.map((tag) => [tag.key, tag])),
    [tagCatalog]
  )

  const { previousEvent, upcomingEvents } = useMemo(() => {
    let previous: StoredVideoEvent | null = null
    const upcoming: StoredVideoEvent[] = []

    for (const event of events) {
      if (event.timestampSeconds < currentTime) {
        previous = event
        continue
      }

      if (upcoming.length < 2) {
        upcoming.push(event)
      }
    }

    return {
      previousEvent: previous,
      upcomingEvents: upcoming
    }
  }, [events, currentTime])

  const isFirstUpcomingCurrent = upcomingEvents.length > 0
    && upcomingEvents[0].timestampSeconds === currentTime

  return (
    <section className="rounded-4 border bg-white p-3 shadow-sm d-flex flex-column gap-2">
      <h2 className="h6 mb-1 text-slate-900">Event Timeline</h2>
      {previousEvent ? (
        <NotePreview label="Previous event" event={previousEvent} tagCatalogMap={tagCatalogMap} onJumpTo={onJumpTo} />
      ) : (
        <p className="mb-0 text-slate-600">No previous event at this time.</p>
      )}

      {upcomingEvents.map((event, index) => (
        <NotePreview
          key={event.id}
          label={isFirstUpcomingCurrent
            ? (index === 0 ? 'Current' : `Upcoming ${index}`)
            : `Upcoming ${index + 1}`}
          event={event}
          tagCatalogMap={tagCatalogMap}
          onJumpTo={onJumpTo}
        />
      ))}

      {upcomingEvents.length === 0 ? (
        <p className="mb-0 text-slate-600">No upcoming events.</p>
      ) : null}
    </section>
  )
}

export default NotesTimeline
