import { useState } from 'react'
import type { StoredVideoRecord } from '../lib/videoStorage'

type VideoCardProps = {
  video: StoredVideoRecord
  isRemoving: boolean
  isSavingTitle: boolean
  onOpen: (videoId: string) => void
  onRemove: (videoId: string) => void
  onSaveTitle: (videoId: string, title: string) => Promise<boolean>
}

function VideoCard({
  video,
  isRemoving,
  isSavingTitle,
  onOpen,
  onRemove,
  onSaveTitle
}: VideoCardProps) {
  const [draftTitle, setDraftTitle] = useState(video.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  function handleStartEdit() {
    setDraftTitle(video.title)
    setIsEditingTitle(true)
  }

  function handleCancelEdit() {
    setDraftTitle(video.title)
    setIsEditingTitle(false)
  }

  async function handleSaveTitle() {
    const nextTitle = draftTitle.trim()
    if (!nextTitle) {
      return
    }

    const wasSaved = await onSaveTitle(video.id, nextTitle)
    if (wasSaved) {
      setIsEditingTitle(false)
    }
  }

  return (
    <article className="video-card border rounded-4 bg-white shadow-sm p-3 h-100 d-flex flex-column gap-3">
      <button
        type="button"
        className="video-card-preview border-0 bg-transparent p-0 text-start"
        onClick={() => onOpen(video.id)}
      >
        {video.thumbnailDataUrl ? (
          <img
            src={video.thumbnailDataUrl}
            alt={`${video.title} preview`}
            className="w-100 rounded-3 object-fit-cover"
            style={{ aspectRatio: '16 / 9' }}
          />
        ) : (
          <div className="w-100 rounded-3 bg-slate-100 d-flex align-items-center justify-content-center text-slate-700" style={{ aspectRatio: '16 / 9' }}>
            No preview
          </div>
        )}
      </button>

      <div className="d-flex flex-column gap-2">
        {isEditingTitle ? (
          <div className="d-flex flex-column gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              aria-label="Video title"
            />
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                disabled={isSavingTitle || draftTitle.trim().length === 0}
                onClick={() => {
                  void handleSaveTitle()
                }}
              >
                {isSavingTitle ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={isSavingTitle}
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="d-flex align-items-start justify-content-between gap-2">
            <p className="mb-0 fw-semibold text-slate-900">{video.title}</p>
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-decoration-none"
              onClick={handleStartEdit}
            >
              Edit
            </button>
          </div>
        )}
        <div className="d-flex justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            disabled={isRemoving}
            onClick={() => onRemove(video.id)}
          >
            {isRemoving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default VideoCard
