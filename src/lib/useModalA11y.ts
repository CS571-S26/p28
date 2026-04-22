import { useEffect, useRef, type RefObject } from 'react'

type UseModalA11yOptions = {
  isOpen: boolean
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}

export function useModalA11y<T extends HTMLElement>({
  isOpen,
  onClose,
  initialFocusRef
}: UseModalA11yOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const timeoutId = window.setTimeout(() => {
      const initialFocusTarget = initialFocusRef?.current
      if (initialFocusTarget) {
        initialFocusTarget.focus()
        return
      }

      const [firstFocusableElement] = getFocusableElements(container)
      if (firstFocusableElement) {
        firstFocusableElement.focus()
        return
      }

      container.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(containerRef.current)
      if (focusableElements.length === 0) {
        event.preventDefault()
        containerRef.current.focus()
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!(activeElement instanceof HTMLElement) || !containerRef.current.contains(activeElement)) {
        event.preventDefault()
        firstFocusableElement.focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      previousActiveElementRef.current?.focus()
    }
  }, [initialFocusRef, isOpen, onClose])

  return containerRef
}
