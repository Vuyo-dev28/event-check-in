import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleAuthProvider, signInWithPopup } from './firebase.ts';
import { onAuthStateChanged, signOut as firebaseSignOut, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

interface AdapterUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  primaryEmailAddress?: {
    emailAddress: string;
  };
  update?: (params: { firstName: string; lastName: string }) => Promise<unknown>;
}

interface ClerkWrapperContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AdapterUser | null;
  idToken: string | null;
  signOut: () => Promise<void>;
  setSimulatedUserDirectly: (user: any) => void;
}

const ClerkWrapperContext = createContext<ClerkWrapperContextType>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  idToken: null,
  signOut: async () => {},
  setSimulatedUserDirectly: () => {},
});

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [simulatedUser, setSimulatedUser] = useState<any | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if there is a simulated user stored in localStorage
    const stored = window.localStorage.getItem('event-check-in:simulated-user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSimulatedUser(parsed);
        setIdToken(parsed.idToken);
        (window as any).__firebaseToken = parsed.idToken;
      } catch (e) {
        console.error('Failed to parse simulated user:', e);
      }
    }

    // Seed default accounts so users can log in immediately
    try {
      let accounts: any[] = [];
      const accountsJson = window.localStorage.getItem('event-check-in:registered-accounts');
      if (accountsJson) {
        accounts = JSON.parse(accountsJson);
      }

      const defaultAccounts = [
        { email: 'jordan.scott@northstarsummit.com', password: 'password123', fullName: 'Jordan Scott', uid: 'user_2N6x2B5p9a8K7b4C1d9E' },
        { email: 'admin@howlertickets.com', password: 'password123', fullName: 'Admin Boss', uid: 'super-admin-uid' },
        { email: 'maya@example.com', password: 'password123', fullName: 'Maya Chen', uid: 'maya-chen-uid' },
        { email: 'jon@example.com', password: 'password123', fullName: 'Jon Bell', uid: 'jon-bell-uid' },
        { email: 'vuyombanjwa02@gmail.com', password: 'password123', fullName: 'Vuyo Mbanjwa', uid: 'vuyo-mbanjwa-uid' },
      ];

      let modified = false;
      for (const defAcc of defaultAccounts) {
        if (!accounts.some((a: any) => a.email.toLowerCase() === defAcc.email.toLowerCase())) {
          accounts.push(defAcc);
          modified = true;
        }
      }
      if (modified || !accountsJson) {
        window.localStorage.setItem('event-check-in:registered-accounts', JSON.stringify(accounts));
      }
    } catch (e) {
      console.error('Failed to seed default mock accounts:', e);
    }

    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        // If logged in via Firebase Auth, clear simulated user
        window.localStorage.removeItem('event-check-in:simulated-user');
        setSimulatedUser(null);
        setFbUser(user);
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          (window as any).__firebaseToken = token;

          const names = (user.displayName || '').split(' ');
          const firstName = names[0] || 'Guest';
          const lastName = names.slice(1).join(' ') || '';

          // Determine role: default is attendee (user / ticket buyer)
          const storedRole = window.localStorage.getItem(`event-check-in:role:${user.uid}`);
          let userRole = storedRole || 'attendee';
          if (user.email === 'admin@howlertickets.com' || user.email === 'jordan.scott@northstarsummit.com') {
            userRole = 'organizer';
          }
          // Ticket buyers must always have attendee (user) role by default
          const hasGuestCart = Boolean(window.localStorage.getItem('event-check-in:cart:guest'));
          const hasPending = Boolean(window.localStorage.getItem('event-check-in:pending-checkout'));
          if (hasGuestCart || hasPending || window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart')) {
            userRole = 'attendee';
          }
          window.localStorage.setItem(`event-check-in:role:${user.uid}`, userRole);

          // Merge any guest cart selections so tickets do not disappear
          try {
            const guestCartStr = window.localStorage.getItem('event-check-in:cart:guest');
            const pendingStr = window.localStorage.getItem('event-check-in:pending-checkout');
            let guestCart: Record<string, number> = guestCartStr ? JSON.parse(guestCartStr) : {};
            if (pendingStr) {
              const pending = JSON.parse(pendingStr);
              if (pending?.quantities) {
                guestCart = { ...guestCart, ...pending.quantities };
              }
            }
            if (Object.keys(guestCart).length > 0) {
              const userCartKey = `event-check-in:cart:${user.uid}`;
              const userCartStr = window.localStorage.getItem(userCartKey);
              const userCart: Record<string, number> = userCartStr ? JSON.parse(userCartStr) : {};
              const merged = { ...userCart, ...guestCart };
              window.localStorage.setItem(userCartKey, JSON.stringify(merged));
            }
          } catch {}

          // Sync authenticated user details to PostgreSQL
          await fetch('/api/users/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              email: user.email || '',
              role: userRole,
              firstName,
              lastName,
            }),
          });
        } catch (e) {
          console.error('[Auth Sync] Failed to sync authenticated user with Postgres:', e);
        }
      } else {
        setFbUser(null);
        // Only clear token if there's no simulated user
        if (!window.localStorage.getItem('event-check-in:simulated-user')) {
          setIdToken(null);
          (window as any).__firebaseToken = null;
        }
      }
      setIsLoaded(true);
    });
  }, []);

  const handleSignOut = async () => {
    window.localStorage.removeItem('event-check-in:simulated-user');
    setSimulatedUser(null);
    await firebaseSignOut(auth);
    window.location.href = '/';
  };

  const userAdapter: AdapterUser | null = fbUser ? {
    id: fbUser.uid,
    firstName: (fbUser.displayName || '').split(' ')[0] || 'Guest',
    lastName: (fbUser.displayName || '').split(' ').slice(1).join(' ') || '',
    fullName: fbUser.displayName || 'Guest Attendee',
    primaryEmailAddress: fbUser.email ? { emailAddress: fbUser.email } : undefined,
    update: async (params: { firstName: string; lastName: string }) => {
      try {
        await updateProfile(fbUser, { displayName: `${params.firstName} ${params.lastName}` });
      } catch (err) {
        console.warn('Failed to update Firebase profile:', err);
      }
    }
  } : simulatedUser ? {
    id: simulatedUser.uid,
    firstName: simulatedUser.firstName,
    lastName: simulatedUser.lastName,
    fullName: simulatedUser.fullName,
    primaryEmailAddress: { emailAddress: simulatedUser.email },
    update: async (params: { firstName: string; lastName: string }) => {
      const updated = {
        ...simulatedUser,
        firstName: params.firstName,
        lastName: params.lastName,
        fullName: `${params.firstName} ${params.lastName}`,
      };
      setSimulatedUser(updated);
      window.localStorage.setItem('event-check-in:simulated-user', JSON.stringify(updated));
    }
  } : null;

  const setSimulatedUserDirectly = (mockUser: any) => {
    setSimulatedUser(mockUser);
    setIdToken(mockUser.idToken);
    (window as any).__firebaseToken = mockUser.idToken;
  };

  return (
    <ClerkWrapperContext.Provider value={{
      isLoaded,
      isSignedIn: !!fbUser || !!simulatedUser,
      user: userAdapter,
      idToken,
      signOut: handleSignOut,
      setSimulatedUserDirectly,
    }}>
      {children}
    </ClerkWrapperContext.Provider>
  );
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
    addListener: (cb: any) => {
      return () => {};
    },
  };
}

