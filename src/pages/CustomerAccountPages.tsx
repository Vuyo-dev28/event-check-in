import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Heart,
  MailCheck,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket as TicketIcon,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatZarFromCents } from '../lib/api.ts';
import { useAuthContext } from '../lib/clerk-wrapper.tsx';
import TicketPdfButton from '../components/ticket/TicketPdfButton.tsx';
import BulkTicketPdfButton from '../components/ticket/BulkTicketPdfButton.tsx';

export function MyTicketsWalletPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { isSignedIn, isLoaded } = useAuthContext();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  // Transfer modal
  const [transferTicket, setTransferTicket] = useState<any | null>(null);
  const [transferName, setTransferName] = useState('');
  const [transferEmail, setTransferEmail] = useState('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  // Cashless RFID drawer
  const [cashlessTicket, setCashlessTicket] = useState<any | null>(null);
  const [cashlessData, setCashlessData] = useState<any | null>(null);
  const [topupAmount, setTopupAmount] = useState('150');
  const [spendDesc, setSpendDesc] = useState('Craft Beverage Bar');
  const [spendAmt, setSpendAmt] = useState('65');
  const [cashlessMsg, setCashlessMsg] = useState<string | null>(null);

  const loadTickets = async () => {
    setLoading(true);
    const res = await apiFetch<any[]>('/api/tickets/my');
    if (res.ok && Array.isArray(res.data)) {
      setTickets(res.data);
      const qrs: Record<string, string> = {};
      for (const t of res.data) {
        qrs[t.ticketNumber] = await QRCode.toDataURL(`${window.location.origin}/ticket/verify/${encodeURIComponent(t.token)}`, {
          width: 220,
          margin: 1,
        });
      }
      setQrMap(qrs);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadTickets();
    } else if (isLoaded) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-border bg-card p-8 text-center space-y-4 my-10">
        <TicketIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-extrabold text-foreground">Sign In to View Your Tickets</h2>
        <p className="text-xs text-muted-foreground">
          Access your QR passes, transfer tickets to friends, and download PDF passes.
        </p>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('bookmyte:return-url', '/my-tickets');
            onNavigate('/login');
          }}
          className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  const filteredTickets = tickets.filter((t) =>
    tab === 'upcoming'
      ? ['VALID', 'CHECKED_IN'].includes(t.status) && !['COMPLETED', 'CANCELLED'].includes(t.eventStatus)
      : !['VALID', 'CHECKED_IN'].includes(t.status) || ['COMPLETED', 'CANCELLED'].includes(t.eventStatus)
  );

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTicket) return;
    setTransferStatus(null);
    const res = await apiFetch('/api/tickets/transfer', {
      method: 'POST',
      body: JSON.stringify({
        ticketId: transferTicket.id,
        newName: transferName,
        newEmail: transferEmail,
      }),
    });
    if (!res.ok) {
      setTransferStatus(res.data?.error || 'Transfer failed.');
      return;
    }
    setTransferTicket(null);
    setTransferName('');
    setTransferEmail('');
    loadTickets();
  };

  const openCashless = async (t: any) => {
    setCashlessTicket(t);
    setCashlessMsg(null);
    const res = await apiFetch(`/api/tickets/${t.id}/cashless`);
    if (res.ok) setCashlessData(res.data);
  };

  const handleTopup = async () => {
    if (!cashlessTicket) return;
    const cents = Math.round(Number(topupAmount) * 100);
    const res = await apiFetch('/api/cashless/topup', {
      method: 'POST',
      body: JSON.stringify({ ticketId: cashlessTicket.id, amountCents: cents }),
    });
    if (res.ok) {
      setCashlessMsg(`Added ${formatZarFromCents(cents)} to RFID balance.`);
      openCashless(cashlessTicket);
    } else {
      setCashlessMsg(res.data?.error || 'Top-up failed.');
    }
  };

  const handleSpend = async () => {
    if (!cashlessTicket) return;
    const cents = Math.round(Number(spendAmt) * 100);
    const res = await apiFetch('/api/cashless/spend', {
      method: 'POST',
      body: JSON.stringify({ ticketId: cashlessTicket.id, description: spendDesc, amountCents: cents }),
    });
    if (res.ok) {
      setCashlessMsg(`Spent ${formatZarFromCents(cents)} at ${spendDesc}.`);
      openCashless(cashlessTicket);
    } else {
      setCashlessMsg(res.data?.error || 'Spend failed.');
    }
  };

  const pdfPayload = filteredTickets.map((t) => ({
    ticketNumber: t.ticketNumber,
    token: t.token,
    attendeeName: t.attendeeName,
    attendeeEmail: t.attendeeEmail,
    ticketType: t.type,
    eventName: t.eventName,
    eventDate: t.eventDate,
    startTime: t.startTime,
    venue: t.venue,
    orderNumber: t.orderNumber,
  }));

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">
            My Tickets
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Present your QR code at the venue gate or download printable PDF passes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {pdfPayload.length > 1 && <BulkTicketPdfButton tickets={pdfPayload} />}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
            <button
              type="button"
              onClick={() => setTab('upcoming')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${tab === 'upcoming' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
            >
              Active & Upcoming
            </button>
            <button
              type="button"
              onClick={() => setTab('past')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${tab === 'past' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
            >
              Past / Refunded
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">Loading your tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3">
          <p className="text-sm font-bold text-foreground">No tickets in this tab yet</p>
          <p className="text-xs text-muted-foreground">
            Checked out as a guest previously? Visit My Orders to claim guest purchases linked to your email.
          </p>
          <div className="flex justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('/discover')}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
            >
              Explore Events
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/my-orders')}
              className="rounded-xl border border-border px-4 py-2 text-xs font-bold"
            >
              Check Guest Orders
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTickets.map((t, idx) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row gap-5 justify-between">
              <div className="flex gap-4">
                {qrMap[t.ticketNumber] ? (
                  <img
                    src={qrMap[t.ticketNumber]}
                    alt={t.ticketNumber}
                    className="h-28 w-28 rounded-xl border border-border bg-white p-1.5 shrink-0"
                  />
                ) : (
                  <div className="h-28 w-28 rounded-xl bg-muted shrink-0" />
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                    <span>{t.ticketNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span className={t.status === 'VALID' ? 'text-emerald-600 font-bold' : 'font-bold'}>{t.status}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-foreground">{t.eventName}</h3>
                  <div className="text-xs text-muted-foreground">
                    {t.eventDate} {t.startTime ? `· ${t.startTime}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.venue}</div>
                  <div className="text-xs font-semibold text-foreground pt-1">
                    {t.type} · {t.attendeeName}
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                <TicketPdfButton ticket={pdfPayload[idx]} />
                {t.status === 'VALID' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTicket(t);
                      setTransferStatus(null);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
                  >
                    <Send size={13} />
                    Transfer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openCashless(t)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
                >
                  <Wallet size={13} />
                  RFID Wallet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transfer Modal */}
      {transferTicket && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleTransfer} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-base font-extrabold text-foreground">Transfer Pass {transferTicket.ticketNumber}</h3>
            <p className="text-xs text-muted-foreground">
              Enter the recipient's full name and email. Ownership transfers immediately upon submission.
            </p>
            <input
              type="text"
              required
              value={transferName}
              onChange={(e) => setTransferName(e.target.value)}
              placeholder="Recipient Full Name"
              className="onboarding-input"
            />
            <input
              type="email"
              required
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="onboarding-input"
            />
            {transferStatus && <p className="text-xs font-semibold text-destructive">{transferStatus}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTransferTicket(null)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground">
                Confirm Transfer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cashless RFID Modal */}
      {cashlessTicket && cashlessData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] text-muted-foreground">{cashlessData.cashlessNumber}</span>
                <h3 className="text-base font-extrabold text-foreground">Cashless Event Wallet</h3>
              </div>
              <div className="font-mono text-xl font-extrabold text-foreground tabular-nums">
                {formatZarFromCents(cashlessData.cashlessBalance)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-border p-3 space-y-2">
                <label className="text-[11px] font-bold text-foreground block">Top-up (ZAR)</label>
                <div className="flex gap-2">
                  <input type="number" min="10" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} className="onboarding-input py-1.5 text-xs" />
                  <button type="button" onClick={handleTopup} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground whitespace-nowrap">
                    Top Up
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-border p-3 space-y-2">
                <label className="text-[11px] font-bold text-foreground block">Simulate Bar/Vendor Spend</label>
                <div className="flex gap-2">
                  <input type="number" min="1" value={spendAmt} onChange={(e) => setSpendAmt(e.target.value)} className="onboarding-input py-1.5 text-xs w-20" />
                  <button type="button" onClick={handleSpend} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground whitespace-nowrap">
                    Spend
                  </button>
                </div>
              </div>
            </div>

            {cashlessMsg && <p className="text-xs font-bold text-foreground">{cashlessMsg}</p>}

            <div className="max-h-40 overflow-y-auto divide-y divide-border border border-border rounded-xl text-xs">
              {(cashlessData.transactions || []).length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No cashless transactions yet.</div>
              ) : (
                cashlessData.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between px-3.5 py-2.5">
                    <span>{tx.description}</span>
                    <span className={`font-mono font-bold tabular-nums ${tx.amount >= 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                      {tx.amount >= 0 ? '+' : ''}
                      {formatZarFromCents(tx.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setCashlessTicket(null)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MyOrdersPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, isSignedIn, isLoaded } = useAuthContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [unclaimedCount, setUnclaimedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [claimCode, setClaimCode] = useState('');
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    const res = await apiFetch('/api/orders/my');
    if (res.ok && res.data) {
      setOrders(res.data.orders || []);
      setUnclaimedCount(res.data.unclaimedGuestOrdersCount || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) loadOrders();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn]);

  const sendClaimCode = async () => {
    const res = await apiFetch('/api/auth/request-verification', { method: 'POST' });
    setClaimMsg(res.data?.message || 'Verification code sent.');
  };

  const claimGuestOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/orders/claim', {
      method: 'POST',
      body: JSON.stringify({ verificationCode: claimCode }),
    });
    setClaimMsg(res.data?.message || res.data?.error);
    if (res.ok) {
      setClaimCode('');
      loadOrders();
    }
  };

  const submitRefundRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrder) return;
    const res = await apiFetch(`/api/orders/${encodeURIComponent(refundOrder.orderNumber)}/refund-request`, {
      method: 'POST',
      body: JSON.stringify({ reason: refundReason }),
    });
    if (res.ok) {
      setRefundOrder(null);
      setRefundReason('');
      setRefundMsg('Refund request submitted for organiser / admin review.');
      loadOrders();
    } else {
      setRefundMsg(res.data?.error || 'Could not submit refund request.');
    }
  };

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-border bg-card p-8 text-center space-y-4 my-10">
        <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-extrabold text-foreground">Sign In to View Orders</h2>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('bookmyte:return-url', '/my-orders');
            onNavigate('/login');
          }}
          className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">
          My Orders
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Track purchases, claim guest checkout orders via verified email ownership, and request refunds.
        </p>
      </div>

      {unclaimedCount > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-foreground">
                {unclaimedCount} Guest Order{unclaimedCount > 1 ? 's' : ''} Found for {user?.primaryEmailAddress?.emailAddress}
              </h2>
              <p className="text-xs text-muted-foreground">
                Verify ownership of your email address to link these guest purchases to your account securely.
              </p>
            </div>
            {!user?.emailVerified && (
              <button
                type="button"
                onClick={sendClaimCode}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted whitespace-nowrap"
              >
                Send Verification Code
              </button>
            )}
          </div>

          <form onSubmit={claimGuestOrders} className="flex flex-wrap gap-2.5">
            {!user?.emailVerified && (
              <input
                type="text"
                required
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                placeholder="Enter email verification code"
                className="onboarding-input w-64 text-xs"
              />
            )}
            <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground">
              Claim Guest Purchases
            </button>
          </form>
          {claimMsg && <p className="text-xs font-semibold text-foreground">{claimMsg}</p>}
        </div>
      )}

      {refundMsg && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold text-foreground">
          {refundMsg}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-muted-foreground">Loading order history...</div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3">
          <p className="text-sm font-bold text-foreground">No orders linked to this account yet</p>
          <button
            type="button"
            onClick={() => onNavigate('/discover')}
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
          >
            Discover Events
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span>{o.orderNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-foreground">{o.status}</span>
                  </div>
                  <h3 className="text-base font-extrabold text-foreground mt-0.5">{o.eventName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {o.eventDate} · {o.venue} · {(o.tickets || []).length} pass(es)
                  </p>
                </div>

                <div className="text-right space-y-1.5">
                  <div className="font-mono text-lg font-extrabold text-foreground tabular-nums">
                    {formatZarFromCents(o.totalCents ?? o.total * 100)}
                  </div>
                  {['PAID', 'PARTIALLY_REFUNDED'].includes(o.status) && (
                    <button
                      type="button"
                      onClick={() => setRefundOrder(o)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                    >
                      Request Refund
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {refundOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submitRefundRequest} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-base font-extrabold text-foreground">Request Refund · {refundOrder.orderNumber}</h3>
            <textarea
              required
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Explain why you are requesting a refund..."
              className="onboarding-input"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRefundOrder(null)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground">
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function CustomerProfilePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, isSignedIn, isLoaded, refreshMe } = useAuthContext();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [verCode, setVerCode] = useState('');
  const [verMsg, setVerMsg] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setCity(user.city || '');
    }
  }, [user]);

  const loadExtras = async () => {
    const [favRes, notifRes] = await Promise.all([apiFetch('/api/favourites'), apiFetch('/api/notifications/my')]);
    if (favRes.ok && Array.isArray(favRes.data)) setFavourites(favRes.data);
    if (notifRes.ok && Array.isArray(notifRes.data)) setNotifications(notifRes.data);
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) loadExtras();
  }, [isLoaded, isSignedIn]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-border bg-card p-8 text-center space-y-4 my-10">
        <h2 className="text-lg font-extrabold text-foreground">Sign In to Manage Profile</h2>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('bookmyte:return-url', '/profile');
            onNavigate('/login');
          }}
          className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ firstName, lastName, phone, city }),
    });
    if (res.ok) {
      setSaveMsg('Profile updated.');
      refreshMe();
    }
  };

  const requestCode = async () => {
    const res = await apiFetch('/api/auth/request-verification', { method: 'POST' });
    setVerMsg(res.data?.message || 'Verification issued.');
    loadExtras();
  };

  const confirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verCode }),
    });
    if (res.ok) {
      setVerMsg('Email verified!');
      refreshMe();
    } else {
      setVerMsg(res.data?.error || 'Invalid code.');
    }
  };

  const retryEmail = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/retry`, { method: 'POST' });
    loadExtras();
  };

  return (
    <div className="space-y-8 pb-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">
        Account Profile
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={saveProfile} className="lg:col-span-6 rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-base font-extrabold text-foreground">Personal Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[11px] font-bold">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="onboarding-input" />
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="onboarding-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-[11px] font-bold">Mobile Number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="onboarding-input" />
            </div>
            <div>
              <label className="block mb-1 text-[11px] font-bold">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cape Town" className="onboarding-input" />
            </div>
          </div>
          {saveMsg && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{saveMsg}</p>}
          <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground">
            Save Changes
          </button>
        </form>

        <div className="lg:col-span-6 rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-foreground">Email Verification</h2>
              <p className="text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            {user?.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                <MailCheck size={16} /> Verified
              </span>
            ) : (
              <button type="button" onClick={requestCode} className="rounded-xl border border-border px-3.5 py-2 text-xs font-bold hover:bg-muted">
                Send Code
              </button>
            )}
          </div>
          {!user?.emailVerified && (
            <form onSubmit={confirmVerification} className="flex gap-2">
              <input
                value={verCode}
                onChange={(e) => setVerCode(e.target.value)}
                placeholder="Enter verification code"
                className="onboarding-input text-xs flex-1"
              />
              <button type="submit" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground">
                Verify
              </button>
            </form>
          )}
          {verMsg && <p className="text-xs font-semibold text-foreground">{verMsg}</p>}

          <div className="pt-4 border-t border-border">
            <h3 className="text-xs font-extrabold text-foreground mb-2 flex items-center gap-1.5">
              <Heart size={14} /> Saved Favourites ({favourites.length})
            </h3>
            {favourites.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved events yet.</p>
            ) : (
              <div className="space-y-1.5">
                {favourites.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onNavigate(`/events/${f.slug || f.eventId}`)}
                    className="w-full text-left flex justify-between rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
                  >
                    <span className="font-bold text-foreground">{f.eventName}</span>
                    <span className="text-muted-foreground">{f.dateText}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Log */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
            <Bell size={16} /> Notifications & Dispatch Log
          </h2>
          <button type="button" onClick={loadExtras} className="text-xs font-bold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div className="divide-y divide-border">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No notifications recorded yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-foreground">{n.title}</div>
                  <div className="text-muted-foreground mt-0.5">{n.message}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">
                    {n.channel} · {n.status}
                  </span>
                  {n.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryEmail(n.id)}
                      className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold hover:bg-muted"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function PublicTicketVerifyPage({ token, onNavigate }: { token: string; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/tickets/verify/${encodeURIComponent(token)}`).then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.data?.error || 'Ticket not found.');
    });
  }, [token]);

  return (
    <div className="max-w-md mx-auto my-12 rounded-2xl border border-border bg-card p-8 text-center space-y-4">
      <QrCode className="mx-auto h-10 w-10 text-foreground" />
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground">
        Ticket Authenticity Check
      </h1>
      {error ? (
        <p className="text-xs font-semibold text-destructive">{error}</p>
      ) : !data ? (
        <p className="text-xs text-muted-foreground">Verifying token...</p>
      ) : (
        <div className="rounded-xl border border-border bg-background p-4 text-left text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-mono font-extrabold text-foreground">{data.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ticket #</span>
            <span className="font-mono font-bold">{data.ticketNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Event</span>
            <span className="font-bold">{data.eventName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Holder</span>
            <span className="font-bold">{data.attendeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tier</span>
            <span>{data.type}</span>
          </div>
        </div>
      )}
      <button type="button" onClick={() => onNavigate('/discover')} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground">
        Go to Marketplace
      </button>
    </div>
  );
}
