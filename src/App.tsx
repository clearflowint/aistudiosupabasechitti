// MIX: Composition root. Shared auth + product registry + neutral shell; no CFCF imports here.
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { LandingPage } from "./components/LandingPage";
import { WorkspaceHomePage } from "./components/workspace/WorkspaceHomePage";
import { WorkspaceLayout } from "./components/workspace/WorkspaceLayout";
import { LoadingScreen } from "./components/workspace/LoadingScreen";
import { activeProduct } from "./products/productRegistry";
import type { AuthorizedWorkspace } from "./core/workspace/workspace.types";
import { authService } from "./core/auth/auth.service";
import { checkTenantDatabaseConnection, type ConnectionStatus } from "./core/database/connection.service";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const authenticatedEmailRef = useRef<string | null>(null);
  const [workspace, setWorkspace] = useState<AuthorizedWorkspace | null>(null);
  const [activePageId, setActivePageId] = useState(() => {
    const homeId = activeProduct.navigation.find(({ isHome }) => isHome)?.id ?? "home";
    try {
      const savedPageId = window.localStorage.getItem("clearflow:active-page:v1");
      return savedPageId && activeProduct.navigation.some(({ id }) => id === savedPageId)
        ? savedPageId
        : homeId;
    } catch {
      return homeId;
    }
  });
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authorizationAttempt, setAuthorizationAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<ConnectionStatus | null>(null);

  // MIX: Remember the top-level destination so a browser refresh restores the same app screen.
  useEffect(() => {
    try {
      window.localStorage.setItem("clearflow:active-page:v1", activePageId);
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }, [activePageId]);

  // SKELETON: Resolve the persisted session before allowing the sign-in screen to render.
  // Supabase emits the initial auth event asynchronously; subscribing first avoids a flash
  // of the landing page while getSession() restores a valid persisted session.
  useEffect(() => {
    let isMounted = true;
    let initialSessionResolved = false;

    const { data } = authService.onAuthStateChange((_event, currentUser) => {
      if (!isMounted) return;
      const nextEmail = currentUser?.email?.toLowerCase() ?? null;

      if (authenticatedEmailRef.current !== nextEmail) {
        const hadAuthenticatedUser = authenticatedEmailRef.current !== null;
        authenticatedEmailRef.current = nextEmail;
        setWorkspace(null);
        setDatabaseStatus(null);
        setErrorMessage(null);
        // Preserve the restored page during initial session recovery; reset only when an existing session changes.
        if (hadAuthenticatedUser) {
          setActivePageId(activeProduct.navigation.find(({ isHome }) => isHome)?.id ?? "home");
        }
      }
      setUser(currentUser);
      // Safari can emit an empty INITIAL_SESSION while its persisted session is still being
      // recovered. In that case, let getCurrentUser() settle before showing the sign-in page.
      if (!initialSessionResolved && (currentUser !== null || _event !== "INITIAL_SESSION")) {
        initialSessionResolved = true;
        setIsRestoringSession(false);
      }
    });

    void authService.getCurrentUser().then((currentUser) => {
      if (!isMounted) return;
      // The auth event may have already supplied a newer session; don't overwrite it with this snapshot.
      if (!initialSessionResolved) {
        authenticatedEmailRef.current = currentUser?.email?.toLowerCase() ?? null;
        setUser(currentUser);
        initialSessionResolved = true;
        setIsRestoringSession(false);
      }
    }).catch(() => {
      if (!isMounted) return;
      // If the snapshot fails, wait for Supabase auth events rather than treating the user as signed out.
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // MIX: The shell asks the active product to authorize the user; it never queries product tables itself.
  useEffect(() => {
    if (!user?.email) {
      setWorkspace(null);
      setDatabaseStatus(null);
      setIsLoadingWorkspace(false);
      return;
    }

    let isMounted = true;
    setIsLoadingWorkspace(true);
    setErrorMessage(null);

    void activeProduct.resolveWorkspace(user.email)
      .then(async (authorizedWorkspace) => {
        if (!isMounted) return;
        setWorkspace(authorizedWorkspace);
        const status = await checkTenantDatabaseConnection(authorizedWorkspace.tenantId);
        if (isMounted) setDatabaseStatus(status);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setWorkspace(null);
        setDatabaseStatus(null);
        setErrorMessage(getErrorMessage(error, "Unable to authorize this workspace."));
      })
      .finally(() => {
        if (isMounted) setIsLoadingWorkspace(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user?.email, authorizationAttempt]);

  async function handleSignIn() {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      await authService.signInWithGoogle();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Google sign-in failed."));
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await authService.signOut();
      setUser(null);
      setWorkspace(null);
      setDatabaseStatus(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Sign-out failed."));
    } finally {
      setIsSigningOut(false);
    }
  }

  async function retryDatabaseConnection() {
    if (!workspace) return;
    setDatabaseStatus(await checkTenantDatabaseConnection(workspace.tenantId));
  }

  function retryWorkspaceAuthorization() {
    setErrorMessage(null);
    setAuthorizationAttempt((attempt) => attempt + 1);
  }

  if (isRestoringSession) {
    return <LoadingScreen message="Restoring secure session…" />;
  }

  if (isLoadingWorkspace && !workspace && !errorMessage) {
    return <LoadingScreen message="Loading authorized workspace…" />;
  }

  if (!user) {
    return <LandingPage onSignIn={handleSignIn} isLoading={isSigningIn} errorMessage={errorMessage} />;
  }

  if (errorMessage && !workspace) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-rose-300/20 bg-slate-900 p-7">
          <ShieldCheck className="mb-4 text-rose-300" size={28} />
          <h1 className="text-xl font-semibold">Workspace access not granted</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{errorMessage}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={retryWorkspaceAuthorization} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
              Try again
            </button>
            <button type="button" onClick={() => void handleSignOut()} className="rounded-lg border border-white/15 px-4 py-2 text-sm">
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (isLoadingWorkspace || !workspace) {
    return <LoadingScreen message="Loading authorized workspace…" />;
  }

  const activePage = activeProduct.navigation.find(({ id }) => id === activePageId)
    ?? activeProduct.navigation.find(({ isHome }) => isHome)
    ?? activeProduct.navigation[0];

  if (!activePage) {
    return <LoadingScreen message="No workspace pages are configured." />;
  }

  const pageContent = activePage.isHome
    ? <WorkspaceHomePage product={activeProduct} workspace={workspace} onNavigate={setActivePageId} />
    : activeProduct.renderPage(activePage, workspace);

  return (
    <WorkspaceLayout
      product={activeProduct}
      workspace={workspace}
      activePage={activePage}
      databaseStatus={databaseStatus}
      onNavigate={setActivePageId}
      onSignOut={() => void handleSignOut()}
      onRetryConnection={() => void retryDatabaseConnection()}
      isSigningOut={isSigningOut}
    >
      {pageContent}
    </WorkspaceLayout>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
