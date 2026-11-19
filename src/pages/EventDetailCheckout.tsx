import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Ticket as TicketIcon,
  UserPlus,
} from 'lucide-react';
import { apiFetch, formatZarFromCents } from '../lib/api.ts';
import { AuthForm, useAuthContext } from '../lib/clerk-wrapper.tsx';
import { EventCoverImage } from '../lib/event-images.tsx';
import TicketPdfButton from '../components/ticket/TicketPdfButton.tsx';
import BulkTicketPdfButton from '../components/ticket/BulkTicketPdfButton.tsx';

function getCartKey(uid?: string | null) {
  return uid ? `bookmyte:cart:${uid}` : 'bookmyte:cart:guest';
}

function readLocalQuantities(uid?: string | null): Record<number, number> {
  try {
    const userRaw = uid ? window.localStorage.getItem(getCartKey(uid)) : null;
    const guestRaw = window.localStorage.getItem('bookmyte:cart:guest');
    const pendingRaw = window.localStorage.getItem('bookmyte:pending-checkout');
    const merged: Record<number, number> = {};
    [guestRaw, userRaw].forEach((raw) => {
      if (!raw) return;
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([k, v]) => {
        if (Number(v) > 0) merged[Number(k)] = Number(v);
      });
    });
    if (pendingRaw) {
      const p = JSON.parse(pendingRaw);
      if (p?.quantities) {
        Object.entries(p.quantities).forEach(([k, v]) => {
          if (Number(v) > 0) merged[Number(k)] = Number(v);
        });
      }
    }
    return merged;
  } catch {
    return {};
  }
}

function persistLocalQuantities(uid: string | null | undefined, eventId: number, quantities: Record<number, number>) {
  try {
    const clean: Record<number, number> = {};
    Object.entries(quantities).forEach(([k, v]) => {
      if (Number(v) > 0) clean[Number(k)] = Number(v);
    });
    window.localStorage.setItem('bookmyte:active-event-id', String(eventId));
    window.localStorage.setItem('bookmyte:cart:guest', JSON.stringify(clean));
    if (uid) {
      window.localStorage.setItem(getCartKey(uid), JSON.stringify(clean));
    }
    window.localStorage.setItem('bookmyte:pending-checkout', JSON.stringify({ eventId, quantities: clean }));
  } catch {}
}

