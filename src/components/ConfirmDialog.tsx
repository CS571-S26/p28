import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../lib/useModalA11y.ts'

type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()
  const dialogRef = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose: onCancel,
    initialFocusRef: variant === 'danger' ? cancelButtonRef : confirmButtonRef
  })

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="position-fixed inset-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1080, backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-4 border shadow p-4 w-100"
        style={{ maxWidth: '28rem' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className="h5 mb-2 text-slate-900">
          {title}
        </h2>
        <p id={messageId} className="mb-4 text-slate-600">{message}</p>
        <div className="d-flex justify-content-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn btn-outline-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`btn btn-${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmDialog
