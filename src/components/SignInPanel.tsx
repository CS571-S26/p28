import { useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModalA11y } from '../lib/useModalA11y.ts'

type SignInPanelProps = {
  isSignedIn: boolean
  onSignIn: () => void
}

function SignInPanel({ isSignedIn, onSignIn }: SignInPanelProps) {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const usernameInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = username.trim().length > 0 && password.trim().length > 0
  const dialogRef = useModalA11y<HTMLDivElement>({
    isOpen: isModalOpen,
    onClose: closeModal,
    initialFocusRef: usernameInputRef
  })

  function openModal() {
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  function handleSignIn() {
    if (!canSubmit) {
      return
    }

    onSignIn()
    closeModal()
    navigate('/')
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    handleSignIn()
  }

  return (
    <>
      {!isSignedIn ? (
        <div className="d-flex justify-content-center">
          <button
            type="button"
            className="btn btn-primary px-4 py-2"
            onClick={openModal}
          >
            Sign in
          </button>
        </div>
      ) : null}

      <p className="mt-3 mb-0 text-sm text-slate-600">
        {isSignedIn
          ? 'You are signed in - open Gallery from the navbar'
          : 'You must sign in before you can open the video gallery'}
      </p>

      {isModalOpen ? (
        <>
          <div
            ref={dialogRef}
            className="modal fade show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-title"
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <form onSubmit={handleSubmit}>
                  <div className="modal-header">
                    <h2 id="sign-in-title" className="modal-title fs-5">Sign in</h2>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label htmlFor="username" className="form-label">Username</label>
                      <input
                        ref={usernameInputRef}
                        id="username"
                        type="text"
                        className="form-control"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                      />
                    </div>
                    <div className="mb-0">
                      <label htmlFor="password" className="form-label">Password</label>
                      <input
                        id="password"
                        type="password"
                        className="form-control"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                      Continue
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={closeModal} role="presentation" />
        </>
      ) : null}
    </>
  )
}

export default SignInPanel
