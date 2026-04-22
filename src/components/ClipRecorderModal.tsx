import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { saveVideoClip } from '../lib/clipStorage'
import { saveClipEvent, type StoredVideoEvent } from '../lib/noteStorage'
import { formatHms } from '../lib/time'

type StrokePoint = {
  x: number
  y: number
}

type Stroke = {
  color: string
  points: StrokePoint[]
}

type ClipRecorderModalProps = {
  isOpen: boolean
  videoId: string
  videoUrl: string
  initialTimestampSeconds: number
  onClose: () => void
  onEventSaved: (event: StoredVideoEvent) => void
}

const DRAW_COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#FFFFFF', '#111827'] as const
const DRAWING_FADE_DURATION_MS = 1200

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ]

  return candidates.find((value) => MediaRecorder.isTypeSupported(value))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatElapsed(milliseconds: number): string {
  return formatHms(milliseconds / 1000)
}

function drawStrokes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: Stroke[],
  activeStroke: Stroke | null,
  lineWidth: number,
  opacity: number
) {
  if (opacity <= 0) {
    return
  }

  const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes
  context.save()
  context.globalAlpha = opacity
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.lineWidth = lineWidth

  for (const stroke of allStrokes) {
    if (stroke.points.length === 0) {
      continue
    }

    context.strokeStyle = stroke.color
    context.beginPath()

    const firstPoint = stroke.points[0]
    context.moveTo(firstPoint.x * width, firstPoint.y * height)
    for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) {
      const point = stroke.points[pointIndex]
      context.lineTo(point.x * width, point.y * height)
    }

    if (stroke.points.length === 1) {
      context.lineTo(firstPoint.x * width, firstPoint.y * height)
    }
    context.stroke()
  }
  context.restore()
}

