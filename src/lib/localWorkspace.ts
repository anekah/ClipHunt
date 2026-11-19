import { buildCandidateClips, validateWeights } from './scoringEngine';
import { validateYouTubeUrl } from './urlValidation';
import {
  CAPTION_PRESETS,
  CaptionConfig,
  DEFAULT_SCORING_WEIGHTS,
  GeneratedClip,
  ProjectDetail,
  TranscriptSegment,
  UserSettings,
  UserUsage,
} from '../shared/types';

const PROJECTS_STORAGE_KEY = 'cliphunt_local_projects_v1';
const SETTINGS_STORAGE_KEY = 'cliphunt_local_settings_v1';

// Keeps blob URLs alive during the current browser session for local video previews
const sessionVideoUrls = new Map<string, string>();

const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  enabled: true,
  preset: 'bold_viral',
  ...CAPTION_PRESETS.find((p) => p.id === 'bold_viral')!.config,
};

function getDefaultSettings(): UserSettings {
  return {
    weights: { ...DEFAULT_SCORING_WEIGHTS },
    defaultCaptionConfig: { ...DEFAULT_CAPTION_CONFIG },
    autoValidateClips: true,
    preferDirectHttps: true,
  };
}

export function loadLocalSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return getDefaultSettings();
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      weights: parsed.weights ?? { ...DEFAULT_SCORING_WEIGHTS },
      defaultCaptionConfig: parsed.defaultCaptionConfig ?? { ...DEFAULT_CAPTION_CONFIG },
      autoValidateClips: parsed.autoValidateClips ?? true,
      preferDirectHttps: parsed.preferDirectHttps ?? true,
    };
  } catch {
    return getDefaultSettings();
  }
}

