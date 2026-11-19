import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, googleAuthProvider, signInWithPopup } from './firebase.ts';
import { onAuthStateChanged, signOut as firebaseSignOut, User as FirebaseUser, updateProfile } from 'firebase/auth';
import { apiFetch, getOrCreateCartSessionId, setSessionToken } from './api.ts';

export interface AdapterUser {
  id: string;
  dbId?: number;
  role?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string | null;
  city?: string | null;
  emailVerified?: boolean;
  primaryEmailAddress?: {
    emailAddress: string;
  };
  update?: (params: { firstName: string; lastName: string; phone?: string; city?: string }) => Promise<unknown>;
}

export interface MeWorkspaceContext {
  user: any;
  platformRole: string | null;
  businesses: Array<{ id: number; name: string; slug?: string; status: string; role: string }>;
}

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AdapterUser | null;
  idToken: string | null;
  meData: MeWorkspaceContext | null;
  refreshMe: () => Promise<MeWorkspaceContext | null>;
  signOut: () => Promise<void>;
  applyServerSession: (token: string, mePayload: MeWorkspaceContext) => void;
}

const ClerkWrapperContext = createContext<AuthContextType>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  idToken: null,
  meData: null,
  refreshMe: async () => null,
  signOut: async () => {},
  applyServerSession: () => {},
});

const LOCAL_USER_CACHE_KEY = 'bookmyte:auth-user';

export function mergeLocalGuestCart(userUid: string) {
  try {
    const guestRaw = window.localStorage.getItem('bookmyte:cart:guest');
    const pendingRaw = window.localStorage.getItem('bookmyte:pending-checkout');
    const guestCart: Record<string, number> = guestRaw ? JSON.parse(guestRaw) : {};
    if (pendingRaw) {
      const p = JSON.parse(pendingRaw);
      if (p?.quantities && typeof p.quantities === 'object') {
        Object.entries(p.quantities).forEach(([k, v]) => {
          if (Number(v) > 0) guestCart[k] = Number(v);
        });
      }
    }
    if (Object.keys(guestCart).length > 0) {
      const userKey = `bookmyte:cart:${userUid}`;
      const existingRaw = window.localStorage.getItem(userKey);
      const existing: Record<string, number> = existingRaw ? JSON.parse(existingRaw) : {};
      const merged: Record<string, number> = { ...existing };
      Object.entries(guestCart).forEach(([k, v]) => {
        if (Number(v) > 0) merged[k] = Math.min(20, Math.max(merged[k] || 0, Number(v)));
      });
      window.localStorage.setItem(userKey, JSON.stringify(merged));
    }
  } catch {}
}

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [serverUser, setServerUser] = useState<any | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [meData, setMeData] = useState<MeWorkspaceContext | null>(null);

  const refreshMe = useCallback(async (): Promise<MeWorkspaceContext | null> => {
    const res = await apiFetch<MeWorkspaceContext>('/api/users/me');
    if (res.ok && res.data?.user) {
      setMeData(res.data);
      setServerUser(res.data.user);
      window.localStorage.setItem(LOCAL_USER_CACHE_KEY, JSON.stringify(res.data.user));
      mergeLocalGuestCart(res.data.user.uid);
      return res.data;
    }
    return null;
  }, []);

  const applyServerSession = useCallback((token: string, mePayload: MeWorkspaceContext) => {
    setSessionToken(token);
    setIdToken(token);
    setMeData(mePayload);
    setServerUser(mePayload.user);
    if (mePayload?.user) {
      window.localStorage.setItem(LOCAL_USER_CACHE_KEY, JSON.stringify(mePayload.user));
      mergeLocalGuestCart(mePayload.user.uid);
    }
  }, []);

  useEffect(() => {
    getOrCreateCartSessionId();

    const initSession = async () => {
      const existingToken = window.localStorage.getItem('bookmyte:session-token');
      if (existingToken) {
        setSessionToken(existingToken);
        setIdToken(existingToken);
        const me = await refreshMe();
        if (!me) {
          setSessionToken(null);
          setIdToken(null);
          window.localStorage.removeItem(LOCAL_USER_CACHE_KEY);
        }
      }
      setIsLoaded(true);
    };

    initSession();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFbUser(user);
        try {
          const token = await user.getIdToken();
          setSessionToken(token);
          setIdToken(token);
          const names = (user.displayName || '').trim().split(/\s+/);
          await apiFetch('/api/users/sync', {
            method: 'POST',
            body: JSON.stringify({
              firstName: names[0] || '',
              lastName: names.slice(1).join(' ') || '',
            }),
          });
          await refreshMe();
        } catch (err) {
          console.error('[Firebase Auth Sync] Failed:', err);
        }
      } else {
        setFbUser(null);
      }
      setIsLoaded(true);
    });

    return () => unsub();
  }, [refreshMe]);

  const handleSignOut = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setSessionToken(null);
    setIdToken(null);
    setServerUser(null);
    setMeData(null);
    window.localStorage.removeItem(LOCAL_USER_CACHE_KEY);
    try {
      await firebaseSignOut(auth);
    } catch {}
    window.location.href = '/';
  };

  const activeDbUser = meData?.user || serverUser;
  const userAdapter: AdapterUser | null = activeDbUser
    ? {
        id: activeDbUser.uid,
        dbId: activeDbUser.id,
        role: activeDbUser.role,
        firstName: activeDbUser.firstName || 'Guest',
        lastName: activeDbUser.lastName || '',
        fullName: `${activeDbUser.firstName || ''} ${activeDbUser.lastName || ''}`.trim() || activeDbUser.email,
        phone: activeDbUser.phone,
        city: activeDbUser.city,
        emailVerified: activeDbUser.emailVerified === 1,
        primaryEmailAddress: { emailAddress: activeDbUser.email },
        update: async (params) => {
          if (fbUser) {
            try {
              await updateProfile(fbUser, { displayName: `${params.firstName} ${params.lastName}`.trim() });
            } catch {}
          }
          await apiFetch('/api/profile', {
            method: 'PATCH',
            body: JSON.stringify(params),
          });
          await refreshMe();
        },
      }
    : null;

  return (
    <ClerkWrapperContext.Provider
      value={{
        isLoaded,
        isSignedIn: Boolean(activeDbUser),
        user: userAdapter,
        idToken,
        meData,
        refreshMe,
        signOut: handleSignOut,
        applyServerSession,
      }}
    >
      {children}
    </ClerkWrapperContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(ClerkWrapperContext);
}

