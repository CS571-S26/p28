import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getVideoClipById } from '../lib/clipStorage'
import { useModalA11y } from '../lib/useModalA11y.ts'

type ClipPlayerModalProps = {
  clipId: string
  clipTitle?: string
  isOpen: boolean
  onClose: () => void
}

function ClipPlayerModal({ clipId, clipTitle, isOpen, onClose }: ClipPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const dialogRef = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef
  })

  useEffect(() => {
    if (!isOpen) {
      setClipUrl(null)
      setErrorMessage(null)
      setIsLoading(false)
      return
    }

    let isCancelled = false
    let nextUrl: string | null = null

    async function loadClip() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const clip = await getVideoClipById(clipId)
        if (isCancelled) {
          return
        }
        if (!clip) {
          setErrorMessage('This clip is no longer available.')
          return
        }
        nextUrl = URL.createObjectURL(clip.blob)
        setClipUrl(nextUrl)
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load this clip.'
          setErrorMessage(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadClip()

    return () => {
      isCancelled = true
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl)
      }
    }
  }, [clipId, isOpen])

  const hasContent = useMemo(() => !isLoading && !errorMessage && clipUrl, [clipUrl, errorMessage, isLoading])
  const headingText = clipTitle?.trim()
    ? `Clip event - ${clipTitle.trim()}`
    : 'Clip event'

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="position-fixed inset-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1090, backgroundColor: 'rgba(15, 23, 42, 0.7)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-4 border shadow p-3 p-lg-4 w-100 d-flex flex-column gap-3"
        style={{ maxWidth: '60rem' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-player-title"
        aria-describedby="clip-player-description"
      >
        <div className="d-flex justify-content-between align-items-center gap-2">
          <h2 id="clip-player-title" className="h5 mb-0 text-slate-900">{headingText}</h2>
          <button ref={closeButtonRef} type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p id="clip-player-description" className="mb-0 text-slate-600">
          Review the recorded clip and replay it if needed.
        </p>

        {isLoading ? (
          <p className="mb-0 text-slate-600">Loading clip...</p>
        ) : null}

        {errorMessage ? (
          <div className="alert alert-danger mb-0" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {hasContent ? (
          <div className="d-flex flex-column gap-2">
            <div className="ratio ratio-16x9 rounded-4 overflow-hidden bg-dark">
              <video
                ref={videoRef}
                className="w-100 h-100"
                src={clipUrl ?? undefined}
                controls
              >
                Your browser does not support video playback.
              </video>
            </div>
            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  if (!videoRef.current) {
                    return
                  }
                  videoRef.current.currentTime = 0
                  void videoRef.current.play()
                }}
              >
                Replay
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default ClipPlayerModal
