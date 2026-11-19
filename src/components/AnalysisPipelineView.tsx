import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Film,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { ChangeEvent, useRef } from 'react';
import { PIPELINE_STAGES, ProjectDetail } from '../shared/types';

interface AnalysisPipelineViewProps {
  project: ProjectDetail;
  onUploadFallback: (file: File) => Promise<void>;
  onBackToDashboard: () => void;
}

export function AnalysisPipelineView({
  project,
  onUploadFallback,
  onBackToDashboard,
}: AnalysisPipelineViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const job = project.job;
  const activeStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === job?.stage);
  const isErrorOrRestricted =
    job?.status === 'failed' ||
    job?.status === 'restricted' ||
    project.status === 'failed' ||
    project.status === 'restricted';

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUploadFallback(file);
    e.target.value = '';
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Dashboard</span>
        </button>

        <span className="font-mono text-xs tabular-nums text-zinc-400">
          {job ? `${job.progress}% complete` : 'Initializing...'}
        </span>
      </div>

      <div className="rounded-xl border border-white/15 bg-[#080808] p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-950 border border-white/15 flex items-center justify-center">
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
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-medium text-white truncate">
              {project.title}
            </h1>
            <p className="mt-1 text-xs text-zinc-400 truncate">{project.sourceUrl}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isErrorOrRestricted ? 'bg-amber-400' : 'bg-white'
                }`}
                style={{ width: `${job?.progress ?? 8}%` }}
              />
            </div>
          </div>
        </div>

        {/* Restriction / Error Recovery Panel */}
        {isErrorOrRestricted && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-5 space-y-4">
            <div className="flex items-start gap-3">
              {job?.status === 'restricted' ? (
                <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
              )}
              <div className="space-y-1.5">
                <h2 className="font-display text-sm font-medium text-white">
                  {job?.status === 'restricted'
                    ? 'Direct Stream Download Restricted — Authorized Upload Available'
                    : 'Video Analysis Could Not Complete'}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {job?.restrictionReason ||
                    job?.errorMessage ||
                    'This source could not be downloaded directly.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload Authorized MP4 / MOV</span>
              </button>
              <button
                type="button"
                onClick={onBackToDashboard}
                className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-white/20 bg-black px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 touch-manipulation"
              >
                <span>Try Another URL</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* 9-Stage Progress List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {PIPELINE_STAGES.map((stage, idx) => {
            const done = activeStageIndex > idx || job?.status === 'completed';
            const current = activeStageIndex === idx && job?.status === 'running';
            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
                  current
                    ? 'border-white bg-white/10 text-white'
                    : done
                      ? 'border-white/15 bg-black text-zinc-200'
                      : 'border-white/[0.06] bg-black/50 text-zinc-500'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
                ) : current ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-zinc-700 text-center text-[10px] leading-[14px] tabular-nums">
                    {idx + 1}
                  </span>
                )}
                <span className="font-medium truncate">{stage.label}</span>
              </div>
            );
          })}
        </div>

        {/* Real Processing Logs */}
        {project.logs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/10">
            <h3 className="text-xs font-medium text-zinc-400">Processing Log</h3>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-black p-3 space-y-1.5 font-mono text-xs">
              {project.logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5">
                  <span className="shrink-0 text-zinc-600 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-rose-400'
                        : log.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-zinc-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
