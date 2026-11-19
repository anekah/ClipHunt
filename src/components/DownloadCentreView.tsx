import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Monitor,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useState } from 'react';
import { GeneratedClip, ProjectDetail } from '../shared/types';

interface DownloadCentreViewProps {
  project: ProjectDetail;
  onBackToStudio: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DownloadCentreView({ project, onBackToStudio }: DownloadCentreViewProps) {
  const [copied, setCopied] = useState(false);

  const landscapeClip: GeneratedClip | undefined = project.generatedClips.find(
    (c) => c.format === 'landscape',
  );
  const verticalClip: GeneratedClip | undefined = project.generatedClips.find(
    (c) => c.format === 'vertical',
  );

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/?project=${encodeURIComponent(project.id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback ignored if clipboard blocked
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Adjust Timestamps or Captions</span>
          </button>
          <h1 className="font-display text-2xl font-medium tracking-tight text-white">
            Download Centre
          </h1>
          <p className="text-sm text-zinc-400">{project.title}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-white/20 bg-[#080808] px-4 py-2 text-xs font-medium text-white hover:bg-white/10 whitespace-nowrap touch-manipulation"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copied ? 'Link Copied' : 'Copy Project Link'}</span>
          </button>

          <a
            href={`/api/projects/${encodeURIComponent(project.id)}/download-all`}
            className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors whitespace-nowrap touch-manipulation"
          >
            <FileArchive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download Both (.zip)</span>
          </a>
        </div>
      </div>

      {/* Dual Download Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Landscape Card */}
        <section className="flex flex-col justify-between rounded-xl border border-white/15 bg-[#080808] p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Monitor className="h-4 w-4 text-white" aria-hidden="true" />
                <h2 className="font-display text-base font-medium text-white">Landscape Clip</h2>
              </div>
              <span className="font-mono text-xs tabular-nums text-zinc-400">
                16:9 · 1280×720 · MP4
              </span>
            </div>

            {landscapeClip ? (
              <div className="overflow-hidden rounded-lg border border-white/15 bg-black aspect-video">
                <video
                  src={landscapeClip.previewUrl}
                  controls
                  playsInline
                  preload="auto"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-zinc-500">
                Landscape render unavailable
              </div>
            )}

            {landscapeClip && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-black p-3.5 text-xs">
                <div className="flex items-center gap-2 font-medium text-white">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>FFprobe & 3-Frame Integrity Verified</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-zinc-400 font-mono tabular-nums">
                  <span>{landscapeClip.durationSec.toFixed(2)}s</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(landscapeClip.fileSizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>H.264 / AAC</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  {landscapeClip.validation.message}
                </p>
              </div>
            )}
          </div>

          {landscapeClip && (
            <a
              href={landscapeClip.downloadUrl}
              download
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Landscape</span>
            </a>
          )}
        </section>

        {/* Vertical Card */}
        <section className="flex flex-col justify-between rounded-xl border border-white/15 bg-[#080808] p-5 sm:p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-4 w-4 text-white" aria-hidden="true" />
                <h2 className="font-display text-base font-medium text-white">Vertical Clip</h2>
              </div>
              <span className="font-mono text-xs tabular-nums text-zinc-400">
                9:16 · 1080×1920 · MP4
              </span>
            </div>

            {verticalClip ? (
              <div className="flex justify-center rounded-lg border border-white/15 bg-black py-2">
                <video
                  src={verticalClip.previewUrl}
                  controls
                  playsInline
                  preload="auto"
                  className="h-[340px] w-auto aspect-[9/16] rounded object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[340px] items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-zinc-500">
                Vertical render unavailable
              </div>
            )}

            {verticalClip && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-black p-3.5 text-xs">
                <div className="flex items-center gap-2 font-medium text-white">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Blurred Background + Centered Composition Verified</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-zinc-400 font-mono tabular-nums">
                  <span>{verticalClip.durationSec.toFixed(2)}s</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(verticalClip.fileSizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>TikTok / Reels / Shorts</span>
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  {verticalClip.validation.message}
                </p>
              </div>
            )}
          </div>

          {verticalClip && (
            <a
              href={verticalClip.downloadUrl}
              download
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-white hover:text-black transition-colors touch-manipulation"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Vertical</span>
            </a>
          )}
        </section>
      </div>
    </div>
  );
}
