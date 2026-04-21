import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import Home from './screens/Home'
import TagManager from './screens/TagManager'
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

  const signedInNavClassName = isSignedIn
  ? 'nav-link'
  : 'nav-link disabled text-muted'

  function handleSignIn() {
    setIsSignedIn(true)
  }

  function handleSignOut() {
    setIsSignedIn(false)
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
                <NavLink
                  to="/videos"
                  className={signedInNavClassName}
                  aria-disabled={!isSignedIn}
                  onClick={(event) => {
                    if (!isSignedIn) {
                      event.preventDefault()
                    }
                  }}
                >
                  Gallery
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink
                  to="/tags"
                  className={signedInNavClassName}
                  aria-disabled={!isSignedIn}
                  onClick={(event) => {
                    if (!isSignedIn) {
                      event.preventDefault()
                    }
                  }}
                >
                  Tags
                </NavLink>
              </li>
            </ul>
            <div className="d-flex align-items-center gap-2">
              <span className="small text-secondary">
                {isSignedIn ? 'Signed in' : 'Signed out'}
              </span>
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
        <Route path="/" element={<Home onSignIn={handleSignIn} isSignedIn={isSignedIn} />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
