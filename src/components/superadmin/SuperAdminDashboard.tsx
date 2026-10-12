import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  CalendarDays, 
  ShoppingBag, 
  Users, 
  Settings, 
  Plus, 
  MapPin, 
  Ticket, 
  Radio, 
  CreditCard, 
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle,
  FileText,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Mail,
  Zap,
  Percent,
  Coins
} from 'lucide-react';

interface Props {
  user: any;
  basePath: string;
}

export default function SuperAdminDashboard({ user, basePath }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'businesses' | 'payouts' | 'settings' | 'audit'>('overview');
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings state
  const [settingsForm, setSettingsForm] = useState({
    platformName: 'Howler Tickets',
    currency: 'R',
    platformFeePercent: 5,
    platformFixedFee: 10,
    supportEmail: 'support@howlertickets.com',
    businessApprovalRequired: true,
  });

  // Payout Form
  const [payoutForm, setPayoutForm] = useState({
    businessId: '',
    amount: 100,
    notes: '',
  });

  // Refund Order states
  const [refundOrderId, setRefundOrderId] = useState('');
  const [refundStatusMessage, setRefundStatusMessage] = useState('');

  useEffect(() => {
    fetchDashboardData();
    fetchSettings();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/dashboard`, { headers });
      const data = await res.json();
      setMetrics(data);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/settings`, { headers });
      const data = await res.json();
      if (data) {
        setSettingsForm({
          platformName: data.platformName,
          currency: data.currency,
          platformFeePercent: data.platformFeePercent,
          platformFixedFee: data.platformFixedFee,
          supportEmail: data.supportEmail,
          businessApprovalRequired: data.businessApprovalRequired === 1,
        });
      }
    } catch (e) {}
  };

  const handleUpdateBusinessStatus = async (bizId: number, status: string) => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/businesses/${bizId}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/settings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        alert('Platform settings saved successfully.');
        fetchSettings();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDispatchPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutForm.businessId) return;
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/payouts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: Number(payoutForm.businessId),
          amount: Number(payoutForm.amount),
          notes: payoutForm.notes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Payout processed successfully!');
        setPayoutForm({ businessId: '', amount: 100, notes: '' });
        fetchDashboardData();
      } else {
        alert(data.error || 'Failed to dispatch payout.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefundOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrderId.trim()) return;
    setRefundStatusMessage('');
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/admin/orders/${refundOrderId}/refund`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setRefundStatusMessage('Order successfully fully refunded and tickets invalidated.');
        setRefundOrderId('');
        fetchDashboardData();
      } else {
        setRefundStatusMessage(data.error || 'Refund transaction failed.');
      }
    } catch (e) {
      setRefundStatusMessage('Error executing refund.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5 text-left">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ShieldCheck size={12} className="text-primary" /> GLOBAL SYSTEM PLATFORM ADMINISTRATION</span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">Super Admin Dashboard</h1>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
        >
          <RefreshCw size={13} /> Refresh Global Stats
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <aside className="space-y-1 md:col-span-1">
          {[
            { id: 'overview', label: 'Platform Summary', icon: LayoutDashboard },
            { id: 'businesses', label: 'Businesses & Approval', icon: Building2 },
            { id: 'payouts', label: 'Payout Dispatcher', icon: CreditCard },
            { id: 'settings', label: 'Platform Settings', icon: Settings },
            { id: 'audit', label: 'System Audit Logs', icon: FileText },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${active ? 'bg-primary text-primary-foreground font-extrabold shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </aside>

        <main className="md:col-span-4 bg-card border border-border/80 rounded-2xl p-6 shadow-xs">
          {loading ? (
            <div className="text-center py-12 text-xs font-bold text-muted-foreground animate-pulse">Syncing platform system logs...</div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left">
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Gross Platform Sales</div>
                  <div className="text-2xl font-extrabold mt-1 text-primary">R{metrics?.summary?.totalRevenue || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Platform Fees Cut: R{metrics?.summary?.platformFees || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Tickets Sold</div>
                  <div className="text-2xl font-extrabold mt-1">{metrics?.summary?.ticketsSold || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Checked In (RFID Sync): {metrics?.summary?.checkedIn || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Active Events</div>
                  <div className="text-2xl font-extrabold mt-1">{metrics?.summary?.activeEvents || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Businesses Registered: {metrics?.summary?.totalBusinesses || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Refunds</div>
                  <div className="text-2xl font-extrabold mt-1 text-destructive">R{metrics?.summary?.refundedAmt || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Invalidated passes</div>
                </div>
              </div>

              {/* Order Refund Form Block */}
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-left max-w-xl">
                <h4 className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Order Cancellation & Full Pass Refund
                </h4>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  Enter an internal order ID to fully refund, add back ticket capacities, and invalidate the QR secure credentials for validation immediately.
                </p>
                <form onSubmit={handleRefundOrder} className="flex gap-2 mt-3.5">
                  <input 
                    required 
                    type="number"
                    placeholder="Enter order ID (e.g. 1)" 
                    value={refundOrderId}
                    onChange={e => setRefundOrderId(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-xs outline-none focus:border-destructive"
                  />
                  <button type="submit" className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-xs font-bold hover:brightness-95">
                    Execute Refund
                  </button>
                </form>
                {refundStatusMessage && (
                  <p className="text-[10px] font-bold text-destructive bg-destructive/10 p-2.5 rounded-lg mt-3 text-center">
                    {refundStatusMessage}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-extrabold border-b border-border/50 pb-2 mb-3 text-left">Registered Tenants / Venue-Businesses</h3>
                <div className="overflow-x-auto text-left">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
                        <th className="py-2.5">Business</th>
                        <th className="py-2.5">Type</th>
                        <th className="py-2.5">Contact Person</th>
                        <th className="py-2.5">Gross Sales</th>
                        <th className="py-2.5">Pending Payout</th>
                        <th className="py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics?.businesses?.map((b: any) => (
                        <tr key={b.id} className="border-b border-border/40 hover:bg-muted/10">
                          <td className="py-3 font-bold">{b.name}</td>
                          <td className="py-3">{b.type}</td>
                          <td className="py-3 text-muted-foreground">{b.contactPerson}</td>
                          <td className="py-3 font-mono">R{b.grossSales}</td>
                          <td className="py-3 font-mono text-emerald-500">R{b.pendingPayout}</td>
                          <td className="py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${b.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'businesses' ? (
            <div className="space-y-6">
              <h3 className="text-sm font-extrabold border-b border-border/40 pb-3 text-left">Tenant Approvals & Operations</h3>
              <div className="space-y-3">
                {metrics?.businesses?.map((b: any) => (
                  <div key={b.id} className="rounded-xl border border-border p-4 bg-muted/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left">
                    <div>
                      <h4 className="text-xs font-extrabold">{b.name}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{b.type} · {b.email} · {b.phone || 'No phone'}</p>
                      {b.description && <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed italic">{b.description}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {b.status === 'PENDING' && (
                        <>
                          <button 
                            onClick={() => handleUpdateBusinessStatus(b.id, 'ACTIVE')}
                            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:brightness-95"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => handleUpdateBusinessStatus(b.id, 'REJECTED')}
                            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:bg-muted"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {b.status === 'ACTIVE' && (
                        <button 
                          onClick={() => handleUpdateBusinessStatus(b.id, 'SUSPENDED')}
                          className="rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-bold hover:brightness-95"
                        >
                          Suspend Business
                        </button>
                      )}
                      {b.status === 'SUSPENDED' && (
                        <button 
                          onClick={() => handleUpdateBusinessStatus(b.id, 'ACTIVE')}
                          className="rounded-lg bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold hover:brightness-95"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'payouts' ? (
            <div className="space-y-6">
              <div className="border-b border-border/40 pb-3 text-left">
                <h3 className="text-sm font-extrabold">Payout Disbursals</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Approve and disburse payout requests from active businesses.</p>
              </div>

              <form onSubmit={handleDispatchPayout} className="flex gap-3 items-end max-w-xl text-left bg-muted/15 p-4 rounded-xl border border-border">
                <label className="flex-1">
                  <span className="block text-[10px] font-bold text-muted-foreground mb-1.5">Select Business</span>
                  <select required value={payoutForm.businessId} onChange={e => setPayoutForm({ ...payoutForm, businessId: e.target.value })} className="onboarding-input">
                    <option value="">Choose business</option>
                    {metrics?.businesses?.filter((b: any) => b.status === 'ACTIVE').map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name} (Max: R{b.pendingPayout})</option>
                    ))}
                  </select>
                </label>
                <label className="w-[120px]">
                  <span className="block text-[10px] font-bold text-muted-foreground mb-1.5">Amount (R)</span>
                  <input required type="number" value={payoutForm.amount} onChange={e => setPayoutForm({ ...payoutForm, amount: Number(e.target.value) })} className="onboarding-input" />
                </label>
                <button type="submit" className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold shrink-0">Dispatch</button>
              </form>

              <div>
                <h4 className="text-xs font-bold border-b border-border/50 pb-2 mb-3 text-left"> payout records</h4>
                <div className="overflow-x-auto text-left">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
                        <th className="py-2.5">Reference</th>
                        <th className="py-2.5">Business</th>
                        <th className="py-2.5">Amount</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics?.payouts?.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/40 hover:bg-muted/10">
                          <td className="py-3 font-mono font-bold">{p.reference}</td>
                          <td className="py-3 font-bold">{p.businessName}</td>
                          <td className="py-3 font-mono text-emerald-500">R{p.amount}</td>
                          <td className="py-3">
                            <span className="rounded-full bg-emerald-500/15 text-emerald-500 px-2.5 py-0.5 text-[9px] font-bold font-mono">
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {metrics?.payouts?.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">No payout cycles recorded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <div className="space-y-6">
              <h3 className="text-sm font-extrabold border-b border-border/40 pb-3 text-left">Global Platform Controls</h3>
              <form onSubmit={handleSaveSettings} className="space-y-4 max-w-xl text-left">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-bold text-muted-foreground mb-1">Platform Name</span>
                    <input required value={settingsForm.platformName} onChange={e => setSettingsForm({ ...settingsForm, platformName: e.target.value })} className="onboarding-input" />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-bold text-muted-foreground mb-1">Currency Symbol</span>
                    <input required value={settingsForm.currency} onChange={e => setSettingsForm({ ...settingsForm, currency: e.target.value })} className="onboarding-input" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-bold text-muted-foreground mb-1">Platform Fee (%)</span>
                    <input type="number" required value={settingsForm.platformFeePercent} onChange={e => setSettingsForm({ ...settingsForm, platformFeePercent: Number(e.target.value) })} className="onboarding-input" />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-bold text-muted-foreground mb-1">Fixed Flat Fee (R)</span>
                    <input type="number" required value={settingsForm.platformFixedFee} onChange={e => setSettingsForm({ ...settingsForm, platformFixedFee: Number(e.target.value) })} className="onboarding-input" />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-[10px] font-bold text-muted-foreground mb-1">Support Contact Email</span>
                  <input required type="email" value={settingsForm.supportEmail} onChange={e => setSettingsForm({ ...settingsForm, supportEmail: e.target.value })} className="onboarding-input" />
                </label>
                <div className="flex items-center gap-3 py-2 border-t border-b border-border/50">
                  <input 
                    type="checkbox" 
                    id="approval-req"
                    checked={settingsForm.businessApprovalRequired} 
                    onChange={e => setSettingsForm({ ...settingsForm, businessApprovalRequired: e.target.checked })}
                    className="h-4 w-4 rounded-md border-border bg-card"
                  />
                  <label htmlFor="approval-req" className="text-xs font-bold text-foreground">Require Admin Approval for new Businesses before selling tickets</label>
                </div>
                <button type="submit" className="rounded-xl bg-primary text-primary-foreground px-5 py-3 text-xs font-extrabold hover:brightness-95">
                  Save Platform Settings
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-sm font-extrabold border-b border-border/40 pb-3 text-left">Real-Time Platform Audit Log Streams</h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto text-left">
                {metrics?.auditLogs?.map((log: any) => (
                  <div key={log.id} className="p-3 bg-muted/10 border border-border/55 rounded-xl text-xs flex justify-between gap-4">
                    <div>
                      <div className="font-bold flex items-center gap-1 text-foreground">
                        <Zap size={11} className="text-primary" /> {log.log.action}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Resource: {log.log.resourceType} (#{log.log.resourceId}) · By {log.userName || 'System'}
                      </div>
                      {log.log.metadata && (
                        <div className="text-[9px] font-mono bg-card px-2 py-1 border border-border/50 mt-1.5 rounded-lg text-muted-foreground">{log.log.metadata}</div>
                      )}
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground shrink-0 mt-0.5">
                      {new Date(log.log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {metrics?.auditLogs?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No audit records found.</p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
