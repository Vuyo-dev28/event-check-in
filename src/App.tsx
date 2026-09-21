import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudOff,
  CreditCard,
  ExternalLink,
  FileClock,
  Flag,
  History,
  Info,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Minus,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Ticket,
  UserRound,
  Users,
  Vibrate,
  Volume2,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import {
  Link,
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

type AccountRole = 'attendee' | 'organizer';

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#c2ef50',
    colorForeground: '#18213c',
    colorMutedForeground: '#6c7284',
    colorDanger: '#d75c54',
    colorBackground: '#fbfaf6',
    colorInput: '#ffffff',
    colorInputForeground: '#18213c',
    colorNeutral: '#d9d8d2',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#18213c] font-extrabold tracking-[-.04em]',
    headerSubtitle: 'text-[#6c7284]',
    socialButtonsBlockButtonText: 'text-[#18213c] font-bold',
    formFieldLabel: 'text-[#18213c] font-bold',
    footerActionLink: 'text-[#18213c] font-bold',
    footerActionText: 'text-[#6c7284]',
    dividerText: 'text-[#6c7284]',
    identityPreviewEditButton: 'text-[#18213c]',
    formFieldSuccessText: 'text-[#3f7f56]',
    alertText: 'text-[#8c3d39]',
    logoBox: 'mb-5',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#d9d8d2] bg-white hover:bg-[#f0f0ea]',
    formButtonPrimary: 'bg-[#c2ef50] text-[#18213c] font-extrabold hover:bg-[#b3df47]',
    formFieldInput: 'border-[#d9d8d2] bg-white text-[#18213c]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#d9d8d2]',
    alert: 'border-[#efc2bf] bg-[#fcecea]',
    otpCodeFieldInput: 'border-[#d9d8d2] bg-white',
    formFieldRow: 'mb-4',
    main: 'px-1',
  },
};

type ScanStatus =
  | 'VALID'
  | 'CHECKED_IN'
  | 'INVALID'
  | 'WRONG_EVENT'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'TRANSFERRED';

type Ticket = {
  token: string;
  ticketNumber: string;
  attendeeName: string;
  type: string;
  eventName: string;
  status: ScanStatus;
  checkedInAt?: string;
  checkedInBy?: string;
};

type ScanResult = { status: ScanStatus; ticket: Ticket };

type CheckInRecord = {
  time: string;
  attendee: string;
  ticket: string;
  ticketType: string;
  entrance: string;
  staff: string;
  scanner: string;
  status: ScanStatus;
};

type EventInfo = {
  id: string;
  name: string;
  date: string;
  venue: string;
  sold: number;
  checkedIn: number;
  remaining: number;
  rate: number;
  activeScanners: number;
  activeEntrances: number;
};

const liveEvent: EventInfo = {
  id: 'evt-summit-24',
  name: 'Northstar Product Summit',
  date: 'Today · 18 June 2024',
  venue: 'Pier 48, San Francisco',
  sold: 1842,
  checkedIn: 1268,
  remaining: 574,
  rate: 42,
  activeScanners: 6,
  activeEntrances: 3,
};

const names = ['Maya Chen', 'Jon Bell', 'Tomas Alvarez', 'Priya Nair', 'Leah Okafor'];
const seedRecords: CheckInRecord[] = [
  { time: '14:32:08', attendee: 'Maya Chen', ticket: 'NS-04821', ticketType: 'General', entrance: 'North / A', staff: 'You', scanner: 'iPad Pro · 03', status: 'VALID' },
  { time: '14:31:54', attendee: 'Jon Bell', ticket: 'NS-11072', ticketType: 'VIP', entrance: 'North / A', staff: 'A. Rivera', scanner: 'iPhone 14 · 02', status: 'VALID' },
  { time: '14:31:41', attendee: 'Tomas Alvarez', ticket: 'NS-09210', ticketType: 'General', entrance: 'North / B', staff: 'K. Okafor', scanner: 'iPad mini · 01', status: 'CHECKED_IN' },
  { time: '14:31:22', attendee: 'Priya Nair', ticket: 'NS-17704', ticketType: 'Speaker', entrance: 'VIP', staff: 'You', scanner: 'iPad Pro · 03', status: 'VALID' },
  { time: '14:30:59', attendee: 'Leah Okafor', ticket: 'NS-00418', ticketType: 'General', entrance: 'North / A', staff: 'M. Scott', scanner: 'iPhone 13 · 04', status: 'INVALID' },
  { time: '14:30:43', attendee: 'Sofia Martins', ticket: 'NS-08820', ticketType: 'General', entrance: 'North / C', staff: 'A. Rivera', scanner: 'iPhone 14 · 02', status: 'CHECKED_IN' },
];

const demoTickets: Record<ScanStatus, Ticket> = {
  VALID: { token: 'demo-valid', ticketNumber: 'NS-04821', attendeeName: 'Maya Chen', type: 'General admission', eventName: liveEvent.name, status: 'VALID' },
  CHECKED_IN: { token: 'demo-checked', ticketNumber: 'NS-09210', attendeeName: 'Tomas Alvarez', type: 'General admission', eventName: liveEvent.name, status: 'CHECKED_IN', checkedInAt: '13:48 today', checkedInBy: 'K. Okafor' },
  INVALID: { token: 'demo-invalid', ticketNumber: 'NS-00000', attendeeName: 'Ticket not found', type: '—', eventName: 'Unknown', status: 'INVALID' },
  WRONG_EVENT: { token: 'demo-wrong', ticketNumber: 'CITY-11380', attendeeName: 'Aiden Brooks', type: 'General admission', eventName: 'City Futures Forum · 20 Jun', status: 'WRONG_EVENT' },
  REFUNDED: { token: 'demo-refunded', ticketNumber: 'NS-12011', attendeeName: 'Nico Silva', type: 'General admission', eventName: liveEvent.name, status: 'REFUNDED' },
  CANCELLED: { token: 'demo-cancelled', ticketNumber: 'NS-13082', attendeeName: 'Ari Kim', type: 'General admission', eventName: liveEvent.name, status: 'CANCELLED' },
  EXPIRED: { token: 'demo-expired', ticketNumber: 'NS-03140', attendeeName: 'Rowan Bell', type: 'General admission', eventName: liveEvent.name, status: 'EXPIRED' },
  TRANSFERRED: { token: 'demo-transferred', ticketNumber: 'NS-15504', attendeeName: 'Jamie Wu', type: 'General admission', eventName: liveEvent.name, status: 'TRANSFERRED' },
};

const statusMeta: Record<ScanStatus, { label: string; title: string; detail: string; tone: string }> = {
  VALID: { label: 'Ready to admit', title: 'Ticket valid', detail: 'This pass is valid for Northstar Product Summit.', tone: 'valid' },
  CHECKED_IN: { label: 'Already used', title: 'Already checked in', detail: 'This ticket was admitted earlier. Do not admit again without a lead review.', tone: 'warning' },
  INVALID: { label: 'No match found', title: 'Ticket not found', detail: 'No ticket matches this code. Ask the guest to reopen the original confirmation.', tone: 'danger' },
  WRONG_EVENT: { label: 'Different event', title: 'Wrong event', detail: 'This ticket belongs to another event. Keep the guest outside and confirm their booking.', tone: 'warning' },
  REFUNDED: { label: 'Payment reversed', title: 'Ticket refunded', detail: 'This ticket was refunded and cannot be admitted.', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', title: 'Ticket cancelled', detail: 'This ticket is no longer active. Ask a lead before making an exception.', tone: 'danger' },
  EXPIRED: { label: 'Expired', title: 'Ticket expired', detail: 'The validity window for this ticket has closed.', tone: 'warning' },
  TRANSFERRED: { label: 'New owner required', title: 'Ticket transferred', detail: 'This ticket has changed owner. Ask the guest to refresh their pass.', tone: 'warning' },
};

type TicketTier = {
  id: string;
  name: string;
  description: string;
  price: number;
  remaining: number;
  accent: 'lime' | 'coral' | 'blue';
};

const ticketTiers: TicketTier[] = [
  { id: 'general', name: 'General admission', description: 'Full summit access, talks, and community floor.', price: 89, remaining: 574, accent: 'lime' },
  { id: 'vip', name: 'VIP pass', description: 'Priority seating, speaker lounge, and fast entry.', price: 249, remaining: 42, accent: 'coral' },
  { id: 'speaker', name: 'Speaker circle', description: 'Curated roundtables and private dinner access.', price: 399, remaining: 12, accent: 'blue' },
];

type DiscoverableEvent = {
  id: string;
  name: string;
  date: string;
  venue: string;
  city: string;
  category: string;
  description: string;
  price: number;
  accent: 'lime' | 'coral' | 'blue';
  status: 'Live' | 'Coming soon';
};

const discoverableEvents: DiscoverableEvent[] = [
  { id: 'northstar-product-summit-2024', name: 'Northstar Product Summit', date: '18 June 2024', venue: 'Pier 48', city: 'San Francisco', category: 'Product · Community', description: 'A sharp, practical day for people building what comes next.', price: 89, accent: 'lime', status: 'Live' },
  { id: 'designing-tomorrow-2024', name: 'Designing Tomorrow', date: '26 July 2024', venue: 'The Foundry', city: 'London', category: 'Design · Culture', description: 'A two-day gathering for the people shaping better experiences.', price: 120, accent: 'coral', status: 'Coming soon' },
  { id: 'makers-after-dark-2024', name: 'Makers After Dark', date: '09 August 2024', venue: 'The Silo', city: 'Cape Town', category: 'Technology · Nightlife', description: 'An intimate evening of demos, stories, and unexpected collisions.', price: 45, accent: 'blue', status: 'Coming soon' },
];

const defaultCart = { general: 1, vip: 0, speaker: 0 };

function cartStorageKey(userId?: string) {
  return `event-check-in:cart:${userId ?? 'guest'}`;
}

function readCart(userId?: string): Record<string, number> {
  if (typeof window === 'undefined') return defaultCart;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cartStorageKey(userId)) ?? 'null') as Record<string, number> | null;
    if (!parsed || typeof parsed !== 'object') return { ...defaultCart };
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Number.isInteger(value) ? Math.max(0, Math.min(8, value)) : 0]));
  } catch {
    return { ...defaultCart };
  }
}

