"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BehavioralRiskTolerance,
  clearOnboardingProfile,
  ExperienceLevel,
  formatOnboardingProfileForPrompt,
  InvestingIntent,
  loadOnboardingProfile,
  OnboardingProfile,
  RiskTolerance,
  saveOnboardingProfile,
  SectorPreference,
} from "../lib/onboardingProfile";

const behavioralOptions: BehavioralRiskTolerance[] = [
  "Sell to avoid further losses",
  "Wait and see",
  "Invest more while prices are lower",
  "I'm not sure",
];

const intentOptions: InvestingIntent[] = [
  "Long-term wealth growth",
  "Saving for a major purchase",
  "Passive income",
  "Learning how investing works",
  "Short-term gains",
];

const experienceOptions: ExperienceLevel[] = [
  "Completely new",
  "Know the basics",
  "Some experience",
  "Actively manage investments",
];

const riskToleranceOptions: RiskTolerance[] = [
  "I prefer stable growth even if returns are lower",
  "I'm okay with ups and downs for higher long-term returns",
  "I'm comfortable taking significant risk",
];

const sectorOptions: SectorPreference[] = [
  "Broad Market",
  "Tech & Innovation",
  "Consumer Brands",
  "Healthcare & Pharmaceuticals",
  "Energy & Sustainability",
  "Financials & Real Estate",
];

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value?: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt}
          className="flex items-center gap-2 text-sm text-white/90 cursor-pointer"
        >
          <input
            type="radio"
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="accent-white"
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

export default function OnboardingProfileModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: OnboardingProfile | null) => void;
}) {
  const [profile, setProfile] = useState<OnboardingProfile>({});

  useEffect(() => {
    if (!open) return;
    setProfile(loadOnboardingProfile() ?? {});
  }, [open]);

  const preview = useMemo(() => {
    if (!open) return "";
    return formatOnboardingProfileForPrompt(profile);
  }, [open, profile]);

  if (!open) return null;

  const toggleSector = (sector: SectorPreference) => {
    setProfile((p) => {
      const current = new Set(p.sectorPreferences ?? []);
      if (current.has(sector)) current.delete(sector);
      else current.add(sector);
      return { ...p, sectorPreferences: Array.from(current) };
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-[min(720px,95vw)] max-h-[85vh] overflow-auto rounded-[20px] border border-white/25 bg-[#0b0f1a] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Onboarding profile (prototype)</h2>
            <p className="text-xs text-white/60 mt-1">
              Stored locally for now. Later this can come from Supabase auth +
              profile table.
            </p>
          </div>
          <button
            className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm hover:bg-white/15"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">
                Behavioral risk tolerance
              </h3>
              <p className="text-xs text-white/60">
                If your investments dropped 20% in a month, what would you most
                likely do?
              </p>
              <RadioGroup
                value={profile.behavioralRiskTolerance}
                onChange={(v) => setProfile((p) => ({ ...p, behavioralRiskTolerance: v }))}
                options={behavioralOptions}
              />
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Intent</h3>
              <p className="text-xs text-white/60">
                What are you investing for?
              </p>
              <RadioGroup
                value={profile.intent}
                onChange={(v) => setProfile((p) => ({ ...p, intent: v }))}
                options={intentOptions}
              />
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Experience level</h3>
              <p className="text-xs text-white/60">
                This helps the LLM adjust explanations.
              </p>
              <RadioGroup
                value={profile.experienceLevel}
                onChange={(v) => setProfile((p) => ({ ...p, experienceLevel: v }))}
                options={experienceOptions}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Risk tolerance</h3>
              <p className="text-xs text-white/60">Which feels closer to you?</p>
              <RadioGroup
                value={profile.riskTolerance}
                onChange={(v) => setProfile((p) => ({ ...p, riskTolerance: v }))}
                options={riskToleranceOptions}
              />
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Sector preference</h3>
              <p className="text-xs text-white/60">
                Select multiple (optional).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sectorOptions.map((s) => {
                  const checked = (profile.sectorPreferences ?? []).includes(s);
                  return (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm text-white/90 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSector(s)}
                        className="accent-white"
                      />
                      <span>{s}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Preview injected context</h3>
              <pre className="text-[11px] whitespace-pre-wrap rounded-[14px] border border-white/15 bg-white/5 p-3 text-white/80">
                {preview}
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-full bg-white/5 border border-white/20 text-sm hover:bg-white/10"
            onClick={() => {
              clearOnboardingProfile();
              onSaved(null);
              onClose();
            }}
          >
            Clear profile
          </button>
          <button
            className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90"
            onClick={() => {
              saveOnboardingProfile(profile);
              onSaved(profile);
              onClose();
            }}
          >
            Save & use for chat
          </button>
        </div>
      </div>
    </div>
  );
}

