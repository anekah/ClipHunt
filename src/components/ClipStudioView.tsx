import {
  ChevronDown,
  ChevronUp,
  Clock,
  Film,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTimestamp } from '../lib/urlValidation';
import {
  CAPTION_PRESETS,
  CandidateClip,
  CaptionConfig,
  CaptionPresetId,
  ProjectDetail,
} from '../shared/types';

interface ClipStudioViewProps {
  project: ProjectDetail;
  onSelectAndRender: (params: {
    candidateId: string;
    startSec: number;
    endSec: number;
    captionConfig: CaptionConfig;
  }) => Promise<void>;
  onRegenerateCandidates: () => Promise<void>;
  onAttachSourceFile?: (projectId: string, file: File) => Promise<void>;
  onViewDownloads: () => void;
  isRendering: boolean;
  isRegenerating: boolean;
  isAttachingSource?: boolean;
}

export function ClipStudioView({
  project,
  onSelectAndRender,
  onRegenerateCandidates,
  onAttachSourceFile,
  onViewDownloads,
  isRendering,
  isRegenerating,
  isAttachingSource = false,
}: ClipStudioViewProps) {
  const metadata = project.metadata;
  const duration = Math.max(20, metadata?.durationSec ?? 65);
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const initialCand =
    project.candidates.find((c) => c.id === project.selectedCandidateId) ??
    project.candidates[0] ??
    null;

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    initialCand?.id ?? 'manual',
  );
  const [startSec, setStartSec] = useState<number>(
    project.selectedStartSec ?? initialCand?.startSec ?? 0,
  );
  const [endSec, setEndSec] = useState<number>(
    project.selectedEndSec ?? initialCand?.endSec ?? 20,
  );
  const [lockTwentySec, setLockTwentySec] = useState(true);
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>(project.captionConfig);
  const [showCaptionControls, setShowCaptionControls] = useState(false);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(
    initialCand?.id ?? null,
  );
  const [currentTime, setCurrentTime] = useState(startSec);
  const [isPlaying, setIsPlaying] = useState(false);
  const [embedPlayNonce, setEmbedPlayNonce] = useState(0);

  // Sync when switching projects
  useEffect(() => {
    const nextCand =
      project.candidates.find((c) => c.id === project.selectedCandidateId) ??
      project.candidates[0] ??
      null;
    setSelectedCandidateId(nextCand?.id ?? 'manual');
    setStartSec(project.selectedStartSec ?? nextCand?.startSec ?? 0);
    setEndSec(project.selectedEndSec ?? nextCand?.endSec ?? 20);
    setCaptionConfig(project.captionConfig);
  }, [project.id]);

  // Loop preview inside [startSec, endSec] while playing
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      if (vid.currentTime >= endSec) {
        vid.currentTime = startSec;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
    };
  }, [startSec, endSec]);

  const activeTranscriptLine = useMemo(() => {
    const segs = metadata?.transcript ?? [];
    const hit = segs.find((s) => currentTime >= s.startSec && currentTime <= s.endSec);
    return hit?.text ?? '';
  }, [metadata?.transcript, currentTime]);

  const applyWindow = (newStart: number, newEnd?: number) => {
    if (lockTwentySec || newEnd === undefined) {
      const clampedStart = Math.max(0, Math.min(duration - 20.0, Math.round(newStart * 10) / 10));
      setStartSec(clampedStart);
      setEndSec(Math.round((clampedStart + 20.0) * 10) / 10);
      if (videoRef.current) {
        videoRef.current.currentTime = clampedStart;
      }
    } else {
      const clampedStart = Math.max(0, Math.min(duration - 5, Math.round(newStart * 10) / 10));
      const clampedEnd = Math.max(
        clampedStart + 5,
        Math.min(duration, Math.round(newEnd * 10) / 10),
      );
      setStartSec(clampedStart);
      setEndSec(clampedEnd);
    }
  };

  const handleSelectCandidate = (cand: CandidateClip) => {
    setSelectedCandidateId(cand.id);
    setStartSec(cand.startSec);
    setEndSec(cand.endSec);
    setCurrentTime(cand.startSec);
    setExpandedSignalId(cand.id);
    if (videoRef.current) {
      videoRef.current.currentTime = cand.startSec;
      videoRef.current.play().catch(() => {});
    } else if (metadata?.youtubeVideoId) {
      setEmbedPlayNonce((n) => n + 1);
    }
  };

  const handlePresetSelect = (presetId: CaptionPresetId) => {
    if (presetId === 'off') {
      setCaptionConfig((prev) => ({ ...prev, enabled: false, preset: 'off' }));
      return;
    }
    const found = CAPTION_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setCaptionConfig({
      enabled: true,
      preset: presetId,
      ...found.config,
    });
  };

  const togglePlayClip = () => {
    const vid = videoRef.current;
    if (!vid) {
      if (metadata?.youtubeVideoId) {
        setCurrentTime(startSec);
        setEmbedPlayNonce((n) => n + 1);
      }
      return;
    }
    if (vid.paused) {
      if (vid.currentTime < startSec || vid.currentTime >= endSec) {
        vid.currentTime = startSec;
      }
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  };

  const windowDur = Math.round((endSec - startSec) * 10) / 10;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-white truncate">
            {project.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>{metadata?.channelName ?? 'Studio Source'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Source duration {formatTimestamp(duration)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-white">
              Selected clip {formatTimestamp(startSec, true)} – {formatTimestamp(endSec, true)} (
              {windowDur.toFixed(1)}s)
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto">
          {project.generatedClips.length > 0 && (
            <button
              type="button"
              onClick={onViewDownloads}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center rounded-lg border border-white/20 bg-[#080808] px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10 whitespace-nowrap touch-manipulation"
            >
              View Rendered Clips ({project.generatedClips.length})
            </button>
          )}
          {!metadata?.hasPlayableSource && onAttachSourceFile && (
            <>
              <input
                ref={attachInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    void onAttachSourceFile(project.id, file);
                  }
                }}
              />
              <button
                type="button"
                disabled={isAttachingSource}
                onClick={() => attachInputRef.current?.click()}
                className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-white/25 bg-[#080808] px-4 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 touch-manipulation"
              >
                {isAttachingSource ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isAttachingSource ? 'Attaching Video...' : 'Attach MP4 to Render'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            disabled={isRendering || !metadata?.hasPlayableSource}
            title={
              metadata?.hasPlayableSource
                ? 'Render 16:9 and 9:16 MP4 clips'
                : 'Attach an authorized MP4/MOV/WebM file to render downloadable 16:9 + 9:16 exports'
            }
            onClick={() =>
              onSelectAndRender({
                candidateId: selectedCandidateId,
                startSec,
                endSec,
                captionConfig,
              })
            }
            className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 touch-manipulation"
          >
            {isRendering ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Scissors className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isRendering ? 'Rendering 16:9 + 9:16...' : 'Generate Final Clips'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Video Preview + Interactive Timeline + Progressive Caption Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* Video Preview Player */}
          <div className="overflow-hidden rounded-xl border border-white/15 bg-[#080808]">
            <div className="relative aspect-video bg-black">
              {metadata?.hasPlayableSource ? (
                <video
                  ref={videoRef}
                  src={metadata.sourceStreamUrl}
                  poster={project.thumbnailUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : metadata?.youtubeVideoId ? (
                <iframe
                  key={`${metadata.youtubeVideoId}_${embedPlayNonce}`}
                  data-testid="youtube-embed-player"
                  title={`YouTube preview: ${project.title}`}
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                    metadata.youtubeVideoId,
                  )}?start=${Math.max(0, Math.floor(startSec))}&end=${Math.max(
                    1,
                    Math.ceil(endSec),
                  )}&autoplay=${embedPlayNonce > 0 ? 1 : 0}&rel=0&modestbranding=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : project.thumbnailUrl ? (
                <img
                  src={project.thumbnailUrl}
                  alt={project.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover opacity-75"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black">
                  <Film className="h-10 w-10 text-zinc-600" aria-hidden="true" />
                </div>
              )}

              {/* Live CSS Caption Overlay Preview (only on playable direct/uploaded videos with real captions) */}
              {metadata?.hasPlayableSource &&
                metadata?.subtitlesAvailable &&
                captionConfig.enabled &&
                captionConfig.preset !== 'off' &&
                activeTranscriptLine && (
                <div
                  className={`pointer-events-none absolute inset-x-6 flex justify-center ${
                    captionConfig.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-12'
                  }`}
                >
                  <div
                    className="max-w-[88%] rounded-md px-3 py-1.5 text-center font-semibold leading-snug shadow-lg"
                    style={{
                      fontSize: `${Math.max(13, Math.round(captionConfig.fontSize * 0.34))}px`,
                      color: captionConfig.primaryColor,
                      backgroundColor:
                        captionConfig.backgroundOpacity > 0
                          ? `rgba(0,0,0,${captionConfig.backgroundOpacity})`
                          : 'transparent',
                      textShadow:
                        captionConfig.backgroundOpacity === 0
                          ? '0 2px 6px rgba(0,0,0,0.9)'
                          : 'none',
                    }}
                  >
                    {captionConfig.preset === 'high_energy' ||
                    captionConfig.preset === 'bold_viral'
                      ? activeTranscriptLine.toUpperCase()
                      : activeTranscriptLine}
                  </div>
                </div>
              )}
            </div>

            {/* Playback & Window Controls */}
            <div className="border-t border-white/15 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayClip}
                    className="inline-flex min-h-[44px] sm:min-h-[32px] items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 transition-colors touch-manipulation"
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{isPlaying ? 'Pause' : 'Preview 20s Clip'}</span>
                  </button>

                  <span className="font-mono text-xs tabular-nums text-zinc-400">
                    {formatTimestamp(currentTime, true)} / {formatTimestamp(duration)}
                  </span>
                </div>

                <label className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lockTwentySec}
                    onChange={(e) => {
                      const locked = e.target.checked;
                      setLockTwentySec(locked);
                      if (locked) applyWindow(startSec);
                    }}
                    className="h-4 w-4 rounded border-white/30 bg-black accent-white"
                  />
                  <span>Lock 20.0s viral window</span>
                </label>
              </div>

              {/* Multi-signal Visual Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Timeline · Candidates, Audio Peaks & Scene Cuts</span>
                  <span className="font-mono tabular-nums">
                    {formatTimestamp(startSec, true)} – {formatTimestamp(endSec, true)}
                  </span>
                </div>

                <div
                  data-testid="clip-timeline"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const clickedTime = ratio * duration;
                    applyWindow(clickedTime - 10.0);
                  }}
                  className="relative h-16 sm:h-14 w-full cursor-pointer overflow-hidden rounded-lg border border-white/15 bg-black touch-pan-y"
                >
                  {/* Transcript Segment Blocks */}
                  {(metadata?.transcript ?? []).map((seg) => (
                    <div
                      key={seg.id}
                      title={seg.text}
                      className="absolute bottom-1 h-2 rounded-sm bg-zinc-700/70"
                      style={{
                        left: `${(seg.startSec / duration) * 100}%`,
                        width: `${Math.max(1, ((seg.endSec - seg.startSec) / duration) * 100)}%`,
                      }}
                    />
                  ))}

                  {/* Scene Change Ticks */}
                  {(metadata?.sceneChanges ?? []).map((sc, i) => (
                    <div
                      key={`sc_${i}`}
                      title={`Scene cut at ${sc.timestampSec}s`}
                      className="absolute top-1 h-2.5 w-0.5 bg-zinc-400/70"
                      style={{ left: `${(sc.timestampSec / duration) * 100}%` }}
                    />
                  ))}

                  {/* Audio Peak Bars */}
                  {(metadata?.audioPeaks ?? []).map((pk, i) => (
                    <div
                      key={`pk_${i}`}
                      title={`Audio peak (${pk.kind}) at ${pk.timestampSec}s`}
                      className="absolute bottom-4 w-1 rounded-t bg-white/80"
                      style={{
                        left: `${(pk.timestampSec / duration) * 100}%`,
                        height: `${Math.max(8, Math.round(pk.intensity * 0.28))}px`,
                      }}
                    />
                  ))}

                  {/* Candidate Markers */}
                  {project.candidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      aria-label={`Jump to candidate #${cand.rank} at ${formatTimestamp(cand.peakSec)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCandidate(cand);
                      }}
                      className={`absolute top-1.5 -translate-x-1/2 h-6 w-6 sm:h-4 sm:w-4 rounded-full border text-[10px] sm:text-[9px] font-bold flex items-center justify-center z-20 touch-manipulation ${
                        cand.id === selectedCandidateId
                          ? 'bg-white border-white text-black'
                          : 'bg-black border-white/60 text-white hover:bg-white hover:text-black'
                      }`}
                      style={{ left: `${(cand.peakSec / duration) * 100}%` }}
                    >
                      {cand.rank}
                    </button>
                  ))}

                  {/* Selected 20s Window Highlight */}
                  <div
                    className="pointer-events-none absolute inset-y-0 border-x-2 border-white bg-white/15 z-10"
                    style={{
                      left: `${(startSec / duration) * 100}%`,
                      width: `${Math.max(2, ((endSec - startSec) / duration) * 100)}%`,
                    }}
                  />

                  {/* Playhead */}
                  <div
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-white z-30"
                    style={{ left: `${Math.min(100, (currentTime / duration) * 100)}%` }}
                  />
                </div>

                {/* Manual Start/End Fine-Tuning */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="grid grid-cols-4 sm:flex items-center gap-1.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => applyWindow(startSec - 1)}
                      className="min-h-[44px] sm:min-h-[28px] rounded-md border border-white/15 bg-black px-2.5 py-1 text-xs font-mono text-zinc-200 hover:bg-white/10 touch-manipulation"
                    >
                      -1.0s
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWindow(startSec - 0.5)}
                      className="min-h-[44px] sm:min-h-[28px] rounded-md border border-white/15 bg-black px-2.5 py-1 text-xs font-mono text-zinc-200 hover:bg-white/10 touch-manipulation"
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWindow(startSec + 0.5)}
                      className="min-h-[44px] sm:min-h-[28px] rounded-md border border-white/15 bg-black px-2.5 py-1 text-xs font-mono text-zinc-200 hover:bg-white/10 touch-manipulation"
                    >
                      +0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWindow(startSec + 1)}
                      className="min-h-[44px] sm:min-h-[28px] rounded-md border border-white/15 bg-black px-2.5 py-1 text-xs font-mono text-zinc-200 hover:bg-white/10 touch-manipulation"
                    >
                      +1.0s
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-end">
                    <label className="flex items-center gap-1.5 text-zinc-400">
                      <span>Start</span>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={Math.max(0, duration - 5)}
                        value={startSec}
                        onChange={(e) => applyWindow(Number(e.target.value))}
                        className="h-10 sm:h-7 w-20 rounded-md border border-white/20 bg-black px-2 py-1 font-mono tabular-nums text-base sm:text-xs text-white"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-zinc-400">
                      <span>End</span>
                      <input
                        type="number"
                        step="0.5"
                        min={5}
                        max={duration}
                        disabled={lockTwentySec}
                        value={endSec}
                        onChange={(e) => applyWindow(startSec, Number(e.target.value))}
                        className="h-10 sm:h-7 w-20 rounded-md border border-white/20 bg-black px-2 py-1 font-mono tabular-nums text-base sm:text-xs text-white disabled:opacity-60"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progressive Disclosure Caption Customizer */}
          <div className="rounded-xl border border-white/15 bg-[#080808]">
            <button
              type="button"
              aria-expanded={showCaptionControls}
              onClick={() => setShowCaptionControls((v) => !v)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Subtitles className="h-4 w-4 text-white" aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium text-white">AI Captions & Styling</div>
                  <div className="text-xs text-zinc-400">
                    {captionConfig.enabled && captionConfig.preset !== 'off'
                      ? `Preset: ${CAPTION_PRESETS.find((p) => p.id === captionConfig.preset)?.label ?? captionConfig.preset} · ${captionConfig.fontSize}px`
                      : 'Captions disabled'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showCaptionControls ? 'Hide options' : 'Customize'}</span>
              </div>
            </button>

            {showCaptionControls && (
              <div className="border-t border-white/15 p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetSelect('off')}
                    className={`min-h-[40px] sm:min-h-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
                      !captionConfig.enabled || captionConfig.preset === 'off'
                        ? 'border-white bg-white text-black'
                        : 'border-white/15 bg-black text-zinc-400 hover:text-white'
                    }`}
                  >
                    Captions Off
                  </button>
                  {CAPTION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`min-h-[40px] sm:min-h-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
                        captionConfig.enabled && captionConfig.preset === preset.id
                          ? 'border-white bg-white text-black'
                          : 'border-white/15 bg-black text-zinc-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {captionConfig.enabled && captionConfig.preset !== 'off' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="space-y-1.5 text-xs text-zinc-300">
                      <div className="flex justify-between">
                        <span>Font size</span>
                        <span className="font-mono tabular-nums">{captionConfig.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={36}
                        max={74}
                        value={captionConfig.fontSize}
                        onChange={(e) =>
                          setCaptionConfig((prev) => ({
                            ...prev,
                            fontSize: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-white"
                      />
                    </label>

                    <label className="space-y-1.5 text-xs text-zinc-300">
                      <div className="flex justify-between">
                        <span>Background opacity</span>
                        <span className="font-mono tabular-nums">
                          {Math.round(captionConfig.backgroundOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={captionConfig.backgroundOpacity}
                        onChange={(e) =>
                          setCaptionConfig((prev) => ({
                            ...prev,
                            backgroundOpacity: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-white"
                      />
                    </label>

                    <div className="flex items-center justify-between rounded-lg border border-white/15 bg-black px-3 py-2 text-xs">
                      <span className="text-zinc-300">Text & Highlight</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Caption text color"
                          value={captionConfig.primaryColor}
                          onChange={(e) =>
                            setCaptionConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                          }
                          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                        />
                        <input
                          type="color"
                          aria-label="Caption highlight color"
                          value={captionConfig.highlightColor}
                          onChange={(e) =>
                            setCaptionConfig((prev) => ({
                              ...prev,
                              highlightColor: e.target.value,
                            }))
                          }
                          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-white/15 bg-black px-3 py-2 text-xs">
                      <span className="text-zinc-300">Position</span>
                      <div className="flex gap-1">
                        {(['bottom', 'center'] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() =>
                              setCaptionConfig((prev) => ({ ...prev, position: pos }))
                            }
                            className={`min-h-[36px] sm:min-h-0 rounded px-3 py-1 capitalize touch-manipulation ${
                              captionConfig.position === pos
                                ? 'bg-white text-black font-medium'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Candidate Viral Moments List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-medium text-white">
                Detected Viral Candidates
              </h2>
              <p className="text-xs text-zinc-400">
                Predicted engagement scores combine 7 signals — not a viral guarantee.
              </p>
            </div>
            <button
              type="button"
              disabled={isRegenerating}
              onClick={onRegenerateCandidates}
              className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-white/20 bg-[#080808] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50 whitespace-nowrap touch-manipulation"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Regenerate</span>
            </button>
          </div>

          <div className="space-y-3">
            {project.candidates.map((cand) => {
              const selected = cand.id === selectedCandidateId;
              const expanded = expandedSignalId === cand.id;
              return (
                <div
                  key={cand.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-white bg-[#0E0E0E]'
                      : 'border-white/15 bg-[#080808] hover:border-white/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span className="font-semibold text-white">Candidate #{cand.rank}</span>
                        <span aria-hidden="true">·</span>
                        <span>{cand.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-zinc-200">
                          {formatTimestamp(cand.startSec)} – {formatTimestamp(cand.endSec)}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-100 leading-relaxed">{cand.reason}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-display text-lg font-medium tabular-nums text-white">
                        {cand.predictedEngagementScore}
                        <span className="text-xs font-normal text-zinc-500">/100</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">Predicted score</div>
                    </div>
                  </div>

                  <blockquote className="mt-3 rounded-lg bg-black px-3 py-2 text-xs text-zinc-300 leading-relaxed border border-white/10">
                    “{cand.transcriptExcerpt}”
                  </blockquote>

                  {/* Actions & Expandable Signal Breakdown */}
                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setExpandedSignalId(expanded ? null : cand.id)}
                      className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1 text-xs text-zinc-400 hover:text-white touch-manipulation"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Signal breakdown</span>
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectCandidate(cand)}
                      className={`inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg px-3.5 py-2 sm:py-1.5 text-xs font-semibold transition-colors touch-manipulation ${
                        selected
                          ? 'bg-white text-black'
                          : 'border border-white/20 bg-black text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      <span>{selected ? 'Selected' : 'Select Clip'}</span>
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-white/10 text-[11px]">
                      {[
                        ['Humour & entertainment', cand.signals.humour, cand.weightsUsed.humour],
                        ['Context & payoff', cand.signals.contextPayoff, cand.weightsUsed.contextPayoff],
                        ['Audio reactions', cand.signals.audioReactions, cand.weightsUsed.audioReactions],
                        ['Audience engagement', cand.signals.audienceEngagement, cand.weightsUsed.audienceEngagement],
                        ['Visual interest', cand.signals.visualInterest, cand.weightsUsed.visualInterest],
                        ['Emotional impact', cand.signals.emotionalImpact, cand.weightsUsed.emotionalImpact],
                        ['Clip completeness', cand.signals.clipCompleteness, cand.weightsUsed.clipCompleteness],
                      ].map(([label, val, wt]) => (
                        <div key={String(label)} className="space-y-1">
                          <div className="flex justify-between text-zinc-400">
                            <span className="truncate">
                              {label} ({wt}%)
                            </span>
                            <span className="font-mono tabular-nums text-white">{val}</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-white"
                              style={{ width: `${val}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