export function useUser() {
  const ctx = useContext(ClerkWrapperContext);
  return {
    isLoaded: ctx.isLoaded,
    isSignedIn: ctx.isSignedIn,
    user: ctx.user,
  };
}

export function useClerk() {
  const ctx = useContext(ClerkWrapperContext);
  return {
    signOut: ctx.signOut,
    addListener: () => () => {},
  };
}

export const isClerkMocked = true;

function navigateAfterAuth(mePayload?: MeWorkspaceContext | null) {
  const returnUrl = window.sessionStorage.getItem('bookmyte:return-url');
  if (returnUrl) {
    window.sessionStorage.removeItem('bookmyte:return-url');
    window.location.href = returnUrl;
    return;
  }

  const activeEvt = window.localStorage.getItem('bookmyte:active-event-id');
  const guestCartStr = window.localStorage.getItem('bookmyte:cart:guest');
  try {
    if (guestCartStr && activeEvt) {
      const parsed = JSON.parse(guestCartStr);
      if (Object.values(parsed).some((v: any) => Number(v) > 0)) {
        window.location.href = `/checkout?event=${activeEvt}`;
        return;
      }
    }
  } catch {}

  if (mePayload?.platformRole === 'SUPER_ADMIN') {
    window.location.href = '/admin';
  } else if (mePayload?.businesses && mePayload.businesses.length > 0 && window.location.pathname.includes('business')) {
    window.location.href = '/business/dashboard';
  } else {
    window.location.href = '/discover';
  }
}

