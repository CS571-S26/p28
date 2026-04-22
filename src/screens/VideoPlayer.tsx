import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStoredVideoById, type StoredVideoRecord } from '../lib/videoStorage'
import {
  createTagCatalogEntry,
  deleteVideoEvent,
  listEventsForVideo,
  listTagCatalogEntries,
  updateVideoEvent,
  type StoredTagCatalogEntry,
  type StoredVideoEvent
} from '../lib/noteStorage'
import { deleteVideoClip } from '../lib/clipStorage'
import NoteComposer, { type NoteComposerHandle } from '../components/NoteComposer'
import ClipPlayerModal from '../components/ClipPlayerModal'
import ClipRecorderModal from '../components/ClipRecorderModal'
import NotesList from '../components/NotesList'
import NotesNowPlaying from '../components/NotesTimeline'
import { handleVideoKeyboardShortcut } from '../lib/videoKeyboardSeek'

function formatFileSize(sizeInBytes: number): string {
  const sizeInMegabytes = sizeInBytes / (1024 * 1024)
  return `${sizeInMegabytes.toFixed(2)} MB`
}

function sortEventsByTimestamp(events: StoredVideoEvent[]): StoredVideoEvent[] {
  return [...events].sort((a, b) => {
    if (a.timestampSeconds === b.timestampSeconds) {
      return a.createdAt - b.createdAt
    }
    return a.timestampSeconds - b.timestampSeconds
  })
}

