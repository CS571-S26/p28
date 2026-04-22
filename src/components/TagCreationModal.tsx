import { useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TAG_COLOR_PALETTE } from '../lib/noteStorage'
import { useModalA11y } from '../lib/useModalA11y.ts'
import TagCreationFields from './TagCreationFields'

type TagCreationModalProps = {
  isOpen: boolean
  isSaving: boolean
  tagName: string
  selectedColor: (typeof TAG_COLOR_PALETTE)[number]
  previewLabel: string
  isCreateDisabled: boolean
  onTagNameChange: (value: string) => void
  onColorChange: (color: (typeof TAG_COLOR_PALETTE)[number]) => void
  onClose: () => void
  onCreate: () => void
}

function TagCreationModal({
  isOpen,
  isSaving,
  tagName,
  selectedColor,
  previewLabel,
  isCreateDisabled,
  onTagNameChange,
  onColorChange,
  onClose,
  onCreate
}: TagCreationModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const handleRequestClose = useCallback(() => {
    if (!isSaving) {
      onClose()
    }
  }, [isSaving, onClose])
  const dialogRef = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose: handleRequestClose,
    initialFocusRef: nameInputRef
  })

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="position-fixed inset-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1080, backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
      onClick={() => {
        handleRequestClose()
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-4 border shadow p-4 w-100"
        style={{ maxWidth: '34rem' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tag-modal-title"
      >
        <h2 id="create-tag-modal-title" className="h5 mb-2 text-slate-900">Create global tag</h2>
        <p className="mb-3 text-slate-600">Choose a name and color for this reusable tag</p>
        <TagCreationFields
          nameInputId="create-tag-name-modal"
          nameInputRef={nameInputRef}
          tagName={tagName}
          selectedColor={selectedColor}
          previewLabel={previewLabel}
          onTagNameChange={onTagNameChange}
          onColorChange={onColorChange}
        />
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleRequestClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreate}
            disabled={isCreateDisabled}
          >
            {isSaving ? 'Creating tag...' : 'Create global tag'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default TagCreationModal
