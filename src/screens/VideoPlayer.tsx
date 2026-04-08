import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStoredVideoById, type StoredVideoRecord } from '../lib/videoStorage'

function formatFileSize(sizeInBytes: number): string {
  const sizeInMegabytes = sizeInBytes / (1024 * 1024)
  return `${sizeInMegabytes.toFixed(2)} MB`
}

function VideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>()
  const [videoRecord, setVideoRecord] = useState<StoredVideoRecord | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
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
    if (!videoRecord) {
      return
    }

    const nextVideoUrl = URL.createObjectURL(videoRecord.file)
    setVideoUrl(nextVideoUrl)

    return () => {
      URL.revokeObjectURL(nextVideoUrl)
    }
  }, [videoRecord])

  return (
    <main className="container py-5 grow">
      <section className="row justify-content-center">
        <div className="col-xl-10">
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
              <>
                <div className="ratio ratio-16x9 overflow-hidden rounded-4 bg-dark shadow-sm">
                <video
                  key={videoUrl}
                  className="h-100 w-100"
                  controls
                  preload="metadata"
                  src={videoUrl}
                >
                  Your browser does not support playing this video.
                </video>
                </div>

                <div className="mt-4 d-flex flex-column flex-md-row justify-content-between gap-3 text-slate-600">
                  <div>
                    <p className="mb-1 fw-semibold text-slate-900">{videoRecord.title}</p>
                  </div>
                  <div className="text-md-end">
                    <p className="mb-1">{formatFileSize(videoRecord.size)}</p>
                  </div>
                </div>
              </>
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