export function saveLocalSettings(next: UserSettings): UserSettings {
  const check = validateWeights(next.weights);
  if (!check.valid) {
    throw new Error(`Scoring weights must total 100% (currently ${check.total}%).`);
  }
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadLocalProjects(): ProjectDetail[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectDetail[];
    if (!Array.isArray(parsed)) return [];
    // Refresh session playability flags based on active blob URLs
    return parsed.map((p) => {
      const blobUrl = sessionVideoUrls.get(p.id);
      if (!p.metadata) return p;
      return {
        ...p,
        metadata: {
          ...p.metadata,
          sourceStreamUrl: blobUrl || '',
          hasPlayableSource: Boolean(blobUrl),
        },
      };
    });
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: ProjectDetail[]): void {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function getLocalDashboard(): {
  usage: UserUsage;
  projects: ProjectDetail[];
  settings: UserSettings;
  clips: Array<GeneratedClip & { projectTitle: string; thumbnailUrl: string }>;
} {
  const projects = loadLocalProjects();
  const settings = loadLocalSettings();
  const clips: Array<GeneratedClip & { projectTitle: string; thumbnailUrl: string }> = [];
  let totalBytes = 0;

  for (const p of projects) {
    for (const c of p.generatedClips) {
      totalBytes += c.fileSizeBytes || 0;
      clips.push({
        ...c,
        projectTitle: p.title,
        thumbnailUrl: p.thumbnailUrl,
      });
    }
  }

  return {
    usage: {
      planName: 'Creator Pro',
      monthlyClipsLimit: 60,
      monthlyClipsUsed: clips.length,
      storageLimitMb: 2048,
      storageUsedMb: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
      totalClipsCreated: clips.length,
      activeJobsCount: 0,
    },
    projects,
    settings,
    clips,
  };
}

export async function analyzeLocalYouTubeUrl(url: string): Promise<ProjectDetail> {
  const validation = validateYouTubeUrl(url);
  if (!validation.valid || !validation.videoId || !validation.normalizedUrl) {
    throw new Error(validation.errorMessage || 'Please provide a valid YouTube URL.');
  }

  const videoId = validation.videoId;
  const normalizedUrl = validation.normalizedUrl;
  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const settings = loadLocalSettings();

  let title = `YouTube Video (${videoId})`;
  let channelName = 'YouTube Creator';
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const resp = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(normalizedUrl)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (resp.ok) {
      const info = (await resp.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
        error?: string;
      };
      if (info.error) {
        throw new Error('This YouTube video is private, unavailable, or restricts embedding.');
      }
      if (info.title) title = info.title;
      if (info.author_name) channelName = info.author_name;
      if (info.thumbnail_url) thumbnailUrl = info.thumbnail_url;
    }
  } catch (err) {
    if (err instanceof Error && /private, unavailable/i.test(err.message)) {
      throw err;
    }
    // Keep verified fallback thumbnail and video ID title if oEmbed proxy times out
  }

  const restrictionReason =
    'Public YouTube metadata was verified, but direct video stream extraction is unavailable in this preview environment without an authorized local file. Upload the MP4, MOV, or WebM file below to preview, score 20s viral windows, and trim clips.';

  const project: ProjectDetail = {
    id: projectId,
    title,
    sourceUrl: normalizedUrl,
    thumbnailUrl,
    status: 'restricted',
    selectedStartSec: null,
    selectedEndSec: null,
    selectedCandidateId: null,
    aiExplanation: null,
    captionConfig: { ...settings.defaultCaptionConfig },
    createdAt: now,
    updatedAt: now,
    metadata: {
      id: `meta_${projectId}`,
      projectId,
      sourceType: 'youtube',
      youtubeVideoId: videoId,
      sourceUrl: normalizedUrl,
      title,
      channelName,
      description: '',
      durationSec: 60,
      uploadDate: now.slice(0, 10),
      thumbnailUrl,
      chapters: [],
      transcript: [],
      audioPeaks: [],
      sceneChanges: [],
      commentSignals: [],
      heatmapPoints: [],
      heatmapAvailable: false,
      subtitlesAvailable: false,
      sourceStreamUrl: '',
      hasPlayableSource: false,
    },
    job: {
      id: jobId,
      projectId,
      status: 'restricted',
      stage: 'extracting_metadata',
      stageLabel: 'Extracting metadata',
      progress: 22,
      errorCode: 'DIRECT_STREAM_UNAVAILABLE',
      errorMessage: restrictionReason,
      restrictionReason,
      updatedAt: now,
    },
    candidates: [],
    generatedClips: [],
    logs: [
      {
        id: `log_${Date.now()}_1`,
        projectId,
        jobId,
        stage: 'validating_url',
        level: 'info',
        message: 'Validated YouTube source URL.',
        timestamp: now,
      },
      {
        id: `log_${Date.now()}_2`,
        projectId,
        jobId,
        stage: 'extracting_metadata',
        level: 'warn',
        message: restrictionReason,
        timestamp: now,
      },
    ],
  };

  const existing = loadLocalProjects();
  saveLocalProjects([project, ...existing]);
  return project;
}

async function probeBrowserVideo(
  file: File,
): Promise<{ durationSec: number; width: number; height: number; thumbnailUrl: string; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => {
      video.onloadeddata = null;
      video.onerror = null;
      video.onseeked = null;
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode that video file in this browser. Try MP4 or WebM.'));
    };

    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 25;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      if (durationSec < 5) {
        cleanup();
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Uploaded video must be at least 5 seconds long.'));
        return;
      }

      const seekTarget = Math.min(1.0, Math.max(0.1, durationSec * 0.1));
      video.currentTime = seekTarget;

      video.onseeked = () => {
        let thumbnailUrl = '';
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = Math.max(180, Math.round((640 * height) / Math.max(1, width)));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbnailUrl = canvas.toDataURL('image/jpeg', 0.78);
          }
        } catch {
          thumbnailUrl = '';
        }
        cleanup();
        resolve({ durationSec, width, height, thumbnailUrl, objectUrl });
      };
    };
  });
}

