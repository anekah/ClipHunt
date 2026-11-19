export type NavSection =
  | 'dashboard'
  | 'create'
  | 'projects'
  | 'library'
  | 'settings'
  | 'help';

export type ProjectStatus =
  | 'queued'
  | 'analyzing'
  | 'candidates_ready'
  | 'rendering'
  | 'completed'
  | 'restricted'
  | 'failed';

export type PipelineStageKey =
  | 'validating_url'
  | 'extracting_metadata'
  | 'retrieving_captions'
  | 'analysing_video'
  | 'detecting_viral_moments'
  | 'downloading_segment'
  | 'generating_clips'
  | 'validating_video'
  | 'ready';

export interface PipelineStageInfo {
  key: PipelineStageKey;
  label: string;
  progress: number;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  { key: 'validating_url', label: 'Validating URL', progress: 10 },
  { key: 'extracting_metadata', label: 'Extracting metadata', progress: 22 },
  { key: 'retrieving_captions', label: 'Retrieving captions', progress: 34 },
  { key: 'analysing_video', label: 'Analysing video', progress: 48 },
  { key: 'detecting_viral_moments', label: 'Detecting viral moments', progress: 62 },
  { key: 'downloading_segment', label: 'Downloading selected segment', progress: 74 },
  { key: 'generating_clips', label: 'Generating clips', progress: 86 },
  { key: 'validating_video', label: 'Validating video', progress: 94 },
  { key: 'ready', label: 'Ready to download', progress: 100 },
];

export interface ScoringWeights {
  humour: number; // default 25
  contextPayoff: number; // default 20
  audioReactions: number; // default 15
  audienceEngagement: number; // default 15
  visualInterest: number; // default 10
  emotionalImpact: number; // default 10
  clipCompleteness: number; // default 5
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  humour: 25,
  contextPayoff: 20,
  audioReactions: 15,
  audienceEngagement: 15,
  visualInterest: 10,
  emotionalImpact: 10,
  clipCompleteness: 5,
};

export interface SignalScores {
  humour: number; // 0-100
  contextPayoff: number; // 0-100
  audioReactions: number; // 0-100
  audienceEngagement: number; // 0-100
  visualInterest: number; // 0-100
  emotionalImpact: number; // 0-100
  clipCompleteness: number; // 0-100
}

export interface TranscriptSegment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
  words?: Array<{
    word: string;
    startSec: number;
    endSec: number;
  }>;
}

export interface AudioPeak {
  timestampSec: number;
  intensity: number; // 0-100
  kind: 'laughter' | 'excitement' | 'applause' | 'sudden_spike' | 'pause_drop';
}

export interface SceneChange {
  timestampSec: number;
  score: number; // 0-1
}

export interface CommentSignal {
  timestampSec: number;
  commentText: string;
  likes: number;
  matchedPhrase?: string;
}

export interface HeatmapPoint {
  startSec: number;
  endSec: number;
  intensity: number; // 0-1
}

export interface VideoMetadata {
  id: string;
  projectId: string;
  sourceType: 'youtube' | 'upload' | 'sample';
  youtubeVideoId?: string;
  sourceUrl: string;
  title: string;
  channelName: string;
  description: string;
  durationSec: number;
  uploadDate: string;
  thumbnailUrl: string;
  chapters: Array<{ title: string; startSec: number }>;
  transcript: TranscriptSegment[];
  audioPeaks: AudioPeak[];
  sceneChanges: SceneChange[];
  commentSignals: CommentSignal[];
  heatmapPoints: HeatmapPoint[];
  heatmapAvailable: boolean;
  subtitlesAvailable: boolean;
  sourceStreamUrl: string;
  hasPlayableSource: boolean;
}

export interface CandidateClip {
  id: string;
  projectId: string;
  rank: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  peakSec: number;
  predictedEngagementScore: number; // 0-100
  category: string;
  reason: string;
  transcriptExcerpt: string;
  signals: SignalScores;
  weightsUsed: ScoringWeights;
  isSelected: boolean;
}

export type CaptionPresetId =
  | 'off'
  | 'clean_minimal'
  | 'bold_viral'
  | 'podcast_style'
  | 'cinematic'
  | 'high_energy';