export function EventDetailPage({
  slugOrId,
  onNavigate,
}: {
  slugOrId: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuthContext();
  const [event, setEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [infoTab, setInfoTab] = useState<'overview' | 'refund' | 'terms'>('overview');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/events/slug/${encodeURIComponent(slugOrId)}`).then(async (res) => {
      if (!res.ok) {
        setError(res.data?.error || 'Event not found.');
        setLoading(false);
        return;
      }
      setEvent(res.data);

      // Restore quantities if matching server or localStorage cart
      const localQ = readLocalQuantities(user?.id);
      const serverCartRes = await apiFetch('/api/cart');
      const restored: Record<number, number> = {};
      const validIds = new Set((res.data.ticketTypes || []).map((t: any) => t.id));
      if (serverCartRes.ok && serverCartRes.data?.eventId === res.data.id && Array.isArray(serverCartRes.data.items)) {
        serverCartRes.data.items.forEach((it: any) => {
          if (validIds.has(it.ticketTypeId) && it.quantity > 0) {
            restored[it.ticketTypeId] = it.quantity;
          }
        });
      }
      Object.entries(localQ).forEach(([k, v]) => {
        if (validIds.has(Number(k)) && Number(v) > 0 && !restored[Number(k)]) {
          restored[Number(k)] = Number(v);
        }
      });
      setQuantities(restored);
      setLoading(false);
    });
  }, [slugOrId, user?.id]);

  const updateQty = (tier: any, delta: number) => {
    const current = quantities[tier.id] || 0;
    const maxAllowed = Math.min(tier.remaining, tier.maxPurchase || 8);
    let next = Math.max(0, Math.min(maxAllowed, current + delta));
    if (delta > 0 && current === 0 && (tier.minPurchase || 1) > 1) {
      next = Math.min(maxAllowed, tier.minPurchase);
    }
    const updated = { ...quantities, [tier.id]: next };
    if (next === 0) delete updated[tier.id];
    setQuantities(updated);
    if (event) {
      persistLocalQuantities(user?.id, event.id, updated);
    }
  };

  const selectedItems = useMemo(() => {
    if (!event?.ticketTypes) return [];
    return event.ticketTypes
      .filter((t: any) => (quantities[t.id] || 0) > 0)
      .map((t: any) => ({ ...t, qty: quantities[t.id] }));
  }, [event, quantities]);

  const totalCount = selectedItems.reduce((s: number, it: any) => s + it.qty, 0);
  const subtotalCents = selectedItems.reduce((s: number, it: any) => s + (it.priceCents || 0) * it.qty, 0);

  const syncCartAndProceed = async (goToCheckout: boolean) => {
    if (!event || selectedItems.length === 0) return;
    persistLocalQuantities(user?.id, event.id, quantities);
    await apiFetch('/api/cart', {
      method: 'PUT',
      body: JSON.stringify({
        eventId: event.id,
        items: selectedItems.map((it: any) => ({ ticketTypeId: it.id, quantity: it.qty })),
      }),
    });
    if (goToCheckout) {
      onNavigate(`/checkout?event=${event.id}`);
    } else {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading event details...</div>;
  }

  if (error || !event) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-4 max-w-lg mx-auto my-8">
        <h2 className="text-lg font-extrabold text-foreground">Event Unavailable</h2>
        <p className="text-xs text-muted-foreground">{error || 'This event could not be found.'}</p>
        <button
          type="button"
          onClick={() => onNavigate('/discover')}
          className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  const totalRemaining = (event.ticketTypes || []).reduce((s: number, t: any) => s + Number(t.remaining || 0), 0);
  const totalSold = (event.ticketTypes || []).reduce((s: number, t: any) => s + Number(t.sold || 0), 0);

  return (
    <div className="space-y-8 pb-16">
      {/* Screen 4 Stage Hero Banner */}
      <section className="relative rounded-[1.75rem] overflow-hidden bg-neutral-950 border border-border/60 min-h-[340px] sm:min-h-[410px] flex flex-col justify-between">
        <EventCoverImage
          src={event.coverImage}
          category={event.category}
          eventId={event.id}
          alt={event.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/25" />

        {/* Top Floating Circular Back Button */}
        <div className="relative z-10 p-5 sm:p-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/discover')}
            aria-label="Back to events"
            className="h-10 w-10 rounded-full bg-white text-[#11100F] flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
            {event.ageRestriction || 'ALL AGES'} · ZAR
          </span>
        </div>

        {/* Bottom Title & Translucent Obsidian Metadata Cells */}
        <div className="relative z-10 p-5 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-white/80">
              {event.category} · Presented by {event.businessName}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight leading-[0.95] text-white [text-wrap:balance]">
              {event.name}
            </h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/15 bg-black/55 backdrop-blur-xs px-4 py-3 flex items-center gap-3">
              <CalendarDays size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-white truncate">{event.dateText}</div>
                <div className="text-[11px] text-white/65">Date</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-black/55 backdrop-blur-xs px-4 py-3 flex items-center gap-3">
              <TicketIcon size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-white truncate">
                  {event.startTime || '18:00'}
                  {event.endTime ? ` – ${event.endTime}` : ''}
                </div>
                <div className="text-[11px] text-white/65">Time ({event.timezone || 'SAST'})</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-black/55 backdrop-blur-xs px-4 py-3 flex items-center gap-3">
              <MapPin size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-xs text-white truncate">
                  {event.isOnline ? 'Online Stream' : event.venueName || event.city || 'Venue TBA'}
                </div>
                <div className="text-[11px] text-white/65 truncate">
                  {event.isOnline ? 'Access link on ticket' : event.venueAddress || event.address || event.city || 'South Africa'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Editorial About, Organiser & Live Capacity Counters */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-[1.5rem] border border-border bg-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-6 border-b border-border pb-3 overflow-x-auto">
              {[
                { id: 'overview', label: 'About the Event' },
                { id: 'refund', label: 'Refund Policy' },
                { id: 'terms', label: 'Terms & Entry' },
              ].map((tab) => {
                const active = infoTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInfoTab(tab.id as any)}
                    className={`relative pb-1 font-display text-lg font-extrabold uppercase tracking-tight whitespace-nowrap transition-colors ${
                      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {infoTab === 'overview' && (
              <div className="space-y-4 text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {event.description || 'Join us for an unforgettable live experience.'}
                {event.businessDescription && (
                  <div className="pt-4 border-t border-border text-xs text-muted-foreground">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold block mb-1">
                      ORGANISER · {event.businessName}
                    </span>
                    {event.businessDescription}
                  </div>
                )}
              </div>
            )}

            {infoTab === 'refund' && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.refundPolicy || 'Refunds may be requested via My Orders in line with organiser event terms.'}
              </p>
            )}

            {infoTab === 'terms' && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.termsAndConditions || 'Each QR ticket permits single entry. Keep your pass secure.'}
              </p>
            )}
          </div>

          {/* Live Attendance & Availability Counters (Screen 4 Bottom Strip) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-2xl font-extrabold uppercase text-foreground tabular-nums">
                  {totalSold} ISSUED
                </div>
                <div className="text-xs text-muted-foreground">Confirmed Passes</div>
              </div>
              <ShieldCheck size={22} className="text-primary shrink-0" />
            </div>

            <div className="rounded-2xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-2xl font-extrabold uppercase text-primary tabular-nums">
                  {totalRemaining} SPOTS LEFT
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalRemaining > 0 && totalRemaining < 30 ? 'Limited Capacity' : 'Live Inventory'}
                </div>
              </div>
              <TicketIcon size={22} className="text-primary shrink-0" />
            </div>
          </div>
        </div>

        {/* Right: Contiguous Purchase Module */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-[1.5rem] border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground">
              Select Tickets
            </h2>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              ZAR Currency
            </span>
          </div>

          <div className="space-y-3">
            {(event.ticketTypes || []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">No ticket tiers configured for this event yet.</p>
            ) : (
              (event.ticketTypes || []).map((tier: any) => {
                const qty = quantities[tier.id] || 0;
                const soldOut = tier.remaining <= 0;
                const priceCents = tier.isFree ? 0 : tier.priceCents ?? tier.price * 100;

                return (
                  <div
                    key={tier.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      qty > 0 ? 'border-primary bg-primary/10' : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-extrabold text-sm text-foreground">{tier.name}</div>
                        {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {soldOut ? 'Sold Out' : `${tier.remaining} remaining · Max ${tier.maxPurchase || 8} per order`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-base font-extrabold text-foreground tabular-nums">
                          {priceCents === 0 ? 'Free' : formatZarFromCents(priceCents)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={qty <= 0}
                        onClick={() => updateQty(tier, -1)}
                        className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40"
                        aria-label={`Decrease ${tier.name}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-mono text-sm font-bold tabular-nums">{qty}</span>
                      <button
                        type="button"
                        disabled={soldOut || qty >= Math.min(tier.remaining, tier.maxPurchase || 8)}
                        onClick={() => updateQty(tier, 1)}
                        className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40"
                        aria-label={`Increase ${tier.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Selected Passes ({totalCount})</span>
              <span className="font-mono text-lg font-extrabold text-foreground tabular-nums">
                {subtotalCents === 0 && totalCount > 0 ? 'Free' : formatZarFromCents(subtotalCents)}
              </span>
            </div>

            {savedNotice && (
              <div className="rounded-xl bg-primary/15 border border-primary/35 px-3.5 py-2 text-xs font-bold text-foreground">
                Cart saved! Your selection stays preserved even if you sign in later.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={totalCount === 0}
                onClick={() => syncCartAndProceed(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-muted disabled:opacity-40 whitespace-nowrap"
              >
                <ShoppingCart size={14} />
                Save Cart
              </button>
              <button
                type="button"
                disabled={totalCount === 0}
                onClick={() => syncCartAndProceed(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-primary-foreground hover:brightness-95 disabled:opacity-40 whitespace-nowrap"
              >
                <Lock size={14} />
                Reserve Spot
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CartAndCheckoutPage({
  onNavigate,
  initialVerifyRef,
}: {
  onNavigate: (path: string) => void;
  initialVerifyRef?: string | null;
}) {
  const { user, isSignedIn, refreshMe } = useAuthContext();

  const searchParams = new URLSearchParams(window.location.search);
  const queryEventId = Number(searchParams.get('event') || 0);
  const queryVerifyRef = initialVerifyRef || searchParams.get('verifyRef') || searchParams.get('reference') || '';

  const [event, setEvent] = useState<any | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guest vs Sign In mode
  const [checkoutMode, setCheckoutMode] = useState<'guest' | 'auth'>(isSignedIn ? 'guest' : 'guest');
  const [showInlineAuth, setShowInlineAuth] = useState(false);

  // Buyer fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Promo & Gateway
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPercent: number; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [gateways, setGateways] = useState<any[]>([]);
  const [selectedGateway, setSelectedGateway] = useState('sandbox');
  const [assignments, setAssignments] = useState<Record<number, { name: string; email: string }>>({});

  // Payment & Confirmation states
  const [processing, setProcessing] = useState(false);
  const [sandboxSession, setSandboxSession] = useState<any | null>(null);
  const [confirmation, setConfirmation] = useState<any | null>(null);
  const [ticketQrs, setTicketQrs] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Guest Account Claim post-purchase
  const [guestPassword, setGuestPassword] = useState('');
  const [guestClaimStatus, setGuestClaimStatus] = useState<string | null>(null);
  const [claimingAccount, setClaimingAccount] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName((prev) => prev || user.firstName || '');
      setLastName((prev) => prev || user.lastName || '');
      setEmail((prev) => prev || user.primaryEmailAddress?.emailAddress || '');
      setPhone((prev) => prev || user.phone || '');
    }
  }, [user]);

  // Countdown timer for active reservation
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s && s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // If returning from Paystack callback URL
  useEffect(() => {
    if (!queryVerifyRef) return;
    setLoading(true);
    apiFetch(`/api/payments/verify/${encodeURIComponent(queryVerifyRef)}`).then((res) => {
      if (res.ok && res.data?.order?.status === 'PAID') {
        setConfirmation(res.data);
      } else if (res.ok && res.data?.payment?.provider === 'sandbox' && res.data?.order?.status === 'PENDING') {
        setSandboxSession({
          order: res.data.order,
          payment: res.data.payment,
          breakdown: { totalCents: res.data.payment.amountCents },
        });
      }
      setLoading(false);
    });
  }, [queryVerifyRef]);

  // Load gateways & restore preserved cart (Server + localStorage)
  useEffect(() => {
    if (queryVerifyRef) return;

    const load = async () => {
      setLoading(true);
      const [gwRes, cartRes] = await Promise.all([apiFetch('/api/gateways'), apiFetch('/api/cart')]);
      if (gwRes.ok && Array.isArray(gwRes.data?.gateways)) {
        setGateways(gwRes.data.gateways);
        const preferred = gwRes.data.gateways.find((g: any) => g.configured) || gwRes.data.gateways[0];
        if (preferred) setSelectedGateway(preferred.id);
      }

      const activeSavedId = Number(window.localStorage.getItem('bookmyte:active-event-id') || 0);
      const targetEventId = queryEventId || cartRes.data?.eventId || activeSavedId;

      if (!targetEventId) {
        setLoading(false);
        return;
      }

      const evRes = await apiFetch(`/api/events/${targetEventId}`);
      if (evRes.ok && evRes.data) {
        setEvent(evRes.data);
        const validIds = new Set((evRes.data.ticketTypes || []).map((t: any) => t.id));
        const restored: Record<number, number> = {};

        // 1. Restore from server cart if same event
        if (cartRes.ok && cartRes.data?.eventId === evRes.data.id && Array.isArray(cartRes.data.items)) {
          cartRes.data.items.forEach((it: any) => {
            if (validIds.has(it.ticketTypeId) && it.quantity > 0) {
              restored[it.ticketTypeId] = it.quantity;
            }
          });
        }
        // 2. Merge localStorage preserved cart so zero items are lost during login/signup
        const localQ = readLocalQuantities(user?.id);
        Object.entries(localQ).forEach(([k, v]) => {
          if (validIds.has(Number(k)) && Number(v) > 0 && !restored[Number(k)]) {
            restored[Number(k)] = Number(v);
          }
        });

        setQuantities(restored);
        if (Object.keys(restored).length > 0) {
          persistLocalQuantities(user?.id, evRes.data.id, restored);
        }
      }
      setLoading(false);
    };

    load();
  }, [queryEventId, user?.id, queryVerifyRef]);

  // Generate QR previews for confirmed tickets
  useEffect(() => {
    if (!confirmation?.tickets?.length) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const t of confirmation.tickets) {
        const url = `${window.location.origin}/ticket/verify/${encodeURIComponent(t.token)}`;
        map[t.ticketNumber] = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      }
      setTicketQrs(map);
    })();
  }, [confirmation]);

  const selectedItems = useMemo(() => {
    if (!event?.ticketTypes) return [];
    return event.ticketTypes
      .filter((t: any) => (quantities[t.id] || 0) > 0)
      .map((t: any) => ({ ...t, qty: quantities[t.id] }));
  }, [event, quantities]);

  const flattenedTickets = useMemo(() => {
    const arr: Array<{ idx: number; tierName: string; tierId: number }> = [];
    selectedItems.forEach((it: any) => {
      for (let i = 0; i < it.qty; i++) {
        arr.push({ idx: arr.length, tierName: it.name, tierId: it.id });
      }
    });
    return arr;
  }, [selectedItems]);

  const subtotalCents = selectedItems.reduce((s: number, it: any) => s + (it.priceCents || 0) * it.qty, 0);
  const discountCents = useMemo(() => {
    if (!appliedPromo || subtotalCents === 0) return 0;
    const pct = appliedPromo.discountPercent ? Math.round((subtotalCents * appliedPromo.discountPercent) / 100) : 0;
    return Math.min(subtotalCents, pct + (appliedPromo.discountCents || 0));
  }, [appliedPromo, subtotalCents]);
  const afterDiscount = Math.max(0, subtotalCents - discountCents);
  const serviceFeeCents = afterDiscount > 0 ? Math.round((afterDiscount * (event?.bookingFeeBps || 350)) / 10000) : 0;
  const totalCents = afterDiscount + serviceFeeCents;

  const updateCartQty = async (tier: any, delta: number) => {
    const next = Math.max(0, Math.min(tier.remaining, (quantities[tier.id] || 0) + delta));
    const updated = { ...quantities, [tier.id]: next };
    if (next === 0) delete updated[tier.id];
    setQuantities(updated);
    if (event) {
      persistLocalQuantities(user?.id, event.id, updated);
      await apiFetch('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({
          eventId: event.id,
          items: Object.entries(updated).map(([id, qty]) => ({ ticketTypeId: Number(id), quantity: qty })),
          promoCode: appliedPromo?.code,
        }),
      });
    }
  };

  const applyPromo = async () => {
    setPromoError(null);
    if (!promoInput.trim() || !event) return;
    const res = await apiFetch('/api/promo/validate', {
      method: 'POST',
      body: JSON.stringify({ code: promoInput.trim(), eventId: event.id }),
    });
    if (!res.ok || !res.data?.valid) {
      setPromoError(res.data?.error || 'Invalid promo code.');
      setAppliedPromo(null);
      return;
    }
    setAppliedPromo(res.data);
  };

  const goToDedicatedAuth = (mode: 'login' | 'register') => {
    if (event) {
      persistLocalQuantities(user?.id, event.id, quantities);
    }
    window.sessionStorage.setItem('bookmyte:return-url', `/checkout${event ? `?event=${event.id}` : ''}`);
    onNavigate(`/${mode}`);
  };

  const initiateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!event || selectedItems.length === 0) return;

    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName || !email.trim()) {
      setError('First name, last name, and email address are required.');
      return;
    }

    setProcessing(true);
    const assignmentList = flattenedTickets.map((ft) => ({
      name: assignments[ft.idx]?.name?.trim() || fullName,
      email: assignments[ft.idx]?.email?.trim() || email.trim(),
    }));

    const res = await apiFetch('/api/checkout/initiate', {
      method: 'POST',
      body: JSON.stringify({
        eventId: event.id,
        buyerName: fullName,
        buyerEmail: email.trim(),
        buyerPhone: phone.trim(),
        items: selectedItems.map((it: any) => ({ ticketTypeId: it.id, quantity: it.qty })),
        assignments: assignmentList,
        promoCode: appliedPromo?.code,
        provider: selectedGateway,
      }),
    });
    setProcessing(false);

    if (!res.ok) {
      setError(res.data?.error || 'Checkout initiation failed.');
      return;
    }

    if (res.data.freeCompleted) {
      const verify = await apiFetch(`/api/payments/verify/${encodeURIComponent(res.data.payment.reference)}`);
      if (verify.ok) {
        clearLocalCart();
        setConfirmation(verify.data);
      }
      return;
    }

    setSecondsLeft(900); // 15 minute reservation countdown

    if (res.data.authorizationUrl && res.data.payment?.provider === 'paystack') {
      window.location.href = res.data.authorizationUrl;
      return;
    }

    setSandboxSession(res.data);
  };

  const clearLocalCart = () => {
    window.localStorage.removeItem('bookmyte:cart:guest');
    window.localStorage.removeItem('bookmyte:pending-checkout');
    if (user?.id) window.localStorage.removeItem(getCartKey(user.id));
  };

  const handleSandboxOutcome = async (outcome: 'success' | 'fail') => {
    if (!sandboxSession?.payment?.reference) return;
    setProcessing(true);
    setError(null);
    const res = await apiFetch(`/api/payments/sandbox/complete/${encodeURIComponent(sandboxSession.payment.reference)}`, {
      method: 'POST',
      body: JSON.stringify({ simulateOutcome: outcome }),
    });
    setProcessing(false);

    if (!res.ok) {
      setError(res.data?.error || 'Payment failed.');
      setSandboxSession(null);
      setSecondsLeft(null);
      return;
    }

    clearLocalCart();
    setSandboxSession(null);
    setSecondsLeft(null);
    setConfirmation(res.data);
  };

  const cancelReservation = async () => {
    if (!sandboxSession?.payment?.reference) return;
    await apiFetch(`/api/payments/cancel/${encodeURIComponent(sandboxSession.payment.reference)}`, {
      method: 'POST',
    });
    setSandboxSession(null);
    setSecondsLeft(null);
  };

  const claimAsNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestPassword || guestPassword.length < 6 || !confirmation?.order) return;
    setClaimingAccount(true);
    setGuestClaimStatus(null);
    const parts = (confirmation.order.buyerName || 'Guest').split(' ');
    const reg = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: confirmation.order.buyerEmail,
        password: guestPassword,
        firstName: parts[0] || 'Customer',
        lastName: parts.slice(1).join(' ') || '',
        phone: confirmation.order.buyerPhone || '',
      }),
    });

    if (!reg.ok) {
      setGuestClaimStatus(reg.data?.error || 'Could not create account. Try signing in instead.');
      setClaimingAccount(false);
      return;
    }

    // Verify ownership & claim
    const meData = await refreshMe();
    await apiFetch('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({}) });
    await apiFetch('/api/orders/claim', { method: 'POST', body: JSON.stringify({}) });
    if (meData || reg.data?.token) {
      await refreshMe();
    }
    setGuestClaimStatus('Account created and guest order claimed! Redirecting to My Tickets...');
    setClaimingAccount(false);
    setTimeout(() => onNavigate('/my-tickets'), 1200);
  };

  // Confirmation View
  if (confirmation?.order) {
    const pdfTickets = (confirmation.tickets || []).map((t: any) => ({
      ticketNumber: t.ticketNumber,
      token: t.token,
      attendeeName: t.attendeeName,
      attendeeEmail: t.attendeeEmail,
      ticketType: t.type,
      eventName: t.eventName,
      eventDate: confirmation.event?.date || 'Date TBA',
      venue: confirmation.event?.venue || 'Venue TBA',
      orderNumber: confirmation.order.orderNumber,
    }));

    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  Order Confirmed · {confirmation.order.orderNumber}
                </span>
                <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground mt-0.5">
                  Your Tickets Are Ready
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Confirmation sent to <strong className="text-foreground">{confirmation.order.buyerEmail}</strong> ·{' '}
                  {confirmation.event?.name} ({confirmation.event?.date})
                </p>
              </div>
            </div>
            {pdfTickets.length > 0 && <BulkTicketPdfButton tickets={pdfTickets} />}
          </div>

          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {(confirmation.tickets || []).map((t: any, idx: number) => (
              <div key={t.id} className="p-4 sm:p-5 bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {ticketQrs[t.ticketNumber] ? (
                    <img
                      src={ticketQrs[t.ticketNumber]}
                      alt={`QR for ${t.ticketNumber}`}
                      className="h-20 w-20 rounded-lg border border-border bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg border border-border bg-muted shrink-0" />
                  )}
                  <div className="space-y-1">
                    <div className="font-mono text-xs font-bold text-muted-foreground">{t.ticketNumber}</div>
                    <div className="text-sm font-extrabold text-foreground">{t.attendeeName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.type} · {t.attendeeEmail}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  <TicketPdfButton ticket={pdfTickets[idx]} />
                </div>
              </div>
            ))}
          </div>

          {/* Optional Guest Account Claiming */}
          {!isSignedIn && confirmation.isGuestOrder && (
            <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <UserPlus className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Save your tickets in a Customer Account</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Optional: Set a password for <strong>{confirmation.order.buyerEmail}</strong> to view, transfer, or request refunds anytime.
                  </p>
                </div>
              </div>

              <form onSubmit={claimAsNewAccount} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="Create password (min 6 chars)"
                  className="onboarding-input text-xs flex-1"
                />
                <button
                  type="submit"
                  disabled={claimingAccount}
                  className="rounded-xl bg-secondary px-5 py-2.5 text-xs font-bold text-secondary-foreground whitespace-nowrap shrink-0"
                >
                  {claimingAccount ? 'Saving...' : 'Create Account & Claim Tickets'}
                </button>
              </form>
              {guestClaimStatus && <p className="text-xs font-bold text-foreground">{guestClaimStatus}</p>}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('/discover')}
              className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold hover:bg-muted"
            >
              Browse More Events
            </button>
            {isSignedIn && (
              <button
                type="button"
                onClick={() => onNavigate('/my-tickets')}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
              >
                Open My Tickets Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Restoring your cart...</div>;
  }

  if (!event || selectedItems.length === 0) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-border bg-card p-10 text-center space-y-4 my-8">
        <ShoppingCart size={28} className="mx-auto text-muted-foreground" />
        <h2 className="text-lg font-extrabold text-foreground">Your Ticket Cart is Empty</h2>
        <p className="text-xs text-muted-foreground">
          Discover live concerts, festivals, summits, and workshops to select your passes.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/discover')}
          className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Discover Events
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate(`/events/${event.slug || event.id}`)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to {event.name}
        </button>
        {secondsLeft !== null && (
          <span className="font-mono text-xs font-bold text-foreground tabular-nums">
            Reservation held: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Sandbox Gateway Verification Modal */}
      {sandboxSession && (
        <div className="rounded-2xl border-2 border-secondary bg-card p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Verified Test Gateway (Sandbox Mode)
              </span>
              <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground mt-1">
                Complete Test Payment
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Order <strong className="font-mono">{sandboxSession.order.orderNumber}</strong> · Reference{' '}
                <strong className="font-mono">{sandboxSession.payment.reference}</strong>
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Amount Due</div>
              <div className="font-mono text-2xl font-extrabold text-foreground tabular-nums">
                {formatZarFromCents(sandboxSession.payment.amountCents)}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground bg-muted/60 rounded-xl p-3.5">
            Live Paystack keys are not configured in this environment, so this transaction routes through the platform's signed HMAC webhook simulator to test atomic ticket issuance, fee ledger posting, and inventory locking end-to-end.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={processing}
              onClick={() => handleSandboxOutcome('success')}
              className="rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-primary-foreground hover:brightness-95"
            >
              {processing ? 'Processing...' : 'Authorize Test Payment'}
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => handleSandboxOutcome('fail')}
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-bold text-destructive"
            >
              Simulate Card Decline
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={cancelReservation}
              className="rounded-xl border border-border px-4 py-3 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel & Release Tickets
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Checkout Options & Buyer Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Option 1 (Guest) vs Option 2 (Sign In / Create Account) */}
          {!isSignedIn ? (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground">
                    Checkout Option
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Your selected tickets stay preserved regardless of which option you pick.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutMode('guest');
                      setShowInlineAuth(false);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                      !showInlineAuth ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Continue as Guest
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutMode('auth');
                      setShowInlineAuth(true);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                      showInlineAuth ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Sign In / Register
                  </button>
                </div>
              </div>

              {showInlineAuth ? (
                <div className="pt-2 space-y-3">
                  <AuthForm
                    compact
                    initialMode="signin"
                    onAuthSuccess={() => {
                      setShowInlineAuth(false);
                      setCheckoutMode('guest');
                    }}
                  />
                  <div className="flex items-center justify-between pt-2 border-t border-border text-[11px] text-muted-foreground">
                    <span>Prefer the full auth screen?</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => goToDedicatedAuth('login')}
                        className="font-bold text-foreground hover:underline"
                      >
                        Open Sign In Page
                      </button>
                      <button
                        type="button"
                        onClick={() => goToDedicatedAuth('register')}
                        className="font-bold text-foreground hover:underline"
                      >
                        Open Register Page
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Checking out as a <strong>Guest</strong> — no password required. Your QR passes are emailed immediately and can be claimed later.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Signed in as Customer</div>
                <div className="text-sm font-extrabold text-foreground">
                  {user?.fullName} ({user?.primaryEmailAddress?.emailAddress})
                </div>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            </div>
          )}

          {/* Buyer & Attendee Form */}
          <form onSubmit={initiateCheckout} className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground">
              1. Buyer Contact Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block mb-1 text-[11px] font-bold text-foreground">First Name *</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
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
                  placeholder="Surname"
                  className="onboarding-input"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold text-foreground">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tickets@example.com"
                  className="onboarding-input"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold text-foreground">Mobile Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+27 82 555 0100"
                  className="onboarding-input"
                />
              </div>
            </div>

            {flattenedTickets.length > 0 && (
              <div className="pt-4 border-t border-border space-y-3">
                <h3 className="text-sm font-extrabold text-foreground">2. Ticket Holder Assignment (Optional)</h3>
                <p className="text-xs text-muted-foreground">
                  Leave blank to issue passes under {firstName || 'the buyer'}'s name and email.
                </p>
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {flattenedTickets.map((ft) => (
                    <div key={ft.idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-xl border border-border bg-background p-3">
                      <div className="sm:col-span-4 text-xs font-bold text-foreground truncate">
                        #{ft.idx + 1} · {ft.tierName}
                      </div>
                      <input
                        type="text"
                        value={assignments[ft.idx]?.name || ''}
                        onChange={(e) =>
                          setAssignments((prev) => ({
                            ...prev,
                            [ft.idx]: { name: e.target.value, email: prev[ft.idx]?.email || '' },
                          }))
                        }
                        placeholder={`${firstName} ${lastName}`.trim() || 'Attendee name'}
                        className="sm:col-span-4 onboarding-input py-1.5 text-xs"
                      />
                      <input
                        type="email"
                        value={assignments[ft.idx]?.email || ''}
                        onChange={(e) =>
                          setAssignments((prev) => ({
                            ...prev,
                            [ft.idx]: { name: prev[ft.idx]?.name || '', email: e.target.value },
                          }))
                        }
                        placeholder={email || 'attendee@email.com'}
                        className="sm:col-span-4 onboarding-input py-1.5 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment Gateway Selection */}
            {totalCents > 0 && (
              <div className="pt-4 border-t border-border space-y-3">
                <h3 className="text-sm font-extrabold text-foreground">3. South African Payment Method</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {gateways.map((gw) => (
                    <button
                      key={gw.id}
                      type="button"
                      disabled={!gw.configured}
                      onClick={() => setSelectedGateway(gw.id)}
                      className={`text-left rounded-xl border p-3.5 transition-colors ${
                        selectedGateway === gw.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background opacity-75'
                      } disabled:opacity-40`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-foreground">{gw.name}</span>
                        <CreditCard size={14} className="text-muted-foreground" />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {gw.mode === 'sandbox' ? 'Test Mode Enabled' : gw.configured ? 'Live ZAR Gateway' : 'Not Configured'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={processing || Boolean(sandboxSession)}
              className="w-full rounded-xl bg-primary py-3.5 text-xs font-extrabold text-primary-foreground hover:brightness-95 disabled:opacity-50 transition-all"
            >
              {processing
                ? 'Reserving Inventory...'
                : totalCents === 0
                  ? 'Confirm Free Registration'
                  : `Reserve & Pay ${formatZarFromCents(totalCents)}`}
            </button>
          </form>
        </div>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-[1.5rem] border border-border bg-card p-6 space-y-5">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-primary font-bold">{event.dateText}</span>
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground mt-0.5">
              {event.name}
            </h2>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            {selectedItems.map((it: any) => (
              <div key={it.id} className="flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-foreground">{it.name}</div>
                  <div className="font-mono text-muted-foreground tabular-nums">
                    {it.priceCents === 0 ? 'Free' : formatZarFromCents(it.priceCents)} × {it.qty}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCartQty(it, -1)}
                    className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono font-bold tabular-nums w-5 text-center">{it.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateCartQty(it, 1)}
                    className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Promo Code */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Promo code (e.g. LAUNCH20)"
                  className="onboarding-input pl-8 py-2 text-xs uppercase"
                />
              </div>
              <button
                type="button"
                onClick={applyPromo}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted whitespace-nowrap"
              >
                Apply
              </button>
            </div>
            {promoError && <p className="text-[11px] font-semibold text-destructive">{promoError}</p>}
            {appliedPromo && (
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                Promo {appliedPromo.code} applied (-{formatZarFromCents(discountCents)})
              </p>
            )}
          </div>

          {/* Breakdown */}
          <div className="pt-4 border-t border-border space-y-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Tickets Subtotal</span>
              <span className="font-mono tabular-nums">{formatZarFromCents(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Promo Discount</span>
                <span className="font-mono tabular-nums">-{formatZarFromCents(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Booking & Gateway Fee</span>
              <span className="font-mono tabular-nums">{formatZarFromCents(serviceFeeCents)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border text-base font-extrabold text-foreground">
              <span>Total (ZAR)</span>
              <span className="font-mono tabular-nums">{formatZarFromCents(totalCents)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
