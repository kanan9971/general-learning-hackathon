import { MarketLab } from '@/components/MarketLab';

/** First-run placement quiz: adaptive, one question per topic, builds the personalised roadmap. */
export default function OnboardingPlacement() {
  return <MarketLab mode="placement" onboarding />;
}
