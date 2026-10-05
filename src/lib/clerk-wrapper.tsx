import React, { createContext, useContext, useState, useEffect } from 'react';
import * as RealClerk from '@clerk/react';

// We evaluate whether VITE_CLERK_PUBLISHABLE_KEY is present
const hasKey = typeof window !== 'undefined' && 
  (window as any).location?.hostname && 
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim() !== '';

export const isClerkMocked = !hasKey;

// --- MOCK DEFINITIONS ---
interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  primaryEmailAddress?: {
    emailAddress: string;
  };
}

interface MockClerkContextType {
  isSignedIn: boolean;
  setSignedIn: (val: boolean) => void;
  user: MockUser | null;
  setUser: (user: MockUser | null) => void;
}

const MockClerkContext = createContext<MockClerkContextType>({
  isSignedIn: true,
  setSignedIn: () => {},
  user: null,
  setUser: () => {},
});

const DEFAULT_MOCK_USER: MockUser = {
  id: 'user_2N6x2B5p9a8K7b4C1d9E',
  firstName: 'Jordan',
  lastName: 'Scott',
  fullName: 'Jordan Scott',
  primaryEmailAddress: {
    emailAddress: 'jordan.scott@northstarsummit.com',
  },
};

export function ClerkProvider({ children, ...props }: any) {
  if (!isClerkMocked) {
    return <RealClerk.ClerkProvider {...props}>{children}</RealClerk.ClerkProvider>;
  }

  // Set default auth status to true for instant showcase / playground access!
  const [isSignedIn, setSignedIn] = useState(() => {
    const stored = localStorage.getItem('event-check-in:mock-auth');
    return stored === null ? true : stored === 'true';
  });

  const [user, setUser] = useState<MockUser | null>(() => {
    return isSignedIn ? DEFAULT_MOCK_USER : null;
  });

  useEffect(() => {
    localStorage.setItem('event-check-in:mock-auth', String(isSignedIn));
    if (isSignedIn) {
      setUser(DEFAULT_MOCK_USER);
    } else {
      setUser(null);
    }
  }, [isSignedIn]);

  return (
    <MockClerkContext.Provider value={{ isSignedIn, setSignedIn, user, setUser }}>
      {children}
    </MockClerkContext.Provider>
  );
}

export function useUser() {
  if (!isClerkMocked) {
    return RealClerk.useUser();
  }
  const { isSignedIn, user } = useContext(MockClerkContext);
  return {
    isLoaded: true,
    isSignedIn,
    user,
  };
}

export function useClerk() {
  if (!isClerkMocked) {
    return RealClerk.useClerk();
  }
  const { setSignedIn } = useContext(MockClerkContext);
  return {
    signOut: async (options?: { redirectUrl?: string }) => {
      setSignedIn(false);
      if (options?.redirectUrl) {
        window.location.href = options.redirectUrl;
      }
    },
    addListener: (cb: any) => {
      // No-op for mock
      return () => {};
    },
  };
}

export function SignIn({ signUpUrl, ...props }: any) {
  if (!isClerkMocked) {
    return <RealClerk.SignIn signUpUrl={signUpUrl} {...props} />;
  }

  const { setSignedIn } = useContext(MockClerkContext);
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setSignedIn(true);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight">Welcome back</h2>
        <p className="mt-1.5 text-xs text-muted-foreground">Sign in to access your event workspace</p>
      </div>
      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Email address</label>
          <input
            type="email"
            defaultValue="jordan.scott@northstarsummit.com"
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Password</label>
          <input
            type="password"
            defaultValue="password123"
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-primary outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition hover:brightness-95 active:scale-[0.99]"
        >
          Sign In (Demo Mode)
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-muted-foreground">
        Don't have an account?{' '}
        <a href={signUpUrl || '#'} className="font-bold text-foreground hover:underline">
          Create account
        </a>
      </div>
    </div>
  );
}

export function SignUp({ signInUrl, ...props }: any) {
  if (!isClerkMocked) {
    return <RealClerk.SignUp signInUrl={signInUrl} {...props} />;
  }

  const { setSignedIn } = useContext(MockClerkContext);
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setSignedIn(true);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight">Create your account</h2>
        <p className="mt-1.5 text-xs text-muted-foreground">Choose your Event Check-In workspace next</p>
      </div>
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Full Name</label>
          <input
            type="text"
            placeholder="Jordan Scott"
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Email address</label>
          <input
            type="email"
            placeholder="jordan.scott@northstarsummit.com"
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Password</label>
          <input
            type="password"
            placeholder="Choose a password"
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-primary outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition hover:brightness-95 active:scale-[0.99]"
        >
          Create Account (Demo Mode)
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <a href={signInUrl || '#'} className="font-bold text-foreground hover:underline">
          Sign in
        </a>
      </div>
    </div>
  );
}