function sortTagCatalog(entries: StoredTagCatalogEntry[]): StoredTagCatalogEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function VideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>()
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const composerRef = useRef<NoteComposerHandle>(null)
  const [videoRecord, setVideoRecord] = useState<StoredVideoRecord | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [events, setEvents] = useState<StoredVideoEvent[]>([])
  const [tagCatalog, setTagCatalog] = useState<StoredTagCatalogEntry[]>([])
  const [selectedFilterTagKeys, setSelectedFilterTagKeys] = useState<string[]>([])
  const [tagFilterMode, setTagFilterMode] = useState<'or' | 'and'>('or')
  const [searchText, setSearchText] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [isClipRecorderOpen, setIsClipRecorderOpen] = useState(false)
  const [clipStartTimestamp, setClipStartTimestamp] = useState(0)
  const [playingClipEventId, setPlayingClipEventId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadVideo() {
      if (!videoId) {
        setErrorMessage('No video was selected')
        setIsLoading(false)
        return
      }

      try {
        const storedVideo = await getStoredVideoById(videoId)

        if (isCancelled) {
          return
        }

        if (!storedVideo) {
          setErrorMessage('This video could not be found')
          setVideoRecord(null)
          return
        }

        setVideoRecord(storedVideo)
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to open this video'
          setErrorMessage(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadVideo()

    return () => {
      isCancelled = true
    }
  }, [videoId])

  useEffect(() => {
    let isCancelled = false

    async function loadEventsAndTags() {
      if (!videoId) {
        setEvents([])
        setTagCatalog([])
        return
      }

      try {
        const [storedEvents, storedTagCatalog] = await Promise.all([
          listEventsForVideo(videoId),
          listTagCatalogEntries()
        ])

        if (!isCancelled) {
          setEvents(sortEventsByTimestamp(storedEvents))
          setTagCatalog(sortTagCatalog(storedTagCatalog))
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load video events'
          setErrorMessage(message)
        }
      }
    }

    void loadEventsAndTags()

    return () => {
      isCancelled = true
    }
  }, [videoId])

  useEffect(() => {
    if (!videoRecord) {
      return
    }

    const nextVideoUrl = URL.createObjectURL(videoRecord.file)
    setVideoUrl(nextVideoUrl)

    return () => {
      URL.revokeObjectURL(nextVideoUrl)
    }
  }, [videoRecord])

  const getCurrentTime = useCallback(() => {
    return videoElementRef.current?.currentTime ?? 0
  }, [])

  const jumpTo = useCallback((seconds: number) => {
    if (!videoElementRef.current) {
      return
    }

    videoElementRef.current.currentTime = Math.max(0, seconds)
    setCurrentTime(Math.max(0, Math.floor(seconds)))
  }, [])

  const pauseVideo = useCallback(() => {
    videoElementRef.current?.pause()
  }, [])

  const handleStartComposing = useCallback(() => {
    pauseVideo()
  }, [pauseVideo])

  const handleEmptyStateClick = useCallback(() => {
    pauseVideo()
    composerRef.current?.focus()
  }, [pauseVideo])

  const handleEventSaved = useCallback((savedEvent: StoredVideoEvent) => {
    setEvents((previousEvents) => sortEventsByTimestamp([...previousEvents, savedEvent]))
  }, [])

  const handleEditEvent = useCallback(async (
    eventId: string,
    patch: { text?: string; timestampSeconds: number; tagKeys?: string[] }
  ) => {
    const updatedEvent = await updateVideoEvent(eventId, patch)

    if (!updatedEvent) {
      setEvents((previousEvents) => previousEvents.filter((event) => event.id !== eventId))
      return
    }

    setEvents((previousEvents) => {
      const nextEvents = previousEvents.map((event) => (event.id === eventId ? updatedEvent : event))
      return sortEventsByTimestamp(nextEvents)
    })
  }, [])

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    const targetEvent = events.find((event) => event.id === eventId)
    if (targetEvent?.type === 'clip') {
      await deleteVideoClip(targetEvent.clipId)
    }
    await deleteVideoEvent(eventId)
    setEvents((previousEvents) => previousEvents.filter((event) => event.id !== eventId))
    if (playingClipEventId === eventId) {
      setPlayingClipEventId(null)
    }
  }, [events, playingClipEventId])

  const handleCreateTag = useCallback(async (name: string, color: StoredTagCatalogEntry['color']) => {
    const createdTag = await createTagCatalogEntry({ name, color })
    setTagCatalog((previousTagCatalog) => sortTagCatalog([...previousTagCatalog, createdTag]))
    return createdTag
  }, [])

  const visibleEvents = useMemo(() => {
    const normalizedQuery = searchText.trim().toLowerCase()
    return events.filter((event) => {
      const matchesTags = selectedFilterTagKeys.length === 0
        ? true
        : (tagFilterMode === 'or'
          ? selectedFilterTagKeys.some((tagKey) => event.tagKeys.includes(tagKey))
          : selectedFilterTagKeys.every((tagKey) => event.tagKeys.includes(tagKey)))
      if (!matchesTags) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return (event.type === 'note' || event.type === 'clip')
        && event.text.toLowerCase().includes(normalizedQuery)
    })
  }, [events, searchText, selectedFilterTagKeys, tagFilterMode])

  const toggleFilterTag = useCallback((tagKey: string) => {
    setSelectedFilterTagKeys((previousTagKeys) => (
      previousTagKeys.includes(tagKey)
        ? previousTagKeys.filter((existingTagKey) => existingTagKey !== tagKey)
        : [...previousTagKeys, tagKey]
    ))
  }, [])

  const handleVideoKeyDownCapture = useCallback((event: KeyboardEvent<HTMLVideoElement>) => {
    const videoElement = videoElementRef.current
    if (!videoElement) {
      return
    }

    handleVideoKeyboardShortcut(event, videoElement, (nextTime) => {
      setCurrentTime(Math.floor(nextTime))
    })
  }, [])

  const handleOpenClipRecorder = useCallback(() => {
    const nextStartTimestamp = getCurrentTime()
    setClipStartTimestamp(Math.max(0, nextStartTimestamp))
    pauseVideo()
    setIsClipRecorderOpen(true)
  }, [getCurrentTime, pauseVideo])

  const handlePlayClip = useCallback((eventId: string) => {
    pauseVideo()
    setPlayingClipEventId(eventId)
  }, [pauseVideo])

  const activeClipEvent = useMemo(
    () => events.find((event): event is Extract<StoredVideoEvent, { type: 'clip' }> => (
      event.id === playingClipEventId && event.type === 'clip'
    )) ?? null,
    [events, playingClipEventId]
  )

  return (
    <main className="container-fluid px-3 px-xl-4 py-5 grow">
      <section className="row justify-content-center">
        <div className="col-12 col-xxl-11">
          <div className="rounded-4 border bg-white p-4 p-lg-5 shadow-sm">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
              <div>
                <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
                <h1 className="mb-2 text-3xl font-semibold text-slate-900">Video player</h1>
              </div>

              <div className="d-flex flex-column flex-sm-row gap-2">
                <Link to="/videos" className="btn btn-outline-secondary px-4 py-2">
                  Back to gallery
                </Link>
              </div>
            </div>

            {isLoading ? (
              <p className="mb-0 text-slate-600">Loading video...</p>
            ) : videoRecord && videoUrl ? (
              <div className="row g-4">
                <div className="col-lg-8 d-flex flex-column gap-3">
                  <div className="ratio ratio-16x9 overflow-hidden rounded-4 bg-dark shadow-sm">
                    <video
                      ref={videoElementRef}
                      key={videoUrl}
                      className="h-100 w-100"
                      controls
                      preload="metadata"
                      src={videoUrl}
                      onLoadedMetadata={(event) => {
                        const durationValue = event.currentTarget.duration
                        setVideoDuration(Number.isFinite(durationValue) ? durationValue : null)
                      }}
                      onTimeUpdate={(event) => {
                        const roundedSeconds = Math.floor(event.currentTarget.currentTime)
                        setCurrentTime((previousTime) => (
                          previousTime === roundedSeconds ? previousTime : roundedSeconds
                        ))
                      }}
                      onKeyDownCapture={handleVideoKeyDownCapture}
                    >
                      Your browser does not support playing this video
                    </video>
                  </div>

                  <div className="d-flex flex-column flex-md-row justify-content-between gap-3 text-slate-600">
                    <div>
                      <p className="mb-1 fw-semibold text-slate-900">{videoRecord.title}</p>
                    </div>
                    <div className="text-md-end">
                      <p className="mb-1">{formatFileSize(videoRecord.size)}</p>
                    </div>
                  </div>

                  <NoteComposer
                    ref={composerRef}
                    videoId={videoRecord.id}
                    getCurrentTime={getCurrentTime}
                    videoDuration={videoDuration}
                    tagCatalog={tagCatalog}
                    onCreateTag={handleCreateTag}
                    onStartComposing={handleStartComposing}
                    onEventSaved={handleEventSaved}
                  />
                  <div className="d-flex justify-content-end">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={handleOpenClipRecorder}
                    >
                      Add clip here
                    </button>
                  </div>
                </div>
                <div className="col-lg-4 d-flex flex-column gap-3">
                  <section className="rounded-4 border bg-white p-3 shadow-sm d-flex flex-column gap-2">
                    <h2 className="h6 mb-1 text-slate-900">Event filters</h2>
                    <input
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Search note text"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    <div className="d-flex align-items-center gap-2">
                      <label htmlFor="tag-filter-mode" className="form-label mb-0 text-sm text-slate-700">
                        Tag match
                      </label>
                      <select
                        id="tag-filter-mode"
                        className="form-select form-select-sm"
                        value={tagFilterMode}
                        onChange={(event) => setTagFilterMode(event.target.value as 'or' | 'and')}
                      >
                        <option value="or">Match any (OR)</option>
                        <option value="and">Match all (AND)</option>
                      </select>
                    </div>
                    {tagCatalog.length > 0 ? (
                      <div className="d-flex flex-wrap gap-2">
                        {tagCatalog.map((tag) => {
                          const isSelected = selectedFilterTagKeys.includes(tag.key)
                          return (
                            <button
                              key={`filter-${tag.key}`}
                              type="button"
                              className={`btn btn-sm ${isSelected ? 'btn-dark' : 'btn-outline-secondary'}`}
                              onClick={() => toggleFilterTag(tag.key)}
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
                    ) : (
                      <p className="mb-0 text-sm text-slate-600">No tags created yet</p>
                    )}
                  </section>
                  <NotesNowPlaying
                    events={visibleEvents}
                    tagCatalog={tagCatalog}
                    currentTime={currentTime}
                    onJumpTo={jumpTo}
                    onPlayClip={handlePlayClip}
                  />
                  <div className="grow">
                    <NotesList
                      events={visibleEvents}
                      tagCatalog={tagCatalog}
                      videoDuration={videoDuration}
                      onJumpTo={jumpTo}
                      onPlayClip={handlePlayClip}
                      onEdit={handleEditEvent}
                      onDelete={handleDeleteEvent}
                      onEmptyStateClick={handleEmptyStateClick}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="alert alert-warning mb-0" role="alert">
                This video is unavailable - it may have been removed from your gallery
              </div>
            )}

            {errorMessage ? (
              <div className="alert alert-danger mt-4 mb-0" role="alert">
                {errorMessage}
              </div>
            ) : null}

            {videoRecord && videoUrl ? (
              <ClipRecorderModal
                isOpen={isClipRecorderOpen}
                videoId={videoRecord.id}
                videoUrl={videoUrl}
                initialTimestampSeconds={clipStartTimestamp}
                onClose={() => setIsClipRecorderOpen(false)}
                onEventSaved={handleEventSaved}
              />
            ) : null}

            {activeClipEvent ? (
              <ClipPlayerModal
                clipId={activeClipEvent.clipId}
                clipTitle={activeClipEvent.text}
                isOpen={playingClipEventId !== null}
                onClose={() => setPlayingClipEventId(null)}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default VideoPlayer