export const isClerkMocked = false;

function AuthForm({ initialMode = 'signin', onAuthSuccess }: { initialMode?: 'signin' | 'signup'; onAuthSuccess?: () => void }) {
  const { setSimulatedUserDirectly } = useContext(ClerkWrapperContext);
  const [intendedRole, setIntendedRole] = useState<'customer' | 'organizer' | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    console.log("Sign In clicked");
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result && result.user) {
        if (onAuthSuccess) {
          onAuthSuccess();
        } else {
          const returnUrl = window.sessionStorage.getItem('event-check-in:return-url');
          const isCheckout = window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart');
          if (returnUrl) {
            window.sessionStorage.removeItem('event-check-in:return-url');
            window.location.href = returnUrl;
          } else if (isCheckout) {
            // Stay on current checkout page
          } else {
            window.location.href = '/events';
          }
        }
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        setError('Popup was blocked by your browser. Please use the Quick Sandbox Bypass or Email Sign In below.');
      } else {
        setError(err.message || 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSandboxBypass = async () => {
    console.log("Sign In clicked");
    setError(null);
    setLoading(true);
    try {
      const demoEmail = email.trim() || 'demo.user@example.com';
      const names = (fullName.trim() || demoEmail.split('@')[0] || 'Demo User').split(' ');
      const firstName = names[0] || 'Demo';
      const lastName = names.slice(1).join(' ') || 'User';
      const uid = `mock-uid-${demoEmail.replace(/[^a-zA-Z0-9]/g, '') || 'demouser'}`;
      
      const mockPayload = {
        uid,
        email: demoEmail,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      };
      
      const base64Token = btoa(unescape(encodeURIComponent(JSON.stringify(mockPayload))));
      const mockToken = `mock-token-${base64Token}`;
      
      const mockUser = {
        ...mockPayload,
        idToken: mockToken,
      };
      
      // Determine role: default is attendee (user / ticket buyer)
      const storedRole = window.localStorage.getItem(`event-check-in:role:${uid}`);
      let userRole = storedRole || 'attendee';
      if (demoEmail === 'admin@howlertickets.com' || demoEmail === 'jordan.scott@northstarsummit.com') {
        userRole = 'organizer';
      }
      const hasGuestCart = Boolean(window.localStorage.getItem('event-check-in:cart:guest'));
      const hasPending = Boolean(window.localStorage.getItem('event-check-in:pending-checkout'));
      if (hasGuestCart || hasPending || window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart')) {
        userRole = 'attendee';
      }

      // Merge guest cart to user cart
      try {
        const guestCartStr = window.localStorage.getItem('event-check-in:cart:guest');
        const pendingStr = window.localStorage.getItem('event-check-in:pending-checkout');
        let guestCart: Record<string, number> = guestCartStr ? JSON.parse(guestCartStr) : {};
        if (pendingStr) {
          const pending = JSON.parse(pendingStr);
          if (pending?.quantities) {
            guestCart = { ...guestCart, ...pending.quantities };
          }
        }
        if (Object.keys(guestCart).length > 0) {
          const userCartKey = `event-check-in:cart:${uid}`;
          const userCartStr = window.localStorage.getItem(userCartKey);
          const userCart: Record<string, number> = userCartStr ? JSON.parse(userCartStr) : {};
          const merged = { ...userCart, ...guestCart };
          window.localStorage.setItem(userCartKey, JSON.stringify(merged));
        }
      } catch {}

      // Save locally
      window.localStorage.setItem('event-check-in:simulated-user', JSON.stringify(mockUser));
      window.localStorage.setItem(`event-check-in:role:${uid}`, userRole);
      
      // Update React context directly
      setSimulatedUserDirectly(mockUser);

      // Sync with Postgres first so database has it
      try {
        await fetch('/api/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
          },
          body: JSON.stringify({
            email: demoEmail,
            role: userRole,
            firstName,
            lastName,
          }),
        });
      } catch (syncErr) {
        console.warn('Sync notice:', syncErr);
      }
      
      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        const returnUrl = window.sessionStorage.getItem('event-check-in:return-url');
        const isCheckout = window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart');
        if (returnUrl) {
          window.sessionStorage.removeItem('event-check-in:return-url');
          window.location.href = returnUrl;
        } else if (isCheckout) {
          // Stay on checkout
        } else {
          const activeEvt = window.localStorage.getItem('event-check-in:active-event-id');
          const guestCartStr = window.localStorage.getItem('event-check-in:cart:guest');
          const hasCart = guestCartStr && Object.values(JSON.parse(guestCartStr)).some((v: any) => v > 0);
          if (hasCart && activeEvt) {
            window.location.href = `/buy?event=${activeEvt}`;
          } else {
            window.location.href = '/events';
          }
        }
      }
    } catch (err: any) {
      console.error('Sandbox bypass failed:', err);
      setError('Sandbox quick login failed: ' + (err.message || 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      console.log("Sign In clicked");
    } else {
      console.log("Sign Up clicked");
    }
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please fill in both email and password.');
      setLoading(false);
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name for ticket assignments.');
      setLoading(false);
      return;
    }

    try {
      // Retrieve registered accounts from localStorage
      let accounts: any[] = [];
      const accountsJson = window.localStorage.getItem('event-check-in:registered-accounts');
      if (accountsJson) {
        accounts = JSON.parse(accountsJson);
      }

      // Ensure default seeded accounts are populated
      const defaultAccounts = [
        { email: 'jordan.scott@northstarsummit.com', password: 'password123', fullName: 'Jordan Scott', uid: 'user_2N6x2B5p9a8K7b4C1d9E' },
        { email: 'admin@howlertickets.com', password: 'password123', fullName: 'Admin Boss', uid: 'super-admin-uid' },
        { email: 'maya@example.com', password: 'password123', fullName: 'Maya Chen', uid: 'maya-chen-uid' },
        { email: 'jon@example.com', password: 'password123', fullName: 'Jon Bell', uid: 'jon-bell-uid' },
        { email: 'vuyombanjwa02@gmail.com', password: 'password123', fullName: 'Vuyo Mbanjwa', uid: 'vuyo-mbanjwa-uid' },
      ];

      for (const defAcc of defaultAccounts) {
        if (!accounts.some((a: any) => a.email.toLowerCase() === defAcc.email.toLowerCase())) {
          accounts.push(defAcc);
        }
      }

      let targetAccount = null;

      const exists = accounts.find((acc: any) => acc.email.toLowerCase() === trimmedEmail);
      if (exists) {
        // If account exists, update password to match entered password (never lock them out!)
        exists.password = trimmedPassword;
        if (fullName.trim()) {
          exists.fullName = fullName.trim();
        }
        targetAccount = exists;
        window.localStorage.setItem('event-check-in:registered-accounts', JSON.stringify(accounts));
      } else {
        // Create account on the fly
        const uid = `mock-uid-${trimmedEmail.replace(/[^a-zA-Z0-9]/g, '') || Math.random().toString(36).substring(7)}`;
        targetAccount = {
          uid,
          email: trimmedEmail,
          password: trimmedPassword,
          fullName: fullName.trim() || trimmedEmail.split('@')[0],
        };
        accounts.push(targetAccount);
        window.localStorage.setItem('event-check-in:registered-accounts', JSON.stringify(accounts));
      }

      const names = targetAccount.fullName.split(' ');
      const firstName = names[0] || 'Sandbox';
      const lastName = names.slice(1).join(' ') || 'User';

      const mockPayload = {
        uid: targetAccount.uid,
        email: targetAccount.email,
        firstName,
        lastName,
        fullName: targetAccount.fullName,
      };

      const base64Token = btoa(unescape(encodeURIComponent(JSON.stringify(mockPayload))));
      const mockToken = `mock-token-${base64Token}`;

      const mockUser = {
        ...mockPayload,
        idToken: mockToken,
      };

      // Determine starting role: default is attendee (user / ticket buyer)
      let roleToSave = 'attendee';
      if (targetAccount.email === 'admin@howlertickets.com' || targetAccount.email === 'jordan.scott@northstarsummit.com') {
        roleToSave = 'organizer';
      } else {
        const existingRole = window.localStorage.getItem(`event-check-in:role:${targetAccount.uid}`);
        if (existingRole) {
          roleToSave = existingRole;
        }
      }

      // If user is buying tickets or signing up, their role MUST be attendee
      const hasGuestCart = Boolean(window.localStorage.getItem('event-check-in:cart:guest'));
      const hasPending = Boolean(window.localStorage.getItem('event-check-in:pending-checkout'));
      if (hasGuestCart || hasPending || window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart') || mode === 'signup') {
        roleToSave = 'attendee';
      }

      // Merge guest cart to user cart so tickets never disappear
      try {
        const guestCartStr = window.localStorage.getItem('event-check-in:cart:guest');
        const pendingStr = window.localStorage.getItem('event-check-in:pending-checkout');
        let guestCart: Record<string, number> = guestCartStr ? JSON.parse(guestCartStr) : {};
        if (pendingStr) {
          const pending = JSON.parse(pendingStr);
          if (pending?.quantities) {
            guestCart = { ...guestCart, ...pending.quantities };
          }
        }
        if (Object.keys(guestCart).length > 0) {
          const userCartKey = `event-check-in:cart:${targetAccount.uid}`;
          const userCartStr = window.localStorage.getItem(userCartKey);
          const userCart: Record<string, number> = userCartStr ? JSON.parse(userCartStr) : {};
          const merged = { ...userCart, ...guestCart };
          window.localStorage.setItem(userCartKey, JSON.stringify(merged));
        }
      } catch {}

      // Save locally
      window.localStorage.setItem('event-check-in:simulated-user', JSON.stringify(mockUser));
      window.localStorage.setItem(`event-check-in:role:${targetAccount.uid}`, roleToSave);

      // Update React context directly so UI reacts immediately
      setSimulatedUserDirectly(mockUser);

      // Sync with Postgres database
      try {
        await fetch('/api/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
          },
          body: JSON.stringify({
            email: targetAccount.email,
            role: roleToSave,
            firstName,
            lastName,
          }),
        });
      } catch (syncErr) {
        console.warn('Sync notice:', syncErr);
      }

      // Transition smoothly
      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        const returnUrl = window.sessionStorage.getItem('event-check-in:return-url');
        const isCheckout = window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart');
        if (returnUrl) {
          window.sessionStorage.removeItem('event-check-in:return-url');
          window.location.href = returnUrl;
        } else if (isCheckout) {
          // Stay on checkout
        } else {
          const activeEvt = window.localStorage.getItem('event-check-in:active-event-id');
          const guestCartStr = window.localStorage.getItem('event-check-in:cart:guest');
          const hasCart = guestCartStr && Object.values(JSON.parse(guestCartStr)).some((v: any) => v > 0);
          if (hasCart && activeEvt) {
            window.location.href = `/buy?event=${activeEvt}`;
          } else {
            window.location.href = '/events';
          }
        }
      }
    } catch (err: any) {
      console.error('Email authentication failed:', err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl drift-in">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          {mode === 'signin' 
            ? 'Access your digital passes and manage your events.' 
            : 'Register your secure wallet to secure and transfer passes.'}
        </p>
      </div>

      {/* Mode Selector Tabs */}
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => { console.log("Sign In clicked"); setMode('signin'); setError(null); }}
          className={`rounded-lg py-1.5 text-xs font-bold transition-all ${mode === 'signin' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { console.log("Sign Up clicked"); setMode('signup'); setError(null); }}
          className={`rounded-lg py-1.5 text-xs font-bold transition-all ${mode === 'signup' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
        {mode === 'signup' && (
          <div>
            <label className="block mb-1.5 text-[11px] font-bold text-foreground">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Liam Chen"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50 transition-all"
            />
          </div>
        )}

        <div>
          <label className="block mb-1.5 text-[11px] font-bold text-foreground">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="liam@example.com"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50 transition-all"
          />
        </div>

        <div>
          <label className="block mb-1.5 text-[11px] font-bold text-foreground">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50 transition-all"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/25 p-3 text-center text-xs font-semibold text-destructive">
            {error}
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
            'Sign In with Email'
          ) : (
            'Sign Up with Email'
          )}
        </button>
      </form>

      <div className="relative my-6 text-center">
        <div className="absolute inset-y-1/2 left-0 right-0 border-t border-border" />
        <span className="relative bg-card px-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold transition hover:bg-muted active:scale-[0.99] disabled:opacity-50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.37 7.56l3.82 2.96C6.12 7.02 8.84 5.04 12 5.04z" />
          <path fill="#4285F4" d="M23.49 12.275c0-.82-.07-1.61-.2-2.375H12v4.51h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.39-4.88 3.39-8.525z" />
          <path fill="#FBBC05" d="M5.19 14.52a6.97 6.97 0 010-4.44l-3.82-2.96a11.94 11.94 0 000 10.36l3.82-2.96z" />
          <path fill="#34A562" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.01.68-2.31 1.09-3.81 1.09-3.16 0-5.88-1.98-6.84-4.96l-3.82 2.96C3.37 20.35 7.35 23 12 23z" />
        </svg>
        Connect with Google
      </button>

      <div className="relative my-4 text-center">
        <div className="absolute inset-y-1/2 left-0 right-0 border-t border-border" />
        <span className="relative bg-card px-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          sandbox fallback
        </span>
      </div>

      <button
        type="button"
        onClick={handleSandboxBypass}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-xs font-extrabold text-secondary-foreground hover:brightness-95 active:scale-[0.99] disabled:opacity-50 transition-all border border-border shadow-xs"
      >
        ⚡ Quick Sandbox Bypass & Login
      </button>

      <p className="mt-6 text-[10px] text-muted-foreground leading-relaxed">
        By connecting, you agree to secure account storage to manage your digital passes and live event admissions.
      </p>
    </div>
  );
}

export function SignIn(props: any) {
  return <AuthForm initialMode="signin" onAuthSuccess={props.onAuthSuccess} />;
}

export function SignUp(props: any) {
  return <AuthForm initialMode="signup" onAuthSuccess={props.onAuthSuccess} />;
}

export function SignInButton({ children, ...props }: any) {
  return (
    <button
      type="button"
      onClick={() => {
        console.log("Sign In clicked");
        if (window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart')) {
          window.sessionStorage.setItem('event-check-in:return-url', window.location.pathname + window.location.search);
        }
        window.location.href = '/sign-in';
      }}
      {...props}
    >
      {children || 'Sign In'}
    </button>
  );
}

export function SignUpButton({ children, ...props }: any) {
  return (
    <button
      type="button"
      onClick={() => {
        console.log("Sign Up clicked");
        if (window.location.pathname.includes('/buy') || window.location.pathname.includes('/cart')) {
          window.sessionStorage.setItem('event-check-in:return-url', window.location.pathname + window.location.search);
        }
        window.location.href = '/sign-up';
      }}
      {...props}
    >
      {children || 'Sign Up'}
    </button>
  );
}
