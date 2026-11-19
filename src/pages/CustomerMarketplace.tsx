import React, { useEffect, useState } from 'react';
import {
  Search,
  Heart,
  ArrowRight,
  ChevronRight,
  MapPin,
  CalendarDays,
} from 'lucide-react';
import { apiFetch, formatZarFromCents } from '../lib/api.ts';
import { useAuthContext } from '../lib/clerk-wrapper.tsx';
import { EventCoverImage, HERO_BANNER_IMAGE, resolveEventCoverImage } from '../lib/event-images.tsx';

interface MarketplaceEvent {
  id: number;
  slug?: string;
  name: string;
  description?: string;
  coverImage?: string;
  category: string;
  city: string;
  venueDisplay: string;
  dateText: string;
  startTime?: string;
  isFeatured: number;
  isOnline: number;
  minPriceCents: number;
  maxPriceCents: number;
  totalRemaining: number;
  totalSold: number;
  businessName: string;
  status: string;
}

export default function CustomerMarketplace({
  onNavigate,
  mode = 'discover',
}: {
  onNavigate: (path: string) => void;
  mode?: 'discover' | 'events';
}) {
  const { isSignedIn } = useAuthContext();
  const [events, setEvents] = useState<MarketplaceEvent[]>([]);
  const [allUnfilteredCount, setAllUnfilteredCount] = useState<number>(0);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; slug: string }>>([]);
  const [favIds, setFavIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [sort, setSort] = useState<'featured' | 'popular' | 'recent'>('featured');
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeSceneRow, setActiveSceneRow] = useState(1);

  const loadEvents = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedCity !== 'all') params.set('city', selectedCity);
    if (priceFilter !== 'all') params.set('price', priceFilter);
    params.set('sort', sort);

    const res = await apiFetch<{ events: MarketplaceEvent[]; categories: any[] }>(`/api/discover?${params.toString()}`);
    if (res.ok && res.data) {
      const list = res.data.events || [];
      setEvents(list);
      setCategories(res.data.categories || []);
      if (!query.trim() && selectedCategory === 'all' && selectedCity === 'all' && priceFilter === 'all') {
        setAllUnfilteredCount(list.length);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(loadEvents, 120);
    return () => clearTimeout(timer);
  }, [query, selectedCategory, selectedCity, priceFilter, sort]);

  useEffect(() => {
    if (!isSignedIn) {
      setFavIds([]);
      return;
    }
    apiFetch<any[]>('/api/favourites').then((res) => {
      if (res.ok && Array.isArray(res.data)) {
        setFavIds(res.data.map((f) => f.eventId));
      }
    });
  }, [isSignedIn]);

  const toggleFav = async (e: React.MouseEvent, eventId: number) => {
    e.stopPropagation();
    if (!isSignedIn) {
      window.sessionStorage.setItem('bookmyte:return-url', window.location.pathname + window.location.search);
      onNavigate('/login');
      return;
    }
    const res = await apiFetch<{ favourited: boolean }>('/api/favourites/toggle', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    });
    if (res.ok) {
      setFavIds((prev) => (res.data.favourited ? [...prev, eventId] : prev.filter((id) => id !== eventId)));
    }
  };

  const featuredList = events.filter((e) => e.isFeatured === 1);
  const heroPool = featuredList.length > 0 ? featuredList : events;
  const featuredLead = heroPool[heroIndex % Math.max(1, heroPool.length)] || events[0];
  const cities = Array.from(new Set(events.map((e) => e.city).filter(Boolean)));

  const openEvent = (evt: MarketplaceEvent) => {
    onNavigate(`/events/${evt.slug || evt.id}`);
  };

  const scrollToExplore = () => {
    const el = document.getElementById('explore-grid');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Build up to 3 curated Scene rows from real categories + event imagery
  const sceneRows = (categories.length >= 3
    ? categories.slice(0, 3).map((cat, idx) => {
        const matchEvt = events.find((e) => e.category.toLowerCase() === cat.name.toLowerCase()) || events[idx];
        return {
          key: cat.name.toLowerCase(),
          label: cat.name.toUpperCase(),
          sublabel: idx === 0 ? 'CURATED EXPERIENCES' : idx === 1 ? 'NIGHTLIFE & STAGES' : 'WORKSHOPS & TALKS',
          thumb: resolveEventCoverImage(matchEvt?.coverImage, cat.name, matchEvt?.id ?? idx),
          tilt: idx % 2 === 0 ? 'rotate-[-3deg]' : 'rotate-[3deg]',
        };
      })
    : [
        {
          key: 'arts & culture',
          label: 'ART & CULTURE',
          sublabel: 'EXHIBITIONS & GALLERIES',
          thumb: resolveEventCoverImage(undefined, 'arts', 2),
          tilt: 'rotate-[-3deg]',
        },
        {
          key: 'music & festivals',
          label: 'LIVE MUSIC',
          sublabel: 'FESTIVALS & ROOFTOPS',
          thumb: resolveEventCoverImage(undefined, 'music', 0),
          tilt: 'rotate-[3deg]',
        },
        {
          key: 'tech & conferences',
          label: 'WORKSHOPS',
          sublabel: 'SUMMITS & TALKS',
          thumb: resolveEventCoverImage(undefined, 'tech', 1),
          tilt: 'rotate-[-2deg]',
        },
      ]);

  const totalSpotsRemaining = events.reduce((sum, ev) => sum + (ev.totalRemaining || 0), 0);

  return (
    <div className="space-y-12 pb-16">
      {/* Pulse Hero + Scene Index Split (Discover Landing) */}
      {mode === 'discover' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Hero Poster Card */}
          <div className="lg:col-span-7 relative min-h-[420px] sm:min-h-[500px] rounded-[1.75rem] overflow-hidden bg-neutral-950 border border-border/60 flex flex-col justify-between">
            {featuredLead ? (
              <EventCoverImage
                src={featuredLead.coverImage}
                category={featuredLead.category}
                eventId={featuredLead.id}
                alt={featuredLead.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <img
                src={HERO_BANNER_IMAGE}
                alt="Live music festival stage"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            {/* Editorial Dark Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />

            {/* Top Hero Strip */}
            <div className="relative z-10 p-6 sm:p-8 flex items-center justify-between gap-4">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white/80">
                SOUTH AFRICA · LIVE TICKETING
              </span>
              {featuredLead && (
                <button
                  type="button"
                  onClick={() => openEvent(featuredLead)}
                  className="hidden sm:inline-flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-xs border border-white/15 px-3.5 py-1.5 text-[11px] font-semibold text-white/90 hover:border-primary transition-colors"
                >
                  <span className="truncate max-w-[200px]">{featuredLead.name}</span>
                  <span className="font-mono text-primary font-bold tabular-nums">
                    {featuredLead.minPriceCents === 0 ? 'FREE' : formatZarFromCents(featuredLead.minPriceCents)}
                  </span>
                </button>
              )}
            </div>

            {/* Bottom Headline & CTA */}
            <div className="relative z-10 p-6 sm:p-10 space-y-5">
              <div className="space-y-3">
                <h1 className="font-display text-5xl sm:text-6xl lg:text-[68px] font-extrabold uppercase tracking-tight leading-[0.93] text-white [text-wrap:balance]">
                  YOUR CITY
                  <br />
                  HAS A <span className="text-primary">PULSE</span>
                </h1>
                <p className="text-sm sm:text-base text-white/80 max-w-md leading-relaxed">
                  Find live concerts, rooftop sessions, culinary harvests, and tech summits across South Africa—with instant QR passes.
                </p>
              </div>

              {/* Pagination Dots for Hero Pool */}
              {heroPool.length > 1 && (
                <div className="flex items-center gap-2">
                  {heroPool.slice(0, 4).map((ev, idx) => (
                    <button
                      key={ev.id}
                      type="button"
                      aria-label={`Show featured event ${ev.name}`}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-1.5 rounded-full transition-all ${
                        heroIndex % heroPool.length === idx ? 'w-6 bg-primary' : 'w-1.5 bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => (featuredLead ? openEvent(featuredLead) : scrollToExplore())}
                  className="inline-flex items-center justify-between gap-4 rounded-xl bg-primary px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider text-primary-foreground hover:brightness-95 transition-all whitespace-nowrap shrink-0"
                >
                  <span>{featuredLead ? `Book ${featuredLead.name}` : 'Enter The Scene'}</span>
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={scrollToExplore}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/45 backdrop-blur-xs px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                >
                  Browse All Events
                </button>
              </div>
            </div>
          </div>

          {/* Right Scene Index Panel (Inspired directly by Screen 2) */}
          <div className="lg:col-span-5 rounded-[1.75rem] border border-border bg-card overflow-hidden flex flex-col justify-between">
            {/* Top Bar inside Scene Card */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-3">
              <div className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground leading-none">
                <span className="text-primary">S</span>CENE
              </div>

              <div className="relative inline-flex items-center">
                <MapPin size={13} className="absolute left-3 text-primary pointer-events-none" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  aria-label="Select city"
                  className="appearance-none rounded-full border border-border bg-background pl-8 pr-7 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground outline-none hover:border-primary/60 cursor-pointer"
                >
                  <option value="all">South Africa</option>
                  {cities.map((c) => (
                    <option key={c} value={c.toLowerCase()}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category Scene Rows */}
            <div className="divide-y divide-border border-y border-border flex-1 flex flex-col justify-center">
              {sceneRows.map((row, idx) => {
                const isSelected =
                  selectedCategory === row.key || (selectedCategory === 'all' && activeSceneRow === idx);
                return (
                  <button
                    key={row.key}
                    type="button"
                    onMouseEnter={() => setActiveSceneRow(idx)}
                    onClick={() => {
                      setActiveSceneRow(idx);
                      setSelectedCategory(selectedCategory === row.key ? 'all' : row.key);
                      scrollToExplore();
                    }}
                    className={`w-full px-6 py-4 flex items-center justify-between gap-4 text-left transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {row.sublabel}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-display text-3xl sm:text-[34px] font-extrabold uppercase tracking-tight leading-none ${
                            isSelected ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {row.label}
                        </span>
                        {isSelected && (
                          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center shrink-0">
                            <ArrowRight size={14} />
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className={`h-16 w-24 sm:h-[72px] sm:w-28 rounded-xl overflow-hidden border-2 border-card shadow-md shrink-0 transition-transform duration-300 ${row.tilt} ${
                        isSelected ? 'scale-105' : 'opacity-90'
                      }`}
                    >
                      <img src={row.thumb} alt={row.label} className="h-full w-full object-cover" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Database Stats Strip */}
            <div className="grid grid-cols-3 divide-x divide-border py-4 px-4 text-center bg-card">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Live Events</div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-primary tabular-nums mt-0.5">
                  {allUnfilteredCount || events.length}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Passes Open</div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-primary tabular-nums mt-0.5">
                  {totalSpotsRemaining}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Saved</div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-primary tabular-nums mt-0.5">
                  {favIds.length}
                </div>
              </div>
            </div>

            {/* Bottom Obsidian Search Bar */}
            <div className="bg-[#11100F] text-[#F2ECE1] px-4 py-3 flex items-center gap-3">
              <Search size={16} className="text-[#F2ECE1]/70 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SEARCH EVENTS OR CITIES..."
                aria-label="Search events, organisers, venues, or cities"
                className="flex-1 bg-transparent text-xs font-mono uppercase tracking-wider text-[#F2ECE1] placeholder:text-[#F2ECE1]/50 outline-none"
              />
              <button
                type="button"
                onClick={scrollToExplore}
                className="inline-flex items-center gap-1 font-display text-base font-extrabold uppercase tracking-wider text-white hover:text-primary transition-colors whitespace-nowrap shrink-0"
              >
                EXPLORE
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* EXPLORE Header + Filter Bar (Screen 3 Style) */}
      <section id="explore-grid" className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-foreground leading-none">
              {mode === 'discover' ? 'EXPLORE' : 'ALL EVENTS'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
              {loading
                ? 'Loading live marketplace...'
                : `${events.length} curated event${events.length === 1 ? '' : 's'} available in ZAR`}
            </p>
          </div>

          {/* Search (when on /events catalog mode) + Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {mode === 'events' && (
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events..."
                  className="onboarding-input pl-9 py-2 text-xs"
                />
              </div>
            )}

            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              aria-label="Filter by city"
              className="onboarding-input w-auto py-2 text-xs font-semibold"
            >
              <option value="all">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c.toLowerCase()}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
              aria-label="Filter by price"
              className="onboarding-input w-auto py-2 text-xs font-semibold"
            >
              <option value="all">All Prices</option>
              <option value="free">Free Entry</option>
              <option value="under200">Under R200</option>
              <option value="paid">Paid Tickets</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              aria-label="Sort events"
              className="onboarding-input w-auto py-2 text-xs font-semibold"
            >
              <option value="featured">Featured First</option>
              <option value="popular">Most Popular</option>
              <option value="recent">Recently Added</option>
            </select>

            {mode === 'discover' && (
              <button
                type="button"
                onClick={() => onNavigate('/events')}
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:underline px-2 whitespace-nowrap shrink-0"
              >
                Full Catalog
              </button>
            )}
          </div>
        </div>

        {/* Clean Category Underline Tabs with Vermilion Active Dot */}
        <div className="flex items-center gap-6 overflow-x-auto border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`relative pb-1 text-xs font-extrabold uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors ${
              selectedCategory === 'all' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Events
            {selectedCategory === 'all' && (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary"
              />
            )}
          </button>

          {categories.map((cat) => {
            const key = cat.name.toLowerCase();
            const active = selectedCategory === key;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(key)}
                className={`relative pb-1 text-xs font-extrabold uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.name}
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

        {/* Poster-Style Immersive Event Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-[4/5] rounded-2xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-3">
            <h3 className="font-display text-2xl font-extrabold uppercase text-foreground">
              No Matching Events Found
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Try clearing your search term or selecting a different city, category, or price filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedCategory('all');
                setSelectedCity('all');
                setPriceFilter('all');
              }}
              className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-primary-foreground"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((evt) => {
              const isFav = favIds.includes(evt.id);
              const soldOut = evt.status === 'SOLD_OUT' || evt.totalRemaining === 0;
              return (
                <article
                  key={evt.id}
                  onClick={() => openEvent(evt)}
                  className="group relative aspect-[4/4.6] cursor-pointer rounded-2xl overflow-hidden bg-neutral-950 border border-border/60 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1"
                >
                  <EventCoverImage
                    src={evt.coverImage}
                    category={evt.category}
                    eventId={evt.id}
                    alt={evt.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/15" />

                  {/* Top Action Row */}
                  <div className="relative z-10 p-4 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-white/80">
                      {evt.city}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => toggleFav(e, evt.id)}
                      aria-label={isFav ? 'Remove from favourites' : 'Save to favourites'}
                      className="h-9 w-9 rounded-full bg-black/50 backdrop-blur-xs border border-white/15 flex items-center justify-center text-white hover:border-primary transition-colors"
                    >
                      <Heart size={15} className={isFav ? 'fill-primary text-primary' : ''} />
                    </button>
                  </div>

                  {/* Bottom Poster Details */}
                  <div className="relative z-10 p-5 sm:p-6 space-y-2.5">
                    <div className="text-[11px] font-medium text-white/75 truncate">
                      {evt.category} · {evt.venueDisplay}
                    </div>

                    <h3 className="font-display text-2xl sm:text-[28px] font-extrabold uppercase tracking-tight leading-[1.02] text-white line-clamp-2">
                      {evt.name}
                    </h3>

                    <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 text-white/80 truncate">
                        <CalendarDays size={13} className="text-primary shrink-0" />
                        <span className="truncate font-mono text-[11px]">
                          {evt.dateText}
                          {evt.startTime ? ` · ${evt.startTime}` : ''}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold tabular-nums whitespace-nowrap shrink-0 text-white">
                        <span className={soldOut ? 'text-white/60' : 'text-primary'}>
                          {soldOut
                            ? 'SOLD OUT'
                            : evt.minPriceCents === 0
                              ? 'FREE'
                              : `FROM ${formatZarFromCents(evt.minPriceCents)}`}
                        </span>
                        <ArrowRight size={13} className="text-white/80 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Organiser Architectural Banner */}
      {mode === 'discover' && (
        <section className="rounded-[1.75rem] bg-[#11100F] text-[#F2ECE1] p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-border/40">
          <div className="space-y-2 max-w-xl">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
              FOR EVENT ORGANISERS
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight leading-none">
              LAUNCH YOUR FESTIVAL OR SHOW ON <span className="text-primary">BOOKMYTE</span>
            </h2>
            <p className="text-sm text-[#F2ECE1]/75 leading-relaxed">
              Manage multi-tier ZAR ticket inventory, scan QR passes at the gate, and track instant payouts from one unified organiser portal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/business/onboarding')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider text-primary-foreground hover:brightness-95 transition-all whitespace-nowrap shrink-0"
          >
            Get Started as Organiser
            <ArrowRight size={15} />
          </button>
        </section>
      )}
    </div>
  );
}
