import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  listTagCatalogEntries,
  listTaggedMoments,
  type StoredTagCatalogEntry,
  type StoredVideoEvent,
  type TagMatchMode
} from '../lib/noteStorage'
import { formatHms } from '../lib/time'
import { listStoredVideos, type StoredVideoRecord } from '../lib/videoStorage'
import { handleVideoKeyboardShortcut } from '../lib/videoKeyboardSeek'

type QueueItem = {
  id: string
  event: StoredVideoEvent
  video: StoredVideoRecord
}

type PersistedTagReelState = {
  selectedTagKeys: string[]
  tagMatchMode: TagMatchMode
  videoScopeMode: 'all' | 'selected'
  selectedVideoIds: string[]
  queueEvents: StoredVideoEvent[]
  activeQueueIndex: number
}

const TAG_REEL_STORAGE_KEY = 'film-reviewer-tag-reel-state-v1'

function sortTagsByName(tags: StoredTagCatalogEntry[]): StoredTagCatalogEntry[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function sortQueueByGameAndTime(queueItems: QueueItem[]): QueueItem[] {
  return [...queueItems].sort((a, b) => {
    const byTitle = a.video.title.localeCompare(b.video.title, undefined, { sensitivity: 'base' })
    if (byTitle !== 0) {
      return byTitle
    }

    if (a.video.id !== b.video.id) {
      return a.video.id.localeCompare(b.video.id)
    }

    if (a.event.timestampSeconds !== b.event.timestampSeconds) {
      return a.event.timestampSeconds - b.event.timestampSeconds
    }

    return a.event.createdAt - b.event.createdAt
  })
}

function readPersistedState(): PersistedTagReelState | null {
  try {
    const rawValue = window.localStorage.getItem(TAG_REEL_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as Partial<PersistedTagReelState>
    if (!parsedValue || typeof parsedValue !== 'object') {
      return null
    }

    const selectedTagKeys = Array.isArray(parsedValue.selectedTagKeys)
      ? parsedValue.selectedTagKeys.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const selectedVideoIds = Array.isArray(parsedValue.selectedVideoIds)
      ? parsedValue.selectedVideoIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const queueEvents = Array.isArray(parsedValue.queueEvents)
      ? parsedValue.queueEvents.filter((value): value is StoredVideoEvent => (
        !!value
        && typeof value === 'object'
        && typeof value.id === 'string'
        && typeof value.videoId === 'string'
        && typeof value.timestampSeconds === 'number'
        && Array.isArray(value.tagKeys)
      ))
      : []

    return {
      selectedTagKeys,
      tagMatchMode: parsedValue.tagMatchMode === 'or' ? 'or' : 'and',
      videoScopeMode: parsedValue.videoScopeMode === 'selected' ? 'selected' : 'all',
      selectedVideoIds,
      queueEvents,
      activeQueueIndex: typeof parsedValue.activeQueueIndex === 'number' ? parsedValue.activeQueueIndex : 0
    }
  } catch {
    return null
  }
}

function TagQueue() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const restoredPersistedStateRef = useRef(false)
  const isHydratingPersistedStateRef = useRef(true)
  const [videos, setVideos] = useState<StoredVideoRecord[]>([])
  const [tagCatalog, setTagCatalog] = useState<StoredTagCatalogEntry[]>([])
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([])
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>('and')
  const [videoScopeMode, setVideoScopeMode] = useState<'all' | 'selected'>('all')
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [activeQueueIndex, setActiveQueueIndex] = useState(0)
  const [currentVideoUrl, setCurrentVideoUrl] = useState('')
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isBuildingQueue, setIsBuildingQueue] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [persistedState] = useState<PersistedTagReelState | null>(() => readPersistedState())

  const videoMap = useMemo(
    () => new Map(videos.map((video) => [video.id, video])),
    [videos]
  )
  const tagMap = useMemo(
    () => new Map(tagCatalog.map((tag) => [tag.key, tag])),
    [tagCatalog]
  )

  const activeQueueItem = queue[activeQueueIndex] ?? null
  const canGoPrev = activeQueueIndex > 0
  const canGoNext = activeQueueIndex < (queue.length - 1)
  const isPlayDisabled = selectedTagKeys.length === 0
    || isBuildingQueue
    || (videoScopeMode === 'selected' && selectedVideoIds.length === 0)
  const isClearDisabled = isBuildingQueue
    || (
      selectedTagKeys.length === 0
      && tagMatchMode === 'and'
      && videoScopeMode === 'all'
      && selectedVideoIds.length === 0
      && queue.length === 0
      && activeQueueIndex === 0
      && !errorMessage
    )

  useEffect(() => {
    let isCancelled = false

    async function loadInitialData() {
      try {
        const [storedVideos, storedTags] = await Promise.all([
          listStoredVideos(),
          listTagCatalogEntries()
        ])

        if (isCancelled) {
          return
        }

        setVideos(storedVideos)
        setTagCatalog(sortTagsByName(storedTags))
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load tag queue data'
          setErrorMessage(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingData(false)
        }
      }
    }

    void loadInitialData()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (isLoadingData || restoredPersistedStateRef.current) {
      return
    }

    restoredPersistedStateRef.current = true

    if (!persistedState) {
      isHydratingPersistedStateRef.current = false
      return
    }

    const availableVideoIds = new Set(videos.map((video) => video.id))
    const availableTagKeys = new Set(tagCatalog.map((tag) => tag.key))

    const restoredSelectedTagKeys = persistedState.selectedTagKeys
      .filter((tagKey) => availableTagKeys.has(tagKey))
    const restoredSelectedVideoIds = persistedState.selectedVideoIds
      .filter((videoId) => availableVideoIds.has(videoId))

    const restoredQueue = persistedState.queueEvents
      .map((event) => {
        const video = videoMap.get(event.videoId)
        if (!video) {
          return null
        }
        return {
          id: `${event.id}-${event.videoId}`,
          event,
          video
        } satisfies QueueItem
      })
      .filter((item): item is QueueItem => item !== null)

    const nextActiveIndex = restoredQueue.length === 0
      ? 0
      : Math.max(0, Math.min(persistedState.activeQueueIndex, restoredQueue.length - 1))

    setSelectedTagKeys(restoredSelectedTagKeys)
    setTagMatchMode(persistedState.tagMatchMode)
    setVideoScopeMode(persistedState.videoScopeMode)
    setSelectedVideoIds(restoredSelectedVideoIds)
    setQueue(restoredQueue)
    setActiveQueueIndex(nextActiveIndex)
    isHydratingPersistedStateRef.current = false
  }, [isLoadingData, persistedState, videos, tagCatalog, videoMap])

  useEffect(() => {
    const activeVideo = activeQueueItem?.video ?? null
    if (!activeVideo) {
      setCurrentVideoUrl('')
      return
    }

    const nextVideoUrl = URL.createObjectURL(activeVideo.file)
    setCurrentVideoUrl(nextVideoUrl)

    return () => {
      URL.revokeObjectURL(nextVideoUrl)
    }
  }, [activeQueueItem])

  useEffect(() => {
    if (!activeQueueItem) {
      setPendingSeekSeconds(null)
      return
    }
    setPendingSeekSeconds(activeQueueItem.event.timestampSeconds)
  }, [activeQueueItem])

  useEffect(() => {
    if (pendingSeekSeconds === null) {
      return
    }
    const videoElement = videoRef.current
    if (!videoElement) {
      return
    }
    if (videoElement.readyState < 1) {
      return
    }

    const nextTime = Number.isFinite(videoElement.duration)
      ? Math.max(0, Math.min(pendingSeekSeconds, videoElement.duration))
      : Math.max(0, pendingSeekSeconds)
    videoElement.currentTime = nextTime
    void videoElement.play().catch(() => {})
    setPendingSeekSeconds(null)
  }, [pendingSeekSeconds, currentVideoUrl])

  useEffect(() => {
    if (isHydratingPersistedStateRef.current) {
      return
    }

    const stateToPersist: PersistedTagReelState = {
      selectedTagKeys,
      tagMatchMode,
      videoScopeMode,
      selectedVideoIds,
      queueEvents: queue.map((item) => item.event),
      activeQueueIndex
    }

    try {
      window.localStorage.setItem(TAG_REEL_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch {
      // Ignore write failures (storage quota, privacy mode, etc.)
    }
  }, [
    selectedTagKeys,
    tagMatchMode,
    videoScopeMode,
    selectedVideoIds,
    queue,
    activeQueueIndex
  ])

  function toggleTag(tagKey: string) {
    setSelectedTagKeys((previousTagKeys) => (
      previousTagKeys.includes(tagKey)
        ? previousTagKeys.filter((existingTagKey) => existingTagKey !== tagKey)
        : [...previousTagKeys, tagKey]
    ))
  }

  function toggleVideo(videoId: string) {
    setSelectedVideoIds((previousVideoIds) => (
      previousVideoIds.includes(videoId)
        ? previousVideoIds.filter((existingVideoId) => existingVideoId !== videoId)
        : [...previousVideoIds, videoId]
    ))
  }

  async function handleBuildQueue() {
    if (isPlayDisabled) {
      return
    }

    setIsBuildingQueue(true)
    setErrorMessage(null)

    try {
      const matchingEvents = await listTaggedMoments({
        tagKeys: selectedTagKeys,
        matchMode: tagMatchMode,
        videoIds: videoScopeMode === 'selected' ? selectedVideoIds : undefined
      })

      const nextQueue = sortQueueByGameAndTime(matchingEvents
        .map((event) => {
          const video = videoMap.get(event.videoId)
          if (!video) {
            return null
          }

          return {
            id: `${event.id}-${event.videoId}`,
            event,
            video
          } satisfies QueueItem
        })
        .filter((item): item is QueueItem => item !== null))

      setQueue(nextQueue)
      setActiveQueueIndex(0)

      if (nextQueue.length === 0) {
        setErrorMessage('No matching moments were found for this filter.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to build tag queue'
      setErrorMessage(message)
      setQueue([])
      setActiveQueueIndex(0)
    } finally {
      setIsBuildingQueue(false)
    }
  }

  function handleJumpToQueueIndex(index: number) {
    setActiveQueueIndex(index)
  }

  function handlePrev() {
    if (!canGoPrev) {
      return
    }
    setActiveQueueIndex((currentIndex) => Math.max(0, currentIndex - 1))
  }

  function handleNext() {
    if (!canGoNext) {
      return
    }
    setActiveQueueIndex((currentIndex) => Math.min(queue.length - 1, currentIndex + 1))
  }

  function handleClear() {
    setSelectedTagKeys([])
    setTagMatchMode('and')
    setVideoScopeMode('all')
    setSelectedVideoIds([])
    setQueue([])
    setActiveQueueIndex(0)
    setErrorMessage(null)
    setPendingSeekSeconds(null)
    try {
      window.localStorage.removeItem(TAG_REEL_STORAGE_KEY)
    } catch {
      // Ignore storage clear failures.
    }
  }

  const handleVideoKeyDownCapture = useCallback((event: KeyboardEvent<HTMLVideoElement>) => {
    const videoElement = videoRef.current
    if (!videoElement) {
      return
    }

    handleVideoKeyboardShortcut(event, videoElement)
  }, [])

  return (
    <main className="container-fluid px-2 px-lg-3 px-xxl-4 py-4 py-lg-5 grow">
      <section className="row justify-content-center">
        <div className="col-12">
          <div className="rounded-4 border bg-white p-3 p-lg-4 p-xxl-5 shadow-sm d-flex flex-column gap-4">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
              <div>
                <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
                <h1 className="mb-2 text-3xl font-semibold text-slate-900">Tag Queue</h1>
                <p className="mb-0 text-slate-600">
                  Build a cross-video tagged moment queue and review it in sequence
                </p>
              </div>
              <Link to="/videos" className="btn btn-outline-secondary">
                Back to gallery
              </Link>
            </div>

            {isLoadingData ? (
              <p className="mb-0 text-slate-600">Loading tag queue data...</p>
            ) : (
              <div className="row g-4">
                <div className="col-12 col-xl-3">
                  <section className="rounded-4 border p-3 p-lg-4 d-flex flex-column gap-3 h-100">
                    <div>
                      <h2 className="h6 mb-1 text-slate-900">Setup</h2>
                      <p className="mb-0 text-sm text-slate-600">
                        Pick tags and scope, then press Play to jump into the first match.
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 text-sm text-slate-700">Tag match mode</p>
                      <select
                        className="form-select form-select-sm"
                        value={tagMatchMode}
                        onChange={(event) => setTagMatchMode(event.target.value as TagMatchMode)}
                      >
                        <option value="and">Match all selected tags (AND)</option>
                        <option value="or">Match any selected tags (OR)</option>
                      </select>
                    </div>

                    <div>
                      <p className="mb-2 text-sm text-slate-700">Tags</p>
                      {tagCatalog.length === 0 ? (
                        <p className="mb-0 text-sm text-slate-600">No global tags yet</p>
                      ) : (
                        <div className="d-flex flex-wrap gap-2">
                          {tagCatalog.map((tag) => {
                            const isSelected = selectedTagKeys.includes(tag.key)
                            return (
                              <button
                                key={tag.key}
                                type="button"
                                className={`btn btn-sm ${isSelected ? 'btn-dark' : 'btn-outline-secondary'}`}
                                onClick={() => toggleTag(tag.key)}
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
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-sm text-slate-700">Video scope</p>
                      <div className="d-flex gap-3">
                        <label className="form-check-label text-sm d-flex align-items-center gap-2">
                          <input
                            type="radio"
                            name="tag-reel-video-scope"
                            className="form-check-input mt-0"
                            checked={videoScopeMode === 'all'}
                            onChange={() => setVideoScopeMode('all')}
                          />
                          All videos
                        </label>
                        <label className="form-check-label text-sm d-flex align-items-center gap-2">
                          <input
                            type="radio"
                            name="tag-reel-video-scope"
                            className="form-check-input mt-0"
                            checked={videoScopeMode === 'selected'}
                            onChange={() => setVideoScopeMode('selected')}
                          />
                          Specific videos
                        </label>
                      </div>
                    </div>

                    {videoScopeMode === 'selected' ? (
                      <div className="border rounded-3 p-2 d-flex flex-column gap-2 tag-reel-video-list">
                        {videos.length === 0 ? (
                          <p className="mb-0 text-sm text-slate-600">No videos available</p>
                        ) : (
                          videos.map((video) => (
                            <label key={video.id} className="form-check-label text-sm d-flex align-items-center gap-2">
                              <input
                                type="checkbox"
                                className="form-check-input mt-0"
                                checked={selectedVideoIds.includes(video.id)}
                                onChange={() => toggleVideo(video.id)}
                              />
                              <span>{video.title}</span>
                            </label>
                          ))
                        )}
                      </div>
                    ) : null}

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary grow"
                        disabled={isPlayDisabled}
                        onClick={() => {
                          void handleBuildQueue()
                        }}
                      >
                        {isBuildingQueue ? 'Building queue...' : 'Play tag queue'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={isClearDisabled}
                        onClick={handleClear}
                      >
                        Clear
                      </button>
                    </div>
                  </section>
                </div>

                <div className="col-12 col-xl-9">
                  <div className="row g-3">
                    <div className="col-12 col-lg-9 d-flex flex-column gap-3">
                      <section className="rounded-4 border p-3 p-lg-4">
                        {activeQueueItem && currentVideoUrl ? (
                          <>
                            <div className="ratio ratio-16x9 overflow-hidden rounded-4 bg-dark">
                              <video
                                ref={videoRef}
                                key={currentVideoUrl}
                                className="h-100 w-100"
                                controls
                                preload="metadata"
                                src={currentVideoUrl}
                                onKeyDownCapture={handleVideoKeyDownCapture}
                                onLoadedMetadata={() => {
                                  if (pendingSeekSeconds === null || !videoRef.current) {
                                    return
                                  }
                                  const duration = videoRef.current.duration
                                  const nextTime = Number.isFinite(duration)
                                    ? Math.max(0, Math.min(pendingSeekSeconds, duration))
                                    : Math.max(0, pendingSeekSeconds)
                                  videoRef.current.currentTime = nextTime
                                  void videoRef.current.play().catch(() => {})
                                  setPendingSeekSeconds(null)
                                }}
                              >
                                Your browser does not support playing this video
                              </video>
                            </div>
                            <div className="mt-3 d-flex flex-column gap-2">
                              <p className="mb-0 fw-semibold text-slate-900">{activeQueueItem.video.title}</p>
                              <p className="mb-0 text-sm text-slate-600">
                                Moment at {formatHms(activeQueueItem.event.timestampSeconds)}
                              </p>
                              <div className="d-flex flex-wrap gap-1">
                                {activeQueueItem.event.tagKeys.map((tagKey) => {
                                  const tag = tagMap.get(tagKey)
                                  return (
                                    <span
                                      key={`${activeQueueItem.id}-${tagKey}`}
                                      className="px-2 py-1 rounded text-xs border"
                                      style={{
                                        backgroundColor: tag?.color ?? '#E5E7EB',
                                        color: '#111111'
                                      }}
                                    >
                                      {tag?.name ?? tagKey}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-3 border p-4 text-center bg-slate-50">
                            <p className="mb-2 fw-semibold text-slate-900">No active queue</p>
                            <p className="mb-0 text-sm text-slate-600">
                              Configure filters and press Play to begin your tag queue.
                            </p>
                          </div>
                        )}
                      </section>

                      <section className="rounded-4 border p-3 d-flex justify-content-between align-items-center">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={handlePrev}
                          disabled={!canGoPrev}
                        >
                          Prev
                        </button>
                        <p className="mb-0 text-sm text-slate-600">
                          {queue.length === 0 ? 'Queue is empty' : `${activeQueueIndex + 1} of ${queue.length}`}
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={handleNext}
                          disabled={!canGoNext}
                        >
                          Next
                        </button>
                      </section>
                    </div>

                    <div className="col-12 col-lg-3">
                      <section className="tag-reel-queue-panel rounded-4 border p-3 p-lg-4 d-flex flex-column gap-2">
                        <h2 className="h6 mb-0 text-slate-900">Queue</h2>
                        {queue.length === 0 ? (
                          <p className="mb-0 text-sm text-slate-600">No queued moments yet</p>
                        ) : (
                          <div className="d-flex flex-column gap-2 overflow-auto pe-1 tag-reel-queue-list">
                            {queue.map((item, index) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`tag-reel-queue-item btn text-start border rounded-3 p-2 ${
                                  index === activeQueueIndex ? 'tag-reel-queue-item-active' : ''
                                }`}
                                onClick={() => handleJumpToQueueIndex(index)}
                              >
                                <p className="mb-1 fw-semibold text-slate-900 text-sm">{item.video.title}</p>
                                <p className="mb-0 text-slate-600 text-sm">{formatHms(item.event.timestampSeconds)}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {errorMessage ? (
              <div className="alert alert-danger mb-0" role="alert">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default TagQueue
