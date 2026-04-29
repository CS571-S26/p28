import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import Home from './screens/Home'
import TagManager from './screens/TagManager'
import TagQueue from './screens/TagQueue.tsx'
import VideoPlayer from './screens/VideoPlayer'
import VideoSelector from './screens/VideoSelector'

type ProtectedRouteProps = {
  isSignedIn: boolean
  children: ReactNode
}

function ProtectedRoute({ isSignedIn, children }: ProtectedRouteProps) {
  if (!isSignedIn) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [requestedNavLabel, setRequestedNavLabel] = useState<string | null>(null)
  const [requestedNavPath, setRequestedNavPath] = useState<string | null>(null)

  function handleSignIn() {
    setIsSignedIn(true)
  }

  function handleSignOut() {
    setIsSignedIn(false)
  }

  function openSignInModal(label?: string, path?: string) {
    setRequestedNavLabel(label ?? null)
    setRequestedNavPath(path ?? null)
    setIsSignInModalOpen(true)
  }

  function closeSignInModal() {
    setIsSignInModalOpen(false)
    setRequestedNavLabel(null)
    setRequestedNavPath(null)
  }

  return (
    <div className="app d-flex flex-column">
      <nav className="navbar navbar-expand-lg bg-white border-bottom shadow-sm">
        <div className="container">
          <NavLink to="/" className="navbar-brand fw-semibold text-primary text-decoration-none">
            Film Reviewer
          </NavLink>
          <div className="d-flex align-items-center justify-content-between grow">
            <ul className="navbar-nav flex-row me-auto gap-2">
              <li className="nav-item">
                <NavLink to="/" className="nav-link">
                  Home
                </NavLink>
              </li>
              <li className="nav-item">
                {isSignedIn ? (
                  <NavLink to="/videos" className="nav-link">
                    Gallery
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className="nav-link text-slate-500 bg-transparent border-0"
                    onClick={() => openSignInModal('Gallery', '/videos')}
                  >
                    Gallery
                  </button>
                )}
              </li>
              <li className="nav-item">
                {isSignedIn ? (
                  <NavLink to="/tags" className="nav-link">
                    Tags
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className="nav-link text-slate-500 bg-transparent border-0"
                    onClick={() => openSignInModal('Tags', '/tags')}
                  >
                    Tags
                  </button>
                )}
              </li>
              <li className="nav-item">
                {isSignedIn ? (
                  <NavLink to="/tag-queue" className="nav-link">
                    Tag Queue
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className="nav-link text-slate-500 bg-transparent border-0"
                    onClick={() => openSignInModal('Tag Queue', '/tag-queue')}
                  >
                    Tag Queue
                  </button>
                )}
              </li>
            </ul>
            <div className="d-flex align-items-center gap-2">
              {isSignedIn ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </nav>

      <Routes>
        <Route
          path="/"
          element={(
            <Home
              onSignIn={handleSignIn}
              isSignedIn={isSignedIn}
              isSignInModalOpen={isSignInModalOpen}
              onOpenSignInModal={() => openSignInModal()}
              onCloseSignInModal={closeSignInModal}
              requestedNavLabel={requestedNavLabel}
              requestedNavPath={requestedNavPath}
            />
          )}
        />
        <Route
          path="/videos"
          element={(
            <ProtectedRoute isSignedIn={isSignedIn}>
              <VideoSelector />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/tags"
          element={(
            <ProtectedRoute isSignedIn={isSignedIn}>
              <TagManager />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/videos/:videoId"
          element={(
            <ProtectedRoute isSignedIn={isSignedIn}>
              <VideoPlayer />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/tag-queue"
          element={(
            <ProtectedRoute isSignedIn={isSignedIn}>
              <TagQueue />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
