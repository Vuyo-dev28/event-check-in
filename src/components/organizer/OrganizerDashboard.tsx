import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Coins,
  Download,
  LayoutDashboard,
  MapPin,
  Percent,
  Plus,
  QrCode,
  Settings,
  ShoppingBag,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch, basePath, formatZarFromCents } from '../../lib/api.ts';
import { useAuthContext } from '../../lib/clerk-wrapper.tsx';
import QrScannerPanel from '../scanner/QrScannerPanel.tsx';

export type BusinessSection =
  | 'dashboard'
  | 'onboarding'
  | 'events'
  | 'events-create'
  | 'tickets'
  | 'orders'
  | 'attendees'
  | 'scanner'
  | 'staff'
  | 'promotions'
  | 'financials'
  | 'payouts'
  | 'settings';

const ONBOARDING_STEPS = [
  '1. Get Started',
  '2. Personal Info',
  '3. Contact Details',
  '4. Account Security',
  '5. Email Verify',
  '6. Business Profile',
  '7. Brand Logo',
  '8. Business Details',
  '9. KYC Verification',
  '10. Bank & Payouts',
  '11. Agreements',
  '12. Review & Submit',
  '13. Approval Status',
  '14. Workspace Ready',
];

export default function OrganizerDashboard({
  section,
  onNavigate,
}: {
  section: BusinessSection;
  onNavigate: (path: string) => void;
}) {
  const { user, isSignedIn, isLoaded, refreshMe } = useAuthContext();
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dashboard / Module states
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [venuesList, setVenuesList] = useState<any[]>([]);
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [attendeesList, setAttendeesList] = useState<any[]>([]);
  const [attendeeEventFilter, setAttendeeEventFilter] = useState('');
  const [teamData, setTeamData] = useState<{ members: any[]; invitations: any[] }>({ members: [], invitations: [] });
  const [promosList, setPromosList] = useState<any[]>([]);
  const [financialsData, setFinancialsData] = useState<any | null>(null);

  // Business Onboarding 14-Step Wizard State
  const [obStep, setObStep] = useState(1);
  const [obBusinessId, setObBusinessId] = useState<number | null>(null);
  const [obDraft, setObDraft] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: user?.phone || '',
    name: '',
    type: 'Festival & Live Music',
    contactPerson: '',
    country: 'South Africa',
    address: '',
    website: '',
    logo: '',
    description: '',
    registrationNumber: '',
    taxNumber: '',
    registrationDocUrl: '',
    idDocUrl: '',
    bankProofUrl: '',
    bankName: '',
    bankAccountNumber: '',
    bankBranchCode: '',
    accountHolderName: '',
    payoutEmail: '',
    agreementAccepted: false,
  });

  // 5-Step Guided Event Creation Wizard State
  const [evStep, setEvStep] = useState(1);
  const [evForm, setEvForm] = useState({
    name: '',
    category: 'Music & Festivals',
    description: '',
    ageRestriction: 'All Ages',
    isOnline: false,
    onlineUrl: '',
    venueId: '',
    address: '',
    city: 'Cape Town',
    dateText: '20 Nov 2026',
    startTime: '18:00',
    endTime: '23:00',
    timezone: 'SAST',
    coverImage: '',
    refundPolicy: 'Tickets are refundable up to 7 days before the event.',
    termsAndConditions: 'Valid QR ticket required at gate. One admission per scan.',
    status: 'PUBLISHED',
  });
  const [evTiers, setEvTiers] = useState([
    { name: 'General Admission', description: 'Standard event pass', price: 250, isFree: false, quantity: 200, minPurchase: 1, maxPurchase: 8 },
  ]);

  // Venue / Promo / Staff / Settings Forms
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: 'Cape Town', capacity: 500 });
  const [tierForm, setTierForm] = useState({ eventId: '', name: '', description: '', price: 150, isFree: false, quantity: 100 });
  const [staffForm, setStaffForm] = useState({ email: '', role: 'CHECK_IN_STAFF' });
  const [promoForm, setPromoForm] = useState({ code: '', discountPercent: 15, discountAmountRand: 0, maxUses: 100 });
  const [settingsForm, setSettingsForm] = useState<any>({});

  const loadBusinesses = async () => {
    setLoading(true);
    const [bizRes, draftRes] = await Promise.all([apiFetch<any[]>('/api/businesses/my'), apiFetch('/api/businesses/onboarding/draft')]);
    if (bizRes.ok && Array.isArray(bizRes.data)) {
      setBusinesses(bizRes.data);
      const current = selectedBusiness ? bizRes.data.find((b) => b.id === selectedBusiness.id) || bizRes.data[0] : bizRes.data[0];
      setSelectedBusiness(current || null);
      if (current) {
        setSettingsForm({
          name: current.name || '',
          type: current.type || '',
          phone: current.phone || '',
          address: current.address || '',
          website: current.website || '',
          logo: current.logo || '',
          description: current.description || '',
          bankName: current.bankName || '',
          bankAccountNumber: current.bankAccountNumber || '',
          bankBranchCode: current.bankBranchCode || '',
          accountHolderName: current.accountHolderName || '',
          payoutEmail: current.payoutEmail || current.email || '',
        });
      }
    }
    if (draftRes.ok && draftRes.data?.businesses?.length > 0) {
      const pending = draftRes.data.businesses.find((b: any) => b.status === 'PENDING' || b.status === 'UNDER_REVIEW');
      if (pending) {
        setObBusinessId(pending.id);
        setObStep(Math.min(14, Math.max(1, pending.onboardingStep || 6)));
        setObDraft((prev) => ({
          ...prev,
          ...(pending.onboardingDraft || {}),
          name: pending.name || prev.name,
          email: pending.email || prev.email,
        }));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadBusinesses();
    } else if (isLoaded) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  const role = selectedBusiness?.role || 'CHECK_IN_STAFF';
  const canManageBusiness = ['BUSINESS_OWNER', 'BUSINESS_ADMIN'].includes(role);
  const canManageEvents = ['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER'].includes(role);
  const canViewFinancials = ['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'FINANCE'].includes(role);
  const canViewOrders = ['BUSINESS_OWNER', 'BUSINESS_ADMIN', 'EVENT_MANAGER', 'FINANCE'].includes(role);

  const loadSectionData = async () => {
    if (!selectedBusiness) return;
    const qBiz = `businessId=${selectedBusiness.id}`;
    const [evRes, venRes] = await Promise.all([apiFetch(`/api/events/my?${qBiz}`), apiFetch(`/api/venues?${qBiz}`)]);
    if (evRes.ok && Array.isArray(evRes.data)) {
      setEventsList(evRes.data);
      if (!tierForm.eventId && evRes.data[0]) {
        setTierForm((prev) => ({ ...prev, eventId: String(evRes.data[0].id) }));
      }
    }
    if (venRes.ok && Array.isArray(venRes.data)) setVenuesList(venRes.data);

    if (canViewOrders) {
      const [dashRes, ordRes] = await Promise.all([
        apiFetch(`/api/businesses/my/dashboard?${qBiz}`),
        apiFetch(`/api/businesses/my/orders?${qBiz}&q=${encodeURIComponent(orderSearch)}&status=${encodeURIComponent(orderStatusFilter)}`),
      ]);
      if (dashRes.ok) setDashboardData(dashRes.data);
      if (ordRes.ok && Array.isArray(ordRes.data)) setOrdersList(ordRes.data);
    }

    const attRes = await apiFetch(
      `/api/businesses/my/attendees?${qBiz}${attendeeEventFilter ? `&eventId=${attendeeEventFilter}` : ''}`
    );
    if (attRes.ok && Array.isArray(attRes.data)) setAttendeesList(attRes.data);

    if (canManageEvents) {
      const [teamRes, promoRes] = await Promise.all([
        apiFetch(`/api/businesses/my/team?${qBiz}`),
        apiFetch(`/api/businesses/my/promos?${qBiz}`),
      ]);
      if (teamRes.ok && teamRes.data) setTeamData(teamRes.data);
      if (promoRes.ok && Array.isArray(promoRes.data)) setPromosList(promoRes.data);
    }

    if (canViewFinancials) {
      const finRes = await apiFetch(`/api/businesses/my/financials?${qBiz}`);
      if (finRes.ok) setFinancialsData(finRes.data);
    }
  };

  useEffect(() => {
    if (selectedBusiness) {
      loadSectionData();
    }
  }, [selectedBusiness, section, orderSearch, orderStatusFilter, attendeeEventFilter]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-border bg-card p-8 text-center space-y-4 my-10">
        <Building2 className="mx-auto h-9 w-9 text-foreground" />
        <h2 className="text-xl font-extrabold text-foreground">Organiser & Business Portal</h2>
        <p className="text-xs text-muted-foreground">
          Sign in or create an account to launch your event business, manage tickets, or scan passes at the gate.
        </p>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('event-check-in:return-url', window.location.pathname);
            onNavigate('/login');
          }}
          className="rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-primary-foreground"
        >
          Sign In to Continue
        </button>
      </div>
    );
  }

  const saveOnboardingDraft = async (nextStep: number) => {
    setErrorMsg(null);
    setNotice(null);
    const res = await apiFetch('/api/businesses/onboarding/draft', {
      method: 'POST',
      body: JSON.stringify({ businessId: obBusinessId, step: nextStep, draft: obDraft }),
    });
    if (!res.ok) {
      setErrorMsg(res.data?.error || 'Could not save draft.');
      return false;
    }
    if (res.data?.business?.id) setObBusinessId(res.data.business.id);
    setObStep(nextStep);
    setNotice('Onboarding draft saved. You can leave and resume anytime.');
    return true;
  };

  const submitOnboardingApplication = async () => {
    setErrorMsg(null);
    setNotice(null);
    if (!obDraft.agreementAccepted) {
      setErrorMsg('Please accept the platform organiser agreements before submitting.');
      return;
    }
    const res = await apiFetch('/api/businesses', {
      method: 'POST',
      body: JSON.stringify({
        businessId: obBusinessId,
        ...obDraft,
        agreementAccepted: obDraft.agreementAccepted,
      }),
    });
    if (!res.ok) {
      setErrorMsg(res.data?.error || 'Application submission failed.');
      return;
    }
    setObStep(13);
    setNotice(`Application submitted! Current status: ${res.data.business.status}`);
    await refreshMe();
    await loadBusinesses();
  };

  const createVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/venues?businessId=${selectedBusiness.id}`, {
      method: 'POST',
      body: JSON.stringify(venueForm),
    });
    if (res.ok) {
      setVenueForm({ name: '', address: '', city: 'Cape Town', capacity: 500 });
      setNotice('Venue added.');
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Failed to add venue.');
    }
  };

  const submitEventWizard = async () => {
    if (!selectedBusiness) return;
    setErrorMsg(null);
    const res = await apiFetch(`/api/events?businessId=${selectedBusiness.id}`, {
      method: 'POST',
      body: JSON.stringify({
        ...evForm,
        venueId: evForm.venueId ? Number(evForm.venueId) : null,
        ticketTiers: evTiers,
      }),
    });
    if (!res.ok) {
      setErrorMsg(res.data?.error || 'Could not create event.');
      return;
    }
    setNotice(`Event "${res.data.event.name}" created (${res.data.event.status}).`);
    onNavigate('/business/events');
  };

  const updateEventStatus = async (eventId: number, status: string) => {
    const res = await apiFetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setNotice(`Event updated to ${status}.`);
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Failed to update event.');
    }
  };

  const createTicketTier = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/ticket-types', {
      method: 'POST',
      body: JSON.stringify(tierForm),
    });
    if (res.ok) {
      setTierForm({ ...tierForm, name: '', description: '' });
      setNotice('Ticket tier added.');
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Could not add ticket tier.');
    }
  };

  const inviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/businesses/my/team?businessId=${selectedBusiness.id}`, {
      method: 'POST',
      body: JSON.stringify(staffForm),
    });
    if (res.ok) {
      setStaffForm({ email: '', role: 'CHECK_IN_STAFF' });
      setNotice(`Staff ${res.data.mode === 'invited' ? 'invitation sent' : 'member added'}.`);
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Could not add staff.');
    }
  };

  const removeStaff = async (memberId: number) => {
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/businesses/my/team/${memberId}?businessId=${selectedBusiness.id}`, {
      method: 'DELETE',
    });
    if (res.ok) loadSectionData();
  };

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/businesses/my/promos?businessId=${selectedBusiness.id}`, {
      method: 'POST',
      body: JSON.stringify(promoForm),
    });
    if (res.ok) {
      setPromoForm({ code: '', discountPercent: 15, discountAmountRand: 0, maxUses: 100 });
      setNotice('Promo code created.');
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Promo creation failed.');
    }
  };

  const reviewRefund = async (refundId: number, decision: 'APPROVE' | 'REJECT') => {
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/businesses/my/refunds/${refundId}/review?businessId=${selectedBusiness.id}`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    if (res.ok) {
      setNotice(`Refund ${decision === 'APPROVE' ? 'processed' : 'declined'}.`);
      loadSectionData();
    } else {
      setErrorMsg(res.data?.error || 'Refund review failed.');
    }
  };

  const saveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    const res = await apiFetch(`/api/businesses/my/settings?businessId=${selectedBusiness.id}`, {
      method: 'PATCH',
      body: JSON.stringify(settingsForm),
    });
    if (res.ok) {
      setNotice('Business settings and payout details updated.');
      loadBusinesses();
    } else {
      setErrorMsg(res.data?.error || 'Failed to save settings.');
    }
  };

  const navItems: Array<{ id: BusinessSection; label: string; path: string; icon: any; show: boolean }> = [
    { id: 'dashboard', label: 'Overview', path: '/business/dashboard', icon: LayoutDashboard, show: canViewOrders },
    { id: 'events', label: 'Events', path: '/business/events', icon: CalendarDays, show: true },
    { id: 'tickets', label: 'Ticket Tiers', path: '/business/tickets', icon: Ticket, show: canManageEvents },
    { id: 'orders', label: 'Orders', path: '/business/orders', icon: ShoppingBag, show: canViewOrders },
    { id: 'attendees', label: 'Attendees', path: '/business/attendees', icon: Users, show: true },
    { id: 'scanner', label: 'Gate Scanner', path: '/business/scanner', icon: QrCode, show: true },
    { id: 'staff', label: 'Staff & Roles', path: '/business/staff', icon: Users, show: canManageBusiness },
    { id: 'promotions', label: 'Promotions', path: '/business/promotions', icon: Percent, show: canManageEvents },
    { id: 'financials', label: 'Financials', path: '/business/financials', icon: Coins, show: canViewFinancials },
    { id: 'payouts', label: 'Payouts', path: '/business/payouts', icon: Wallet, show: canViewFinancials },
    { id: 'settings', label: 'Settings', path: '/business/settings', icon: Settings, show: canViewFinancials || canManageBusiness },
  ];

  // If user has no business yet or explicitly clicked onboarding
  const activeSection: BusinessSection =
    !loading && businesses.length === 0 ? 'onboarding' : section;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-16">
      {/* Sidebar Workspace Navigation */}
      <aside className="lg:col-span-3 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          {businesses.length > 0 ? (
            <>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  Active Business
                </label>
                <select
                  value={selectedBusiness?.id || ''}
                  onChange={(e) => {
                    const found = businesses.find((b) => b.id === Number(e.target.value));
                    if (found) setSelectedBusiness(found);
                  }}
                  className="onboarding-input py-2 text-xs font-bold"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.role})
                    </option>
                  ))}
                </select>
                {selectedBusiness && (
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Status: <strong className="text-foreground">{selectedBusiness.status}</strong></span>
                    <span>KYC: <strong className="text-foreground">{selectedBusiness.verificationStatus}</strong></span>
                  </div>
                )}
              </div>

              <nav className="space-y-1 pt-2 border-t border-border">
                {navItems
                  .filter((n) => n.show)
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      activeSection === item.id ||
                      (activeSection === 'events-create' && item.id === 'events');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.path)}
                        className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                          isActive
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
            </>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="font-extrabold text-foreground">New Organiser Onboarding</div>
              <p className="text-muted-foreground">Complete the guided registration to open your business dashboard.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigate('/business/onboarding')}
            className="w-full rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted text-foreground"
          >
            {businesses.length > 0 ? '+ Register Another Business' : 'Onboarding Wizard'}
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
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

        {/* 14-Step Save & Resume Business Onboarding */}
        {activeSection === 'onboarding' && (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Step {obStep} of 14 · {ONBOARDING_STEPS[obStep - 1]}
                </span>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none mt-1">
                  Business & Organiser Onboarding
                </h1>
              </div>
              <button
                type="button"
                onClick={() => saveOnboardingDraft(obStep)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted"
              >
                Save Draft Progress
              </button>
            </div>

            <div className="grid grid-cols-7 sm:grid-cols-14 gap-1">
              {ONBOARDING_STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  onClick={() => setObStep(idx + 1)}
                  className={`h-2 rounded-full transition-colors ${
                    idx + 1 <= obStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            {obStep <= 5 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">Account & Contact Identity</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">First Name *</label>
                    <input value={obDraft.firstName} onChange={(e) => setObDraft({ ...obDraft, firstName: e.target.value })} className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Surname *</label>
                    <input value={obDraft.lastName} onChange={(e) => setObDraft({ ...obDraft, lastName: e.target.value })} className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Business Contact Email *</label>
                    <input type="email" value={obDraft.email} onChange={(e) => setObDraft({ ...obDraft, email: e.target.value })} className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Mobile Number *</label>
                    <input type="tel" value={obDraft.phone} onChange={(e) => setObDraft({ ...obDraft, phone: e.target.value })} placeholder="+27 82 555 0190" className="onboarding-input" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Signed in as <strong>{user?.primaryEmailAddress?.emailAddress}</strong> ({user?.emailVerified ? 'Email Verified' : 'Email verification recommended in Profile'}).
                </p>
              </div>
            )}

            {obStep >= 6 && obStep <= 8 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">Business Profile, Logo & Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Business / Brand Name *</label>
                    <input value={obDraft.name} onChange={(e) => setObDraft({ ...obDraft, name: e.target.value })} placeholder="Cape Sound Collective" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Organiser Type *</label>
                    <select value={obDraft.type} onChange={(e) => setObDraft({ ...obDraft, type: e.target.value })} className="onboarding-input">
                      <option>Festival & Live Music</option>
                      <option>Conference & Tech Summit</option>
                      <option>Nightclub & Entertainment</option>
                      <option>Food, Wine & Lifestyle</option>
                      <option>Sports & Community</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Business Logo URL</label>
                    <input value={obDraft.logo} onChange={(e) => setObDraft({ ...obDraft, logo: e.target.value })} placeholder="https://..." className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Website</label>
                    <input value={obDraft.website} onChange={(e) => setObDraft({ ...obDraft, website: e.target.value })} placeholder="https://yourbrand.co.za" className="onboarding-input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-bold">Physical Address</label>
                    <input value={obDraft.address} onChange={(e) => setObDraft({ ...obDraft, address: e.target.value })} placeholder="12 Bree Street, Cape Town" className="onboarding-input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-bold">Description</label>
                    <textarea rows={3} value={obDraft.description} onChange={(e) => setObDraft({ ...obDraft, description: e.target.value })} className="onboarding-input" />
                  </div>
                </div>
              </div>
            )}

            {obStep === 9 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">Company Registration & KYC Verification</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">CIPC Registration Number</label>
                    <input value={obDraft.registrationNumber} onChange={(e) => setObDraft({ ...obDraft, registrationNumber: e.target.value })} placeholder="2024/123456/07" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">VAT / Tax Number</label>
                    <input value={obDraft.taxNumber} onChange={(e) => setObDraft({ ...obDraft, taxNumber: e.target.value })} placeholder="4000123456" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Registration Document Reference / URL</label>
                    <input value={obDraft.registrationDocUrl} onChange={(e) => setObDraft({ ...obDraft, registrationDocUrl: e.target.value })} placeholder="CIPC certificate URL or ref" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Director ID Document Reference</label>
                    <input value={obDraft.idDocUrl} onChange={(e) => setObDraft({ ...obDraft, idDocUrl: e.target.value })} placeholder="ID proof reference" className="onboarding-input" />
                  </div>
                </div>
              </div>
            )}

            {obStep === 10 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">South African Bank & Payout Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Bank Name *</label>
                    <input value={obDraft.bankName} onChange={(e) => setObDraft({ ...obDraft, bankName: e.target.value })} placeholder="FNB / Standard Bank / Capitec" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Account Holder Name *</label>
                    <input value={obDraft.accountHolderName} onChange={(e) => setObDraft({ ...obDraft, accountHolderName: e.target.value })} className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Account Number *</label>
                    <input value={obDraft.bankAccountNumber} onChange={(e) => setObDraft({ ...obDraft, bankAccountNumber: e.target.value })} className="onboarding-input font-mono" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Branch Code *</label>
                    <input value={obDraft.bankBranchCode} onChange={(e) => setObDraft({ ...obDraft, bankBranchCode: e.target.value })} placeholder="250655" className="onboarding-input font-mono" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-bold">Payout Notification Email</label>
                    <input type="email" value={obDraft.payoutEmail} onChange={(e) => setObDraft({ ...obDraft, payoutEmail: e.target.value })} placeholder="finance@yourbrand.co.za" className="onboarding-input" />
                  </div>
                </div>
              </div>
            )}

            {obStep === 11 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">Platform Organiser Agreements</h2>
                <div className="rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <p>1. All ticket proceeds are settled in ZAR less applicable platform commission and gateway processing fees.</p>
                  <p>2. Organisers must honour valid refund requests for cancelled or postponed events.</p>
                  <p>3. Super Admin approval is required before public ticket sales go live.</p>
                </div>
                <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obDraft.agreementAccepted}
                    onChange={(e) => setObDraft({ ...obDraft, agreementAccepted: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  I accept the Howler Tickets Organiser Agreement and Payout Terms.
                </label>
              </div>
            )}

            {obStep === 12 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold text-foreground">Review & Submit Application</h2>
                <div className="rounded-xl border border-border bg-background p-4 text-xs space-y-1.5">
                  <div><strong>Business:</strong> {obDraft.name || '—'} ({obDraft.type})</div>
                  <div><strong>Email:</strong> {obDraft.email}</div>
                  <div><strong>Bank:</strong> {obDraft.bankName || '—'} · {obDraft.bankAccountNumber || '—'}</div>
                  <div><strong>Agreement:</strong> {obDraft.agreementAccepted ? 'Accepted' : 'Not yet accepted'}</div>
                </div>
              </div>
            )}

            {obStep >= 13 && (
              <div className="rounded-xl border border-border bg-muted/40 p-6 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
                <h3 className="text-lg font-extrabold text-foreground">Application Submitted</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Current business status: <strong>{selectedBusiness?.status || 'UNDER_REVIEW'}</strong>. You can create DRAFT events now; publishing goes live once approved by Super Admin.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('/business/events')}
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
                >
                  Open Business Workspace
                </button>
              </div>
            )}

            {obStep < 13 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  disabled={obStep <= 1}
                  onClick={() => setObStep((s) => Math.max(1, s - 1))}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <div className="flex gap-2">
                  {obStep < 12 ? (
                    <button
                      type="button"
                      onClick={() => saveOnboardingDraft(obStep + 1)}
                      className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground"
                    >
                      Save & Continue
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitOnboardingApplication}
                      className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground"
                    >
                      Submit for Super Admin Approval
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overview Dashboard */}
        {activeSection === 'dashboard' && selectedBusiness && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">{selectedBusiness.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {selectedBusiness.type} · Role: {role}
                </p>
              </div>
              {canManageEvents && (
                <button
                  type="button"
                  onClick={() => onNavigate('/business/events/create')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground"
                >
                  <Plus size={14} /> Create Event
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Gross Sales', val: formatZarFromCents(selectedBusiness.grossSalesCents ?? selectedBusiness.grossSales * 100) },
                { label: 'Pending Payout', val: formatZarFromCents(selectedBusiness.pendingPayoutCents ?? selectedBusiness.pendingPayout * 100) },
                { label: 'Tickets Sold', val: String(dashboardData?.ticketsSold ?? 0) },
                { label: 'Gate Check-Ins', val: String(dashboardData?.checkedIn ?? 0) },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-foreground tabular-nums">{kpi.val}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-foreground">Recent Orders</h2>
                <button type="button" onClick={() => onNavigate('/business/orders')} className="text-xs font-bold hover:underline">
                  View all
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3 text-right">Net Earnings</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(dashboardData?.recentOrders || []).length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No orders yet.</td></tr>
                    ) : (
                      (dashboardData?.recentOrders || []).map((o: any) => (
                        <tr key={o.id}>
                          <td className="px-4 py-3 font-mono font-bold">{o.orderNumber}</td>
                          <td className="px-4 py-3">{o.eventName}</td>
                          <td className="px-4 py-3">{o.buyerName}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatZarFromCents(o.businessEarningsCents ?? o.totalCents ?? o.total * 100)}
                          </td>
                          <td className="px-4 py-3 font-bold">{o.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Events List & Venues */}
        {activeSection === 'events' && selectedBusiness && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Events & Venues</h1>
              {canManageEvents && (
                <button
                  type="button"
                  onClick={() => onNavigate('/business/events/create')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground"
                >
                  <Plus size={14} /> Guided Event Builder
                </button>
              )}
            </div>

            <div className="space-y-3">
              {eventsList.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
                  No events created yet. Click "Guided Event Builder" to launch your first event.
                </div>
              ) : (
                eventsList.map((ev) => (
                  <div key={ev.id} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {ev.status} · {ev.category} · {ev.dateText}
                      </div>
                      <h3 className="text-base font-extrabold text-foreground mt-0.5">{ev.name}</h3>
                      <div className="text-xs text-muted-foreground">
                        {ev.venueName} · {ev.soldCount} tickets sold · {(ev.ticketTypes || []).length} tier(s)
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigate(`/events/${ev.slug || ev.id}`)}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                      >
                        Public Page
                      </button>
                      {canManageEvents && ev.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => updateEventStatus(ev.id, 'PUBLISHED')}
                          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground"
                        >
                          Publish
                        </button>
                      )}
                      {canManageEvents && ['PUBLISHED', 'ON_SALE'].includes(ev.status) && (
                        <button
                          type="button"
                          onClick={() => updateEventStatus(ev.id, 'CANCELLED')}
                          className="rounded-xl border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"
                        >
                          Cancel Event
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {canManageEvents && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
                  <MapPin size={16} /> Business Venues ({venuesList.length})
                </h2>
                <form onSubmit={createVenue} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  <input required value={venueForm.name} onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })} placeholder="Venue Name" className="onboarding-input text-xs" />
                  <input required value={venueForm.address} onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })} placeholder="Street Address" className="onboarding-input text-xs" />
                  <input required value={venueForm.city} onChange={(e) => setVenueForm({ ...venueForm, city: e.target.value })} placeholder="City" className="onboarding-input text-xs" />
                  <input type="number" min="1" value={venueForm.capacity} onChange={(e) => setVenueForm({ ...venueForm, capacity: Number(e.target.value) })} placeholder="Capacity" className="onboarding-input text-xs" />
                  <button type="submit" className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground">
                    Add Venue
                  </button>
                </form>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {venuesList.map((v) => (
                    <div key={v.id} className="rounded-xl border border-border p-3 bg-background">
                      <div className="font-bold text-foreground">{v.name}</div>
                      <div className="text-muted-foreground">{v.address}, {v.city} · Cap {v.capacity}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5-Step Guided Event Creation Wizard */}
        {activeSection === 'events-create' && selectedBusiness && (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-xs text-muted-foreground">Step {evStep} of 5</span>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Create New Event</h1>
              </div>
              <button type="button" onClick={() => onNavigate('/business/events')} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>

            {evStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold">1. Basic Event Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-bold">Event Title *</label>
                    <input value={evForm.name} onChange={(e) => setEvForm({ ...evForm, name: e.target.value })} placeholder="Kirstenbosch Summer Acoustic Sessions" className="onboarding-input" />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Category</label>
                    <select value={evForm.category} onChange={(e) => setEvForm({ ...evForm, category: e.target.value })} className="onboarding-input">
                      <option>Music & Festivals</option>
                      <option>Tech & Conferences</option>
                      <option>Food & Wine</option>
                      <option>Arts & Culture</option>
                      <option>Sports & Fitness</option>
                      <option>Nightlife</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Age Restriction</label>
                    <input value={evForm.ageRestriction} onChange={(e) => setEvForm({ ...evForm, ageRestriction: e.target.value })} placeholder="All Ages / 18+" className="onboarding-input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-bold">Event Description</label>
                    <textarea rows={4} value={evForm.description} onChange={(e) => setEvForm({ ...evForm, description: e.target.value })} className="onboarding-input" />
                  </div>
                </div>
              </div>
            )}

            {evStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold">2. Date, Time & Venue</h2>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input type="checkbox" checked={evForm.isOnline} onChange={(e) => setEvForm({ ...evForm, isOnline: e.target.checked })} />
                  This is an Online / Streaming Event
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {evForm.isOnline ? (
                    <div className="sm:col-span-2">
                      <label className="block mb-1 text-[11px] font-bold">Stream URL</label>
                      <input value={evForm.onlineUrl} onChange={(e) => setEvForm({ ...evForm, onlineUrl: e.target.value })} placeholder="https://stream.example.com" className="onboarding-input" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block mb-1 text-[11px] font-bold">Saved Venue (Optional)</label>
                        <select value={evForm.venueId} onChange={(e) => setEvForm({ ...evForm, venueId: e.target.value })} className="onboarding-input">
                          <option value="">Custom Address Below</option>
                          {venuesList.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.city})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-[11px] font-bold">City</label>
                        <input value={evForm.city} onChange={(e) => setEvForm({ ...evForm, city: e.target.value })} className="onboarding-input" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block mb-1 text-[11px] font-bold">Street Address</label>
                        <input value={evForm.address} onChange={(e) => setEvForm({ ...evForm, address: e.target.value })} className="onboarding-input" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block mb-1 text-[11px] font-bold">Display Date *</label>
                    <input value={evForm.dateText} onChange={(e) => setEvForm({ ...evForm, dateText: e.target.value })} placeholder="20 Nov 2026" className="onboarding-input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 text-[11px] font-bold">Start Time</label>
                      <input value={evForm.startTime} onChange={(e) => setEvForm({ ...evForm, startTime: e.target.value })} className="onboarding-input" />
                    </div>
                    <div>
                      <label className="block mb-1 text-[11px] font-bold">End Time</label>
                      <input value={evForm.endTime} onChange={(e) => setEvForm({ ...evForm, endTime: e.target.value })} className="onboarding-input" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {evStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold">3. Ticket Tiers (Paid or Free)</h2>
                  <button
                    type="button"
                    onClick={() =>
                      setEvTiers([...evTiers, { name: 'VIP Pass', description: '', price: 550, isFree: false, quantity: 50, minPurchase: 1, maxPurchase: 6 }])
                    }
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                  >
                    + Add Tier
                  </button>
                </div>
                <div className="space-y-3">
                  {evTiers.map((t, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-background p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
                      <div className="sm:col-span-2">
                        <label className="block mb-1 text-[10px] font-bold">Tier Name</label>
                        <input value={t.name} onChange={(e) => { const c = [...evTiers]; c[idx].name = e.target.value; setEvTiers(c); }} className="onboarding-input py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block mb-1 text-[10px] font-bold">Price (ZAR)</label>
                        <input type="number" min="0" disabled={t.isFree} value={t.isFree ? 0 : t.price} onChange={(e) => { const c = [...evTiers]; c[idx].price = Number(e.target.value); setEvTiers(c); }} className="onboarding-input py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block mb-1 text-[10px] font-bold">Quantity</label>
                        <input type="number" min="1" value={t.quantity} onChange={(e) => { const c = [...evTiers]; c[idx].quantity = Number(e.target.value); setEvTiers(c); }} className="onboarding-input py-1.5 text-xs" />
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-bold pb-2">
                        <input type="checkbox" checked={t.isFree} onChange={(e) => { const c = [...evTiers]; c[idx].isFree = e.target.checked; if (e.target.checked) c[idx].price = 0; setEvTiers(c); }} />
                        Free Tier
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {evStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold">4. Media & Policies</h2>
                <div>
                  <label className="block mb-1 text-[11px] font-bold">Cover Banner Image URL (optional)</label>
                  <input value={evForm.coverImage} onChange={(e) => setEvForm({ ...evForm, coverImage: e.target.value })} placeholder="Leave blank for curated venue artwork" className="onboarding-input" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-bold">Refund Policy</label>
                  <textarea rows={2} value={evForm.refundPolicy} onChange={(e) => setEvForm({ ...evForm, refundPolicy: e.target.value })} className="onboarding-input" />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-bold">Terms & Conditions</label>
                  <textarea rows={2} value={evForm.termsAndConditions} onChange={(e) => setEvForm({ ...evForm, termsAndConditions: e.target.value })} className="onboarding-input" />
                </div>
              </div>
            )}

            {evStep === 5 && (
              <div className="space-y-4">
                <h2 className="text-base font-extrabold">5. Publish Settings</h2>
                <select value={evForm.status} onChange={(e) => setEvForm({ ...evForm, status: e.target.value })} className="onboarding-input">
                  <option value="PUBLISHED">Publish Immediately (Requires ACTIVE Business)</option>
                  <option value="DRAFT">Save as Draft</option>
                </select>
                <div className="rounded-xl border border-border bg-background p-4 text-xs space-y-1">
                  <div><strong>Event:</strong> {evForm.name || 'Untitled'}</div>
                  <div><strong>When:</strong> {evForm.dateText} · {evForm.startTime}</div>
                  <div><strong>Tiers:</strong> {evTiers.map((t) => `${t.name} (R${t.isFree ? 0 : t.price})`).join(', ')}</div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-border">
              <button type="button" disabled={evStep <= 1} onClick={() => setEvStep((s) => s - 1)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold disabled:opacity-40">
                Previous
              </button>
              {evStep < 5 ? (
                <button type="button" onClick={() => setEvStep((s) => s + 1)} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground">
                  Next Step
                </button>
              ) : (
                <button type="button" onClick={submitEventWizard} className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground">
                  Save & Launch Event
                </button>
              )}
            </div>
          </div>
        )}

        {/* Ticket Tiers Manager */}
        {activeSection === 'tickets' && selectedBusiness && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Ticket Tiers & Inventory</h1>
            <form onSubmit={createTicketTier} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block mb-1 text-[11px] font-bold">Event</label>
                <select value={tierForm.eventId} onChange={(e) => setTierForm({ ...tierForm, eventId: e.target.value })} className="onboarding-input py-2 text-xs">
                  {eventsList.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Tier Name *</label>
                <input required value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Early Bird" className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Price (ZAR)</label>
                <input type="number" min="0" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Quantity</label>
                <input type="number" min="1" value={tierForm.quantity} onChange={(e) => setTierForm({ ...tierForm, quantity: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">
                Add Tier
              </button>
            </form>

            <div className="space-y-4">
              {eventsList.map((ev) => (
                <div key={ev.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-extrabold text-foreground">{ev.name}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {(ev.ticketTypes || []).map((t: any) => (
                      <div key={t.id} className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                        <div className="font-bold text-foreground">{t.name}</div>
                        <div className="font-mono font-extrabold text-foreground">
                          {t.isFree ? 'Free' : formatZarFromCents(t.priceCents ?? t.price * 100)}
                        </div>
                        <div className="text-muted-foreground tabular-nums">
                          {t.remaining} / {t.quantity} remaining · {t.reserved || 0} reserved
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders + CSV Export */}
        {activeSection === 'orders' && selectedBusiness && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Business Orders</h1>
              <a
                href={`${basePath}/api/businesses/my/orders/export?businessId=${selectedBusiness.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold hover:bg-muted"
              >
                <Download size={14} /> Export Orders CSV
              </a>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search order #, buyer, email, event..." className="onboarding-input max-w-sm py-2 text-xs" />
              <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className="onboarding-input w-auto py-2 text-xs">
                <option value="">All Statuses</option>
                <option value="PAID">PAID</option>
                <option value="PENDING">PENDING</option>
                <option value="REFUNDED">REFUNDED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Buyer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Net Business</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordersList.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3 font-mono font-bold">{o.orderNumber}</td>
                      <td className="px-4 py-3">{o.eventName}</td>
                      <td className="px-4 py-3">{o.buyerName} · {o.buyerEmail}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(o.totalCents ?? o.total * 100)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(o.businessEarningsCents ?? 0)}</td>
                      <td className="px-4 py-3 font-bold">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attendees + CSV Export */}
        {activeSection === 'attendees' && selectedBusiness && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Attendees Directory</h1>
              <div className="flex items-center gap-2">
                <select value={attendeeEventFilter} onChange={(e) => setAttendeeEventFilter(e.target.value)} className="onboarding-input w-auto py-2 text-xs">
                  <option value="">All Events</option>
                  {eventsList.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
                {canManageEvents && (
                  <a
                    href={`${basePath}/api/businesses/my/attendees/export?businessId=${selectedBusiness.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold hover:bg-muted"
                  >
                    <Download size={14} /> Export CSV
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Ticket #</th>
                    <th className="px-4 py-3">Attendee</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attendeesList.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-mono font-bold">{t.ticketNumber}</td>
                      <td className="px-4 py-3">{t.attendeeName} · {t.attendeeEmail}</td>
                      <td className="px-4 py-3">{t.eventName}</td>
                      <td className="px-4 py-3">{t.type}</td>
                      <td className="px-4 py-3 font-bold">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gate QR Scanner */}
        {activeSection === 'scanner' && selectedBusiness && (
          <QrScannerPanel events={eventsList} businessId={selectedBusiness.id} />
        )}

        {/* Staff & RBAC */}
        {activeSection === 'staff' && selectedBusiness && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Staff & Role Permissions</h1>
            <form onSubmit={inviteStaff} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block mb-1 text-[11px] font-bold">Staff Email Address *</label>
                <input type="email" required value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="gate.staff@example.com" className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Role</label>
                <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="onboarding-input py-2 text-xs">
                  <option value="CHECK_IN_STAFF">Check-In Staff (Scanner Only)</option>
                  <option value="EVENT_MANAGER">Event Manager</option>
                  <option value="FINANCE">Finance Manager</option>
                  <option value="BUSINESS_ADMIN">Business Admin</option>
                </select>
              </div>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">
                Invite / Assign
              </button>
            </form>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <h2 className="text-sm font-extrabold text-foreground">Team Members ({teamData.members.length})</h2>
              <div className="divide-y divide-border text-xs">
                {teamData.members.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-foreground">{m.user.firstName} {m.user.lastName} ({m.user.email})</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{m.role}</div>
                    </div>
                    {m.role !== 'BUSINESS_OWNER' && (
                      <button type="button" onClick={() => removeStaff(m.id)} className="text-xs font-bold text-destructive hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Promo Codes */}
        {activeSection === 'promotions' && selectedBusiness && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Promotions & Discount Codes</h1>
            <form onSubmit={createPromo} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block mb-1 text-[11px] font-bold">Promo Code *</label>
                <input required value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} placeholder="SUMMER25" className="onboarding-input py-2 text-xs uppercase font-mono" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">% Discount</label>
                <input type="number" min="0" max="100" value={promoForm.discountPercent} onChange={(e) => setPromoForm({ ...promoForm, discountPercent: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Flat ZAR Off</label>
                <input type="number" min="0" value={promoForm.discountAmountRand} onChange={(e) => setPromoForm({ ...promoForm, discountAmountRand: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Max Uses</label>
                <input type="number" min="1" value={promoForm.maxUses} onChange={(e) => setPromoForm({ ...promoForm, maxUses: Number(e.target.value) })} className="onboarding-input py-2 text-xs" />
              </div>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">
                Create Code
              </button>
            </form>

            <div className="rounded-2xl border border-border bg-card divide-y divide-border text-xs">
              {promosList.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-extrabold text-sm text-foreground">{p.code}</span>
                    <span className="ml-3 text-muted-foreground">
                      {p.discountPercent}% off {p.discountCents > 0 ? `+ ${formatZarFromCents(p.discountCents)}` : ''} · Used {p.usedCount}/{p.maxUses || '∞'}
                    </span>
                  </div>
                  <span className="font-mono font-bold">{p.active ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financials & Refunds */}
        {(activeSection === 'financials' || activeSection === 'payouts') && selectedBusiness && financialsData && (
          <div className="space-y-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">
              {activeSection === 'payouts' ? 'Business Payouts' : 'Financial Ledger & Refunds'}
            </h1>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs text-muted-foreground">Gross Sales</div>
                <div className="font-mono text-xl font-extrabold mt-1 tabular-nums">{formatZarFromCents(financialsData.business?.grossSalesCents ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs text-muted-foreground">Platform Fees</div>
                <div className="font-mono text-xl font-extrabold mt-1 tabular-nums">{formatZarFromCents(financialsData.business?.platformFeesCents ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs text-muted-foreground">Pending Payout</div>
                <div className="font-mono text-xl font-extrabold mt-1 tabular-nums">{formatZarFromCents(financialsData.business?.pendingPayoutCents ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs text-muted-foreground">Paid Out</div>
                <div className="font-mono text-xl font-extrabold mt-1 tabular-nums">{formatZarFromCents(financialsData.business?.paidPayoutCents ?? 0)}</div>
              </div>
            </div>

            {activeSection === 'financials' && (
              <>
                <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
                  <h2 className="text-sm font-extrabold text-foreground">Refund Requests</h2>
                  {(financialsData.refunds || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No refund requests.</p>
                  ) : (
                    financialsData.refunds.map((r: any) => (
                      <div key={r.id} className="rounded-xl border border-border p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-bold text-foreground">{r.requesterEmail} · {formatZarFromCents(r.amountCents)}</div>
                          <div className="text-muted-foreground">{r.reason} · Status: <strong>{r.status}</strong></div>
                        </div>
                        {r.status === 'REQUESTED' && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => reviewRefund(r.id, 'APPROVE')} className="rounded-lg bg-primary px-3 py-1.5 font-extrabold text-primary-foreground">
                              Approve & Refund
                            </button>
                            <button type="button" onClick={() => reviewRefund(r.id, 'REJECT')} className="rounded-lg border border-border px-3 py-1.5 font-bold">
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-4 py-3">Entry Type</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-right">Amount (ZAR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(financialsData.ledger || []).map((l: any) => (
                        <tr key={l.id}>
                          <td className="px-4 py-3 font-mono font-bold">{l.entryType}</td>
                          <td className="px-4 py-3">{l.description}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(l.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeSection === 'payouts' && (
              <div className="rounded-2xl border border-border bg-card overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(financialsData.payouts || []).length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No payouts disbursed yet.</td></tr>
                    ) : (
                      financialsData.payouts.map((p: any) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 font-mono font-bold">{p.reference}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{formatZarFromCents(p.amountCents ?? p.amount * 100)}</td>
                          <td className="px-4 py-3 font-bold">{p.status}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Business Settings */}
        {activeSection === 'settings' && selectedBusiness && (
          <form onSubmit={saveBusinessSettings} className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-foreground leading-none">Business & Bank Payout Settings</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block mb-1 text-[11px] font-bold">Business Name</label>
                <input value={settingsForm.name || ''} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Payout Notification Email</label>
                <input value={settingsForm.payoutEmail || ''} onChange={(e) => setSettingsForm({ ...settingsForm, payoutEmail: e.target.value })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Bank Name</label>
                <input value={settingsForm.bankName || ''} onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })} className="onboarding-input" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Account Number</label>
                <input value={settingsForm.bankAccountNumber || ''} onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })} className="onboarding-input font-mono" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Branch Code</label>
                <input value={settingsForm.bankBranchCode || ''} onChange={(e) => setSettingsForm({ ...settingsForm, bankBranchCode: e.target.value })} className="onboarding-input font-mono" />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold">Account Holder</label>
                <input value={settingsForm.accountHolderName || ''} onChange={(e) => setSettingsForm({ ...settingsForm, accountHolderName: e.target.value })} className="onboarding-input" />
              </div>
            </div>
            <button type="submit" className="rounded-xl bg-primary px-6 py-2.5 text-xs font-extrabold text-primary-foreground">
              Save Business Settings
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