type IssuedTicket = {
  ticketNumber: string;
  ticketType: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  venue: string;
  qrDataUrl: string;
};

type IssuedOrder = {
  orderNumber: string;
  emailStatus: 'sent' | 'failed';
  totalCents: number;
  event: { name: string; date: string; venue: string };
  tickets: IssuedTicket[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function AppShell({ children, checkedIn, role }: { children: ReactNode; checkedIn: number; role: AccountRole }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();
  const nav = role === 'organizer'
    ? [
        { href: '/', label: 'Overview', icon: LayoutDashboard },
        { href: '/check-in', label: 'Check-in', icon: Radio },
        { href: '/history', label: 'History', icon: History },
        { href: '/settings', label: 'Settings', icon: SettingsIcon },
      ]
    : [
        { href: '/events', label: 'Events', icon: Sparkles },
        { href: '/cart', label: 'Cart', icon: ShoppingBag },
      ];
  const isScanner = location === '/check-in' || location === '/dashboard/check-in';

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground md:flex">
      <aside className="hidden w-[242px] shrink-0 flex-col bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
        <div className="mb-10 flex items-center gap-3 px-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
            <Ticket size={19} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[15px] font-extrabold tracking-[-.03em]">Event Check-In</div>
            <div className="font-mono text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/50">Operations desk</div>
          </div>
        </div>
        <div className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">Event day</div>
        <button data-testid="button-event-selector" className="mb-7 flex w-full items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent px-3 py-3 text-left transition hover:bg-sidebar-accent/80">
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold">{liveEvent.name}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/55"><MapPin size={11} /> Pier 48 · Live now</span>
          </span>
          <ChevronDown size={14} className="shrink-0 text-sidebar-foreground/50" />
        </button>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                {label}
                {label === 'Check-in' && <span className={`ml-auto h-2 w-2 rounded-full ${active ? 'bg-sidebar-primary-foreground' : 'bg-primary'}`} />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-5 rounded-2xl border border-sidebar-border bg-sidebar-accent/65 p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/50">Live pulse</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary soft-pulse" /> Synced</span>
            </div>
            <div className="text-2xl font-extrabold tracking-[-.06em]">{formatNumber(checkedIn)}</div>
            <div className="mt-1 text-[10px] text-sidebar-foreground/50">people inside · {liveEvent.activeScanners} scanners online</div>
          </div>
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">{(user?.firstName?.[0] ?? 'E')}{(user?.lastName?.[0] ?? 'C')}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Event user'}</div><div className="text-[10px] text-sidebar-foreground/45">{role === 'organizer' ? 'Event organizer' : 'Attendee'}</div></div>
             <button type="button" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg p-1 text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <button data-testid="button-open-menu" onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 hover:bg-muted md:hidden"><Menu size={20} /></button>
            <div className="md:hidden">
              <div className="text-[14px] font-extrabold tracking-[-.03em]">Event Check-In</div>
              <div className="font-mono text-[8px] uppercase tracking-[.16em] text-muted-foreground">Northstar · live</div>
            </div>
            <div className="hidden items-center gap-2 md:flex"><span className="h-2 w-2 rounded-full bg-primary soft-pulse" /><span className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Live event operations</span></div>
          </div>
          <div className="flex items-center gap-2.5">
             {role === 'attendee' && <Link href="/events" data-testid="link-browse-events" className="hidden items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[10px] font-extrabold text-primary-foreground transition hover:brightness-95 sm:flex"><Sparkles size={12} /> Browse events</Link>}
            <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold text-muted-foreground sm:flex"><Wifi size={12} className="text-primary" /> Offline-ready</div>
            <button data-testid="button-notifications" onClick={() => setNotificationsOpen(!notificationsOpen)} className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /></button>
             <button type="button" data-testid="button-header-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="hidden h-8 w-8 items-center justify-center rounded-full bg-secondary text-[10px] font-extrabold text-secondary-foreground sm:flex" aria-label="Sign out"><LogOut size={14} /></button>
          </div>
        </header>
        {notificationsOpen && <div className="absolute right-4 top-[58px] z-50 w-[260px] rounded-2xl border border-border bg-card p-4 shadow-xl"><div className="flex items-center justify-between"><span className="text-xs font-extrabold">Ops notices</span><button data-testid="button-close-notifications" onClick={() => setNotificationsOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X size={14} /></button></div><div className="mt-3 flex gap-2 rounded-xl bg-primary/15 p-3"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><p className="text-[10px] leading-relaxed">All scanners are synced. No action needed.</p></div></div>}
         {menuOpen && <div className="absolute left-3 right-3 top-[60px] z-50 rounded-2xl border border-border bg-card p-2 shadow-xl md:hidden">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} data-testid={`link-mobile-${label.toLowerCase()}`} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold hover:bg-muted"><Icon size={17} />{label}</Link>)}<button type="button" data-testid="button-mobile-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-destructive hover:bg-destructive/10"><LogOut size={17} />Sign out</button></div>}
        <main className={isScanner ? '' : 'mx-auto max-w-[1380px] px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-9'}>{children}</main>
      </div>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-card/95 px-3 pt-2 backdrop-blur-lg md:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? location === '/' : location.startsWith(href);
          return <Link key={href} href={href} data-testid={`link-bottom-${label.toLowerCase()}`} className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[9px] font-bold ${active ? 'text-foreground' : 'text-muted-foreground'}`}><span className={`rounded-xl px-4 py-1 ${active ? 'bg-primary text-primary-foreground' : ''}`}><Icon size={17} /></span>{label}</Link>;
        })}
      </nav>
    </div>
  );
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{eyebrow}</div><h1 className="text-[clamp(1.8rem,4vw,2.7rem)] font-extrabold leading-[1.04] tracking-[-.065em]">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>{action}</div>;
}

function Overview({ checkedIn }: { checkedIn: number }) {
  const [range, setRange] = useState('Today');
  const [refreshed, setRefreshed] = useState(false);
  const [eventNotice, setEventNotice] = useState(false);
  const percent = Math.round((checkedIn / liveEvent.sold) * 100);
  const barHeights = [22, 31, 28, 43, 52, 67, 59, 78, 62, 82, 74, 92];
  return <div className="drift-in">
    <PageHeading eyebrow="Event day · Tuesday 18 June" title="Good afternoon, Jordan." detail="Here’s the room at a glance. Keep the line moving." action={<button data-testid="button-refresh-overview" onClick={() => { setRefreshed(true); window.setTimeout(() => setRefreshed(false), 1600); }} className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted sm:self-auto"><RefreshCw size={14} className={refreshed ? 'animate-spin' : ''} /> {refreshed ? 'Updated just now' : 'Refresh data'}</button>} />
    <div className="relative mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Sparkles size={18} /></div>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold">{liveEvent.name}</div><div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span>{liveEvent.venue}</span><span className="h-1 w-1 rounded-full bg-border" /><span>{liveEvent.date}</span></div></div>
      <span className="flex items-center gap-1.5 rounded-full bg-primary/25 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live</span>
      <button data-testid="button-change-event" onClick={() => setEventNotice(!eventNotice)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><ChevronDown size={15} /></button>
      {eventNotice && <div className="absolute right-4 top-16 z-20 rounded-xl border border-border bg-card p-3 text-[10px] font-bold shadow-lg">Only one live event is available in this demo.</div>}
    </div>
    <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-secondary p-5 text-secondary-foreground shadow-sm sm:p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[22px] border-primary/10" /><div className="absolute -bottom-20 right-16 h-48 w-48 rounded-full border-[25px] border-primary/5" />
        <div className="relative flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-secondary-foreground/55">Checked in</div><div data-testid="text-checked-in-total" className="mt-3 text-[clamp(3.5rem,7vw,5.8rem)] font-extrabold leading-none tracking-[-.09em]">{formatNumber(checkedIn)}</div><div className="mt-3 flex items-center gap-2 text-xs text-secondary-foreground/65"><span className="flex items-center gap-1 text-primary"><ArrowRight size={13} /> 42 / min</span><span>last 15 minutes</span></div></div><div className="rounded-xl border border-secondary-foreground/15 bg-secondary-foreground/5 px-2.5 py-2 text-right"><div className="font-mono text-[10px] text-secondary-foreground/50">OF {formatNumber(liveEvent.sold)}</div><div className="mt-1 text-xl font-extrabold text-primary">{percent}%</div></div></div>
        <div className="relative mt-8 h-2 overflow-hidden rounded-full bg-secondary-foreground/15"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${percent}%` }} /></div><div className="relative mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-secondary-foreground/45"><span>Doors open 12:00</span><span>{formatNumber(liveEvent.remaining)} expected</span></div>
      </div>
      <StatCard icon={<Users size={18} />} label="Expected guests" value={formatNumber(liveEvent.sold)} helper="All ticket types" accent="lime" />
      <StatCard icon={<Radio size={18} />} label="Scanners online" value={`${liveEvent.activeScanners} / 6`} helper={`${liveEvent.activeEntrances} entrances active`} accent="coral" />
    </section>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex items-center justify-between"><div><h2 className="text-base font-extrabold tracking-[-.03em]">Entrance flow</h2><p className="mt-1 text-xs text-muted-foreground">Admissions by 15-minute window</p></div><div className="flex rounded-lg bg-muted p-1">{['Today', 'Doors'].map(item => <button key={item} data-testid={`button-range-${item.toLowerCase()}`} onClick={() => setRange(item)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${range === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{item}</button>)}</div></div>
        <div className="flex h-[180px] items-end gap-2 border-b border-border/70 pb-0 sm:gap-3">{barHeights.map((height, index) => <div key={index} className="group relative flex h-full flex-1 items-end"><div className={`w-full rounded-t-[5px] transition-all duration-500 group-hover:opacity-70 ${index === barHeights.length - 1 ? 'bg-accent' : index > 7 ? 'bg-primary' : 'bg-primary/40'}`} style={{ height: `${height}%` }} /><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[8px] text-muted-foreground">{index % 3 === 0 ? `${12 + index}:00` : ''}</span></div>)}</div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start justify-between"><div><h2 className="text-base font-extrabold tracking-[-.03em]">Entrances</h2><p className="mt-1 text-xs text-muted-foreground">Live scanner coverage</p></div><Link href="/check-in" data-testid="link-open-scanner" className="text-[11px] font-bold text-muted-foreground hover:text-foreground">Open scanner <ArrowRight size={12} className="ml-1 inline" /></Link></div>
        <div className="space-y-4">{[['North / A', '3 scanners', '84%', 'bg-primary'], ['North / B', '2 scanners', '68%', 'bg-accent'], ['VIP entrance', '1 scanner', '42%', 'bg-chart-3']].map(([name, scanners, coverage, color]) => <div key={name}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold">{name}</span><span className="font-mono text-[10px] text-muted-foreground">{scanners}</span></div><div className="h-2 rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: coverage }} /></div><div className="mt-1 text-right font-mono text-[9px] text-muted-foreground">{coverage} pace</div></div>)}</div>
      </div>
    </section>
    <section className="mt-4 grid gap-4 md:grid-cols-3">
      <MiniInsight icon={<CheckCircle2 />} title="96.8% clean scans" detail="Across 1,312 attempts" />
      <MiniInsight icon={<Clock3 />} title="14 sec average" detail="Scan to confirmation" />
      <MiniInsight icon={<ShieldCheck />} title="No sync issues" detail="All devices up to date" />
    </section>
  </div>;
}

function StatCard({ icon, label, value, helper, accent }: { icon: ReactNode; label: string; value: string; helper: string; accent: 'lime' | 'coral' }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className={`mb-7 flex h-9 w-9 items-center justify-center rounded-xl ${accent === 'lime' ? 'bg-primary/25 text-foreground' : 'bg-accent/20 text-accent-foreground'}`}>{icon}</div><div className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</div><div className="mt-1 text-3xl font-extrabold tracking-[-.07em]">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div>;
}

function MiniInsight({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span><div><div className="text-xs font-extrabold">{title}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div></div></div>;
}

function Scanner({ onCheckIn, checkedIn }: { onCheckIn: (ticket: Ticket) => void; checkedIn: number }) {
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [autoCheckIn, setAutoCheckIn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [vibrationOn, setVibrationOn] = useState(true);
  const [showDemos, setShowDemos] = useState(false);
  const [lastScan, setLastScan] = useState('No scans yet');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!scanning || result) return;
    const timer = window.setTimeout(() => {
      if (autoCheckIn) {
        onCheckIn(demoTickets.VALID);
        setResult({ status: 'CHECKED_IN', ticket: { ...demoTickets.VALID, status: 'CHECKED_IN', checkedInAt: 'Just now', checkedInBy: 'You' } });
        setLastScan('Just now · auto-admitted');
        window.setTimeout(() => { setResult(null); setScanning(true); }, 1500);
      } else {
        setResult({ status: 'VALID', ticket: demoTickets.VALID });
        setLastScan('Just now · automatic detection');
      }
      setFlash(true);
      window.setTimeout(() => setFlash(false), 500);
    }, 11000);
    return () => window.clearTimeout(timer);
  }, [autoCheckIn, onCheckIn, scanning, result]);

  const chooseDemo = (status: ScanStatus) => {
    const ticket = demoTickets[status];
    if (status === 'VALID' && autoCheckIn) {
      onCheckIn(ticket);
      setResult({ status: 'CHECKED_IN', ticket: { ...ticket, status: 'CHECKED_IN', checkedInAt: 'Just now', checkedInBy: 'You' } });
      setLastScan('Just now · auto-admitted');
      setFlash(true);
      window.setTimeout(() => { setFlash(false); setResult(null); setScanning(true); }, 1500);
      return;
    }
    setResult({ status, ticket });
    setLastScan('Just now · demo ticket');
    setScanning(false);
  };

  const confirm = () => {
    if (!result || result.status !== 'VALID') return;
    onCheckIn(result.ticket);
    setResult({ status: 'CHECKED_IN', ticket: { ...result.ticket, status: 'CHECKED_IN', checkedInAt: 'Just now', checkedInBy: 'You' } });
    setLastScan('Just now · admitted by you');
    setFlash(true);
    window.setTimeout(() => { setFlash(false); setResult(null); setScanning(true); }, 1500);
  };

  const doManualSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualSearch.trim()) return;
    const normalized = manualSearch.toLowerCase();
    chooseDemo(normalized.includes('checked') || normalized.includes('09210') ? 'CHECKED_IN' : normalized.includes('wrong') ? 'WRONG_EVENT' : normalized.includes('refund') ? 'REFUNDED' : 'VALID');
  };

  return <div className="min-h-[calc(100dvh-68px)] bg-secondary/20 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-7">
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5 flex items-center justify-between"><div><div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />North / A · Scanner 03</div><h1 className="text-2xl font-extrabold tracking-[-.06em] sm:text-3xl">Ready at the door.</h1></div><div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[10px] font-bold shadow-sm"><span className="h-2 w-2 rounded-full bg-primary soft-pulse" />{formatNumber(checkedIn)} inside</div></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <div>
          <div className={`relative min-h-[400px] overflow-hidden rounded-[26px] bg-secondary shadow-xl transition ${flash ? 'ring-4 ring-primary/70' : ''}`}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, transparent 49%, rgba(221,238,161,.35) 50%, transparent 51%), linear-gradient(transparent 49%, rgba(221,238,161,.2) 50%, transparent 51%)', backgroundSize: '88px 88px' }} />
            <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-secondary-foreground/10 bg-secondary-foreground/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.14em] text-secondary-foreground/70"><span className="h-1.5 w-1.5 rounded-full bg-primary soft-pulse" />Camera active</div>
            <div className="absolute right-5 top-5 rounded-full border border-secondary-foreground/10 bg-secondary-foreground/10 px-3 py-1.5 font-mono text-[9px] text-secondary-foreground/60">AUTO-DETECT</div>
            <div className="absolute inset-10 flex items-center justify-center sm:inset-16"><div className={`relative aspect-square w-full max-w-[280px] rounded-[28px] border border-primary/65 ${scanning && !result ? 'soft-pulse' : ''}`}><span className="absolute -left-1 -top-1 h-11 w-11 rounded-tl-[27px] border-l-4 border-t-4 border-primary" /><span className="absolute -right-1 -top-1 h-11 w-11 rounded-tr-[27px] border-r-4 border-t-4 border-primary" /><span className="absolute -bottom-1 -left-1 h-11 w-11 rounded-bl-[27px] border-b-4 border-l-4 border-primary" /><span className="absolute -bottom-1 -right-1 h-11 w-11 rounded-br-[27px] border-b-4 border-r-4 border-primary" />{scanning && !result && <div className="scan-sweep absolute left-2 right-2 top-1 h-0.5 bg-primary shadow-[0_0_18px_rgba(221,238,161,.8)]" />}{result && <div className="pop-in absolute inset-0 flex items-center justify-center"><div className={`flex h-16 w-16 items-center justify-center rounded-full ${result.status === 'VALID' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>{result.status === 'VALID' ? <Check size={30} strokeWidth={3} /> : <AlertTriangle size={27} />}</div></div>}</div></div>
            <div className="absolute bottom-5 left-0 right-0 text-center text-xs text-secondary-foreground/60">{result ? 'Scan captured' : scanning ? 'Point camera at a ticket QR code' : 'Scanner paused'}</div>
          </div>
          <div className="mt-3 flex items-center justify-between"><button data-testid="button-toggle-scanning" onClick={() => { setScanning(!scanning); if (!scanning) setResult(null); }} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${scanning ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground shadow-sm ring-1 ring-border'}`}>{scanning ? <><span className="h-2 w-2 rounded-full bg-current soft-pulse" />Continuous scanning on</> : <><Radio size={14} />Resume scanning</>}</button><span className="font-mono text-[10px] text-muted-foreground">{lastScan}</span></div>
        </div>
        <div className="space-y-4">
          {result ? <ScanResultCard result={result} onConfirm={confirm} onDismiss={() => { setResult(null); setScanning(true); }} /> : <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Manual fallback</div><h2 className="mt-1 text-base font-extrabold">Find a ticket</h2></div><Search size={18} className="text-muted-foreground" /></div><form onSubmit={doManualSearch} className="flex gap-2"><input data-testid="input-ticket-search" value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Ticket number or guest name" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3.5 py-3 text-xs outline-none transition placeholder:text-muted-foreground/70 focus:border-primary" /><button data-testid="button-search-ticket" type="submit" className="rounded-xl bg-secondary px-4 text-secondary-foreground transition hover:bg-secondary/85"><ArrowRight size={16} /></button></form><div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground"><LockKeyhole size={12} /> Search is restricted to this event</div></div>}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Scanner behavior</div><h2 className="mt-1 text-base font-extrabold">Fast lane controls</h2></div><SettingsIcon size={17} className="text-muted-foreground" /></div><ToggleRow icon={<Sparkles size={15} />} label="Auto-check-in valid tickets" detail="Admit on a valid scan" on={autoCheckIn} onToggle={() => setAutoCheckIn(!autoCheckIn)} /><ToggleRow icon={<Volume2 size={15} />} label="Sound on confirmation" detail="Audio feedback for every result" on={soundOn} onToggle={() => setSoundOn(!soundOn)} /><ToggleRow icon={<Vibrate size={15} />} label="Vibration" detail="Tactile feedback on this device" on={vibrationOn} onToggle={() => setVibrationOn(!vibrationOn)} /></div>
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4"><button data-testid="button-toggle-demo-controls" onClick={() => setShowDemos(!showDemos)} className="flex w-full items-center justify-between text-left text-xs font-bold"><span className="flex items-center gap-2"><CircleHelp size={14} className="text-muted-foreground" />Reviewer demo controls</span><ChevronDown size={14} className={`text-muted-foreground transition ${showDemos ? 'rotate-180' : ''}`} /></button>{showDemos && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">{(Object.keys(statusMeta) as ScanStatus[]).map(status => <button key={status} data-testid={`button-demo-${status.toLowerCase()}`} onClick={() => chooseDemo(status)} className="rounded-lg border border-border bg-card px-2 py-2 text-[10px] font-bold transition hover:border-primary hover:bg-primary/10">{statusMeta[status].label}</button>)}</div>}</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground shadow-sm"><span className="flex items-center gap-2"><CloudOff size={14} className="text-primary" /> Offline queue is empty · scans sync instantly when connected</span><span className="flex items-center gap-2"><Users size={14} /> 6 scanners active across 3 entrances</span></div>
    </div>
  </div>;
}

