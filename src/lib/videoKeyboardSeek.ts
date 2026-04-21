const KEYBOARD_SEEK_SECONDS = 10

type KeyboardEventLike = {
  key: string
  preventDefault: () => void
  stopPropagation: () => void
}

type OnSeek = (nextTime: number) => void

function clampSeekTime(videoElement: HTMLVideoElement, nextTime: number): number {
  if (!Number.isFinite(videoElement.duration)) {
    return Math.max(0, nextTime)
  }

  return Math.max(0, Math.min(nextTime, videoElement.duration))
}

async function toggleFullscreen(videoElement: HTMLVideoElement): Promise<void> {
  const ownerDocument = videoElement.ownerDocument
  if (!ownerDocument) {
    return
  }

  if (ownerDocument.fullscreenElement === videoElement) {
    if (typeof ownerDocument.exitFullscreen === 'function') {
      await ownerDocument.exitFullscreen()
    }
    return
  }

  if (ownerDocument.fullscreenElement && typeof ownerDocument.exitFullscreen === 'function') {
    await ownerDocument.exitFullscreen()
  }

  if (typeof videoElement.requestFullscreen === 'function') {
    await videoElement.requestFullscreen()
  }
}

export function handleVideoKeyboardShortcut(
  event: KeyboardEventLike,
  videoElement: HTMLVideoElement,
  onSeek?: OnSeek
): boolean {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()

    const seekOffset = event.key === 'ArrowRight' ? KEYBOARD_SEEK_SECONDS : -KEYBOARD_SEEK_SECONDS
    const nextTime = clampSeekTime(videoElement, videoElement.currentTime + seekOffset)

    videoElement.currentTime = nextTime
    onSeek?.(nextTime)
    return true
  }

  if (event.key.toLowerCase() === 'f') {
    event.preventDefault()
    event.stopPropagation()
    void toggleFullscreen(videoElement).catch(() => {})
    return true
  }

  return false
}