export interface CaptionConfig {
  enabled: boolean;
  preset: CaptionPresetId;
  fontSize: number; // px relative to 1080p height (e.g. 42 - 76)
  primaryColor: string; // hex e.g. #FFFFFF
  highlightColor: string; // hex e.g. #8B5CF6
  backgroundColor: string; // hex e.g. #000000
  backgroundOpacity: number; // 0 - 1
  position: 'bottom' | 'center';
}

export const CAPTION_PRESETS: Array<{
  id: CaptionPresetId;
  label: string;
  description: string;
  config: Omit<CaptionConfig, 'enabled' | 'preset'>;
}> = [
  {
    id: 'clean_minimal',
    label: 'Clean Minimal',
    description: 'Crisp white sans text with subtle dark drop shadow',
    config: {
      fontSize: 46,
      primaryColor: '#FFFFFF',
      highlightColor: '#60A5FA',
      backgroundColor: '#000000',
      backgroundOpacity: 0.35,
      position: 'bottom',
    },
  },
  {
    id: 'bold_viral',
    label: 'Bold Viral',
    description: 'High-contrast punchy framing with electric purple highlights',
    config: {
      fontSize: 60,
      primaryColor: '#FFFFFF',
      highlightColor: '#A78BFA',
      backgroundColor: '#09090B',
      backgroundOpacity: 0.72,
      position: 'center',
    },
  },
  {
    id: 'podcast_style',
    label: 'Podcast Style',
    description: 'Warm amber accent highlights anchored in the lower third',
    config: {
      fontSize: 50,
      primaryColor: '#F8FAFC',
      highlightColor: '#FBBF24',
      backgroundColor: '#0F172A',
      backgroundOpacity: 0.65,
      position: 'bottom',
    },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Understated wide-tracked subtitle styling without heavy boxes',
    config: {
      fontSize: 42,
      primaryColor: '#F1F5F9',
      highlightColor: '#E2E8F0',
      backgroundColor: '#000000',
      backgroundOpacity: 0.0,
      position: 'bottom',
    },
  },
  {
    id: 'high_energy',
    label: 'High-Energy',
    description: 'Large active-word emphasis built for fast reaction clips',
    config: {
      fontSize: 64,
      primaryColor: '#FFFFFF',
      highlightColor: '#38BDF8',
      backgroundColor: '#1E1B4B',
      backgroundOpacity: 0.78,
      position: 'center',
    },
  },
];

export interface ValidationReport {
  passed: boolean;
  fileExists: boolean;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  durationSec: number;
  durationWithinTolerance: boolean;
  width: number;
  height: number;
  aspectRatio: string;
  resolutionValid: boolean;
  framesSampled: number;
  frameMotionScore: number;
  reRendered: boolean;
  message: string;
}

export interface GeneratedClip {
  id: string;
  projectId: string;
  candidateId: string;
  format: 'landscape' | 'vertical';
  aspectRatio: '16:9' | '9:16';
  width: number;
  height: number;
  durationSec: number;
  fileSizeBytes: number;
  codecVideo: string;
  codecAudio: string;
  captionPreset: CaptionPresetId;
  previewUrl: string;
  downloadUrl: string;
  validation: ValidationReport;
  createdAt: string;
}

export interface ProcessingLogEntry {
  id: string;
  projectId: string;
  jobId: string;
  stage: PipelineStageKey;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface AnalysisJob {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'restricted';
  stage: PipelineStageKey;
  stageLabel: string;
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  restrictionReason?: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string;
  status: ProjectStatus;
  selectedStartSec: number | null;
  selectedEndSec: number | null;
  selectedCandidateId: string | null;
  aiExplanation: string | null;
  captionConfig: CaptionConfig;
  createdAt: string;
  updatedAt: string;
  metadata: VideoMetadata | null;
  job: AnalysisJob | null;
  candidates: CandidateClip[];
  generatedClips: GeneratedClip[];
  logs: ProcessingLogEntry[];
}

export interface UserUsage {
  planName: string;
  monthlyClipsLimit: number;
  monthlyClipsUsed: number;
  storageLimitMb: number;
  storageUsedMb: number;
  totalClipsCreated: number;
  activeJobsCount: number;
}

export interface UserSettings {
  weights: ScoringWeights;
  defaultCaptionConfig: CaptionConfig;
  autoValidateClips: boolean;
  preferDirectHttps: boolean;
}