function ClipRecorderModal({
  isOpen,
  videoId,
  videoUrl,
  initialTimestampSeconds,
  onClose,
  onEventSaved
}: ClipRecorderModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const compositorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const combinedStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const recordingStartedAtMsRef = useRef<number | null>(null)
  const latestStrokesRef = useRef<Stroke[]>([])
  const latestActiveStrokeRef = useRef<Stroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const drawingFadeStartedAtMsRef = useRef<number | null>(null)
  const drawingOpacityRef = useRef(1)

  const [mode, setMode] = useState<'idle' | 'recording' | 'review'>('idle')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null)
  const [selectedColor, setSelectedColor] = useState<string>(DRAW_COLORS[0])
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [recordingStartTimestamp, setRecordingStartTimestamp] = useState(0)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [recordedDurationSeconds, setRecordedDurationSeconds] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [clipTitle, setClipTitle] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const canStartRecording = mode === 'idle' && !isSaving
  const canStopRecording = mode === 'recording'

  const clearCaptureResources = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null

    for (const track of micStreamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    micStreamRef.current = null

    for (const track of combinedStreamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    combinedStreamRef.current = null
  }, [])

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const resetModalState = useCallback(() => {
    setMode('idle')
    setStrokes([])
    setActiveStroke(null)
    setSelectedColor(DRAW_COLORS[0])
    setCurrentVideoTime(initialTimestampSeconds)
    setRecordingStartTimestamp(initialTimestampSeconds)
    setRecordingElapsedMs(0)
    setRecordedDurationSeconds(0)
    setRecordedBlob(null)
    setClipTitle('')
    setErrorMessage(null)
    setWarningMessage(null)
    setIsSaving(false)
    recordingStartedAtMsRef.current = null
    latestStrokesRef.current = []
    latestActiveStrokeRef.current = null
    chunksRef.current = []
    pointerIdRef.current = null
    drawingFadeStartedAtMsRef.current = null
    drawingOpacityRef.current = 1
  }, [initialTimestampSeconds])

  useEffect(() => {
    latestStrokesRef.current = strokes
  }, [strokes])

  useEffect(() => {
    latestActiveStrokeRef.current = activeStroke
  }, [activeStroke])

  useEffect(() => {
    if (!recordedBlob) {
      setPreviewUrl(null)
      return
    }

    const nextUrl = URL.createObjectURL(recordedBlob)
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [recordedBlob])

  const redrawOverlay = useCallback(() => {
    const canvas = drawingCanvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }

    const devicePixelRatio = window.devicePixelRatio || 1
    const nextWidth = Math.round(rect.width * devicePixelRatio)
    const nextHeight = Math.round(rect.height * devicePixelRatio)
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth
      canvas.height = nextHeight
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)
    drawStrokes(
      context,
      rect.width,
      rect.height,
      latestStrokesRef.current,
      latestActiveStrokeRef.current,
      3,
      drawingOpacityRef.current
    )
  }, [])

  const drawCompositedFrame = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (!compositorCanvasRef.current) {
      compositorCanvasRef.current = document.createElement('canvas')
    }

    const compositor = compositorCanvasRef.current
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    if (compositor.width !== width || compositor.height !== height) {
      compositor.width = width
      compositor.height = height
    }

    const context = compositor.getContext('2d')
    if (!context) {
      return
    }

    context.clearRect(0, 0, width, height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, width, height)
    } else {
      context.fillStyle = '#000000'
      context.fillRect(0, 0, width, height)
    }
    drawStrokes(
      context,
      width,
      height,
      latestStrokesRef.current,
      latestActiveStrokeRef.current,
      8,
      drawingOpacityRef.current
    )
  }, [])

  useEffect(() => {
    if (!isOpen) {
      stopAnimationLoop()
      clearCaptureResources()
      return
    }

    const run = () => {
      const now = performance.now()
      if (drawingFadeStartedAtMsRef.current !== null) {
        const fadeElapsed = now - drawingFadeStartedAtMsRef.current
        drawingOpacityRef.current = clamp(1 - (fadeElapsed / DRAWING_FADE_DURATION_MS), 0, 1)

        if (drawingOpacityRef.current === 0) {
          drawingFadeStartedAtMsRef.current = null
          if (latestStrokesRef.current.length > 0 || latestActiveStrokeRef.current) {
            latestStrokesRef.current = []
            latestActiveStrokeRef.current = null
            setStrokes([])
            setActiveStroke(null)
          }
        }
      } else {
        drawingOpacityRef.current = 1
      }

      drawCompositedFrame()
      redrawOverlay()
      if (recordingStartedAtMsRef.current !== null && mode === 'recording') {
        setRecordingElapsedMs(Math.max(0, now - recordingStartedAtMsRef.current))
      }
      animationFrameRef.current = window.requestAnimationFrame(run)
    }

    animationFrameRef.current = window.requestAnimationFrame(run)
    return () => stopAnimationLoop()
  }, [isOpen, mode, drawCompositedFrame, redrawOverlay, stopAnimationLoop, clearCaptureResources])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    resetModalState()
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = Math.max(0, initialTimestampSeconds)
      setIsVideoPlaying(false)
    }

    return () => {
      clearCaptureResources()
      stopAnimationLoop()
    }
  }, [isOpen, initialTimestampSeconds, resetModalState, clearCaptureResources, stopAnimationLoop])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const resizeObserver = new ResizeObserver(() => redrawOverlay())
    const canvas = drawingCanvasRef.current
    const video = videoRef.current
    if (canvas) {
      resizeObserver.observe(canvas)
    }
    if (video) {
      resizeObserver.observe(video)
    }
    redrawOverlay()
    return () => resizeObserver.disconnect()
  }, [isOpen, redrawOverlay])

  const playbackSummary = useMemo(() => (
    `${formatHms(currentVideoTime)} / ${formatHms(videoDuration)}`
  ), [currentVideoTime, videoDuration])

  const seekToTime = useCallback((nextSeconds: number) => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const boundedTime = clamp(nextSeconds, 0, Math.max(videoDuration, 0))
    video.currentTime = boundedTime
    setCurrentVideoTime(boundedTime)
  }, [videoDuration])

  const beginRecording = useCallback(async () => {
    if (!canStartRecording) {
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('This browser does not support recording clips.')
      return
    }

    drawCompositedFrame()

    const compositor = compositorCanvasRef.current
    if (!compositor) {
      setErrorMessage('Recorder could not prepare the clip canvas.')
      return
    }

    setErrorMessage(null)
    setWarningMessage(null)
    chunksRef.current = []

    let micStream: MediaStream | null = null
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = micStream
    } catch {
      setWarningMessage('Microphone permission was denied. This recording will be silent.')
    }

    const canvasStream = compositor.captureStream(30)
    const tracks = [...canvasStream.getVideoTracks(), ...(micStream?.getAudioTracks() ?? [])]
    const combinedStream = new MediaStream(tracks)
    combinedStreamRef.current = combinedStream

    const mimeType = pickSupportedMimeType()
    const mediaRecorder = mimeType
      ? new MediaRecorder(combinedStream, { mimeType })
      : new MediaRecorder(combinedStream)

    recorderRef.current = mediaRecorder
    const startTimestamp = currentVideoTime
    setRecordingStartTimestamp(startTimestamp)
    setRecordingElapsedMs(0)
    recordingStartedAtMsRef.current = performance.now()

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      const elapsed = recordingStartedAtMsRef.current === null
        ? recordingElapsedMs
        : Math.max(0, performance.now() - recordingStartedAtMsRef.current)
      const durationSeconds = elapsed / 1000
      setRecordedDurationSeconds(durationSeconds)
      setRecordingElapsedMs(elapsed)
      recordingStartedAtMsRef.current = null
      setMode('review')
      const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' })
      setRecordedBlob(blob)
      clearCaptureResources()
    }

    mediaRecorder.start(200)
    setMode('recording')
  }, [canStartRecording, currentVideoTime, drawCompositedFrame, clearCaptureResources, recordingElapsedMs])

  const stopRecording = useCallback(() => {
    if (!canStopRecording) {
      return
    }

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [canStopRecording])

  const handleSaveClip = useCallback(async () => {
    if (!recordedBlob || isSaving) {
      return
    }

    setErrorMessage(null)
    setIsSaving(true)
    try {
      const storedClip = await saveVideoClip({
        videoId,
        durationSeconds: recordedDurationSeconds,
        blob: recordedBlob
      })
      const clipEvent = await saveClipEvent({
        videoId,
        timestampSeconds: recordingStartTimestamp,
        clipId: storedClip.id,
        clipDurationSeconds: storedClip.durationSeconds,
        text: clipTitle.trim()
      })
      onEventSaved(clipEvent)
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this clip.'
      setErrorMessage(message)
    } finally {
      setIsSaving(false)
    }
  }, [recordedBlob, isSaving, videoId, recordedDurationSeconds, recordingStartTimestamp, clipTitle, onEventSaved, onClose])

  const handleClearDrawing = useCallback(() => {
    pointerIdRef.current = null
    drawingFadeStartedAtMsRef.current = null
    drawingOpacityRef.current = 1
    latestStrokesRef.current = []
    latestActiveStrokeRef.current = null
    setStrokes([])
    setActiveStroke(null)
    redrawOverlay()
  }, [redrawOverlay])

  const handleRerecord = useCallback(() => {
    clearCaptureResources()
    setMode('idle')
    setRecordedBlob(null)
    setClipTitle('')
    setRecordingElapsedMs(0)
    setRecordedDurationSeconds(0)
    setErrorMessage(null)
    setWarningMessage(null)
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = recordingStartTimestamp
      setCurrentVideoTime(recordingStartTimestamp)
      setIsVideoPlaying(false)
    }
    handleClearDrawing()
  }, [clearCaptureResources, recordingStartTimestamp, handleClearDrawing])

  const handleModalClose = useCallback(() => {
    clearCaptureResources()
    onClose()
  }, [clearCaptureResources, onClose])

  const getCanvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = drawingCanvasRef.current
    if (!canvas) {
      return null
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    return { x, y }
  }, [])

  useEffect(() => {
    if (!isOpen || mode === 'review') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        seekToTime((videoRef.current?.currentTime ?? currentVideoTime) - 5)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        seekToTime((videoRef.current?.currentTime ?? currentVideoTime) + 5)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, mode, currentVideoTime, seekToTime])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="position-fixed inset-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1090, backgroundColor: 'rgba(15, 23, 42, 0.75)' }}
      onClick={handleModalClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-4 border shadow p-3 p-lg-4 w-100 d-flex flex-column gap-3"
        style={{ maxWidth: '72rem', maxHeight: '95vh' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-recorder-title"
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h2 id="clip-recorder-title" className="h4 mb-1 text-slate-900">Record clip annotation</h2>
            <p className="mb-0 text-slate-600">
              Start at {formatHms(recordingStartTimestamp)}. Mic audio only.
            </p>
          </div>
          <button type="button" className="btn btn-outline-secondary" onClick={handleModalClose}>
            Close
          </button>
        </div>

        {mode === 'review' && previewUrl ? (
          <div className="d-flex flex-column gap-3">
            <div className="ratio ratio-16x9 rounded-4 overflow-hidden bg-dark">
              <video className="w-100 h-100" controls src={previewUrl}>
                Your browser does not support video preview.
              </video>
            </div>
            <div>
              <label htmlFor="clip-title-input" className="form-label mb-1 text-slate-700">
                Clip title (optional)
              </label>
              <input
                id="clip-title-input"
                type="text"
                className="form-control"
                value={clipTitle}
                onChange={(event) => setClipTitle(event.target.value)}
                placeholder="Give this clip a title"
                maxLength={120}
                disabled={isSaving}
              />
            </div>
            <div className="d-flex flex-wrap gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary" onClick={handleRerecord} disabled={isSaving}>
                Re-record
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={handleModalClose} disabled={isSaving}>
                Discard
              </button>
              <button type="button" className="btn btn-primary" onClick={() => { void handleSaveClip() }} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save clip'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="position-relative ratio ratio-16x9 rounded-4 overflow-hidden bg-dark">
              <video
                ref={videoRef}
                key={videoUrl}
                className="h-100 w-100"
                preload="metadata"
                muted
                src={videoUrl}
                onLoadedMetadata={(event) => {
                  const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0
                  setVideoDuration(duration)
                  const nextTime = clamp(initialTimestampSeconds, 0, Math.max(duration, 0))
                  event.currentTarget.currentTime = nextTime
                  setCurrentVideoTime(nextTime)
                }}
                onTimeUpdate={(event) => setCurrentVideoTime(event.currentTarget.currentTime)}
                onPlay={() => {
                  setIsVideoPlaying(true)
                  if (latestStrokesRef.current.length > 0 || latestActiveStrokeRef.current) {
                    drawingFadeStartedAtMsRef.current = performance.now()
                  }
                }}
                onPause={() => setIsVideoPlaying(false)}
              >
                Your browser does not support video playback.
              </video>
              <canvas
                ref={drawingCanvasRef}
                className="position-absolute top-0 start-0 w-100 h-100"
                style={{ touchAction: 'none', cursor: 'crosshair' }}
                onPointerDown={(event) => {
                  if (mode === 'review') {
                    return
                  }
                  const point = getCanvasPoint(event)
                  if (!point) {
                    return
                  }
                  drawingFadeStartedAtMsRef.current = null
                  drawingOpacityRef.current = 1
                  pointerIdRef.current = event.pointerId
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setActiveStroke({ color: selectedColor, points: [point] })
                }}
                onPointerMove={(event) => {
                  if (pointerIdRef.current !== event.pointerId || !latestActiveStrokeRef.current) {
                    return
                  }
                  const point = getCanvasPoint(event)
                  if (!point) {
                    return
                  }
                  setActiveStroke((previous) => {
                    if (!previous) {
                      return previous
                    }
                    return { ...previous, points: [...previous.points, point] }
                  })
                }}
                onPointerUp={(event) => {
                  if (pointerIdRef.current !== event.pointerId) {
                    return
                  }
                  pointerIdRef.current = null
                  setActiveStroke((previous) => {
                    if (!previous) {
                      return null
                    }
                    setStrokes((existing) => [...existing, previous])
                    if (isVideoPlaying) {
                      drawingFadeStartedAtMsRef.current = performance.now()
                    }
                    return null
                  })
                }}
                onPointerCancel={() => {
                  pointerIdRef.current = null
                  latestActiveStrokeRef.current = null
                  setActiveStroke(null)
                }}
              />
            </div>

            <div className="d-flex flex-column gap-2">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    const video = videoRef.current
                    if (!video) {
                      return
                    }
                    if (video.paused) {
                      void video.play()
                    } else {
                      video.pause()
                    }
                  }}
                  disabled={mode === 'review'}
                >
                  {isVideoPlaying ? 'Pause video' : 'Play video'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={handleClearDrawing}
                >
                  Clear drawing
                </button>
                <span className="text-sm text-slate-600">{playbackSummary}</span>
                <span className="text-sm text-slate-600">
                  Recording: {formatElapsed(recordingElapsedMs)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={videoDuration || 0}
                step={0.05}
                value={clamp(currentVideoTime, 0, videoDuration || 0)}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  seekToTime(nextValue)
                }}
              />
            </div>

            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-700">Color</span>
              {DRAW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`btn btn-sm border ${selectedColor === color ? 'border-3 border-dark' : 'border-1'}`}
                  style={{ width: '2rem', height: '2rem', backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                  aria-label={`Use color ${color}`}
                />
              ))}
            </div>

            <div className="d-flex flex-wrap justify-content-end gap-2">
              {mode === 'recording' ? (
                <button type="button" className="btn btn-danger" onClick={stopRecording}>
                  Stop recording
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => { void beginRecording() }}>
                  Start recording
                </button>
              )}
            </div>
          </>
        )}

        {warningMessage ? (
          <div className="alert alert-warning mb-0 py-2" role="alert">
            {warningMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="alert alert-danger mb-0 py-2" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default ClipRecorderModal
