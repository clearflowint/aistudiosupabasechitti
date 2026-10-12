import { ArrowRight, Layers3, ShieldCheck } from "lucide-react";

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

export function LandingPage({ onSignIn, isLoading, errorMessage }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
            <Layers3 size={21} />
          </div>
          <div>
            <p className="font-semibold tracking-tight">ClearFlow</p>
            <p className="text-xs text-slate-400">Workspace platform</p>
          </div>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-16">
        <div className="grid w-full gap-12 md:grid-cols-2 md:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-200">
              <ShieldCheck size={14} /> Secure workspace access
            </div>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">A clean foundation for your work.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
              A reusable workspace with secure sign-in, clear navigation, and modular features.
              Business workflows live in separate feature modules.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/20">
            <h2 className="text-lg font-semibold">Sign in to continue</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Use the Google account authorized for this workspace.</p>
            {errorMessage && <div role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{errorMessage}</div>}
            <button onClick={onSignIn} disabled={isLoading} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60">
              <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.92 46.98 31.83 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48z"/></svg>
              {isLoading ? "Connecting…" : "Continue with Google"}
              {!isLoading && <ArrowRight className="ml-auto" size={17} />}
            </button>
            <p className="mt-4 text-center text-xs text-slate-500">Access is verified by the application database.</p>
          </div>
        </div>
      </section>
      <footer className="border-t border-white/10 px-6 py-5 text-center text-xs text-slate-500">ClearFlow · Reusable PWA foundation</footer>
    </main>
  );
}
