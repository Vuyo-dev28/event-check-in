import React, { useEffect, useState } from 'react';
import { LogOut, Menu, Moon, ShoppingCart, Sun, User, X } from 'lucide-react';
import { AuthForm, ClerkProvider, useAuthContext } from './lib/clerk-wrapper.tsx';
import CustomerMarketplace from './pages/CustomerMarketplace.tsx';
import { CartAndCheckoutPage, EventDetailPage } from './pages/EventDetailCheckout.tsx';
import {
  CustomerProfilePage,
  MyOrdersPage,
  MyTicketsWalletPage,
  PublicTicketVerifyPage,
} from './pages/CustomerAccountPages.tsx';
import OrganizerDashboard, { type BusinessSection } from './components/organizer/OrganizerDashboard.tsx';
import SuperAdminDashboard, { type AdminSection } from './components/superadmin/SuperAdminDashboard.tsx';

function getCurrentFullUrl() {
  return window.location.pathname + window.location.search;
}

function getCartCountBadge(): number {
  try {
    const raw = window.localStorage.getItem('event-check-in:cart:guest');
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    return Object.values(obj).reduce((s: number, v: any) => s + (Number(v) > 0 ? Number(v) : 0), 0);
  } catch {
    return 0;
  }
}

function resolveBusinessSection(path: string): BusinessSection {
  if (path === '/business/onboarding') return 'onboarding';
  if (path === '/business/events') return 'events';
  if (path === '/business/events/create') return 'events-create';
  if (path === '/business/tickets') return 'tickets';
  if (path === '/business/orders') return 'orders';
  if (path === '/business/attendees') return 'attendees';
  if (path === '/business/scanner' || path === '/check-in') return 'scanner';
  if (path === '/business/staff') return 'staff';
  if (path === '/business/promotions') return 'promotions';
  if (path === '/business/financials') return 'financials';
  if (path === '/business/payouts') return 'payouts';
  if (path === '/business/settings') return 'settings';
  return 'dashboard';
}

function resolveAdminSection(path: string): AdminSection {
  if (path === '/admin/businesses') return 'businesses';
  if (path === '/admin/events') return 'events';
  if (path === '/admin/customers') return 'customers';
  if (path === '/admin/transactions') return 'transactions';
  if (path === '/admin/payouts') return 'payouts';
  if (path === '/admin/refunds') return 'refunds';
  if (path === '/admin/reports') return 'reports';
  if (path === '/admin/settings') return 'settings';
  if (path === '/admin/audit-logs') return 'audit-logs';
  return 'overview';
}

