import { Download, Film, Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { GeneratedClip } from '../shared/types';

interface ClipLibraryItem extends GeneratedClip {
  projectTitle: string;
  thumbnailUrl: string;
}

interface ClipLibraryViewProps {
  clips: ClipLibraryItem[];
  onGoCreate: () => void;
}

export function ClipLibraryView({ clips, onGoCreate }: ClipLibraryViewProps) {
  const [formatFilter, setFormatFilter] = useState<'all' | 'landscape' | 'vertical'>('all');

  const visible = clips.filter((c) => formatFilter === 'all' || c.format === formatFilter);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-white">
            Clip Library
          </h1>
          <p className="text-sm text-zinc-400">
            All validated 16:9 and 9:16 MP4 exports ready for immediate download.
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-[#080808] p-1 border border-white/15 w-full sm:w-auto">
          {(
            [
              ['all', 'All Formats'],
              ['landscape', '16:9 Landscape'],
              ['vertical', '9:16 Vertical'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFormatFilter(key)}
              className={`min-h-[38px] sm:min-h-0 flex-1 sm:flex-none rounded-md px-3 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                formatFilter === key
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-[#050505] p-10 sm:p-12 text-center">
          <Film className="mx-auto h-7 w-7 text-zinc-500" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-medium text-white">
            No rendered clips yet
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Open a project and click Generate Final Clips to render downloadable Landscape &
            Vertical MP4 outputs.
          </p>
          <button
            type="button"
            onClick={onGoCreate}
            className="mt-5 inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
          >
            Create Clips
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((clip) => (
            <div
              key={clip.id}
              className="flex flex-col justify-between rounded-xl border border-white/15 bg-[#080808] p-4 space-y-3"
            >
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-white/15 bg-black flex justify-center">
                  <video
                    src={clip.previewUrl}
                    controls
                    playsInline
                    preload="auto"
                    className={
                      clip.format === 'vertical'
                        ? 'h-56 w-auto aspect-[9/16] object-contain'
                        : 'aspect-video w-full object-contain'
                    }
                  />
                </div>

                <div>
                  <h3 className="truncate font-display text-sm font-medium text-white">
                    {clip.projectTitle}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 font-mono tabular-nums">
                    {clip.format === 'vertical' ? (
                      <Smartphone className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    ) : (
                      <Monitor className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    )}
                    <span>{clip.aspectRatio}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {clip.width}×{clip.height}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{clip.durationSec.toFixed(1)}s</span>
                  </div>
                </div>
              </div>

              <a
                href={clip.downloadUrl}
                download
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download MP4</span>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
