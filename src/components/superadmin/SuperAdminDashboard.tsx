import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  LayoutDashboard,
  Percent,
  RefreshCw,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatZarFromCents } from '../../lib/api.ts';
import { useAuthContext } from '../../lib/clerk-wrapper.tsx';

export type AdminSection =
  | 'overview'
  | 'businesses'
  | 'events'
  | 'customers'
  | 'transactions'
  | 'payouts'
  | 'refunds'
  | 'reports'
  | 'settings'
  | 'audit-logs';

export default function SuperAdminDashboard({
  section,
  onNavigate,
}: {
  section: AdminSection;
  onNavigate: (path: string) => void;
}) {
  const { isSignedIn, isLoaded, meData } = useAuthContext();
  const [data, setData] = useState<any | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    platformName: 'Howler Tickets',
    currency: 'ZAR',
    platformFeePercent: 5,
    platformFixedFee: 10,
    supportEmail: 'support@howlertickets.com',
    businessApprovalRequired: true,
    eventApprovalRequired: false,
  });

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedBiz, setSelectedBiz] = useState<any | null>(null);
  const [payoutForm, setPayoutForm] = useState({ businessId: '', amount: 100, notes: '' });
  const [ruleForm, setRuleForm] = useState({ scope: 'PLATFORM', businessId: '', commissionBps: 500, fixedFeeCents: 0, bookingFeeBps: 350 });

  const loadAdmin = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const [dashRes, setRes, rulesRes] = await Promise.all([
      apiFetch(`/api/admin/dashboard?${params.toString()}`),
      apiFetch('/api/admin/settings'),
      apiFetch('/api/admin/commission-rules'),
    ]);
    if (dashRes.ok) {
      setData(dashRes.data);
      if (!payoutForm.businessId && dashRes.data?.businesses?.[0]) {
        setPayoutForm((p) => ({ ...p, businessId: String(dashRes.data.businesses[0].id) }));
      }
    } else {
      setErrorMsg(dashRes.data?.error || 'Super Admin privileges required.');
    }
    if (setRes.ok && setRes.data) {
      setSettings({
        ...setRes.data,
        businessApprovalRequired: setRes.data.businessApprovalRequired === 1,
        eventApprovalRequired: setRes.data.eventApprovalRequired === 1,
      });
    }
    if (rulesRes.ok && Array.isArray(rulesRes.data)) setRules(rulesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) loadAdmin();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, dateFrom, dateTo]);

  if (isLoaded && (!isSignedIn || !['SUPER_ADMIN', 'ADMIN'].includes(meData?.platformRole || ''))) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-border bg-card p-8 text-center space-y-4 my-10">
        <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
        <h2 className="text-xl font-extrabold text-foreground">Super Admin Governance Portal</h2>
        <p className="text-xs text-muted-foreground">
          Restricted access. Please sign in with an authorized platform administrator account.
        </p>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('event-check-in:return-url', '/admin');
            onNavigate('/login');
          }}
          className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground"
        >
          Sign In as Admin
        </button>
      </div>
    );
  }

  const updateBusinessStatus = async (bizId: number, payload: any) => {
    setErrorMsg(null);
    const res = await apiFetch(`/api/admin/businesses/${bizId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setNotice(`Business #${bizId} updated.`);
      loadAdmin();
    } else {
      setErrorMsg(res.data?.error || 'Update failed.');
    }
  };

  const moderateEvent = async (eventId: number, payload: any) => {
    const res = await apiFetch(`/api/admin/events/${eventId}/moderate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setNotice(`Event #${eventId} updated.`);
      loadAdmin();
    }
  };

  const processRefund = async (refundId: number, decision: 'APPROVE' | 'REJECT') => {
    const res = await apiFetch(`/api/admin/refunds/${refundId}/process`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    if (res.ok) {
      setNotice(`Refund #${refundId} ${decision === 'APPROVE' ? 'approved & reversed' : 'rejected'}.`);
      loadAdmin();
    } else {
      setErrorMsg(res.data?.error || 'Refund failed.');
    }
  };

  const dispatchPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await apiFetch('/api/admin/payouts', {
      method: 'POST',
      body: JSON.stringify(payoutForm),
    });
    if (res.ok) {
      setNotice(`Payout ${res.data.payout.reference} disbursed.`);
      loadAdmin();
    } else {
      setErrorMsg(res.data?.error || 'Payout failed.');
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setNotice('Platform settings saved.');
      loadAdmin();
    }
  };

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/commission-rules', {
      method: 'POST',
      body: JSON.stringify(ruleForm),
    });
    if (res.ok) {
      setNotice('Commission rule saved.');
      loadAdmin();
    }
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems: Array<{ id: AdminSection; label: string; path: string; icon: any }> = [
    { id: 'overview', label: 'Overview', path: '/admin', icon: LayoutDashboard },
    { id: 'businesses', label: 'Businesses', path: '/admin/businesses', icon: Building2 },
    { id: 'events', label: 'Events', path: '/admin/events', icon: CalendarDays },
    { id: 'customers', label: 'Customers', path: '/admin/customers', icon: Users },
    { id: 'transactions', label: 'Transactions', path: '/admin/transactions', icon: CreditCard },
    { id: 'payouts', label: 'Payouts', path: '/admin/payouts', icon: Wallet },
    { id: 'refunds', label: 'Refunds', path: '/admin/refunds', icon: RefreshCw },
    { id: 'reports', label: 'Reports', path: '/admin/reports', icon: FileText },
    { id: 'settings', label: 'Settings & Fees', path: '/admin/settings', icon: Settings },
    { id: 'audit-logs', label: 'Audit Logs', path: '/admin/audit-logs', icon: ShieldAlert },
  ];

  const summary = data?.summary || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-16">
      <aside className="lg:col-span-3">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <div className="px-2 pb-2 border-b border-border">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Platform Control</div>
            <div className="text-sm font-extrabold text-foreground">Super Admin</div>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                    section === item.id
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-foreground">
            {notice}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-bold text-destructive">
            {errorMsg}
          </div>
        )}

        {loading && !data ? (
          <div className="py-16 text-center text-xs text-muted-foreground">Loading platform telemetry...</div>
        ) : null}

        {/* Overview */}
        {section === 'overview' && data && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Marketplace Overview</h1>
                <p className="text-xs text-muted-foreground">Live PostgreSQL aggregates across all businesses & orders</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="onboarding-input py-1.5 w-auto text-xs" />
                <span className="text-muted-foreground">to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="onboarding-input py-1.5 w-auto text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Ticket Revenue', val: formatZarFromCents(summary.totalRevenueCents) },
                { label: 'Platform Commission', val: formatZarFromCents(summary.platformCommissionCents) },
                { label: 'Pending Payouts', val: formatZarFromCents(summary.pendingPayoutCents) },
                { label: 'Refunded Volume', val: formatZarFromCents(summary.refundedAmtCents) },
                { label: 'Businesses (Active)', val: `${summary.totalBusinesses} (${summary.activeBusinesses})` },
                { label: 'Events (Published)', val: `${summary.totalEvents} (${summary.publishedEvents})` },
                { label: 'Registered Customers', val: String(summary.totalCustomers ?? 0) },
                { label: 'Guest Orders', val: String(summary.guestPurchases ?? 0) },
                { label: 'Tickets Sold', val: String(summary.ticketsSold ?? 0) },
                { label: 'Gate Check-Ins', val: String(summary.checkedIn ?? 0) },
                { label: 'Transactions', val: String(summary.totalTransactions ?? 0) },
                { label: 'Failed Payments', val: String(summary.failedTransactions ?? 0) },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-[11px] text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 font-mono text-lg font-extrabold text-foreground tabular-nums">{kpi.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Businesses */}
        {section === 'businesses' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Businesses & Verification</h1>
            <div className="space-y-3">
              {(data.businesses || []).map((b: any) => (
                <div key={b.id} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {b.status} · KYC: {b.verificationStatus} · {b.type}
                    </div>
                    <h3 className="text-base font-extrabold text-foreground mt-0.5">{b.name}</h3>
                    <div className="text-xs text-muted-foreground">
                      {b.email} · Gross: {formatZarFromCents(b.grossSalesCents ?? b.grossSales * 100)} · Pending: {formatZarFromCents(b.pendingPayoutCents ?? b.pendingPayout * 100)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" onClick={() => setSelectedBiz(b)} className="rounded-lg border border-border px-3 py-1.5 font-bold hover:bg-muted">
                      Inspect
                    </button>
                    {b.status !== 'ACTIVE' && (
                      <button type="button" onClick={() => updateBusinessStatus(b.id, { status: 'ACTIVE', verificationStatus: 'VERIFIED' })} className="rounded-lg bg-primary px-3 py-1.5 font-extrabold text-primary-foreground">
                        Approve & Activate
                      </button>
                    )}
                    {b.status === 'ACTIVE' && (
                      <button type="button" onClick={() => updateBusinessStatus(b.id, { status: 'SUSPENDED' })} className="rounded-lg border border-destructive/40 px-3 py-1.5 font-bold text-destructive">
                        Suspend
                      </button>
                    )}
                    {b.status === 'PENDING' || b.status === 'UNDER_REVIEW' ? (
                      <button type="button" onClick={() => updateBusinessStatus(b.id, { status: 'REJECTED', verificationStatus: 'REJECTED', rejectionReason: 'Incomplete verification documents.' })} className="rounded-lg border border-border px-3 py-1.5 font-bold">
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {selectedBiz && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-3 text-xs">
                  <h3 className="text-base font-extrabold text-foreground">{selectedBiz.name} · Verification Details</h3>
                  <div><strong>Email:</strong> {selectedBiz.email}</div>
                  <div><strong>Reg #:</strong> {selectedBiz.registrationNumber || '—'} · <strong>Tax #:</strong> {selectedBiz.taxNumber || '—'}</div>
                  <div><strong>Bank:</strong> {selectedBiz.bankName || '—'} · Acc: {selectedBiz.bankAccountNumber || '—'} · Branch: {selectedBiz.bankBranchCode || '—'}</div>
                  <div><strong>Payout Email:</strong> {selectedBiz.payoutEmail || selectedBiz.email}</div>
                  <div className="pt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setSelectedBiz(null)} className="rounded-xl border border-border px-4 py-2 font-bold">
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Events Moderation */}
        {section === 'events' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">All Platform Events</h1>
            <div className="space-y-3">
              {(data.events || []).map((e: any) => (
                <div key={e.id} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {e.status} · {e.isFeatured ? 'FEATURED' : 'Standard'} · {e.businessName}
                    </div>
                    <h3 className="text-base font-extrabold text-foreground">{e.name}</h3>
                    <div className="text-xs text-muted-foreground">{e.dateText} · {e.city || e.address}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" onClick={() => moderateEvent(e.id, { isFeatured: !e.isFeatured })} className="rounded-lg border border-border px-3 py-1.5 font-bold hover:bg-muted">
                      {e.isFeatured ? 'Unfeature' : 'Feature'}
                    </button>
                    {e.status !== 'PUBLISHED' && (
                      <button type="button" onClick={() => moderateEvent(e.id, { status: 'PUBLISHED' })} className="rounded-lg bg-primary px-3 py-1.5 font-extrabold text-primary-foreground">
                        Approve / Publish
                      </button>
                    )}
                    {e.status !== 'SUSPENDED' && (
                      <button type="button" onClick={() => moderateEvent(e.id, { status: 'SUSPENDED' })} className="rounded-lg border border-border px-3 py-1.5 font-bold">
                        Suspend
                      </button>
                    )}
                    {e.status !== 'CANCELLED' && (
                      <button type="button" onClick={() => moderateEvent(e.id, { status: 'CANCELLED' })} className="rounded-lg border border-destructive/40 px-3 py-1.5 font-bold text-destructive">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customers */}
        {section === 'customers' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Registered Customers ({(data.customers || []).length})</h1>
            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone / City</th>
                    <th className="px-4 py-3">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data.customers || []).map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-bold">{c.firstName} {c.lastName}</td>
                      <td className="px-4 py-3">{c.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.phone || '—'} · {c.city || '—'}</td>
                      <td className="px-4 py-3 font-mono font-bold">{c.emailVerified ? 'VERIFIED' : 'PENDING'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions */}
        {section === 'transactions' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Payment Transactions</h1>
            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data.transactions || []).map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 font-mono font-bold">{tx.reference}</td>
                      <td className="px-4 py-3 font-mono">{tx.orderNumber}</td>
                      <td className="px-4 py-3 uppercase">{tx.provider}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(tx.amountCents)}</td>
                      <td className="px-4 py-3 font-bold">{tx.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payouts */}
        {section === 'payouts' && data && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Payouts Management</h1>
            <form onSubmit={dispatchPayout} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block mb-1 text-[11px] font-bold">Business</label>
                <select value={payoutForm.businessId} onChange={(e) => setPayoutForm({ ...payoutForm, businessId: e.target.value })} className="onboarding-input py-2 text-xs">
                  {(data.businesses || []).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name} (Pending {formatZarFromCents(b.pendingPayoutCents ?? 0)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Amount (ZAR)</label>
                <input type="number" min="1" value={payoutForm.amount} onChange={(e) => setPayoutForm({ ...payoutForm, amount: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Notes</label>
                <input value={payoutForm.notes} onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })} placeholder="Weekly settlement" className="onboarding-input py-2 text-xs" />
              </div>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">
                Disburse Payout
              </button>
            </form>

            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data.payouts || []).map((p: any) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-bold">{p.reference}</td>
                      <td className="px-4 py-3">{p.businessName}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(p.amountCents ?? p.amount * 100)}</td>
                      <td className="px-4 py-3 font-bold">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Refunds */}
        {section === 'refunds' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Platform Refunds Queue</h1>
            {(data.refunds || []).length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
                No refund requests recorded.
              </div>
            ) : (
              (data.refunds || []).map((r: any) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-mono font-bold">{r.orderNumber} · {r.businessName} · {r.status}</div>
                    <div className="mt-0.5 text-foreground font-semibold">{r.requesterEmail} — {formatZarFromCents(r.amountCents)}</div>
                    <div className="text-muted-foreground">{r.reason}</div>
                  </div>
                  {r.status === 'REQUESTED' && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => processRefund(r.id, 'APPROVE')} className="rounded-lg bg-primary px-3 py-1.5 font-extrabold text-primary-foreground">
                        Approve & Reverse
                      </button>
                      <button type="button" onClick={() => processRefund(r.id, 'REJECT')} className="rounded-lg border border-border px-3 py-1.5 font-bold">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Reports */}
        {section === 'reports' && data && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Financial & Marketplace Reports</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <h2 className="text-sm font-extrabold">Orders & Revenue CSV</h2>
                <p className="text-xs text-muted-foreground">Download all orders with gross sales, commission, and status.</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv('platform-orders.csv', [
                      ['OrderNumber', 'Business', 'Event', 'BuyerEmail', 'TotalCents', 'Status'],
                      ...(data.orders || []).map((o: any) => [o.orderNumber, o.businessName, o.eventName, o.buyerEmail, String(o.totalCents ?? o.total * 100), o.status]),
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
                >
                  <Download size={14} /> Download Orders Report
                </button>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
                <h2 className="text-sm font-extrabold">Businesses Settlement CSV</h2>
                <p className="text-xs text-muted-foreground">Download gross sales, platform fees, and pending payout balances per business.</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv('businesses-settlement.csv', [
                      ['Business', 'Email', 'Status', 'GrossCents', 'PlatformFeeCents', 'PendingPayoutCents'],
                      ...(data.businesses || []).map((b: any) => [b.name, b.email, b.status, String(b.grossSalesCents ?? 0), String(b.platformFeesCents ?? 0), String(b.pendingPayoutCents ?? 0)]),
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground"
                >
                  <Download size={14} /> Download Settlement Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings & Commission Rules */}
        {section === 'settings' && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Platform Settings & Commission Rules</h1>
            <form onSubmit={saveSettings} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-[11px] font-bold">Platform Name</label>
                <input value={settings.platformName} onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Support Email</label>
                <input value={settings.supportEmail} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Default Commission (%)</label>
                <input type="number" value={settings.platformFeePercent} onChange={(e) => setSettings({ ...settings, platformFeePercent: Number(e.target.value) })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Default Fixed Fee (ZAR)</label>
                <input type="number" value={settings.platformFixedFee} onChange={(e) => setSettings({ ...settings, platformFixedFee: Number(e.target.value) })} className="onboarding-input" />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={settings.businessApprovalRequired} onChange={(e) => setSettings({ ...settings, businessApprovalRequired: e.target.checked })} />
                Require Super Admin approval for new businesses
              </label>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={settings.eventApprovalRequired} onChange={(e) => setSettings({ ...settings, eventApprovalRequired: e.target.checked })} />
                Require Super Admin approval before events publish
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground">
                  Save Platform Settings
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <Percent size={15} /> Commission Rules ({rules.length})
              </h2>
              <form onSubmit={createRule} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
                <div>
                  <label className="block mb-1 text-[10px] font-bold">Scope</label>
                  <select value={ruleForm.scope} onChange={(e) => setRuleForm({ ...ruleForm, scope: e.target.value })} className="onboarding-input py-1.5 text-xs">
                    <option value="PLATFORM">PLATFORM</option>
                    <option value="BUSINESS">BUSINESS</option>
                    <option value="EVENT">EVENT</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-[10px] font-bold">Commission BPS (500 = 5%)</label>
                  <input type="number" value={ruleForm.commissionBps} onChange={(e) => setRuleForm({ ...ruleForm, commissionBps: Number(e.target.value) })} className="onboarding-input py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] font-bold">Fixed Cents</label>
                  <input type="number" value={ruleForm.fixedFeeCents} onChange={(e) => setRuleForm({ ...ruleForm, fixedFeeCents: Number(e.target.value) })} className="onboarding-input py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] font-bold">Booking Fee BPS</label>
                  <input type="number" value={ruleForm.bookingFeeBps} onChange={(e) => setRuleForm({ ...ruleForm, bookingFeeBps: Number(e.target.value) })} className="onboarding-input py-1.5 text-xs" />
                </div>
                <button type="submit" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground">
                  Add Rule
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Audit Logs */}
        {section === 'audit-logs' && data && (
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Platform Audit Logs</h1>
            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor / Business</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data.auditLogs || []).map((a: any) => (
                    <tr key={a.log.id}>
                      <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                        {a.log.createdAt ? new Date(a.log.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold">{a.log.action}</td>
                      <td className="px-4 py-3">{a.userName || 'System'} · {a.businessName || 'Platform'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-xs">
                        {a.log.newValue || a.log.metadata || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
