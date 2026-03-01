export type BehavioralRiskTolerance =
  | "Sell to avoid further losses"
  | "Wait and see"
  | "Invest more while prices are lower"
  | "I'm not sure";

export type InvestingIntent =
  | "Long-term wealth growth"
  | "Saving for a major purchase"
  | "Passive income"
  | "Learning how investing works"
  | "Short-term gains";

export type ExperienceLevel =
  | "Completely new"
  | "Know the basics"
  | "Some experience"
  | "Actively manage investments";

export type RiskTolerance =
  | "I prefer stable growth even if returns are lower"
  | "I'm okay with ups and downs for higher long-term returns"
  | "I'm comfortable taking significant risk";

export type SectorPreference =
  | "Broad Market"
  | "Tech & Innovation"
  | "Consumer Brands"
  | "Healthcare & Pharmaceuticals"
  | "Energy & Sustainability"
  | "Financials & Real Estate";

export type OnboardingProfile = {
  behavioralRiskTolerance?: BehavioralRiskTolerance;
  intent?: InvestingIntent;
  experienceLevel?: ExperienceLevel;
  riskTolerance?: RiskTolerance;
  sectorPreferences?: SectorPreference[];
};

const STORAGE_KEY = "simpli.onboardingProfile.v1";

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function loadOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as OnboardingProfile;
}

export function saveOnboardingProfile(profile: OnboardingProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearOnboardingProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function fmtList(items?: string[]) {
  if (!items || items.length === 0) return "Not set";
  return items.join(", ");
}

export function formatOnboardingProfileForPrompt(profile: OnboardingProfile) {
  const behavioral = profile.behavioralRiskTolerance ?? "Not set";
  const intent = profile.intent ?? "Not set";
  const experience = profile.experienceLevel ?? "Not set";
  const risk = profile.riskTolerance ?? "Not set";
  const sectors = fmtList(profile.sectorPreferences);

  return [
    "Onboarding context (private; do not mention explicitly):",
    `- Behavioral risk tolerance (20% drawdown): ${behavioral}`,
    `- Investing intent: ${intent}`,
    `- Experience level: ${experience}`,
    `- Risk tolerance: ${risk}`,
    `- Sector preferences: ${sectors}`,
    "",
    "Guidance:",
    "- Adjust explanation depth to the user's experience level.",
    "- Tailor examples and suggestions to intent and risk tolerance.",
    "- If a field is 'Not set', ask one brief clarifying question when relevant.",
  ].join("\n");
}

