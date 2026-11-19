import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardPaste,
  Film,
  FolderOpen,
  Loader2,
  Plus,
  Upload,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { formatTimestamp, validateYouTubeUrl } from '../lib/urlValidation';
import { ProjectDetail, UserUsage } from '../shared/types';
import { WireframeGlobe } from './WireframeGlobe';

interface DashboardViewProps {
  usage: UserUsage | null;
  projects: ProjectDetail[];
  onAnalyzeUrl: (url: string) => Promise<void>;
  onUploadVideo: (file: File) => Promise<void>;
  onOpenProject: (projectId: string) => void;
  onViewAllProjects: () => void;
  onOpenHelp: () => void;
  isSubmitting: boolean;
}

/**
 * 24x24 concave white corner fillet used where two perpendicular white modular blocks meet
 * against the pure black canvas, matching the smooth sculptural curves in the reference layout.
 */
function ConcaveCorner({
  position,
  className = '',
}: {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}) {
  const paths: Record<typeof position, string> = {
    'bottom-left': 'M0,0 L0,24 L24,24 A24,24 0 0,1 0,0 Z',
    'bottom-right': 'M24,0 L24,24 L0,24 A24,24 0 0,0 24,0 Z',
    'top-left': 'M0,24 L0,0 L24,0 A24,24 0 0,0 0,24 Z',
    'top-right': 'M0,0 L24,0 L24,24 A24,24 0 0,0 0,0 Z',
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none hidden lg:block absolute ${className}`}
    >
      <path d={paths[position]} fill="#FFFFFF" />
    </svg>
  );
}

export function DashboardView({
  usage,
  projects,
  onAnalyzeUrl,
  onUploadVideo,
  onOpenProject,
  onViewAllProjects,
  onOpenHelp,
  isSubmitting,
}: DashboardViewProps) {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = async () => {
    setUrlError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setUrlInput(text.trim());
        return;
      }
      setUrlError('Your clipboard is empty. Copy a YouTube link and try again.');
    } catch {
      setUrlError('Clipboard permission is blocked. Paste your YouTube URL directly into the box.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateYouTubeUrl(urlInput);
    if (!check.valid) {
      setUrlError(check.errorMessage || 'Please enter a valid YouTube URL.');
      return;
    }
    setUrlError(null);
    await onAnalyzeUrl(check.normalizedUrl || urlInput.trim());
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUrlError(null);
    await onUploadVideo(file);
    e.target.value = '';
  };

  const remainingMonthly = Math.max(
    0,
    (usage?.monthlyClipsLimit ?? 60) - (usage?.monthlyClipsUsed ?? 0),
  );
  const availableStorageMb = Math.max(
    0,
    Math.round(((usage?.storageLimitMb ?? 2048) - (usage?.storageUsedMb ?? 0)) * 10) / 10,
  );

  const recentProjects = projects.slice(0, 4);

  return (
    <div className="mx-auto max-w-[1200px] space-y-12">
      {/* Reference-Matched Black & White Geometric Hero Grid */}
      <section aria-label="ClipHunt Viral Video Extractor" className="pt-0 lg:pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-0">
          {/* ROW 1, COLS 1–4: Primary White Headline Block */}
          <div className="lg:col-start-1 lg:col-end-5 lg:row-start-1 bg-white text-black rounded-t-[24px] lg:rounded-tl-[28px] lg:rounded-tr-[28px] px-5 pt-6 pb-3 sm:px-10 sm:pt-10 sm:pb-4">
            <h1
              className="font-display text-[28px] sm:text-5xl font-normal tracking-[-0.025em] leading-[1.08] text-black max-w-xl"
              style={{ textWrap: 'balance' }}
            >
              Turn long videos
              <br />
              into viral moments.
            </h1>
          </div>

          {/* ROW 1, COL 5: Black Callout (+ Intelligence) */}
          <div className="hidden lg:flex lg:col-start-5 lg:row-start-1 bg-black text-white px-5 pt-2 pb-5 flex-col justify-start relative">
            <Plus className="h-4 w-4 text-white mb-2" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="font-display text-sm font-medium text-white">Intelligence</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Multi-signal scoring for setup, payoff, and reaction.
            </p>
            <ConcaveCorner position="bottom-left" className="left-0 bottom-0" />
          </div>

          {/* ROW 1, COL 6: Standalone White Square Action Tile */}
          <div className="hidden lg:flex lg:col-start-6 lg:row-start-1 pl-3 pb-3">
            <button
              type="button"
              onClick={() => urlInputRef.current?.focus()}
              aria-label="Focus YouTube URL input"
              className="group flex h-full min-h-[148px] w-full items-end justify-end rounded-[26px] bg-white p-5 text-black hover:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowUpRight
                className="h-7 w-7 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* ROW 2, COLS 1–3: White Interactive URL & Upload Surface */}
          <div className="lg:col-start-1 lg:col-end-4 lg:row-start-2 bg-white text-black rounded-b-[24px] lg:rounded-bl-[28px] lg:rounded-br-[28px] px-5 pb-6 pt-3 sm:px-10 sm:pb-8 sm:pt-4">
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <label htmlFor="youtube-url-input" className="sr-only">
                YouTube Video URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    ref={urlInputRef}
                    id="youtube-url-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (urlError) setUrlError(null);
                    }}
                    placeholder="Paste YouTube video link..."
                    aria-invalid={Boolean(urlError)}
                    className="h-12 sm:h-11 w-full rounded-lg border border-black/20 bg-zinc-50 pl-3.5 pr-24 text-base sm:text-sm text-black placeholder:text-zinc-500 focus:border-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/15"
                  />
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[36px] items-center gap-1 rounded border border-black/15 bg-white px-2.5 py-1.5 text-xs font-medium text-black hover:bg-zinc-100 active:bg-zinc-200 transition-colors whitespace-nowrap touch-manipulation"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden="true" />
                    <span>Paste URL</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-12 sm:h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm sm:text-xs font-semibold text-white hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black touch-manipulation"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                  )}
                  <span>Find Viral Moments</span>
                </button>
              </div>

              {urlError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 text-xs font-medium text-rose-700 pt-0.5"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{urlError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] sm:min-h-[34px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-black/20 bg-white px-3.5 py-2 sm:py-1.5 text-xs font-medium text-black hover:bg-zinc-100 active:bg-zinc-200 transition-colors whitespace-nowrap touch-manipulation"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Upload Authorized Video</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Upload authorized video file"
                />

                <span className="text-center sm:text-right text-[11px] text-zinc-600">
                  16:9 + 9:16 exports · 20s clips
                </span>
              </div>
            </form>
          </div>

          {/* ROW 2, COL 4: Embedded Black Square Housing Wireframe Particle Globe */}
          <div className="hidden lg:flex lg:col-start-4 lg:row-start-2 bg-white p-2.5 items-center justify-center relative">
            <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-black p-2">
              <WireframeGlobe />
            </div>
          </div>

          {/* ROW 2, COL 5: White Right Modular Wing */}
          <div className="hidden lg:block lg:col-start-5 lg:row-start-2 bg-white rounded-tr-[28px] rounded-br-[28px]" />

          {/* ROW 2–3, COL 6: Black Callout (* Impact) */}
          <div className="hidden lg:flex lg:col-start-6 lg:row-start-2 lg:row-end-4 bg-black text-white pl-5 pt-8 flex-col justify-center">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="mb-2.5 text-white"
            >
              <path
                d="M12 2V22M2 12H22M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="1.5 2.5"
              />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
            <h2 className="font-display text-sm font-medium text-white">Impact</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Verified H.264 exports with 3-frame integrity checks.
            </p>
          </div>

          {/* ROW 3, COLS 1–2: Bottom-Left Description & Discover More Link */}
          <div className="lg:col-start-1 lg:col-end-3 lg:row-start-3 bg-black text-white pt-6 lg:pr-4 flex flex-col justify-between gap-4">
            <p className="text-xs sm:text-sm leading-relaxed text-zinc-300">
              Let AI find the moments worth sharing. Paste any public YouTube link or upload
              authorized footage to extract 20-second clips.
            </p>
            <div>
              <button
                type="button"
                onClick={onOpenHelp}
                className="inline-flex items-center gap-2 border-b border-white/50 pb-1 text-xs font-medium text-white hover:border-white transition-colors whitespace-nowrap"
              >
                <span>Discover workflow</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ROW 3, COL 3: Black Stepped Notch */}
          <div className="hidden lg:block lg:col-start-3 lg:row-start-3 bg-black" />

          {/* ROW 3, COL 4: White Vertical Stem Extension */}
          <div className="hidden lg:block lg:col-start-4 lg:row-start-3 bg-white rounded-bl-[28px] rounded-br-[28px] min-h-[116px]" />

          {/* ROW 3, COL 5: Black Spacer with Clean Top-Left Concave Fillet */}
          <div className="hidden lg:block lg:col-start-5 lg:row-start-3 bg-black relative">
            <ConcaveCorner position="top-left" className="left-0 top-0" />
          </div>

          {/* ROW 4, COL 4: Black Callout (+ Connection) */}
          <div className="hidden lg:flex lg:col-start-4 lg:row-start-4 bg-black text-white pt-5 pr-4 flex-col justify-start">
            <Plus className="h-4 w-4 text-white mb-2" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="font-display text-sm font-medium text-white">Connection</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Bridging 16:9 widescreen and 9:16 vertical formats seamlessly.
            </p>
          </div>

          {/* ROW 4, COL 5: Bottom-Right White Rounded Block */}
          <div className="hidden lg:block lg:col-start-5 lg:row-start-4 bg-white rounded-[26px] min-h-[112px]" />
        </div>

        {/* Mobile Callout Triad (compact layout below lg) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:hidden">
          <div className="border border-white/15 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-white shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <h2 className="font-display text-sm font-medium text-white">Intelligence</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Multi-signal scoring for setup, payoff, and reaction.
            </p>
          </div>
          <div className="border border-white/15 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-white shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <h2 className="font-display text-sm font-medium text-white">Connection</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Bridging 16:9 widescreen and 9:16 vertical formats seamlessly.
            </p>
          </div>
          <div className="border border-white/15 rounded-xl p-3.5">
            <h2 className="font-display text-sm font-medium text-white">Impact</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Verified H.264 exports with 3-frame integrity checks.
            </p>
          </div>
        </div>
      </section>

      {/* Monochrome Account Metrics Strip (2x2 compact grid on mobile) */}
      <section aria-label="Account metrics" className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-white/15 bg-[#080808] p-4 sm:p-5">
          <div className="text-xs text-zinc-400">Total Clips Created</div>
          <div className="mt-1.5 sm:mt-2 font-display text-xl sm:text-2xl font-medium tabular-nums text-white">
            {usage?.totalClipsCreated ?? 0}
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-zinc-500">Landscape & Vertical MP4s</div>
        </div>

        <div className="rounded-xl border border-white/15 bg-[#080808] p-4 sm:p-5">
          <div className="text-xs text-zinc-400">Processing Jobs</div>
          <div className="mt-1.5 sm:mt-2 font-display text-xl sm:text-2xl font-medium tabular-nums text-white">
            {usage?.activeJobsCount ?? 0}
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-zinc-500">Active background workers</div>
        </div>

        <div className="rounded-xl border border-white/15 bg-[#080808] p-4 sm:p-5">
          <div className="text-xs text-zinc-400">Available Storage</div>
          <div className="mt-1.5 sm:mt-2 font-display text-xl sm:text-2xl font-medium tabular-nums text-white">
            {availableStorageMb} MB
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-zinc-500">
            Of {usage?.storageLimitMb ?? 2048} MB workspace quota
          </div>
        </div>

        <div className="rounded-xl border border-white/15 bg-[#080808] p-4 sm:p-5">
          <div className="text-xs text-zinc-400">Remaining Monthly Usage</div>
          <div className="mt-1.5 sm:mt-2 font-display text-xl sm:text-2xl font-medium tabular-nums text-white">
            {remainingMonthly}
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-zinc-500">
            Of {usage?.monthlyClipsLimit ?? 60} clips this cycle
          </div>
        </div>
      </section>

      {/* Recent Projects */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-white">Recent Projects</h2>
            <p className="text-xs text-zinc-400">
              Reopen any analysis session to adjust timestamps or download rendered clips.
            </p>
          </div>
          {projects.length > 0 && (
            <button
              type="button"
              onClick={onViewAllProjects}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 text-xs font-medium text-white hover:text-zinc-300 transition-colors whitespace-nowrap"
            >
              <span>View all projects</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {recentProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-[#050505] p-8 sm:p-10 text-center">
            <FolderOpen className="mx-auto h-7 w-7 text-zinc-500" aria-hidden="true" />
            <h3 className="mt-3 font-display text-base font-medium text-white">
              No video projects yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
              Paste a YouTube link above or upload an authorized video file to extract your first
              20-second clips.
            </p>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Upload Authorized Video</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentProjects.map((project) => {
              const duration = project.metadata?.durationSec ?? 0;
              const candCount = project.candidates.length;
              const clipCount = project.generatedClips.length;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="group flex items-start gap-4 rounded-xl border border-white/15 bg-[#080808] p-4 text-left hover:border-white/50 hover:bg-[#101010] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-950 border border-white/10 flex items-center justify-center">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Film className="h-6 w-6 text-zinc-600" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                        {project.status === 'completed' && (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                            <span className="text-white">Ready to download</span>
                          </>
                        )}
                        {project.status === 'candidates_ready' && (
                          <>
                            <span className="text-zinc-200">Candidates ready</span>
                          </>
                        )}
                        {(project.status === 'analyzing' || project.status === 'rendering') && (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden="true" />
                            <span className="text-zinc-200">Processing</span>
                          </>
                        )}
                        {(project.status === 'restricted' || project.status === 'failed') && (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                            <span className="text-amber-300">Needs upload</span>
                          </>
                        )}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-zinc-500">
                        {duration > 0 ? formatTimestamp(duration) : '--:--'}
                      </span>
                    </div>

                    <h3 className="truncate font-display text-sm font-medium text-white group-hover:underline">
                      {project.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 tabular-nums">
                      <span>{candCount} candidates</span>
                      <span aria-hidden="true">·</span>
                      <span>{clipCount} rendered clips</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
