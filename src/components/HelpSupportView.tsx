import { CheckCircle2, FileVideo, ShieldCheck, Sparkles } from 'lucide-react';

interface HelpSupportViewProps {
  onGoDashboard: () => void;
}

export function HelpSupportView({ onGoDashboard }: HelpSupportViewProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-white">
            Help & Support
          </h1>
          <p className="text-sm text-zinc-400">
            How ClipHunt detects viral 20-second moments, handles access permissions, and validates
            exports.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoDashboard}
          className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors whitespace-nowrap self-start touch-manipulation"
        >
          Back to Dashboard
        </button>
      </div>

      <section className="rounded-xl border border-white/15 bg-[#080808] p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          <h2 className="font-display text-base font-medium text-white">
            01. End-to-End Clipping Workflow
          </h2>
        </div>
        <ol className="space-y-2.5 text-sm text-zinc-300 list-decimal list-inside leading-relaxed">
          <li>
            Paste a public YouTube URL or upload an authorized local video (MP4, MOV, WebM, MKV).
          </li>
          <li>
            The ClipHunt Viral Detection Engine evaluates transcript context, FFmpeg RMS audio
            energy spikes, scene transitions, comment timestamps, and replay heatmaps.
          </li>
          <li>
            Preview the ranked 20.0-second candidates on the interactive timeline, fine-tune start
            and end boundaries, and pick an optional caption preset.
          </li>
          <li>
            Click Generate Final Clips to render both a 16:9 Landscape MP4 (1280×720) and a 9:16
            Vertical MP4 (1080×1920 blurred background with centered subject).
          </li>
          <li>
            Every export passes FFprobe stream checks and 3-frame integrity verification before
            appearing in the Download Centre.
          </li>
        </ol>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-white/15 bg-[#080808] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
            <h2 className="font-display text-sm font-medium text-white">
              Copyright & Authorized Access
            </h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            ClipHunt respects YouTube access permissions and never circumvents DRM, login walls,
            age gates, or private video restrictions. When direct downloading is unavailable for a
            URL, use the Authorized Upload workflow with footage you own or have permission to edit.
          </p>
        </section>

        <section className="rounded-xl border border-white/15 bg-[#080808] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileVideo className="h-4 w-4 text-white" aria-hidden="true" />
            <h2 className="font-display text-sm font-medium text-white">
              Output Specifications
            </h2>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-400">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" aria-hidden="true" />
              <span>Landscape: 16:9 · 1280×720 · H.264 + AAC · 20.0s</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" aria-hidden="true" />
              <span>Vertical: 9:16 · 1080×1920 · Blurred bg + H.264/AAC · 20.0s</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" aria-hidden="true" />
              <span>Captions: Burned-in SubStation Alpha (.ass) or Off</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