function ToggleRow({ icon, label, detail, on, onToggle }: { icon: ReactNode; label: string; detail: string; on: boolean; onToggle: () => void }) {
  const [enabled, setEnabled] = useState(on);
  return <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div><div className="min-w-0 flex-1"><div className="text-xs font-bold">{label}</div><div className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</div></div><button data-testid={`button-toggle-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => { setEnabled(!enabled); onToggle(); }} className={`relative h-6 w-10 rounded-full transition ${enabled ? 'bg-primary' : 'bg-muted-foreground/25'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} /></button></div>;
}

function ScanResultCard({ result, onConfirm, onDismiss }: { result: ScanResult; onConfirm: () => void; onDismiss: () => void }) {
  const meta = statusMeta[result.status];
  const isValid = result.status === 'VALID';
  const isChecked = result.status === 'CHECKED_IN';
  return <div className={`pop-in overflow-hidden rounded-2xl border bg-card shadow-lg ${meta.tone === 'valid' ? 'border-primary/70' : meta.tone === 'danger' ? 'border-destructive/45' : 'border-accent/60'}`}><div className={`flex items-center justify-between px-5 py-4 ${meta.tone === 'valid' ? 'bg-primary/20' : meta.tone === 'danger' ? 'bg-destructive/10' : 'bg-accent/15'}`}><span className="flex items-center gap-2 text-xs font-extrabold"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${meta.tone === 'valid' ? 'bg-primary text-primary-foreground' : meta.tone === 'danger' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground'}`}>{isValid ? <Check size={15} strokeWidth={3} /> : isChecked ? <History size={14} /> : <AlertTriangle size={14} />}</span>{meta.label}</span><button data-testid="button-dismiss-result" onClick={onDismiss} className="rounded-lg p-1 text-muted-foreground hover:bg-card/70"><X size={17} /></button></div><div className="p-5"><div className="text-2xl font-extrabold tracking-[-.06em]">{meta.title}</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.detail}</p><div className="my-5 rounded-xl border border-border bg-muted/45 p-3.5"><div className="flex items-center justify-between"><div><div className="text-sm font-extrabold">{result.ticket.attendeeName}</div><div className="mt-1 text-[10px] text-muted-foreground">{result.ticket.type} · {result.ticket.eventName}</div></div><span className="font-mono text-[11px] font-bold">{result.ticket.ticketNumber}</span></div>{result.ticket.checkedInAt && <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[10px] text-muted-foreground"><Clock3 size={12} /> Used {result.ticket.checkedInAt} by {result.ticket.checkedInBy}</div>}</div>{isValid && <button data-testid="button-confirm-check-in" onClick={onConfirm} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:brightness-95 active:scale-[.99]"><CheckCircle2 size={17} /> Confirm check-in</button>}{isChecked && <div className="flex items-center gap-2 rounded-xl bg-accent/15 px-3.5 py-3 text-[11px] font-bold text-accent-foreground"><Flag size={14} /> Ask a lead to review this pass</div>}{!isValid && !isChecked && <button data-testid="button-search-another" onClick={onDismiss} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-xs font-bold hover:bg-muted"><RefreshCw size={14} /> Scan another ticket</button>}</div></div>;
}

function HistoryPage() {
  const [filter, setFilter] = useState<'All' | 'Valid' | 'Needs review'>('All');
  const filtered = seedRecords.filter(record => filter === 'All' || filter === 'Valid' ? (filter === 'Valid' ? record.status === 'VALID' : true) : ['INVALID', 'CHECKED_IN'].includes(record.status));
  return <div className="drift-in"><PageHeading eyebrow="Audit trail · Last sync 14:32:12" title="Recent check-ins" detail="Every scan is recorded. Review the last 100 outcomes from all entrances." action={<button data-testid="button-export-history" className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold hover:bg-muted sm:self-auto"><ExternalLink size={14} /> Export log</button>} /><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard icon={<Activity size={18} />} label="Scans today" value="1,312" helper="↑ 8.4% vs yesterday" accent="lime" /><StatCard icon={<CheckCircle2 size={18} />} label="Admitted" value="1,268" helper="96.8% pass rate" accent="lime" /><StatCard icon={<AlertTriangle size={18} />} label="Needs review" value="44" helper="3.2% of scans" accent="coral" /></div><div className="rounded-2xl border border-border bg-card shadow-sm"><div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex rounded-lg bg-muted p-1">{(['All', 'Valid', 'Needs review'] as const).map(item => <button key={item} data-testid={`button-history-filter-${item.toLowerCase().replace(' ', '-')}`} onClick={() => setFilter(item)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${filter === item ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{item}</button>)}</div><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live feed · updating automatically</div></div><div className="hidden grid-cols-[1.25fr_.75fr_.8fr_.85fr_.65fr] gap-4 px-5 py-3 font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground md:grid"><span>Attendee</span><span>Ticket</span><span>Entrance</span><span>Time</span><span>Outcome</span></div><div>{filtered.map((record, index) => <div key={`${record.ticket}-${index}`} data-testid={`row-check-in-${index}`} className="grid gap-2 border-t border-border px-4 py-4 first:border-t-0 md:grid-cols-[1.25fr_.75fr_.8fr_.85fr_.65fr] md:items-center md:gap-4 md:px-5"><div className="flex items-center gap-3"><div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-extrabold ${record.status === 'VALID' ? 'bg-primary/25' : record.status === 'CHECKED_IN' ? 'bg-accent/20' : 'bg-destructive/15'}`}>{record.attendee.split(' ').map(part => part[0]).join('')}</div><div><div className="text-xs font-extrabold">{record.attendee}</div><div className="text-[10px] text-muted-foreground">{record.ticketType}</div></div></div><span className="font-mono text-[10px] text-muted-foreground">{record.ticket}</span><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin size={11} /> {record.entrance}</span><span className="font-mono text-[10px] text-muted-foreground">{record.time}</span><StatusPill status={record.status} /></div>)}</div>{filtered.length === 0 && <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><FileClock size={28} className="mb-3 text-muted-foreground" /><h3 className="text-sm font-extrabold">No matching scans</h3><p className="mt-1 text-xs text-muted-foreground">Try another filter or keep the line moving.</p></div>}</div></div>;
}

function StatusPill({ status }: { status: ScanStatus }) {
  const valid = status === 'VALID';
  const checked = status === 'CHECKED_IN';
  return <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] font-bold ${valid ? 'bg-primary/25 text-foreground' : checked ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/15 text-destructive'}`}>{valid ? <Check size={10} /> : checked ? <History size={10} /> : <XCircle size={10} />}{valid ? 'Admitted' : checked ? 'Duplicate' : 'Review'}</span>;
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [entrance, setEntrance] = useState('North / A');
  const [mode, setMode] = useState('Continuous');
  const save = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  return <div className="drift-in max-w-[1000px]"><PageHeading eyebrow="Device & access" title="Scanner settings" detail="Set the behavior for this device. Changes apply to your session only." action={<button data-testid="button-save-settings" onClick={save} className="flex items-center gap-2 self-start rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-secondary-foreground transition hover:brightness-110 sm:self-auto">{saved ? <Check size={14} /> : <CheckCircle2 size={14} />}{saved ? 'Saved' : 'Save changes'}</button>} /><div className="grid gap-5 md:grid-cols-[1.1fr_.9fr]"><div className="space-y-5"><SettingGroup title="Scanning mode" eyebrow="How this device behaves"><div className="grid grid-cols-2 gap-2">{['Continuous', 'Single scan'].map(item => <button key={item} data-testid={`button-mode-${item.toLowerCase().replace(' ', '-')}`} onClick={() => setMode(item)} className={`rounded-xl border p-4 text-left transition ${mode === item ? 'border-primary bg-primary/15' : 'border-border bg-card hover:bg-muted'}`}><div className={`mb-4 flex h-8 w-8 items-center justify-center rounded-lg ${mode === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Radio size={16} /></div><div className="text-xs font-extrabold">{item}</div><div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{item === 'Continuous' ? 'Keep the camera ready after every result.' : 'Pause after each ticket for a deliberate confirm.'}</div></button>)}</div></SettingGroup><SettingGroup title="Entrance assignment" eyebrow="Operational context"><label className="mb-2 block text-xs font-bold">This device is working at</label><div className="relative"><select data-testid="select-entrance" value={entrance} onChange={e => setEntrance(e.target.value)} className="w-full appearance-none rounded-xl border border-input bg-background px-3.5 py-3 text-xs font-bold outline-none focus:border-primary"><option>North / A</option><option>North / B</option><option>VIP entrance</option><option>South / loading</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground" /></div><p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><MapPin size={11} /> Visible to the event lead in the live entrance view.</p></SettingGroup><SettingGroup title="Session & permissions" eyebrow="Staff-safe by default"><div className="space-y-1"><ToggleRow icon={<LockKeyhole size={15} />} label="Require lead approval for overrides" detail="No staff member can bypass a failed ticket alone" on onToggle={() => {}} /><ToggleRow icon={<CloudOff size={15} />} label="Allow offline queue" detail="Save scans locally until connection returns" on onToggle={() => {}} /><ToggleRow icon={<Bell size={15} />} label="Alert on duplicate attempt" detail="Notify this device when a pass is reused" on onToggle={() => {}} /></div></SettingGroup></div><div className="space-y-5"><SettingGroup title="Device status" eyebrow="iPad Pro · Scanner 03"><div className="rounded-xl bg-secondary p-4 text-secondary-foreground"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Smartphone size={19} /></div><div><div className="text-sm font-extrabold">Connected and synced</div><div className="mt-1 flex items-center gap-1.5 text-[10px] text-secondary-foreground/60"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Last sync 14:32:12</div></div></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-lg bg-secondary-foreground/10 p-3"><div className="font-mono text-[9px] uppercase text-secondary-foreground/50">Queue</div><div className="mt-1 text-lg font-extrabold">0</div></div><div className="rounded-lg bg-secondary-foreground/10 p-3"><div className="font-mono text-[9px] uppercase text-secondary-foreground/50">Battery</div><div className="mt-1 text-lg font-extrabold">86%</div></div></div></div><button data-testid="button-sync-device" onClick={save} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-xs font-bold hover:bg-muted"><RefreshCw size={14} /> Sync device now</button></SettingGroup><SettingGroup title="Sound & haptics" eyebrow="Feedback on this device"><ToggleRow icon={<Volume2 size={15} />} label="Sound feedback" detail="A clear tone for admit, duplicate, and review" on onToggle={() => {}} /><ToggleRow icon={<Vibrate size={15} />} label="Vibration feedback" detail="Use haptics where supported" on onToggle={() => {}} /></SettingGroup><div className="rounded-2xl border border-accent/30 bg-accent/10 p-4"><div className="flex gap-3"><Info size={16} className="mt-0.5 shrink-0 text-accent-foreground" /><div><div className="text-xs font-extrabold">Session note</div><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">You’re signed in as Jordan Reyes, Lead operator. Device changes are logged for audit and reset when the event session ends.</p></div></div></div></div></div></div>;
}

function SettingGroup({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="mb-5"><div className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">{eyebrow}</div><h2 className="mt-1 text-base font-extrabold tracking-[-.03em]">{title}</h2></div>{children}</section>;
}

function BuyerCheckout() {
  const { user } = useUser();
  const [step, setStep] = useState<'tickets' | 'details' | 'access' | 'complete'>('tickets');
  const [quantities, setQuantities] = useState<Record<string, number>>(() => readCart());
  const [buyer, setBuyer] = useState({ name: '', email: '' });
  const [issuedOrder, setIssuedOrder] = useState<IssuedOrder | null>(null);
  const [orderError, setOrderError] = useState('');
  const [issuing, setIssuing] = useState(false);

  const selected = ticketTiers.filter((tier) => quantities[tier.id] > 0);
  const subtotal = selected.reduce((sum, tier) => sum + tier.price * quantities[tier.id], 0);
  const serviceFee = Math.round(subtotal * 0.035);
  const total = subtotal + serviceFee;
  const ticketCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);

  useEffect(() => {
    if (!user?.id) return;
    setQuantities(readCart(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    window.localStorage.setItem(cartStorageKey(user.id), JSON.stringify(quantities));
  }, [quantities, user?.id]);

  const updateQuantity = (id: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(8, (current[id] ?? 0) + delta)),
    }));
  };

  const completeOrder = async () => {
    setIssuing(true);
    setOrderError('');
    try {
      const response = await fetch(`${basePath}/api/tickets/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          items: selected.map((tier) => ({ tierId: tier.id, quantity: quantities[tier.id] })),
        }),
      });
      const payload = await response.json() as IssuedOrder & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'We could not issue your tickets.');
      window.localStorage.removeItem(cartStorageKey(user?.id));
      setIssuedOrder(payload);
      setStep('complete');
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'We could not issue your tickets.');
    } finally {
      setIssuing(false);
    }
  };

  if (step === 'complete') {
    if (!issuedOrder) return <div className="flex min-h-[40vh] items-center justify-center text-sm font-bold">Preparing your digital tickets…</div>;
    return <div className="drift-in mx-auto max-w-[850px]">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/buy" data-testid="link-buy-more" className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Buy more tickets</Link>
        <span className="rounded-full bg-primary/25 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide">Order confirmed</span>
      </div>
      <section className="overflow-hidden rounded-[28px] bg-secondary text-secondary-foreground shadow-xl">
        <div className="relative overflow-hidden border-b border-secondary-foreground/10 p-6 sm:p-10">
          <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full border-[28px] border-primary/10" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><CheckCircle2 size={25} strokeWidth={2.5} /></div>
            <p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/55">{issuedOrder.event.name}</p>
            <h1 className="mt-2 text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-none tracking-[-.07em]">You’re on the list.</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-secondary-foreground/65">Your unique digital tickets are ready and have been sent to {buyer.email}.</p>
          </div>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_180px] sm:p-10">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.18em] text-secondary-foreground/45">Order details</div>
            <div className="mt-4 space-y-3">
              {issuedOrder.tickets.map((ticket) => <div key={ticket.ticketNumber} className="flex items-center justify-between border-b border-secondary-foreground/10 pb-3 text-xs"><span><span className="font-bold">{ticket.ticketType}</span><span className="ml-2 text-secondary-foreground/50">{ticket.ticketNumber}</span></span><span className="font-mono">Valid</span></div>)}
            </div>
            <div className="mt-5 flex items-center gap-2 text-[10px] text-secondary-foreground/55"><CalendarDays size={13} /> {issuedOrder.event.date} · {issuedOrder.event.venue}</div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-secondary-foreground/55"><UserRound size={13} /> {buyer.name} · {buyer.email}</div>
            <div className={`mt-6 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${issuedOrder.emailStatus === 'sent' ? 'border-primary/30 bg-primary/10' : 'border-accent/30 bg-accent/10'}`}><Info size={13} /> {issuedOrder.emailStatus === 'sent' ? 'Ticket email sent' : 'Tickets created, but email delivery needs a retry'}</div>
          </div>
          <div className="space-y-3">
            {issuedOrder.tickets.map((ticket) => <div key={ticket.ticketNumber} className="flex flex-col items-center justify-center rounded-2xl bg-card p-4 text-foreground"><img src={ticket.qrDataUrl} alt={`QR code for ${ticket.ticketNumber}`} className="h-[132px] w-[132px] rounded-lg border-8 border-white bg-white" /><div className="mt-3 font-mono text-[10px] font-bold tracking-wider">{ticket.ticketNumber}</div><div className="mt-1 text-[9px] text-muted-foreground">Show at the entrance</div></div>)}
          </div>
        </div>
      </section>
    </div>;
  }

  return <div className="drift-in mx-auto max-w-[1180px]">
    <PageHeading eyebrow="Public ticketing · Northstar Product Summit" title="Bring your people to Northstar." detail="Choose passes, share attendee details, and get a digital ticket ready for the door." action={<span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-mono text-[10px] font-bold text-muted-foreground"><ShieldCheck size={13} className="text-primary" /> Secure checkout</span>} />
    <div className="mb-6 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-muted-foreground"><Info size={15} className="shrink-0 text-primary" /><span><strong className="text-foreground">Secure ticket issuance.</strong> After you complete checkout, each ticket gets a unique QR code and is emailed to the attendee.</span></div>
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-4">
        {step === 'tickets' && <section className="space-y-3">
          {ticketTiers.map((tier) => <div key={tier.id} className={`rounded-2xl border bg-card p-5 shadow-sm transition ${quantities[tier.id] > 0 ? 'border-primary/70 ring-1 ring-primary/20' : 'border-border'}`}>
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tier.accent === 'lime' ? 'bg-primary/25' : tier.accent === 'coral' ? 'bg-accent/20' : 'bg-chart-3/15'}`}><Ticket size={20} /></div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-base font-extrabold tracking-[-.03em]">{tier.name}</h2><p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{tier.description}</p></div><div className="text-right"><div className="text-xl font-extrabold tracking-[-.05em]">${tier.price}</div><div className="font-mono text-[9px] uppercase text-muted-foreground">per person</div></div></div>
                <div className="mt-5 flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-muted-foreground">{formatNumber(tier.remaining)} remaining</span><div className="flex items-center gap-2 rounded-xl bg-muted p-1"><button data-testid={`button-decrease-${tier.id}`} onClick={() => updateQuantity(tier.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-card"><Minus size={14} /></button><span data-testid={`text-quantity-${tier.id}`} className="w-7 text-center text-xs font-extrabold">{quantities[tier.id]}</span><button data-testid={`button-increase-${tier.id}`} onClick={() => updateQuantity(tier.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-card shadow-sm hover:bg-primary/20"><Plus size={14} /></button></div></div>
              </div>
            </div>
          </div>)}
        </section>}
        {step === 'details' && <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"><button data-testid="button-back-to-tickets" onClick={() => setStep('tickets')} className="mb-6 flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to ticket types</button><div className="mb-6"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Attendee details</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.06em]">Where should we send your tickets?</h2><p className="mt-2 text-xs text-muted-foreground">One order contact is enough. You can share individual tickets after checkout.</p></div><div className="space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold">Full name</span><input data-testid="input-buyer-name" value={buyer.name} onChange={(event) => setBuyer({ ...buyer, name: event.target.value })} placeholder="Jordan Reyes" className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary" /></label><label className="block"><span className="mb-2 block text-xs font-bold">Email address</span><input data-testid="input-buyer-email" type="email" value={buyer.email} onChange={(event) => setBuyer({ ...buyer, email: event.target.value })} placeholder="you@example.com" className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary" /></label></div></section>}
         {step === 'access' && <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"><button data-testid="button-back-to-details" onClick={() => setStep('details')} className="mb-6 flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to details</button><div className="mb-6"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Checkout access</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.06em]">How would you like to continue?</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Create an account to access order history and future tickets, or continue as a guest and receive your pass by email.</p></div><div className="grid gap-3"><Link href="/sign-in" data-testid="link-checkout-sign-in" className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 text-sm font-extrabold hover:border-primary"><span><span className="block">Log in</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Use your existing Event Check-In account</span></span><ArrowRight size={16} /></Link><Link href="/sign-up" data-testid="link-checkout-sign-up" className="flex items-center justify-between rounded-2xl border border-primary/50 bg-primary/10 p-4 text-sm font-extrabold hover:bg-primary/20"><span><span className="block">Create an account</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Keep your tickets and order history together</span></span><ArrowRight size={16} /></Link><button type="button" data-testid="button-continue-as-guest" disabled={!buyer.name.trim() || !buyer.email.trim() || issuing} onClick={() => { setGuestCheckout(true); void completeOrder(); }} className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 text-left text-sm font-extrabold hover:border-secondary"><span><span className="block">Continue as guest</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">No account required; your ticket will be emailed</span></span><ArrowRight size={16} /></button></div></section>}
      </div>
      <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-24">
        <div className="mb-5 flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Your order</div><h2 className="mt-1 text-base font-extrabold">Northstar summit</h2></div><ShoppingBag size={18} className="text-muted-foreground" /></div>
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-[10px] text-muted-foreground"><CalendarDays size={14} className="text-foreground" /><span>Today · 18 June 2024<br /><strong className="text-foreground">Pier 48 · San Francisco</strong></span></div>
        {selected.length > 0 ? <div className="space-y-3">{selected.map((tier) => <div key={tier.id} className="flex items-start justify-between gap-3 text-xs"><span><span className="font-bold">{quantities[tier.id]} × {tier.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">${tier.price} each</span></span><span className="font-mono font-bold">${tier.price * quantities[tier.id]}</span></div>)}</div> : <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Choose at least one ticket to continue.</p>}
        <div className="my-5 border-t border-border pt-4 text-xs"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${subtotal}</span></div><div className="mt-2 flex justify-between text-muted-foreground"><span>Service fee</span><span>${serviceFee}</span></div><div className="mt-4 flex items-end justify-between"><span className="font-extrabold">Total</span><span className="text-2xl font-extrabold tracking-[-.06em]">${total}</span></div></div>
          {step === 'tickets' ? <button data-testid="button-continue-to-details" disabled={ticketCount === 0} onClick={() => setStep('details')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">Continue to details <ArrowRight size={15} /></button> : step === 'details' ? <button data-testid="button-checkout-access" disabled={!buyer.name.trim() || !buyer.email.trim()} onClick={() => user ? void completeOrder() : setStep('access')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"><CreditCard size={15} /> {user ? 'Complete checkout' : 'Continue to checkout'}</button> : <div className="rounded-xl bg-muted p-3 text-center text-[10px] text-muted-foreground">Choose an account or guest checkout option above.</div>}
         {orderError && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-center text-[10px] font-bold text-destructive">{orderError}</p>}
         <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">Tickets are created securely and emailed after checkout.</p>
      </aside>
    </div>
  </div>;
}

function EventPoster({ event }: { event: DiscoverableEvent }) {
  const posterTone = event.accent === 'lime' ? 'bg-primary text-primary-foreground' : event.accent === 'coral' ? 'bg-accent text-accent-foreground' : 'bg-chart-3 text-primary-foreground';
  return <article className="group overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className={`relative min-h-[250px] overflow-hidden p-5 ${posterTone}`}>
      <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full border-[26px] border-black/10 transition group-hover:scale-110" />
      <div className="absolute bottom-[-44px] left-[-22px] h-36 w-36 rotate-12 rounded-[38px] border-[18px] border-white/15" />
      <div className="relative flex h-full min-h-[220px] flex-col justify-between">
        <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-black/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.14em]">{event.status}</span><span className="font-mono text-[10px] font-bold uppercase">{event.category}</span></div>
        <div><div className="max-w-[250px] text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[.92] tracking-[-.08em]">{event.name}</div><div className="mt-5 flex items-center gap-2 text-xs font-bold"><CalendarDays size={14} /> {event.date}</div><div className="mt-1 flex items-center gap-2 text-xs font-bold"><MapPin size={14} /> {event.venue} · {event.city}</div></div>
      </div>
    </div>
    <div className="p-5"><p className="min-h-[42px] text-xs leading-relaxed text-muted-foreground">{event.description}</p><div className="mt-5 flex items-center justify-between gap-3"><div><span className="font-mono text-[9px] uppercase tracking-[.15em] text-muted-foreground">From</span><div className="text-lg font-extrabold">${event.price}</div></div>{event.status === 'Live' ? <Link href="/buy" data-testid={`link-event-buy-${event.id}`} className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-2.5 text-xs font-extrabold text-secondary-foreground transition hover:brightness-110">View tickets <ArrowRight size={14} /></Link> : <button type="button" data-testid={`button-event-notify-${event.id}`} className="rounded-xl border border-border px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted">Coming soon</button>}</div></div>
  </article>;
}

function EventDiscoveryPage() {
  return <div className="drift-in mx-auto max-w-[1180px]">
    <PageHeading eyebrow="Your event calendar" title="Find your next room." detail="Browse upcoming experiences, then keep every pass together in your cart." action={<Link href="/cart" className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold hover:bg-muted sm:self-auto"><ShoppingBag size={14} /> View cart</Link>} />
    <section className="mb-6 overflow-hidden rounded-[26px] bg-secondary p-6 text-secondary-foreground sm:p-8"><div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/55"><span className="h-2 w-2 rounded-full bg-primary soft-pulse" /> Curated for curious people</div><h2 className="text-[clamp(2rem,5vw,4rem)] font-extrabold leading-none tracking-[-.08em]">Good events have a point of view.</h2><p className="mt-4 max-w-lg text-sm leading-relaxed text-secondary-foreground/65">Save your seat with a few taps. Your ticket arrives by email with a unique QR code ready for the door.</p></div></section>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{discoverableEvents.map((event) => <EventPoster key={event.id} event={event} />)}</div>
  </div>;
}

function CartPage() {
  const { user } = useUser();
  const [quantities, setQuantities] = useState<Record<string, number>>(() => readCart());
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user?.id) setQuantities(readCart(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) window.localStorage.setItem(cartStorageKey(user.id), JSON.stringify(quantities));
  }, [quantities, user?.id]);

  const updateQuantity = (id: string, delta: number) => setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(8, (current[id] ?? 0) + delta)) }));
  const selected = ticketTiers.filter((tier) => (quantities[tier.id] ?? 0) > 0);
  const count = selected.reduce((sum, tier) => sum + quantities[tier.id], 0);
  const subtotal = selected.reduce((sum, tier) => sum + tier.price * quantities[tier.id], 0);
  const serviceFee = Math.round(subtotal * 0.035);

  return <div className="drift-in mx-auto max-w-[980px]">
    <PageHeading eyebrow="Saved for checkout" title="Your cart." detail="Review your passes before continuing to attendee details." action={<Link href="/events" className="inline-flex items-center gap-2 self-start text-xs font-bold text-muted-foreground hover:text-foreground sm:self-auto"><ArrowLeft size={14} /> Keep browsing</Link>} />
    {count === 0 ? <section className="rounded-[26px] border border-dashed border-border bg-card p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20"><ShoppingBag size={24} /></div><h2 className="mt-5 text-xl font-extrabold">Your cart is waiting.</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Pick an event and add a ticket to see it here.</p><Link href="/events" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground">Browse events</Link></section> : <div className="grid gap-5 lg:grid-cols-[1fr_320px]"><section className="space-y-3">{selected.map((tier) => <div key={tier.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tier.accent === 'lime' ? 'bg-primary/25' : tier.accent === 'coral' ? 'bg-accent/20' : 'bg-chart-3/15'}`}><Ticket size={20} /></div><div className="min-w-0 flex-1"><div className="text-sm font-extrabold">{tier.name}</div><p className="mt-1 text-xs text-muted-foreground">${tier.price} each · {tier.description}</p></div><div className="flex items-center gap-2 rounded-xl bg-muted p-1"><button type="button" onClick={() => updateQuantity(tier.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-card"><Minus size={14} /></button><span className="w-5 text-center text-xs font-extrabold">{quantities[tier.id]}</span><button type="button" onClick={() => updateQuantity(tier.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-card shadow-sm"><Plus size={14} /></button></div></div>)}</section><aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-24"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Northstar summit</div><div className="mt-4 space-y-2 text-xs">{selected.map((tier) => <div key={tier.id} className="flex justify-between"><span>{quantities[tier.id]} × {tier.name}</span><span className="font-mono">${tier.price * quantities[tier.id]}</span></div>)}</div><div className="my-5 border-t border-border pt-4 text-xs"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${subtotal}</span></div><div className="mt-2 flex justify-between text-muted-foreground"><span>Service fee</span><span>${serviceFee}</span></div><div className="mt-4 flex justify-between text-base font-extrabold"><span>Total</span><span>${subtotal + serviceFee}</span></div></div><button type="button" onClick={() => setLocation('/buy')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground">Continue to checkout <ArrowRight size={15} /></button></aside></div>}
  </div>;
}

type ProfileUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  update: (params: { firstName: string; lastName: string }) => Promise<unknown>;
};