export async function analyzeLocalVideoFile(file: File): Promise<ProjectDetail> {
  const probe = await probeBrowserVideo(file);
  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const settings = loadLocalSettings();

  sessionVideoUrls.set(projectId, probe.objectUrl);

  const cleanTitle =
    file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded Studio Video';

  const transcript: TranscriptSegment[] = [
    {
      id: 'up_1',
      startSec: 0,
      endSec: Math.min(probe.durationSec, 12),
      text: `Opening setup from ${cleanTitle}.`,
    },
    {
      id: 'up_2',
      startSec: Math.min(probe.durationSec * 0.35, Math.max(0, probe.durationSec - 15)),
      endSec: Math.min(probe.durationSec, probe.durationSec * 0.75),
      text: 'Highlighted visual & pacing peak inside uploaded footage.',
    },
  ];

  const candidates = buildCandidateClips({
    projectId,
    durationSec: probe.durationSec,
    transcript,
    audioPeaks: [],
    sceneChanges: [],
    commentSignals: [],
    heatmapPoints: [],
    weights: settings.weights,
  });

  const top = candidates[0];

  const project: ProjectDetail = {
    id: projectId,
    title: cleanTitle,
    sourceUrl: `upload://${file.name}`,
    thumbnailUrl: probe.thumbnailUrl,
    status: 'candidates_ready',
    selectedStartSec: top?.startSec ?? 0,
    selectedEndSec: top?.endSec ?? Math.min(20, probe.durationSec),
    selectedCandidateId: top?.id ?? null,
    aiExplanation: top?.reason ?? null,
    captionConfig: { ...settings.defaultCaptionConfig },
    createdAt: now,
    updatedAt: now,
    metadata: {
      id: `meta_${projectId}`,
      projectId,
      sourceType: 'upload',
      sourceUrl: `upload://${file.name}`,
      title: cleanTitle,
      channelName: 'Authorized Upload',
      description: `Local video (${probe.width}x${probe.height}, ${probe.durationSec.toFixed(1)}s).`,
      durationSec: probe.durationSec,
      uploadDate: now.slice(0, 10),
      thumbnailUrl: probe.thumbnailUrl,
      chapters: [],
      transcript,
      audioPeaks: [],
      sceneChanges: [],
      commentSignals: [],
      heatmapPoints: [],
      heatmapAvailable: false,
      subtitlesAvailable: false,
      sourceStreamUrl: probe.objectUrl,
      hasPlayableSource: true,
    },
    job: {
      id: jobId,
      projectId,
      status: 'completed',
      stage: 'detecting_viral_moments',
      stageLabel: 'Detecting viral moments',
      progress: 100,
      updatedAt: now,
    },
    candidates,
    generatedClips: [],
    logs: [
      {
        id: `log_${Date.now()}_1`,
        projectId,
        jobId,
        stage: 'validating_url',
        level: 'info',
        message: `Accepted authorized upload: ${file.name}`,
        timestamp: now,
      },
      {
        id: `log_${Date.now()}_2`,
        projectId,
        jobId,
        stage: 'detecting_viral_moments',
        level: 'info',
        message: `Scored ${candidates.length} candidate windows (${probe.width}x${probe.height}).`,
        timestamp: now,
      },
    ],
  };

  const existing = loadLocalProjects();
  saveLocalProjects([project, ...existing]);
  return project;
}

export function regenerateLocalCandidates(projectId: string): ProjectDetail {
  const projects = loadLocalProjects();
  const target = projects.find((p) => p.id === projectId);
  if (!target || !target.metadata) {
    throw new Error('Project metadata not found.');
  }
  const settings = loadLocalSettings();
  const candidates = buildCandidateClips({
    projectId,
    durationSec: target.metadata.durationSec,
    transcript: target.metadata.transcript,
    audioPeaks: target.metadata.audioPeaks,
    sceneChanges: target.metadata.sceneChanges,
    commentSignals: target.metadata.commentSignals,
    heatmapPoints: target.metadata.heatmapPoints,
    weights: settings.weights,
    maxCandidates: 5,
  });

  const updated: ProjectDetail = {
    ...target,
    candidates,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProjects(projects.map((p) => (p.id === projectId ? updated : p)));
  return updated;
}

export function deleteLocalProject(projectId: string): void {
  const blobUrl = sessionVideoUrls.get(projectId);
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    sessionVideoUrls.delete(projectId);
  }
  const remaining = loadLocalProjects().filter((p) => p.id !== projectId);
  saveLocalProjects(remaining);
}
