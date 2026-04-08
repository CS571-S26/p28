import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type SignInPanelProps = {
  isSignedIn: boolean
  onSignIn: () => void
}

function SignInPanel({ isSignedIn, onSignIn }: SignInPanelProps) {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = username.trim().length > 0 && password.trim().length > 0

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
    navigate('/videos')
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

      <p className="mt-3 mb-0 text-sm text-slate-500">
        {isSignedIn
          ? 'You are signed in. Open Gallery from the navbar.'
          : 'You must sign in before you can open the video gallery.'}
      </p>

      {isModalOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title fs-5">Sign in</h2>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="username" className="form-label">Username</label>
                    <input
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
                  <button type="button" className="btn btn-primary" onClick={handleSignIn} disabled={!canSubmit}>
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={closeModal} />
        </>
      ) : null}
    </>
  )
}

export default SignInPanel
