type TimestampValidationResult =
  | { ok: true; seconds: number }
  | { ok: false; error: string }

export function formatHms(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  return [hours, minutes, remainingSeconds]
    .map((segment) => String(segment).padStart(2, '0'))
    .join(':')
}

export function parseHms(value: string): number | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const segments = trimmed.split(':').map((segment) => segment.trim())

  if (segments.length < 1 || segments.length > 3) {
    return null
  }

  if (!segments.every((segment) => /^\d+$/.test(segment))) {
    return null
  }

  const numericSegments = segments.map((segment) => Number.parseInt(segment, 10))

  if (segments.length === 1) {
    return numericSegments[0]
  }

  const seconds = numericSegments[numericSegments.length - 1]
  const minutes = numericSegments[numericSegments.length - 2]

  if (seconds > 59 || minutes > 59) {
    return null
  }

  if (segments.length === 2) {
    return (minutes * 60) + seconds
  }

  const hours = numericSegments[0]
  return (hours * 3600) + (minutes * 60) + seconds
}

export function validateTimestampInput(value: string, durationSeconds: number | null): TimestampValidationResult {
  const parsedSeconds = parseHms(value)

  if (parsedSeconds === null) {
    return {
      ok: false,
      error: 'Enter a time like hh:mm:ss.'
    }
  }

  if (parsedSeconds < 0) {
    return {
      ok: false,
      error: 'Timestamp cannot be negative.'
    }
  }

  if (durationSeconds !== null && Number.isFinite(durationSeconds)) {
    const maxSeconds = Math.max(0, Math.floor(durationSeconds))

    if (parsedSeconds > maxSeconds) {
      return {
        ok: false,
        error: `Timestamp must be within the video length (max ${formatHms(maxSeconds)}).`
      }
    }
  }

  return {
    ok: true,
    seconds: parsedSeconds
  }
}
