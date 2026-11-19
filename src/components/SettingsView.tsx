import { AlertCircle, CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { validateWeights } from '../lib/scoringEngine';
import {
  CAPTION_PRESETS,
  CaptionPresetId,
  DEFAULT_SCORING_WEIGHTS,
  ScoringWeights,
  UserSettings,
} from '../shared/types';

interface SettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (next: UserSettings) => Promise<void>;
}

const WEIGHT_FIELDS: Array<{ key: keyof ScoringWeights; label: string; description: string }> = [
  {
    key: 'humour',
    label: 'Humour & Entertainment',
    description: 'Jokes, punchlines, comedic timing, and unexpected turns',
  },
  {
    key: 'contextPayoff',
    label: 'Context & Payoff',
    description: 'Presence of a clean setup leading into a complete resolution',
  },
  {
    key: 'audioReactions',
    label: 'Audio Reactions',
    description: 'Laughter bursts, sudden vocal intensity spikes, and pauses',
  },
  {
    key: 'audienceEngagement',
    label: 'Audience Engagement Signals',
    description: 'Comment timestamp cues and replay heatmap peaks when available',
  },
  {
    key: 'visualInterest',
    label: 'Visual Interest',
    description: 'Scene cuts, dynamic reactions, and visually distinct frames',
  },
  {
    key: 'emotionalImpact',
    label: 'Emotional Impact',
    description: 'Surprise, excitement, tension, or genuine human reactions',
  },
  {
    key: 'clipCompleteness',
    label: 'Clip Completeness',
    description: 'Avoids cutting off sentences or trailing reactions at the boundary',
  },
];

export function SettingsView({ settings, onSaveSettings }: SettingsViewProps) {
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const weightCheck = validateWeights(draft.weights);

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setSavedBanner(false);
    setErrorMsg(null);
    setDraft((prev) => ({
      ...prev,
      weights: {
        ...prev.weights,
        [key]: Math.max(0, Math.min(100, Math.round(value))),
      },
    }));
  };

  const handleDefaultPreset = (presetId: CaptionPresetId) => {
    setSavedBanner(false);
    if (presetId === 'off') {
      setDraft((prev) => ({
        ...prev,
        defaultCaptionConfig: { ...prev.defaultCaptionConfig, enabled: false, preset: 'off' },
      }));
      return;
    }
    const found = CAPTION_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setDraft((prev) => ({
      ...prev,
      defaultCaptionConfig: {
        enabled: true,
        preset: presetId,
        ...found.config,
      },
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!weightCheck.valid) {
      setErrorMsg(`Scoring weights must total 100% (currently ${weightCheck.total}%).`);
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSaveSettings(draft);
      setSavedBanner(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-white">
            Engine Settings
          </h1>
          <p className="text-sm text-zinc-400">
            Configure the ClipHunt Viral Detection Engine weights and default render pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setSavedBanner(false);
              setErrorMsg(null);
              setDraft((prev) => ({ ...prev, weights: { ...DEFAULT_SCORING_WEIGHTS } }));
            }}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-[#080808] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 touch-manipulation"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="submit"
            disabled={saving || !weightCheck.valid}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 touch-manipulation"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-xs text-white">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Settings saved and applied to future analyses.</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Weighted Scoring Configuration */}
      <section className="rounded-xl border border-white/15 bg-[#080808] p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-base font-medium text-white">
              Viral Detection Engine Weights
            </h2>
            <p className="text-xs text-zinc-400">
              All seven signal weights must add up to exactly 100%.
            </p>
          </div>
          <div
            className={`font-mono text-sm font-semibold tabular-nums ${
              weightCheck.valid ? 'text-white' : 'text-amber-400'
            }`}
          >
            Total: {weightCheck.total}%
          </div>
        </div>

        <div className="space-y-4">
          {WEIGHT_FIELDS.map((field) => (
            <div key={field.key} className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
              <div className="sm:col-span-6">
                <div className="text-sm font-medium text-white">{field.label}</div>
                <div className="text-xs text-zinc-500">{field.description}</div>
              </div>
              <div className="sm:col-span-4">
                <input
                  type="range"
                  min={0}
                  max={60}
                  aria-label={field.label}
                  value={draft.weights[field.key]}
                  onChange={(e) => updateWeight(field.key, Number(e.target.value))}
                  className="h-6 w-full accent-white cursor-pointer"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <div className="flex items-center rounded-md border border-white/15 bg-black px-2.5 py-1.5 sm:py-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`${field.label} percentage`}
                    value={draft.weights[field.key]}
                    onChange={(e) => updateWeight(field.key, Number(e.target.value))}
                    className="w-12 sm:w-10 bg-transparent text-right font-mono text-base sm:text-xs tabular-nums text-white focus:outline-none"
                  />
                  <span className="ml-1 text-xs text-zinc-500">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Default Caption & Render Validation */}
      <section className="rounded-xl border border-white/15 bg-[#080808] p-6 space-y-4">
        <h2 className="font-display text-base font-medium text-white">
          Default Caption Preset & Validation
        </h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDefaultPreset('off')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              !draft.defaultCaptionConfig.enabled || draft.defaultCaptionConfig.preset === 'off'
                ? 'border-white bg-white text-black'
                : 'border-white/15 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            Off
          </button>
          {CAPTION_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleDefaultPreset(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                draft.defaultCaptionConfig.enabled && draft.defaultCaptionConfig.preset === p.id
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 bg-black text-zinc-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 pt-2 border-t border-white/10">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-white">
                Automatic FFprobe & 3-Frame Render Validation
              </div>
              <div className="text-xs text-zinc-500">
                Verifies 20.0s duration, stream codecs, resolution, and decoded frames before
                exposing downloads.
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.autoValidateClips}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, autoValidateClips: e.target.checked }))
              }
              className="h-4 w-4 rounded border-white/30 bg-black accent-white"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-white">
                Prefer Direct HTTPS/DASH Media Formats
              </div>
              <div className="text-xs text-zinc-500">
                Prioritizes clean MP4/M4A HTTPS streams over fragmented HLS segments when
                supported.
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.preferDirectHttps}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, preferDirectHttps: e.target.checked }))
              }
              className="h-4 w-4 rounded border-white/30 bg-black accent-white"
            />
          </label>
        </div>
      </section>
    </form>
  );
}
