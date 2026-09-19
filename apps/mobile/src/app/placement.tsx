import { MarketLab } from '@/components/MarketLab';

/** Retake the placement quiz any time from the profile page; it re-seeds the roadmap. */
export default function PlacementRoute() {
  return <MarketLab mode="placement" />;
}
