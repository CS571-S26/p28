import SignInPanel from '../components/SignInPanel.tsx'

type HomeProps = {
  onSignIn: () => void
  isSignedIn: boolean
}

function Home({ onSignIn, isSignedIn }: HomeProps) {
  return (
    <main className="container py-5 grow">
      <section className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="rounded-4 border bg-white p-5 shadow-sm text-center">
            <p className="mb-2 text-uppercase text-sm tracking-[0.2em] text-primary">Film Reviewer</p>
            <h1 className="mb-3 text-4xl font-semibold text-slate-900">Review your team film anywhere</h1>
            <p className="mx-auto mb-4 max-w-2xl text-base leading-7 text-slate-600">
              Sign in to access your saved videos and open any clip from your gallery.
            </p>

            <SignInPanel isSignedIn={isSignedIn} onSignIn={onSignIn} />
          </div>
        </div>
      </section>
    </main>
  )
}

export default Home