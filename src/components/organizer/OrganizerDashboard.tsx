import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
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
  FileText
} from 'lucide-react';

interface Props {
  user: any;
  basePath: string;
}

export default function OrganizerDashboard({ user, basePath }: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'venues' | 'orders' | 'team'>('dashboard');
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Forms states
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showCreateVenue, setShowCreateVenue] = useState(false);
  const [showCreateTicketType, setShowCreateTicketType] = useState(false);

  // Form inputs
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', country: 'South Africa', capacity: 100 });
  const [eventForm, setEventForm] = useState({ name: '', description: '', category: 'Product · Community', dateText: '15 Dec 2026', startTime: '18:00', venueId: '' });
  const [ticketForm, setTicketForm] = useState({ eventId: '', name: 'General Admission', description: 'Full access pass', price: 89, quantity: 100 });
  const [teamForm, setTeamForm] = useState({ email: '', role: 'CHECK_IN_STAFF' });

  // List of venues
  const [venuesList, setVenuesList] = useState<any[]>([]);
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [teamList, setTeamList] = useState<any[]>([]);

  useEffect(() => {
    fetchMyBusinesses();
  }, []);

  const fetchMyBusinesses = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses/my`, { headers });
      const data = await res.json();
      setBusinesses(data);
      if (data.length > 0) {
        setSelectedBusiness(data[0]);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBusiness) {
      fetchDashboardData();
      fetchVenues();
      fetchEvents();
      fetchTeam();
    }
  }, [selectedBusiness]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses/my/dashboard?businessId=${selectedBusiness.id}`, { headers });
      const data = await res.json();
      setMetrics(data);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchVenues = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/venues?businessId=${selectedBusiness.id}`, { headers });
      const data = await res.json();
      setVenuesList(data);
    } catch (e) {}
  };

  const fetchEvents = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/events/my?businessId=${selectedBusiness.id}`, { headers });
      const data = await res.json();
      setEventsList(data);
    } catch (e) {}
  };

  const fetchTeam = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses/my/team?businessId=${selectedBusiness.id}`, { headers });
      const data = await res.json();
      setTeamList(data);
    } catch (e) {}
  };

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/venues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...venueForm, businessId: selectedBusiness.id }),
      });
      if (res.ok) {
        setShowCreateVenue(false);
        setVenueForm({ name: '', address: '', city: '', country: 'South Africa', capacity: 100 });
        fetchVenues();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...eventForm, businessId: selectedBusiness.id }),
      });
      if (res.ok) {
        setShowCreateEvent(false);
        setEventForm({ name: '', description: '', category: 'Product · Community', dateText: '15 Dec 2026', startTime: '18:00', venueId: '' });
        fetchEvents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTicketType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/ticket-types`, {
        method: 'POST',
        headers,
        body: JSON.stringify(ticketForm),
      });
      if (res.ok) {
        setShowCreateTicketType(false);
        setTicketForm({ eventId: '', name: 'General Admission', description: 'Full access pass', price: 89, quantity: 100 });
        fetchEvents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses/my/team`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...teamForm, businessId: selectedBusiness.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTeamForm({ email: '', role: 'CHECK_IN_STAFF' });
        fetchTeam();
      } else {
        alert(data.error || 'Failed to invite team member.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (businesses.length === 0) {
    return (
      <div className="rounded-3xl bg-card border border-border p-10 text-center max-w-xl mx-auto my-12">
        <div className="h-16 w-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-primary mb-6">
          <LayoutDashboard size={28} />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">Register Your Organiser Profile</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
          Unlock business-level ticketing dashboard, direct ticket payouts, check-in scanning, and event creation features.
        </p>
        <BusinessRegisterForm basePath={basePath} onRegistered={fetchMyBusinesses} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">ORGANISER CONTROL PANEL</span>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight">{selectedBusiness?.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${selectedBusiness?.status === 'ACTIVE' ? 'bg-primary/25 text-foreground' : 'bg-amber-500/25 text-amber-500'}`}>
              {selectedBusiness?.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={selectedBusiness?.id} 
            onChange={(e) => {
              const b = businesses.find(x => x.id === Number(e.target.value));
              if (b) setSelectedBusiness(b);
            }}
            className="rounded-xl border border-input bg-card px-3 py-2 text-xs font-bold outline-none"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <aside className="space-y-1 md:col-span-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'events', label: 'Events & Tickets', icon: Ticket },
            { id: 'venues', label: 'My Venues', icon: MapPin },
            { id: 'orders', label: 'Orders & Sales', icon: ShoppingBag },
            { id: 'team', label: 'Team Roles', icon: Users },
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
            <div className="text-center py-12 text-xs font-bold text-muted-foreground animate-pulse">Syncing dashboard data...</div>
          ) : activeTab === 'dashboard' ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Gross Sales</div>
                  <div className="text-2xl font-extrabold mt-1 text-primary">R{selectedBusiness?.grossSales || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Platform Cut: R{selectedBusiness?.platformFees || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Tickets Issued</div>
                  <div className="text-2xl font-extrabold mt-1">{metrics?.ticketsSold || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Check-in approved: {metrics?.checkedIn || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Payout Balance</div>
                  <div className="text-2xl font-extrabold mt-1 text-emerald-500">R{selectedBusiness?.pendingPayout || 0}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">Disbursed already: R{selectedBusiness?.paidPayout || 0}</div>
                </div>
                <div className="rounded-xl border border-border p-4 bg-muted/20">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Gate Check-in Pace</div>
                  <div className="text-2xl font-extrabold mt-1 text-amber-500">
                    {metrics?.ticketsSold > 0 ? Math.round((metrics?.checkedIn / metrics?.ticketsSold) * 100) : 0}%
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-1">Real-time RFID band sync</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-extrabold border-b border-border/50 pb-2 mb-3">Recent Sales Transactions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
                        <th className="py-2.5">Order</th>
                        <th className="py-2.5">Customer</th>
                        <th className="py-2.5">Event</th>
                        <th className="py-2.5">Paid</th>
                        <th className="py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics?.recentOrders?.map((o: any) => (
                        <tr key={o.id} className="border-b border-border/40 hover:bg-muted/10">
                          <td className="py-2.5 font-mono font-bold text-primary">{o.orderNumber}</td>
                          <td className="py-2.5 font-bold">{o.buyerName}</td>
                          <td className="py-2.5 truncate max-w-[150px]">{o.eventName}</td>
                          <td className="py-2.5 font-mono">R{o.total}</td>
                          <td className="py-2.5">
                            <span className="rounded-full bg-emerald-500/10 text-emerald-500 px-2 py-0.5 text-[9px] font-bold">
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {metrics?.recentOrders?.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground text-[11px]">No sales recorded for this business workspace yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'events' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-sm font-extrabold">Active Events & Ticket Types</h3>
                {selectedBusiness?.status === 'ACTIVE' ? (
                  <button 
                    onClick={() => setShowCreateEvent(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-extrabold hover:brightness-95 transition"
                  >
                    <Plus size={13} /> Create Event
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-lg">Account PENDING approval to publish events</span>
                )}
              </div>

              {showCreateEvent && (
                <form onSubmit={handleCreateEvent} className="bg-muted/20 border border-border rounded-xl p-4 space-y-4 text-left">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Event Name</span>
                      <input required value={eventForm.name} onChange={e => setEventForm({ ...eventForm, name: e.target.value })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Category</span>
                      <input required value={eventForm.category} onChange={e => setEventForm({ ...eventForm, category: e.target.value })} className="onboarding-input" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[10px] font-bold text-muted-foreground mb-1">Description</span>
                    <textarea rows={2} required value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} className="onboarding-input resize-none" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Venue Place</span>
                      <select required value={eventForm.venueId} onChange={e => setEventForm({ ...eventForm, venueId: e.target.value })} className="onboarding-input">
                        <option value="">Select venue</option>
                        {venuesList.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Date Headline</span>
                      <input required value={eventForm.dateText} onChange={e => setEventForm({ ...eventForm, dateText: e.target.value })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Start Time</span>
                      <input required value={eventForm.startTime} onChange={e => setEventForm({ ...eventForm, startTime: e.target.value })} className="onboarding-input" />
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowCreateEvent(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">Cancel</button>
                    <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold">Publish Event</button>
                  </div>
                </form>
              )}

              {showCreateTicketType && (
                <form onSubmit={handleCreateTicketType} className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4 text-left">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Select Event</span>
                      <select required value={ticketForm.eventId} onChange={e => setTicketForm({ ...ticketForm, eventId: e.target.value })} className="onboarding-input">
                        <option value="">Choose event</option>
                        {eventsList.map(ev => (
                          <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Ticket Tier Name</span>
                      <input required value={ticketForm.name} onChange={e => setTicketForm({ ...ticketForm, name: e.target.value })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Price (R)</span>
                      <input required type="number" value={ticketForm.price} onChange={e => setTicketForm({ ...ticketForm, price: Number(e.target.value) })} className="onboarding-input" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Total Capacity</span>
                      <input required type="number" value={ticketForm.quantity} onChange={e => setTicketForm({ ...ticketForm, quantity: Number(e.target.value) })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Description</span>
                      <input required value={ticketForm.description} onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })} className="onboarding-input" />
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowCreateTicketType(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">Cancel</button>
                    <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold">Add Ticket Tier</button>
                  </div>
                </form>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {eventsList.map((e) => (
                  <div key={e.id} className="rounded-xl border border-border p-4 bg-muted/10 relative overflow-hidden">
                    <div className="font-mono text-[9px] font-bold uppercase text-primary">{e.category}</div>
                    <h4 className="text-sm font-extrabold mt-1">{e.name}</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <CalendarDays size={11} /> {e.dateText} · {e.venueName}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{e.description}</p>
                    <button 
                      onClick={() => {
                        setTicketForm({ ...ticketForm, eventId: e.id });
                        setShowCreateTicketType(true);
                      }}
                      className="mt-4 w-full flex items-center justify-center gap-1 rounded-lg border border-border bg-card py-2 text-[10px] font-bold hover:bg-muted"
                    >
                      <Plus size={11} /> Add Ticket Tier
                    </button>
                  </div>
                ))}
                {eventsList.length === 0 && (
                  <div className="col-span-full py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                    No events published yet.
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'venues' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-sm font-extrabold">Venues & Place Capacities</h3>
                <button 
                  onClick={() => setShowCreateVenue(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-extrabold hover:brightness-95 transition"
                >
                  <Plus size={13} /> Create Venue
                </button>
              </div>

              {showCreateVenue && (
                <form onSubmit={handleCreateVenue} className="bg-muted/20 border border-border rounded-xl p-4 space-y-4 text-left">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Venue/Arena Name</span>
                      <input required value={venueForm.name} onChange={e => setVenueForm({ ...venueForm, name: e.target.value })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Capacity Limit</span>
                      <input type="number" required value={venueForm.capacity} onChange={e => setVenueForm({ ...venueForm, capacity: Number(e.target.value) })} className="onboarding-input" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">Physical Address</span>
                      <input required value={venueForm.address} onChange={e => setVenueForm({ ...venueForm, address: e.target.value })} className="onboarding-input" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-muted-foreground mb-1">City</span>
                      <input required value={venueForm.city} onChange={e => setVenueForm({ ...venueForm, city: e.target.value })} className="onboarding-input" />
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowCreateVenue(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">Cancel</button>
                    <button type="submit" className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold">Save Venue</button>
                  </div>
                </form>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {venuesList.map((v) => (
                  <div key={v.id} className="rounded-xl border border-border p-4 bg-muted/10">
                    <h4 className="text-sm font-extrabold">{v.name}</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin size={11} /> {v.address}, {v.city}
                    </p>
                    <div className="mt-3 flex justify-between items-center bg-card rounded-lg px-3 py-2 text-[10px] border border-border/50">
                      <span>Venue Capacity</span>
                      <strong className="text-primary">{v.capacity} guests max</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'orders' ? (
            <div className="space-y-6">
              <h3 className="text-sm font-extrabold border-b border-border/40 pb-3">Complete Sales Order History</h3>
              <OrdersList businessId={selectedBusiness?.id} basePath={basePath} />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b border-border/40 pb-3 text-left">
                <h3 className="text-sm font-extrabold">Business Roles & Collaborators</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Invite teammates and staff users to scan check-ins, run financials, or manage ticket inventories.</p>
              </div>

              <form onSubmit={handleAddTeamMember} className="flex gap-3 items-end max-w-xl text-left bg-muted/15 p-4 rounded-xl border border-border">
                <label className="flex-1">
                  <span className="block text-[10px] font-bold text-muted-foreground mb-1.5">Teammate Registered Email</span>
                  <input required type="email" placeholder="staff@example.com" value={teamForm.email} onChange={e => setTeamForm({ ...teamForm, email: e.target.value })} className="onboarding-input" />
                </label>
                <label className="w-[140px]">
                  <span className="block text-[10px] font-bold text-muted-foreground mb-1.5">Assigned Role</span>
                  <select value={teamForm.role} onChange={e => setTeamForm({ ...teamForm, role: e.target.value })} className="onboarding-input">
                    <option value="BUSINESS_ADMIN">Admin</option>
                    <option value="EVENT_MANAGER">Event Manager</option>
                    <option value="FINANCE">Finance</option>
                    <option value="CHECK_IN_STAFF">Check-In Staff</option>
                  </select>
                </label>
                <button type="submit" className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold shrink-0">Invite</button>
              </form>

              <div className="space-y-2">
                {teamList.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3.5 bg-muted/10 border border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/20 text-foreground flex items-center justify-center text-xs font-bold">
                        {m.user.firstName?.[0] || 'U'}
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-bold">{m.user.firstName} {m.user.lastName}</div>
                        <div className="text-[9px] text-muted-foreground">{m.user.email}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-card border border-border/80 px-2.5 py-1 text-[9px] font-mono font-bold text-muted-foreground">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Sub-component: Business Registration Form
function BusinessRegisterForm({ basePath, onRegistered }: { basePath: string, onRegistered: () => void }) {
  const [form, setForm] = useState({ name: '', type: 'Nightclub', contactPerson: '', email: '', phone: '', country: 'South Africa', address: '', website: '', description: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onRegistered();
      } else {
        alert('Failed to register business. Ensure email is unique.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 text-left space-y-4 border-t border-border/50 pt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[10px] font-bold text-muted-foreground mb-1">Business Name</span>
          <input required placeholder="e.g. ABC Entertainment" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="onboarding-input" />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold text-muted-foreground mb-1">Business Type</span>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="onboarding-input">
            <option>Nightclub</option>
            <option>Concert venue</option>
            <option>Festival organiser</option>
            <option>Comedy venue</option>
            <option>Theatre</option>
            <option>Sports venue</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[10px] font-bold text-muted-foreground mb-1">Contact Email</span>
          <input required type="email" placeholder="jordan@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="onboarding-input" />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold text-muted-foreground mb-1">Contact Phone</span>
          <input required placeholder="+27 82 555 0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="onboarding-input" />
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] font-bold text-muted-foreground mb-1">Business Description</span>
        <textarea rows={2} required placeholder="Tell us about the kinds of events you host..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="onboarding-input resize-none" />
      </label>
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-xs font-extrabold hover:brightness-95">
        {loading ? 'Submitting Application...' : 'Register Business Account'}
      </button>
    </form>
  );
}

// Sub-component: Complete Orders List
function OrdersList({ businessId, basePath }: { businessId: number, basePath: string }) {
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (businessId) fetchOrders();
  }, [businessId]);

  const fetchOrders = async () => {
    try {
      const token = (window as any).__firebaseToken;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/businesses/my/orders?businessId=${businessId}`, { headers });
      const data = await res.json();
      setOrdersList(data);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-6 text-xs text-muted-foreground animate-pulse">Syncing orders...</div>;

  return (
    <div className="overflow-x-auto text-left">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground font-mono text-[9px] uppercase tracking-wider">
            <th className="py-2.5">Order No</th>
            <th className="py-2.5">Buyer</th>
            <th className="py-2.5">Email</th>
            <th className="py-2.5">Event</th>
            <th className="py-2.5">Total Paid</th>
            <th className="py-2.5">Status</th>
            <th className="py-2.5">Date</th>
          </tr>
        </thead>
        <tbody>
          {ordersList.map((o) => (
            <tr key={o.id} className="border-b border-border/40 hover:bg-muted/10">
              <td className="py-3.5 font-mono font-bold text-primary">{o.orderNumber}</td>
              <td className="py-3.5 font-bold">{o.buyerName}</td>
              <td className="py-3.5 text-muted-foreground">{o.buyerEmail}</td>
              <td className="py-3.5 truncate max-w-[150px]">{o.eventName}</td>
              <td className="py-3.5 font-mono">R{o.total}</td>
              <td className="py-3.5">
                <span className="rounded-full bg-emerald-500/10 text-emerald-500 px-2 py-0.5 text-[9px] font-bold">
                  {o.status}
                </span>
              </td>
              <td className="py-3.5 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {ordersList.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted-foreground">No orders recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