export function AuthForm({
  initialMode = 'signin',
  onAuthSuccess,
  titleOverride,
  subtitleOverride,
  compact = false,
}: {
  initialMode?: 'signin' | 'signup' | 'forgot';
  onAuthSuccess?: () => void;
  titleOverride?: string;
  subtitleOverride?: string;
  compact?: boolean;
}) {
  const { applyServerSession, refreshMe } = useAuthContext();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result?.user) {
        const token = await result.user.getIdToken();
        setSessionToken(token);
        const names = (result.user.displayName || '').trim().split(/\s+/);
        await apiFetch('/api/users/sync', {
          method: 'POST',
          body: JSON.stringify({ firstName: names[0] || '', lastName: names.slice(1).join(' ') || '' }),
        });
        const me = await refreshMe();
        if (onAuthSuccess) onAuthSuccess();
        else navigateAfterAuth(me);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        setError('Browser popup blocked. Please allow popups or sign in with your email and password below.');
      } else {
        setError(err.message || 'Google Sign-In failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === 'forgot') {
        if (!resetRequested) {
          const res = await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          if (!res.ok) throw new Error(res.data?.error || 'Could not request reset.');
          setResetRequested(true);
          setInfo(res.data?.message || 'Reset instructions sent.');
        } else {
          const res = await apiFetch('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token: resetToken, newPassword }),
          });
          if (!res.ok) throw new Error(res.data?.error || 'Reset failed.');
          setInfo('Password updated! You can now sign in.');
          setMode('signin');
          setResetRequested(false);
        }
        return;
      }

      if (mode === 'signup') {
        const res = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, firstName, lastName, phone }),
        });
        if (!res.ok) throw new Error(res.data?.error || 'Sign up failed.');
        applyServerSession(res.data.token, {
          user: res.data.user,
          platformRole: res.data.platformRole,
          businesses: res.data.businesses,
        });
        if (onAuthSuccess) onAuthSuccess();
        else navigateAfterAuth(res.data);
      } else {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) throw new Error(res.data?.error || 'Sign in failed.');
        applyServerSession(res.data.token, {
          user: res.data.user,
          platformRole: res.data.platformRole,
          businesses: res.data.businesses,
        });
        if (onAuthSuccess) onAuthSuccess();
        else navigateAfterAuth(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`w-full ${compact ? '' : 'max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl'} drift-in`}>
      {!compact && (
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-xl bg-[#11100F] px-3.5 py-2 font-display text-2xl font-extrabold uppercase tracking-tight text-[#F2ECE1]">
            <span className="text-primary">B</span>OOKMYTE
          </div>
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground">
            {titleOverride || (mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password')}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {subtitleOverride ||
              (mode === 'signin'
                ? 'Access your tickets, orders, and event workspace. Your cart stays preserved.'
                : mode === 'signup'
                  ? 'Register as a customer to manage tickets & claim passes. Your selected cart items stay safe.'
                  : 'Enter your email address to reset your password.')}
          </p>
        </div>
      )}

      {mode !== 'forgot' && (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
            className={`rounded-lg py-2 text-xs font-bold transition-all ${mode === 'signin' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
            className={`rounded-lg py-2 text-xs font-bold transition-all ${mode === 'signup' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Create Account
          </button>
        </div>
      )}

      <form onSubmit={handleEmailAuth} className="space-y-3.5 text-left">
        {mode === 'signup' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Maya"
                className="onboarding-input"
              />
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">Last Name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Chen"
                className="onboarding-input"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block mb-1 text-[11px] font-bold text-foreground">Email Address *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="onboarding-input"
          />
        </div>

        {mode === 'signup' && (
          <div>
            <label className="block mb-1 text-[11px] font-bold text-foreground">Mobile Number (optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+27 82 555 0100"
              className="onboarding-input"
            />
          </div>
        )}

        {mode !== 'forgot' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-foreground">Password *</label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="onboarding-input"
            />
          </div>
        )}

        {mode === 'forgot' && resetRequested && (
          <>
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">Reset Token *</label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste reset token"
                className="onboarding-input"
              />
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold text-foreground">New Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="onboarding-input"
              />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/25 p-3 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl bg-primary/15 border border-primary/30 p-3 text-xs font-semibold text-foreground">
            {info}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded-xl bg-primary py-3 text-xs font-extrabold text-primary-foreground hover:brightness-95 active:scale-[0.99] disabled:opacity-50 transition-all"
        >
          {loading ? (
            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
          ) : mode === 'signin' ? (
            'Sign In'
          ) : mode === 'signup' ? (
            'Create Account'
          ) : resetRequested ? (
            'Update Password'
          ) : (
            'Send Reset Instructions'
          )}
        </button>

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => { setMode('signin'); setResetRequested(false); setError(null); }}
            className="w-full text-center text-xs font-bold text-muted-foreground hover:text-foreground pt-1"
          >
            Back to Sign In
          </button>
        )}
      </form>

      {mode !== 'forgot' && (
        <>
          <div className="relative my-5 text-center">
            <div className="absolute inset-y-1/2 left-0 right-0 border-t border-border" />
            <span className="relative bg-card px-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              or continue with
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-bold transition hover:bg-muted disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.37 7.56l3.82 2.96C6.12 7.02 8.84 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.275c0-.82-.07-1.61-.2-2.375H12v4.51h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.39-4.88 3.39-8.525z" />
              <path fill="#FBBC05" d="M5.19 14.52a6.97 6.97 0 010-4.44l-3.82-2.96a11.94 11.94 0 000 10.36l3.82-2.96z" />
              <path fill="#34A562" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.01.68-2.31 1.09-3.81 1.09-3.16 0-5.88-1.98-6.84-4.96l-3.82 2.96C3.37 20.35 7.35 23 12 23z" />
            </svg>
            Continue with Google
          </button>
        </>
      )}
    </div>
  );
}

export function SignIn(props: any) {
  return <AuthForm initialMode="signin" onAuthSuccess={props.onAuthSuccess} />;
}

export function SignUp(props: any) {
  return <AuthForm initialMode="signup" onAuthSuccess={props.onAuthSuccess} />;
}