function AttendeeOnboarding({ user, onComplete }: { user: ProfileUser; onComplete: () => void }) {
  const [form, setForm] = useState({ firstName: user.firstName ?? '', lastName: user.lastName ?? '', phone: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      window.localStorage.setItem(`event-check-in:attendee-profile:${user.id}`, JSON.stringify(form));
      try {
        await user.update({ firstName: form.firstName.trim(), lastName: form.lastName.trim() });
      } catch (profileSyncError) {
        console.warn('Clerk profile name sync skipped; attendee profile was saved locally.', profileSyncError);
      }
      onComplete();
    } catch {
      setError('We could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return <OnboardingFrame eyebrow="Attendee profile" title="Tell us who the ticket is for." detail="This information helps us personalize your tickets and get you through the door faster."><form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">First name</span><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Last name</span><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="onboarding-input" /></label></div><label className="block"><span className="mb-2 block text-xs font-bold">Email address</span><input readOnly value={user.primaryEmailAddress?.emailAddress ?? ''} className="onboarding-input bg-muted" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">Mobile number</span><input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+27 82 000 0000" className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">City</span><input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Johannesburg" className="onboarding-input" /></label></div>{error && <p className="rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}<button disabled={saving} className="w-full rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50">{saving ? 'Saving profile…' : 'Continue to events'}</button></form></OnboardingFrame>;
}

function OrganizerOnboarding({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [form, setForm] = useState({ businessName: '', businessType: '', businessEmail: '', businessPhone: '', eventName: '', eventDate: '', eventVenue: '', eventCity: '', capacity: '', description: '' });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    window.localStorage.setItem(`event-check-in:organizer-profile:${userId}`, JSON.stringify(form));
    window.setTimeout(() => { setSaving(false); onComplete(); }, 350);
  };
  return <OnboardingFrame eyebrow="Organizer setup" title="Build your event workspace." detail="Every field is required so your team and attendees have a complete source of truth."><form onSubmit={submit} className="space-y-6"><div><div className="mb-3 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Business information</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">Business or organization name</span><input required value={form.businessName} onChange={(e) => update('businessName', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Business type</span><select required value={form.businessType} onChange={(e) => update('businessType', e.target.value)} className="onboarding-input"><option value="">Choose one</option><option>Company</option><option>Community</option><option>Venue</option><option>Agency</option><option>Non-profit</option></select></label><label><span className="mb-2 block text-xs font-bold">Business email</span><input required type="email" value={form.businessEmail} onChange={(e) => update('businessEmail', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Business phone</span><input required type="tel" value={form.businessPhone} onChange={(e) => update('businessPhone', e.target.value)} className="onboarding-input" /></label></div></div><div><div className="mb-3 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">First event</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">Event name</span><input required value={form.eventName} onChange={(e) => update('eventName', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Event date</span><input required type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Venue</span><input required value={form.eventVenue} onChange={(e) => update('eventVenue', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">City</span><input required value={form.eventCity} onChange={(e) => update('eventCity', e.target.value)} className="onboarding-input" /></label><label><span className="mb-2 block text-xs font-bold">Expected capacity</span><input required min="1" type="number" value={form.capacity} onChange={(e) => update('capacity', e.target.value)} className="onboarding-input" /></label><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">Event description</span><textarea required minLength={20} value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} className="onboarding-input resize-none" placeholder="What should attendees know about this event?" /></label></div></div><button disabled={saving} className="w-full rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50">{saving ? 'Creating workspace…' : 'Create organizer workspace'}</button></form></OnboardingFrame>;
}

function OnboardingFrame({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children: ReactNode }) {
  const { signOut } = useClerk();
  return <div className="min-h-[100dvh] bg-secondary px-4 py-8 text-secondary-foreground"><div className="mx-auto max-w-[760px]"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Ticket size={20} /></span><span className="text-sm font-extrabold">Event Check-In</span></div><button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex items-center gap-2 rounded-xl border border-secondary-foreground/15 px-3 py-2 text-xs font-bold text-secondary-foreground/75 hover:bg-secondary-foreground/10"><LogOut size={14} /> Sign out</button></div><div className="mt-12 rounded-[28px] bg-background p-6 text-foreground shadow-2xl sm:p-10"><div className="mb-8"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> {eyebrow}</div><h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-none tracking-[-.08em]">{title}</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{detail}</p></div>{children}</div></div></div>;
}

function LandingPage() {
  return <div className="min-h-[100dvh] bg-secondary text-secondary-foreground"><div className="mx-auto flex min-h-[100dvh] max-w-[1280px] flex-col px-5 py-6 sm:px-8 lg:px-12">
    <header className="flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Ticket size={20} strokeWidth={2.5} /></span><span><span className="block text-sm font-extrabold tracking-[-.03em]">Event Check-In</span><span className="block font-mono text-[9px] uppercase tracking-[.18em] text-secondary-foreground/50">Tickets made simple</span></span></Link><div className="flex items-center gap-2"><Link href="/sign-in" data-testid="link-landing-sign-in" className="rounded-xl px-3.5 py-2.5 text-xs font-bold text-secondary-foreground/75 hover:bg-secondary-foreground/10">Sign in</Link><Link href="/sign-up" data-testid="link-landing-sign-up" className="rounded-xl bg-primary px-3.5 py-2.5 text-xs font-extrabold text-primary-foreground hover:brightness-95">Create account</Link></div></header>
    <main className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-20"><div><div className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/55"><span className="h-2 w-2 rounded-full bg-primary soft-pulse" /> One place for every entrance</div><h1 className="max-w-2xl text-[clamp(3rem,7vw,6.3rem)] font-extrabold leading-[.94] tracking-[-.09em]">The smoother way to arrive.</h1><p className="mt-6 max-w-xl text-base leading-relaxed text-secondary-foreground/65 sm:text-lg">Buy a ticket in minutes, keep it on your phone, and walk into events with confidence. Organizers get the same calm control on event day.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/sign-up" data-testid="link-landing-get-started" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground hover:brightness-95">Get started <ArrowRight size={16} /></Link><Link href="/sign-in" className="inline-flex items-center justify-center gap-2 rounded-xl border border-secondary-foreground/15 px-5 py-3.5 text-sm font-bold text-secondary-foreground/80 hover:bg-secondary-foreground/10">I already have an account</Link></div><div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-[10px] text-secondary-foreground/50"><span className="flex items-center gap-2"><ShieldCheck size={13} className="text-primary" /> Secure accounts</span><span className="flex items-center gap-2"><Smartphone size={13} className="text-primary" /> Mobile-ready tickets</span><span className="flex items-center gap-2"><Radio size={13} className="text-primary" /> Fast entry</span></div></div>
      <div className="relative mx-auto w-full max-w-[520px]"><div className="absolute -right-5 -top-8 h-40 w-40 rounded-full border-[24px] border-primary/10" /><div className="relative overflow-hidden rounded-[30px] border border-secondary-foreground/10 bg-background p-4 text-foreground shadow-2xl sm:p-6"><div className="flex items-center justify-between border-b border-border pb-4"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Your next event</div><div className="mt-1 text-sm font-extrabold">Northstar Product Summit</div></div><span className="rounded-full bg-primary/25 px-2.5 py-1 font-mono text-[9px] font-bold uppercase">Live</span></div><div className="mt-5 rounded-2xl bg-secondary p-5 text-secondary-foreground"><div className="flex items-start justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-secondary-foreground/50">18 June 2024</div><div className="mt-3 text-2xl font-extrabold tracking-[-.06em]">You’re invited.</div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-secondary-foreground/55"><MapPin size={12} /> Pier 48 · San Francisco</div></div><div className="qr-mark h-20 w-20 rounded-lg border-4 border-white bg-white" /></div><div className="mt-6 flex items-center justify-between border-t border-secondary-foreground/10 pt-4 text-[10px]"><span className="text-secondary-foreground/50">Digital pass</span><span className="font-mono font-bold">NS-04821</span></div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-muted px-3 py-3 text-[10px]"><span className="flex items-center gap-2 font-bold"><CheckCircle2 size={14} className="text-primary" /> Ready for the door</span><ArrowRight size={14} className="text-muted-foreground" /></div></div></div>
    </main>
  </div></div>;
}

function RoleChooser({ userId, userName, onChoose }: { userId: string; userName: string; onChoose: (role: AccountRole) => void }) {
  const { signOut } = useClerk();
  return <div className="min-h-[100dvh] bg-secondary px-4 py-8 text-secondary-foreground"><div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[900px] flex-col justify-center"><div className="mb-10 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Ticket size={20} /></span><div><div className="text-sm font-extrabold">Event Check-In</div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-secondary-foreground/50">Choose your workspace</div></div></div><button type="button" data-testid="button-role-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex items-center gap-2 rounded-xl border border-secondary-foreground/15 px-3 py-2 text-xs font-bold text-secondary-foreground/75 hover:bg-secondary-foreground/10"><LogOut size={14} /> Sign out</button></div><div className="max-w-xl"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/55"><span className="h-2 w-2 rounded-full bg-primary" /> Welcome, {userName}</div><h1 className="text-[clamp(2.2rem,6vw,4.5rem)] font-extrabold leading-none tracking-[-.08em]">How will you use Event Check-In?</h1><p className="mt-4 text-sm leading-relaxed text-secondary-foreground/60">Choose the space that matches you. You can switch accounts later by signing out.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2"><button data-testid="button-choose-attendee" onClick={() => onChoose('attendee')} className="group rounded-2xl border border-secondary-foreground/10 bg-secondary-foreground/5 p-5 text-left transition hover:-translate-y-1 hover:border-primary/70 hover:bg-secondary-foreground/10"><div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShoppingBag size={20} /></span><ArrowRight size={18} className="text-secondary-foreground/35 transition group-hover:translate-x-1 group-hover:text-primary" /></div><h2 className="mt-8 text-xl font-extrabold tracking-[-.04em]">I’m attending events</h2><p className="mt-2 text-xs leading-relaxed text-secondary-foreground/55">Browse events, buy tickets, and keep your digital passes in one place.</p></button><button data-testid="button-choose-organizer" onClick={() => onChoose('organizer')} className="group rounded-2xl border border-secondary-foreground/10 bg-secondary-foreground/5 p-5 text-left transition hover:-translate-y-1 hover:border-primary/70 hover:bg-secondary-foreground/10"><div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><LayoutDashboard size={20} /></span><ArrowRight size={18} className="text-secondary-foreground/35 transition group-hover:translate-x-1 group-hover:text-primary" /></div><h2 className="mt-8 text-xl font-extrabold tracking-[-.04em]">I organize events</h2><p className="mt-2 text-xs leading-relaxed text-secondary-foreground/55">Manage event day, assign scanners, and check guests in without slowing the line.</p></button></div><div className="mt-8 flex items-center gap-2 text-[10px] text-secondary-foreground/40"><LockKeyhole size={12} /> Account role saved for this device · {userId.slice(0, 12)}…</div></div></div>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-secondary/20 px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-secondary/20 px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) queryClient.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);
  return null;
}

function NotFound() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center"><div><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Ticket size={25} /></div><h1 className="text-3xl font-extrabold tracking-[-.06em]">This door is closed.</h1><p className="mt-2 text-sm text-muted-foreground">That route is not part of this event workspace.</p><Link href="/" data-testid="link-back-home" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-xs font-bold text-secondary-foreground"><ArrowLeft size={14} /> Back to overview</Link></div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router({ role }: { role: AccountRole }) {
  const [checkedIn, setCheckedIn] = useState(liveEvent.checkedIn);
  const checkIn = () => setCheckedIn(value => value + 1);
  return <AppShell checkedIn={checkedIn} role={role}><RoutedErrorBoundary><Switch><Route path="/"><Overview checkedIn={checkedIn} /></Route><Route path="/events"><EventDiscoveryPage /></Route><Route path="/cart"><CartPage /></Route><Route path="/buy"><BuyerCheckout /></Route><Route path="/tickets"><BuyerCheckout /></Route><Route path="/check-in"><Scanner onCheckIn={checkIn} checkedIn={checkedIn} /></Route><Route path="/dashboard/check-in"><Scanner onCheckIn={checkIn} checkedIn={checkedIn} /></Route><Route path="/history"><HistoryPage /></Route><Route path="/settings"><SettingsPage /></Route><Route><NotFound /></Route></Switch></RoutedErrorBoundary></AppShell>;
}

function AuthenticatedExperience() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [location, setLocation] = useLocation();
  const [role, setRole] = useState<AccountRole | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    const storedRole = window.localStorage.getItem(`event-check-in:role:${user.id}`);
    setRole(storedRole === 'attendee' || storedRole === 'organizer' ? storedRole : null);
  }, [user]);

  useEffect(() => {
    if (!user || !role) {
      setOnboardingComplete(false);
      return;
    }
    const profileKey = role === 'attendee' ? `event-check-in:attendee-profile:${user.id}` : `event-check-in:organizer-profile:${user.id}`;
    setOnboardingComplete(Boolean(window.localStorage.getItem(profileKey)));
  }, [role, user]);

  if (!isLoaded) return <div className="flex min-h-[100dvh] items-center justify-center bg-secondary text-secondary-foreground"><div className="flex items-center gap-2 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-primary soft-pulse" /> Loading your account…</div></div>;
  if (!isSignedIn || !user) return location === '/' ? <LandingPage /> : <Redirect to="/sign-in" />;
  if (!role) return <RoleChooser userId={user.id} userName={user.firstName ?? user.primaryEmailAddress?.emailAddress ?? 'there'} onChoose={(nextRole) => { window.localStorage.setItem(`event-check-in:role:${user.id}`, nextRole); setRole(nextRole); setOnboardingComplete(false); }} />;
  if (!onboardingComplete) return role === 'attendee' ? <AttendeeOnboarding user={user} onComplete={() => { setOnboardingComplete(true); setLocation('/events'); }} /> : <OrganizerOnboarding userId={user.id} onComplete={() => { setOnboardingComplete(true); setLocation('/'); }} />;
  if (role === 'attendee' && !['/events', '/cart', '/buy', '/tickets'].includes(location)) return <Redirect to="/events" />;
  return <Router role={role} />;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your event account' } }, signUp: { start: { title: 'Create your account', subtitle: 'Choose your Event Check-In workspace next' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><TooltipProvider><Switch><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route component={AuthenticatedExperience} /></Switch><Toaster /></TooltipProvider></QueryClientProvider></ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;