function AppShell() {
  const { user, isSignedIn, meData, signOut } = useAuthContext();
  const [route, setRoute] = useState<string>(getCurrentFullUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('event-check-in:theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [cartCount, setCartCount] = useState<number>(getCartCountBadge);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem('event-check-in:theme', darkMode ? 'dark' : 'light');
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    const onPop = () => {
      setRoute(getCurrentFullUrl());
      setCartCount(getCartCountBadge());
    };
    window.addEventListener('popstate', onPop);
    const interval = setInterval(() => setCartCount(getCartCountBadge()), 1000);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearInterval(interval);
    };
  }, []);

  const navigate = (to: string) => {
    if (to !== route) {
      window.history.pushState({}, '', to);
      setRoute(to);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const pathname = route.split('?')[0] || '/';
  const isBusinessWorkspace =
    pathname.startsWith('/business') || pathname === '/organizer' || pathname === '/check-in';
  const isAdminWorkspace = pathname.startsWith('/admin') || pathname.startsWith('/superadmin');
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(meData?.platformRole || '');
  const hasBusiness = (meData?.businesses?.length || 0) > 0;

  const openSignInPreservingReturn = () => {
    if (!['/login', '/register', '/sign-in', '/sign-up'].includes(pathname)) {
      window.sessionStorage.setItem('event-check-in:return-url', route);
    }
    navigate('/login');
  };

  const navLinks = isAdminWorkspace
    ? [
        { label: 'Marketplace', path: '/discover' },
        { label: 'Overview', path: '/admin' },
        { label: 'Businesses', path: '/admin/businesses' },
        { label: 'Events', path: '/admin/events' },
        { label: 'Audit Logs', path: '/admin/audit-logs' },
      ]
    : isBusinessWorkspace
      ? [
          { label: 'Marketplace', path: '/discover' },
          { label: 'Dashboard', path: '/business/dashboard' },
          { label: 'Events', path: '/business/events' },
          { label: 'Scanner', path: '/business/scanner' },
          { label: 'Orders', path: '/business/orders' },
        ]
      : [
          { label: 'Discover', path: '/discover' },
          { label: 'Events', path: '/events' },
          { label: 'My Tickets', path: '/my-tickets' },
          { label: 'My Orders', path: '/my-orders' },
          { label: 'For Organisers', path: hasBusiness ? '/business/dashboard' : '/business/onboarding' },
        ];

  const renderPage = () => {
    if (pathname === '/' || pathname === '/discover') {
      return <CustomerMarketplace mode="discover" onNavigate={navigate} />;
    }
    if (pathname === '/events') {
      return <CustomerMarketplace mode="events" onNavigate={navigate} />;
    }
    if (pathname.startsWith('/events/id/')) {
      const id = pathname.replace('/events/id/', '').split('/')[0];
      return <EventDetailPage slugOrId={id} onNavigate={navigate} />;
    }
    if (pathname.startsWith('/events/')) {
      const slug = pathname.replace('/events/', '').split('/')[0];
      return <EventDetailPage slugOrId={slug} onNavigate={navigate} />;
    }
    if (pathname === '/cart' || pathname === '/checkout' || pathname === '/buy') {
      return <CartAndCheckoutPage onNavigate={navigate} />;
    }
    if (pathname === '/my-tickets' || pathname === '/tickets') {
      return <MyTicketsWalletPage onNavigate={navigate} />;
    }
    if (pathname === '/my-orders') {
      return <MyOrdersPage onNavigate={navigate} />;
    }
    if (pathname === '/profile') {
      return <CustomerProfilePage onNavigate={navigate} />;
    }
    if (pathname.startsWith('/ticket/verify/')) {
      const token = decodeURIComponent(pathname.replace('/ticket/verify/', ''));
      return <PublicTicketVerifyPage token={token} onNavigate={navigate} />;
    }
    if (pathname === '/login' || pathname === '/sign-in') {
      return (
        <div className="py-10 flex justify-center">
          <AuthForm initialMode="signin" />
        </div>
      );
    }
    if (pathname === '/register' || pathname === '/sign-up') {
      return (
        <div className="py-10 flex justify-center">
          <AuthForm initialMode="signup" />
        </div>
      );
    }
    if (isBusinessWorkspace) {
      return <OrganizerDashboard section={resolveBusinessSection(pathname)} onNavigate={navigate} />;
    }
    if (isAdminWorkspace) {
      return <SuperAdminDashboard section={resolveAdminSection(pathname)} onNavigate={navigate} />;
    }

    return (
      <div className="max-w-md mx-auto my-12 rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <h1 className="text-xl font-extrabold text-foreground">Page Not Found</h1>
        <p className="text-xs text-muted-foreground">The page "{pathname}" does not exist.</p>
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Back to Marketplace
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Strict 3-Zone Editorial Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xs">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Two-Tone Condensed Wordmark */}
          <button
            type="button"
            onClick={() => navigate('/discover')}
            className="font-display text-2xl sm:text-[28px] font-extrabold uppercase tracking-tight text-foreground whitespace-nowrap shrink-0 leading-none"
          >
            <span className="text-primary">H</span>OWLER TICKETS
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {navLinks.map((link) => {
              const active = pathname === link.path || (link.path === '/discover' && pathname === '/');
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => navigate(link.path)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors hover:text-foreground ${
                    active ? 'text-primary' : ''
                  }`}
                >
                  {link.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action + Cart Badge + Mobile Menu Trigger */}
          <div className="flex items-center gap-2.5 shrink-0">
            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/checkout')}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:border-primary/50 whitespace-nowrap shrink-0"
              >
                <ShoppingCart size={14} className="text-primary" />
                <span className="font-mono tabular-nums">{cartCount}</span>
              </button>
            )}

            {isSignedIn ? (
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground hover:opacity-90 whitespace-nowrap shrink-0"
              >
                <User size={14} />
                <span className="max-w-[110px] truncate">{user?.firstName || 'Account'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openSignInPreservingReturn}
                className="rounded-full bg-primary px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-primary-foreground hover:brightness-95 whitespace-nowrap shrink-0 transition-all"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden h-10 w-10 rounded-full border border-border bg-card flex items-center justify-center"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-1.5">
            {navLinks.map((link) => (
              <button
                key={link.path}
                type="button"
                onClick={() => navigate(link.path)}
                className={`block w-full text-left rounded-xl px-3.5 py-2.5 font-display text-lg font-bold uppercase tracking-tight hover:bg-muted ${
                  pathname === link.path || (link.path === '/discover' && pathname === '/')
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground'
                }`}
              >
                {link.label}
              </button>
            ))}
            {isSignedIn && (
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="block w-full text-left rounded-xl px-3.5 py-2.5 font-display text-lg font-bold uppercase tracking-tight text-foreground hover:bg-muted"
              >
                Account Profile
              </button>
            )}
          </div>
        )}
      </header>

      {/* Workspace Context Sub-Bar */}
      {(isSignedIn || isBusinessWorkspace || isAdminWorkspace) && (
        <div className="border-b border-border bg-card/80">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Portal
              </span>
              <button
                type="button"
                onClick={() => navigate('/discover')}
                className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors ${
                  !isBusinessWorkspace && !isAdminWorkspace
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Customer Marketplace
              </button>
              <button
                type="button"
                onClick={() => navigate(hasBusiness ? '/business/dashboard' : '/business/onboarding')}
                className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors ${
                  isBusinessWorkspace
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {hasBusiness ? 'Business Portal' : 'Become an Organiser'}
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors ${
                    isAdminWorkspace
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Super Admin
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                aria-label="Toggle colour theme"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground font-semibold whitespace-nowrap"
              >
                {darkMode ? <Sun size={13} /> : <Moon size={13} />}
                {darkMode ? 'Light' : 'Dark'}
              </button>
              {isSignedIn && (
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive font-semibold whitespace-nowrap"
                >
                  <LogOut size={13} />
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-[1280px] px-4 sm:px-6 pt-6 sm:pt-8">
        {renderPage()}
      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-border bg-card/70 mt-auto">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-lg font-extrabold uppercase tracking-tight text-foreground">
              <span className="text-primary">H</span>OWLER TICKETS
            </span>
            <span aria-hidden="true">·</span>
            <span>South African Live Event Ticketing & Marketplace</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium">
            <button type="button" onClick={() => navigate('/discover')} className="hover:text-foreground">
              Discover
            </button>
            <button type="button" onClick={() => navigate('/events')} className="hover:text-foreground">
              Explore Events
            </button>
            <button type="button" onClick={() => navigate('/my-tickets')} className="hover:text-foreground">
              My Tickets
            </button>
            <button type="button" onClick={() => navigate('/business/onboarding')} className="hover:text-foreground">
              Host Events
            </button>
            <button type="button" onClick={() => setDarkMode((d) => !d)} className="hover:text-foreground">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ClerkProvider>
      <AppShell />
    </ClerkProvider>
  );
}