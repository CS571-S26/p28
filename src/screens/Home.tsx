import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SignInPanel from '../components/SignInPanel.tsx'
import { listStoredVideos, type StoredVideoRecord } from '../lib/videoStorage'

type HomeProps = {
  onSignIn: () => void
  isSignedIn: boolean
  isSignInModalOpen: boolean
  onOpenSignInModal: () => void
  onCloseSignInModal: () => void
  requestedNavLabel: string | null
  requestedNavPath: string | null
}

const RECENT_ACTIVITY_LIMIT = 3

function formatActivityDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp)
}

function Home({
  onSignIn,
  isSignedIn,
  isSignInModalOpen,
  onOpenSignInModal,
  onCloseSignInModal,
  requestedNavLabel,
  requestedNavPath
}: HomeProps) {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<StoredVideoRecord[]>([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadActivity() {
      if (!isSignedIn) {
        setVideos([])
        setActivityError(null)
        setIsLoadingActivity(false)
        return
      }

      setIsLoadingActivity(true)
      setActivityError(null)

      try {
        const storedVideos = await listStoredVideos()
        if (!isCancelled) {
          setVideos(storedVideos)
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load recent activity'
          setActivityError(message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingActivity(false)
        }
      }
    }

    void loadActivity()

    return () => {
      isCancelled = true
    }
  }, [isSignedIn])

  const continueReviewingVideo = useMemo(() => videos[0] ?? null, [videos])
  const recentActivityVideos = useMemo(
    () => videos.slice(0, RECENT_ACTIVITY_LIMIT),
    [videos]
  )

  return (
    <main className="container py-5 grow">
      <section className="row justify-content-center">
        <div className="col-xl-10 col-xxl-9">
          <div className="home-shell rounded-4 border bg-white p-4 p-lg-5 shadow-sm">
            {!isSignedIn ? (
              <section className="text-center py-lg-4">
                <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
                <h1 className="mb-3 text-4xl font-semibold text-slate-900">Review your team film anywhere</h1>
                <p className="mx-auto mb-4 home-copy text-base leading-7 text-slate-600">
                  Sign in to open your saved videos and keep your review workflow in one place.
                </p>

                <SignInPanel
                  isSignedIn={isSignedIn}
                  onSignIn={onSignIn}
                  isModalOpen={isSignInModalOpen}
                  onOpenModal={onOpenSignInModal}
                  onCloseModal={onCloseSignInModal}
                  requestedNavLabel={requestedNavLabel}
                  requestedNavPath={requestedNavPath}
                />
              </section>
            ) : (
              <>
                <section className="mb-4">
                  <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Welcome back</p>
                  <h1 className="mb-2 text-3xl font-semibold text-slate-900">Pick up where you left off</h1>
                  <p className="mb-0 text-slate-600">
                    Continue reviewing with one click, or scan your recent activity.
                  </p>
                </section>

                <section className="mb-4">
                  {continueReviewingVideo ? (
                    <div className="home-continue-card rounded-4 border p-3 p-md-4">
                      <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">
                        {continueReviewingVideo.thumbnailDataUrl ? (
                          <img
                            src={continueReviewingVideo.thumbnailDataUrl}
                            alt={`${continueReviewingVideo.title} thumbnail`}
                            className="home-thumbnail rounded-3 border"
                          />
                        ) : (
                          <div className="home-thumbnail home-thumbnail-fallback rounded-3 border">
                            <span className="small text-slate-700">No thumbnail</span>
                          </div>
                        )}

                        <div className="grow">
                          <p className="mb-1 text-uppercase text-xs tracking-[0.18em] text-primary">
                            Continue reviewing
                          </p>
                          <h2 className="mb-1 fs-5 fw-semibold text-slate-900">{continueReviewingVideo.title}</h2>
                          <p className="mb-0 text-sm text-slate-500">
                            Last added {formatActivityDate(continueReviewingVideo.createdAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary px-4"
                          onClick={() => navigate(`/videos/${continueReviewingVideo.id}`)}
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-4 border p-4 text-center bg-slate-50">
                      <h2 className="mb-2 fs-5 fw-semibold text-slate-900">No saved videos yet</h2>
                      <p className="mb-3 text-slate-600">
                        Upload your first video in the gallery to start your review activity.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary px-4"
                        onClick={() => navigate('/videos')}
                      >
                        Open Gallery
                      </button>
                    </div>
                  )}
                </section>

                <section className="mb-4">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0 fs-5 fw-semibold text-slate-900">Recent activity</h2>
                    <button
                      type="button"
                      className="btn btn-link text-decoration-none p-0"
                      onClick={() => navigate('/videos')}
                    >
                      Open gallery
                    </button>
                  </div>

                  {isLoadingActivity ? (
                    <p className="mb-0 text-slate-600">Loading activity...</p>
                  ) : activityError ? (
                    <div className="alert alert-danger mb-0" role="alert">
                      {activityError}
                    </div>
                  ) : recentActivityVideos.length === 0 ? (
                    <p className="mb-0 text-slate-600">No recent activity yet.</p>
                  ) : (
                    <div className="row g-3">
                      {recentActivityVideos.map((video) => (
                        <div key={video.id} className="col-12 col-md-4">
                          <button
                            type="button"
                            className="home-activity-item rounded-3 border p-2 text-start w-100"
                            onClick={() => navigate(`/videos/${video.id}`)}
                          >
                            {video.thumbnailDataUrl ? (
                              <img
                                src={video.thumbnailDataUrl}
                                alt={`${video.title} thumbnail`}
                                className="home-activity-thumb rounded-2"
                              />
                            ) : (
                              <div className="home-activity-thumb home-thumbnail-fallback rounded-2 border">
                                <span className="small text-slate-700">No thumbnail</span>
                              </div>
                            )}
                            <p className="mb-1 mt-2 fw-semibold text-slate-900 home-activity-title">{video.title}</p>
                            <p className="mb-0 text-sm text-slate-500">{formatActivityDate(video.createdAt)}</p>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default Home