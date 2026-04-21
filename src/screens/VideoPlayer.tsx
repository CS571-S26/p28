import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStoredVideoById, type StoredVideoRecord } from '../lib/videoStorage'
import {
  deleteVideoNote,
  listNotesForVideo,
  updateVideoNote,
  type StoredVideoNote
} from '../lib/noteStorage'
import NoteComposer, { type NoteComposerHandle } from '../components/NoteComposer'
import NotesList from '../components/NotesList'
import NotesNowPlaying from '../components/NotesTimeline'

function formatFileSize(sizeInBytes: number): string {
  const sizeInMegabytes = sizeInBytes / (1024 * 1024)
  return `${sizeInMegabytes.toFixed(2)} MB`
}

function sortNotesByTimestamp(notes: StoredVideoNote[]): StoredVideoNote[] {
  return [...notes].sort((a, b) => {
    if (a.timestampSeconds === b.timestampSeconds) {
      return a.createdAt - b.createdAt
    }
    return a.timestampSeconds - b.timestampSeconds
  })
}

function VideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>()
  const videoElementRef = useRef<HTMLVideoElement>(null)
  const composerRef = useRef<NoteComposerHandle>(null)
  const [videoRecord, setVideoRecord] = useState<StoredVideoRecord | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [notes, setNotes] = useState<StoredVideoNote[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadVideo() {
      if (!videoId) {
        setErrorMessage('No video was selected.')
        setIsLoading(false)
        return
      }

      try {
        const storedVideo = await getStoredVideoById(videoId)

        if (isCancelled) {
          return
        }

        if (!storedVideo) {
          setErrorMessage('This video could not be found.')
          setVideoRecord(null)
          return
        }

        setVideoRecord(storedVideo)
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to open this video.'
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

    async function loadNotes() {
      if (!videoId) {
        setNotes([])
        return
      }

      try {
        const storedNotes = await listNotesForVideo(videoId)

        if (!isCancelled) {
          setNotes(sortNotesByTimestamp(storedNotes))
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load video notes.'
          setErrorMessage(message)
        }
      }
    }

    void loadNotes()

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

  const handleNoteSaved = useCallback((savedNote: StoredVideoNote) => {
    setNotes((previousNotes) => sortNotesByTimestamp([...previousNotes, savedNote]))
  }, [])

  const handleEditNote = useCallback(async (
    noteId: string,
    patch: { text: string; timestampSeconds: number }
  ) => {
    const updatedNote = await updateVideoNote(noteId, patch)

    if (!updatedNote) {
      throw new Error('Unable to find this note to update.')
    }

    setNotes((previousNotes) => {
      const nextNotes = previousNotes.map((note) => (note.id === noteId ? updatedNote : note))
      return sortNotesByTimestamp(nextNotes)
    })
  }, [])

  const handleDeleteNote = useCallback(async (noteId: string) => {
    await deleteVideoNote(noteId)
    setNotes((previousNotes) => previousNotes.filter((note) => note.id !== noteId))
  }, [])

  const handleVideoKeyDown = useCallback((event: KeyboardEvent<HTMLVideoElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    const videoElement = videoElementRef.current
    if (!videoElement) {
      return
    }

    event.preventDefault()

    const seekOffset = event.key === 'ArrowRight' ? 10 : -10
    const maxTime = Number.isFinite(videoElement.duration) ? videoElement.duration : Number.POSITIVE_INFINITY
    const nextTime = Math.max(0, Math.min(videoElement.currentTime + seekOffset, maxTime))

    videoElement.currentTime = nextTime
    setCurrentTime(Math.floor(nextTime))
  }, [])

  return (
    <main className="container-fluid px-3 px-xl-4 py-5 grow">
      <section className="row justify-content-center">
        <div className="col-12 col-xxl-11">
          <div className="rounded-4 border bg-white p-4 p-lg-5 shadow-sm">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
              <div>
                <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
                <h1 className="mb-2 text-3xl font-semibold text-slate-900">Video player</h1>
                <p className="mb-0 text-slate-600">
                  Review a saved clip directly in the browser.
                </p>
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
                      onKeyDown={handleVideoKeyDown}
                    >
                      Your browser does not support playing this video.
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
                    onStartComposing={handleStartComposing}
                    onNoteSaved={handleNoteSaved}
                  />
                </div>
                <div className="col-lg-4 d-flex flex-column gap-3">
                  <NotesNowPlaying
                    notes={notes}
                    currentTime={currentTime}
                    onJumpTo={jumpTo}
                  />
                  <div className="grow">
                    <NotesList
                      notes={notes}
                      videoDuration={videoDuration}
                      onJumpTo={jumpTo}
                      onEdit={handleEditNote}
                      onDelete={handleDeleteNote}
                      onEmptyStateClick={handleEmptyStateClick}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="alert alert-warning mb-0" role="alert">
                This video is unavailable. It may have been removed from your gallery.
              </div>
            )}

            {errorMessage ? (
              <div className="alert alert-danger mt-4 mb-0" role="alert">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default VideoPlayer
