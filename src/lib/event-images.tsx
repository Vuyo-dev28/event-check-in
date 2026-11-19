import React, { useState } from 'react';
import festivalBanner from '../assets/images/festival_neon_banner_1791200339906.jpg';
import summitStage from '../assets/images/cape_town_summit_stage_1795081786503.jpg';
import culinaryHarvest from '../assets/images/stellenbosch_culinary_harvest_1795081787459.jpg';
import rooftopConcert from '../assets/images/johannesburg_rooftop_concert_1795081785897.jpg';

export const HERO_BANNER_IMAGE = festivalBanner;

export function resolveEventCoverImage(coverImage?: string | null, category?: string | null, eventId?: number): string {
  if (coverImage && (coverImage.startsWith('/') || coverImage.startsWith('data:') || coverImage.startsWith('http'))) {
    // Replace any legacy external unsplash/picsum URLs with resilient local assets
    if (!coverImage.includes('unsplash.com') && !coverImage.includes('picsum.photos') && !coverImage.includes('placeholder.com')) {
      return coverImage;
    }
  }
  const cat = (category || '').toLowerCase();
  if (cat.includes('tech') || cat.includes('conf') || cat.includes('business') || cat.includes('summit')) {
    return summitStage;
  }
  if (cat.includes('food') || cat.includes('wine') || cat.includes('lifestyle') || cat.includes('culinary')) {
    return culinaryHarvest;
  }
  if (cat.includes('night') || cat.includes('rooftop') || cat.includes('indie') || cat.includes('concert')) {
    return rooftopConcert;
  }
  const pool = [festivalBanner, summitStage, culinaryHarvest, rooftopConcert];
  return pool[Math.abs(Number(eventId || 0)) % pool.length];
}

export function EventCoverImage({
  src,
  category,
  eventId,
  alt,
  className = '',
}: {
  src?: string | null;
  category?: string | null;
  eventId?: number;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveEventCoverImage(src, category, eventId);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-secondary text-secondary-foreground p-6 text-center ${className}`}
      >
        <span className="font-mono text-[11px] uppercase tracking-widest opacity-70">{category || 'Live Event'}</span>
        <span className="mt-1 text-sm font-bold line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
