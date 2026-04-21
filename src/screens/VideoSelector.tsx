import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listStoredVideos,
  removeStoredVideo,
  saveVideoToGallery,
  updateStoredVideoTitle,
  updateStoredVideoThumbnail,
  type StoredVideoRecord
} from '../lib/videoStorage'
import VideoCard from '../components/VideoCard.tsx'

function isMp4File(file: File): boolean {
  return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
}

async function createVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let hasResolved = false
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }

    const finish = (thumbnail: string) => {
      if (hasResolved) {
        return
      }

      hasResolved = true
      cleanup()
      resolve(thumbnail)
    }

    const capture = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 360
      const context = canvas.getContext('2d')

      if (!context) {
        finish('')
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8)
      finish(imageDataUrl)
    }

    video.onloadedmetadata = () => {
      const seekTarget = Math.min(1, Number.isFinite(video.duration) ? video.duration / 3 : 0.1)
      if (seekTarget > 0) {
        try {
          video.currentTime = seekTarget
        } catch {
          capture()
        }
      } else {
        capture()
      }
    }

    video.onseeked = capture
    video.onloadeddata = capture
    video.onerror = () => {
      finish('')
    }

    // Fallback so one browser event quirk does not block preview generation.
    window.setTimeout(() => {
      finish('')
    }, 3000)

    video.src = url
    video.load()
  })
}

function VideoSelector() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [videos, setVideos] = useState<StoredVideoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadVideos() {
      try {
        const storedVideos = await listStoredVideos()
        if (isCancelled) {
          return
        }

        setVideos(storedVideos)

        const videosMissingPreview = storedVideos.filter((video) => !video.thumbnailDataUrl)
        if (videosMissingPreview.length === 0) {
          return
        }

        for (const video of videosMissingPreview) {
          if (isCancelled) {
            return
          }

          const thumbnailDataUrl = await createVideoThumbnail(video.file)
          if (!thumbnailDataUrl) {
            continue
          }

          const updatedVideo = await updateStoredVideoThumbnail(video.id, thumbnailDataUrl)
          if (!updatedVideo || isCancelled) {
            continue
          }

          setVideos((previousVideos) => previousVideos.map((entry) => (
            entry.id === updatedVideo.id ? updatedVideo : entry
          )))
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load saved videos'
          setErrorMessage(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadVideos()

    return () => {
      isCancelled = true
    }
  }, [])

  function handleUploadClick() {
    inputRef.current?.click()
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    if (!isMp4File(selectedFile)) {
      setErrorMessage('Please choose an MP4 file')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const thumbnailDataUrl = await createVideoThumbnail(selectedFile)
      const savedRecord = await saveVideoToGallery(selectedFile, { thumbnailDataUrl })
      setVideos((previousVideos) => [savedRecord, ...previousVideos])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the selected video'
      setErrorMessage(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveVideo(videoId: string) {
    setDeletingId(videoId)
    setErrorMessage(null)

    try {
      await removeStoredVideo(videoId)
      setVideos((previousVideos) => previousVideos.filter((video) => video.id !== videoId))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove this video'
      setErrorMessage(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSaveTitle(videoId: string, title: string): Promise<boolean> {
    setSavingTitleId(videoId)
    setErrorMessage(null)

    try {
      const updatedRecord = await updateStoredVideoTitle(videoId, title)

      if (!updatedRecord) {
        setErrorMessage('Unable to find this video to update')
        return false
      }

      setVideos((previousVideos) => previousVideos.map((video) => (
        video.id === videoId ? updatedRecord : video
      )))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this title'
      setErrorMessage(message)
      return false
    } finally {
      setSavingTitleId(null)
    }
  }

  return (
    <main className="container-fluid px-2 px-lg-3 px-xxl-4 py-4 py-lg-5 grow">
      <section className="row justify-content-center">
        <div className="col-12">
          <div className="rounded-4 border bg-white p-3 p-lg-4 p-xxl-5 shadow-sm">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
              <div>
                <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
                <h1 className="mb-2 text-3xl font-semibold text-slate-900">Video gallery</h1>
                <p className="mb-0 text-slate-600">
                  Upload films, keep them in your browser, and click any saved video to open it
                </p>
              </div>
              <div className="d-flex flex-column flex-sm-row gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-4 py-2"
                  onClick={handleUploadClick}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving video...' : 'Upload video'}
                </button>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="video/mp4"
              className="d-none"
              onChange={handleFileChange}
            />

            {isLoading ? (
              <p className="mb-0 text-slate-600">Loading saved videos...</p>
            ) : videos.length === 0 ? (
              <p className="mb-0 text-slate-600">No videos saved yet - upload one to get started</p>
            ) : (
              <div className="row g-3">
                {videos.map((video) => (
                  <div key={`${video.id}-${video.title}`} className="col-12 col-sm-6 col-lg-3">
                    <VideoCard
                      video={video}
                      isRemoving={deletingId === video.id}
                      isSavingTitle={savingTitleId === video.id}
                      onOpen={(id) => navigate(`/videos/${id}`)}
                      onRemove={(id) => {
                        void handleRemoveVideo(id)
                      }}
                      onSaveTitle={handleSaveTitle}
                    />
                  </div>
                ))}
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

export default VideoSelector
