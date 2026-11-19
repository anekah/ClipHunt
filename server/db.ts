import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AnalysisJob,
  CAPTION_PRESETS,
  CandidateClip,
  CaptionConfig,
  DEFAULT_SCORING_WEIGHTS,
  GeneratedClip,
  ProcessingLogEntry,
  ProjectDetail,
  ProjectStatus,
  UserSettings,
  UserUsage,
  VideoMetadata,
} from '../src/shared/types';

export const DATA_DIR = path.resolve(process.cwd(), process.env.CLIPHUNT_DATA_DIR || '.data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const CLIPS_DIR = path.join(DATA_DIR, 'clips');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(CLIPS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'cliphunt.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    plan_name TEXT NOT NULL DEFAULT 'Creator Pro',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_usage (
    user_id TEXT PRIMARY KEY,
    monthly_clips_limit INTEGER NOT NULL DEFAULT 60,
    monthly_clips_used INTEGER NOT NULL DEFAULT 0,
    storage_limit_mb INTEGER NOT NULL DEFAULT 2048,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    weights_json TEXT NOT NULL,
    default_caption_json TEXT NOT NULL,
    auto_validate_clips INTEGER NOT NULL DEFAULT 1,
    prefer_direct_https INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    status TEXT NOT NULL,
    selected_start_sec REAL,
    selected_end_sec REAL,
    selected_candidate_id TEXT,
    ai_explanation TEXT,
    caption_config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_metadata (
    id TEXT PRIMARY KEY,
    project_id TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL,
    youtube_video_id TEXT,
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_sec REAL NOT NULL,
    upload_date TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    chapters_json TEXT NOT NULL,
    transcript_json TEXT NOT NULL,
    audio_peaks_json TEXT NOT NULL,
    scene_changes_json TEXT NOT NULL,
    comment_signals_json TEXT NOT NULL,
    heatmap_points_json TEXT NOT NULL,
    heatmap_available INTEGER NOT NULL DEFAULT 0,
    subtitles_available INTEGER NOT NULL DEFAULT 0,
    local_source_path TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analysis_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    stage_label TEXT NOT NULL,
    progress INTEGER NOT NULL,
    error_code TEXT,
    error_message TEXT,
    restriction_reason TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS candidate_clips (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    start_sec REAL NOT NULL,
    end_sec REAL NOT NULL,
    duration_sec REAL NOT NULL,
    peak_sec REAL NOT NULL,
    predicted_engagement_score REAL NOT NULL,
    category TEXT NOT NULL,
    reason TEXT NOT NULL,
    transcript_excerpt TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    weights_json TEXT NOT NULL,
    is_selected INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generated_clips (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    format TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    duration_sec REAL NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    codec_video TEXT NOT NULL,
    codec_audio TEXT NOT NULL,
    caption_preset TEXT NOT NULL,
    file_path TEXT NOT NULL,
    validation_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS processing_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

export const DEFAULT_USER_ID = 'usr_cliphunt_studio';

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  enabled: true,
  preset: 'bold_viral',
  ...CAPTION_PRESETS.find((p) => p.id === 'bold_viral')!.config,
};

export function ensureDefaultUser() {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(DEFAULT_USER_ID);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, display_name, avatar_url, plan_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_USER_ID,
      'studio@cliphunt.app',
      'Alex Mercer',
      '/src/assets/images/cliphunt_user_avatar_1795121937112.jpg',
      'Creator Pro',
      now,
    );

    db.prepare(
      `INSERT INTO user_usage (user_id, monthly_clips_limit, monthly_clips_used, storage_limit_mb)
       VALUES (?, 60, 0, 2048)`,
    ).run(DEFAULT_USER_ID);

    db.prepare(
      `INSERT INTO user_settings (user_id, weights_json, default_caption_json, auto_validate_clips, prefer_direct_https)
       VALUES (?, ?, ?, 1, 1)`,
    ).run(
      DEFAULT_USER_ID,
      JSON.stringify(DEFAULT_SCORING_WEIGHTS),
      JSON.stringify(DEFAULT_CAPTION_CONFIG),
    );
  }
}

ensureDefaultUser();

export function getUserSettings(): UserSettings {
  const row = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(DEFAULT_USER_ID) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      weights: { ...DEFAULT_SCORING_WEIGHTS },
      defaultCaptionConfig: { ...DEFAULT_CAPTION_CONFIG },
      autoValidateClips: true,
      preferDirectHttps: true,
    };
  }
  return {
    weights: JSON.parse(String(row.weights_json)),
    defaultCaptionConfig: JSON.parse(String(row.default_caption_json)),
    autoValidateClips: Boolean(row.auto_validate_clips),
    preferDirectHttps: Boolean(row.prefer_direct_https),
  };
}

export function saveUserSettings(settings: UserSettings): UserSettings {
  db.prepare(
    `UPDATE user_settings
     SET weights_json = ?, default_caption_json = ?, auto_validate_clips = ?, prefer_direct_https = ?
     WHERE user_id = ?`,
  ).run(
    JSON.stringify(settings.weights),
    JSON.stringify(settings.defaultCaptionConfig),
    settings.autoValidateClips ? 1 : 0,
    settings.preferDirectHttps ? 1 : 0,
    DEFAULT_USER_ID,
  );
  return getUserSettings();
}

export function getUserUsage(): UserUsage {
  const user = db.prepare('SELECT plan_name FROM users WHERE id = ?').get(DEFAULT_USER_ID) as
    | { plan_name: string }
    | undefined;
  const usage = db
    .prepare('SELECT * FROM user_usage WHERE user_id = ?')
    .get(DEFAULT_USER_ID) as { monthly_clips_limit: number; monthly_clips_used: number; storage_limit_mb: number } | undefined;

  const clipStats = db
    .prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(file_size_bytes), 0) as bytes FROM generated_clips')
    .get() as { cnt: number; bytes: number };
  const activeJobs = db
    .prepare("SELECT COUNT(*) as cnt FROM analysis_jobs WHERE status IN ('queued','running')")
    .get() as { cnt: number };

  const storageUsedMb = Math.round((Number(clipStats.bytes || 0) / (1024 * 1024)) * 10) / 10;

  return {
    planName: user?.plan_name ?? 'Creator Pro',
    monthlyClipsLimit: usage?.monthly_clips_limit ?? 60,
    monthlyClipsUsed: Math.max(usage?.monthly_clips_used ?? 0, Number(clipStats.cnt || 0)),
    storageLimitMb: usage?.storage_limit_mb ?? 2048,
    storageUsedMb,
    totalClipsCreated: Number(clipStats.cnt || 0),
    activeJobsCount: Number(activeJobs.cnt || 0),
  };
}

export function appendLog(entry: Omit<ProcessingLogEntry, 'id' | 'timestamp'>): ProcessingLogEntry {
  const full: ProcessingLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO processing_logs (id, project_id, job_id, stage, level, message, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(full.id, full.projectId, full.jobId, full.stage, full.level, full.message, full.timestamp);
  return full;
}

export function upsertJob(job: AnalysisJob) {
  const existing = db.prepare('SELECT id FROM analysis_jobs WHERE id = ?').get(job.id);
  if (existing) {
    db.prepare(
      `UPDATE analysis_jobs
       SET status = ?, stage = ?, stage_label = ?, progress = ?, error_code = ?, error_message = ?, restriction_reason = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      job.status,
      job.stage,
      job.stageLabel,
      job.progress,
      job.errorCode ?? null,
      job.errorMessage ?? null,
      job.restrictionReason ?? null,
      job.updatedAt,
      job.id,
    );
  } else {
    db.prepare(
      `INSERT INTO analysis_jobs (id, project_id, status, stage, stage_label, progress, error_code, error_message, restriction_reason, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      job.id,
      job.projectId,
      job.status,
      job.stage,
      job.stageLabel,
      job.progress,
      job.errorCode ?? null,
      job.errorMessage ?? null,
      job.restrictionReason ?? null,
      job.updatedAt,
    );
  }
}

export function getJobById(jobId: string): AnalysisJob | null {
  const row = db.prepare('SELECT * FROM analysis_jobs WHERE id = ?').get(jobId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    status: row.status as AnalysisJob['status'],
    stage: row.stage as AnalysisJob['stage'],
    stageLabel: String(row.stage_label),
    progress: Number(row.progress),
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    restrictionReason: row.restriction_reason ? String(row.restriction_reason) : undefined,
    updatedAt: String(row.updated_at),
  };
}

export function listProjects(): ProjectDetail[] {
  const rows = db
    .prepare('SELECT id FROM projects ORDER BY created_at DESC')
    .all() as Array<{ id: string }>;
  return rows.map((r) => getProjectById(r.id)).filter((p): p is ProjectDetail => p !== null);
}

export function getProjectById(projectId: string): ProjectDetail | null {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  if (!p) return null;

  const metaRow = db.prepare('SELECT * FROM video_metadata WHERE project_id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  const jobRow = db
    .prepare('SELECT * FROM analysis_jobs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(projectId) as Record<string, unknown> | undefined;
  const candRows = db
    .prepare('SELECT * FROM candidate_clips WHERE project_id = ? ORDER BY rank ASC')
    .all(projectId) as Array<Record<string, unknown>>;
  const clipRows = db
    .prepare('SELECT * FROM generated_clips WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as Array<Record<string, unknown>>;
  const logRows = db
    .prepare('SELECT * FROM processing_logs WHERE project_id = ? ORDER BY timestamp ASC')
    .all(projectId) as Array<Record<string, unknown>>;

  const metadata: VideoMetadata | null = metaRow
    ? {
        id: String(metaRow.id),
        projectId: String(metaRow.project_id),
        sourceType: metaRow.source_type as VideoMetadata['sourceType'],
        youtubeVideoId: metaRow.youtube_video_id ? String(metaRow.youtube_video_id) : undefined,
        sourceUrl: String(metaRow.source_url),
        title: String(metaRow.title),
        channelName: String(metaRow.channel_name),
        description: String(metaRow.description),
        durationSec: Number(metaRow.duration_sec),
        uploadDate: String(metaRow.upload_date),
        thumbnailUrl: String(metaRow.thumbnail_url),
        chapters: JSON.parse(String(metaRow.chapters_json)),
        transcript: JSON.parse(String(metaRow.transcript_json)),
        audioPeaks: JSON.parse(String(metaRow.audio_peaks_json)),
        sceneChanges: JSON.parse(String(metaRow.scene_changes_json)),
        commentSignals: JSON.parse(String(metaRow.comment_signals_json)),
        heatmapPoints: JSON.parse(String(metaRow.heatmap_points_json)),
        heatmapAvailable: Boolean(metaRow.heatmap_available),
        subtitlesAvailable: Boolean(metaRow.subtitles_available),
        sourceStreamUrl: `/api/video/stream/${projectId}`,
        hasPlayableSource: Boolean(
          metaRow.local_source_path && fs.existsSync(String(metaRow.local_source_path)),
        ),
      }
    : null;

  const job: AnalysisJob | null = jobRow
    ? {
        id: String(jobRow.id),
        projectId: String(jobRow.project_id),
        status: jobRow.status as AnalysisJob['status'],
        stage: jobRow.stage as AnalysisJob['stage'],
        stageLabel: String(jobRow.stage_label),
        progress: Number(jobRow.progress),
        errorCode: jobRow.error_code ? String(jobRow.error_code) : undefined,
        errorMessage: jobRow.error_message ? String(jobRow.error_message) : undefined,
        restrictionReason: jobRow.restriction_reason ? String(jobRow.restriction_reason) : undefined,
        updatedAt: String(jobRow.updated_at),
      }
    : null;

  const candidates: CandidateClip[] = candRows.map((c) => ({
    id: String(c.id),
    projectId: String(c.project_id),
    rank: Number(c.rank),
    startSec: Number(c.start_sec),
    endSec: Number(c.end_sec),
    durationSec: Number(c.duration_sec),
    peakSec: Number(c.peak_sec),
    predictedEngagementScore: Number(c.predicted_engagement_score),
    category: String(c.category),
    reason: String(c.reason),
    transcriptExcerpt: String(c.transcript_excerpt),
    signals: JSON.parse(String(c.signals_json)),
    weightsUsed: JSON.parse(String(c.weights_json)),
    isSelected: Boolean(c.is_selected),
  }));

  const generatedClips: GeneratedClip[] = clipRows.map((g) => ({
    id: String(g.id),
    projectId: String(g.project_id),
    candidateId: String(g.candidate_id),
    format: g.format as GeneratedClip['format'],
    aspectRatio: g.aspect_ratio as GeneratedClip['aspectRatio'],
    width: Number(g.width),
    height: Number(g.height),
    durationSec: Number(g.duration_sec),
    fileSizeBytes: Number(g.file_size_bytes),
    codecVideo: String(g.codec_video),
    codecAudio: String(g.codec_audio),
    captionPreset: g.caption_preset as GeneratedClip['captionPreset'],
    previewUrl: `/api/video/preview/${g.id}`,
    downloadUrl: `/api/video/download/${g.id}`,
    validation: JSON.parse(String(g.validation_json)),
    createdAt: String(g.created_at),
  }));

  const logs: ProcessingLogEntry[] = logRows.map((l) => ({
    id: String(l.id),
    projectId: String(l.project_id),
    jobId: String(l.job_id),
    stage: l.stage as ProcessingLogEntry['stage'],
    level: l.level as ProcessingLogEntry['level'],
    message: String(l.message),
    timestamp: String(l.timestamp),
  }));

  return {
    id: String(p.id),
    title: String(p.title),
    sourceUrl: String(p.source_url),
    thumbnailUrl: String(p.thumbnail_url),
    status: p.status as ProjectStatus,
    selectedStartSec: p.selected_start_sec !== null ? Number(p.selected_start_sec) : null,
    selectedEndSec: p.selected_end_sec !== null ? Number(p.selected_end_sec) : null,
    selectedCandidateId: p.selected_candidate_id ? String(p.selected_candidate_id) : null,
    aiExplanation: p.ai_explanation ? String(p.ai_explanation) : null,
    captionConfig: JSON.parse(String(p.caption_config_json)),
    createdAt: String(p.created_at),
    updatedAt: String(p.updated_at),
    metadata,
    job,
    candidates,
    generatedClips,
    logs,
  };
}

export function getSourcePathForProject(projectId: string): string | null {
  const row = db
    .prepare('SELECT local_source_path FROM video_metadata WHERE project_id = ?')
    .get(projectId) as { local_source_path: string | null } | undefined;
  return row?.local_source_path ?? null;
}

export function getGeneratedClipRecord(clipId: string): {
  id: string;
  projectId: string;
  format: string;
  filePath: string;
  title: string;
} | null {
  const row = db
    .prepare(
      `SELECT g.id, g.project_id, g.format, g.file_path, p.title
       FROM generated_clips g
       JOIN projects p ON p.id = g.project_id
       WHERE g.id = ?`,
    )
    .get(clipId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    format: String(row.format),
    filePath: String(row.file_path),
    title: String(row.title),
  };
}

export function listAllGeneratedClips(): Array<GeneratedClip & { projectTitle: string; thumbnailUrl: string }> {
  const rows = db
    .prepare(
      `SELECT g.*, p.title AS project_title, p.thumbnail_url
       FROM generated_clips g
       JOIN projects p ON p.id = g.project_id
       ORDER BY g.created_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((g) => ({
    id: String(g.id),
    projectId: String(g.project_id),
    projectTitle: String(g.project_title),
    thumbnailUrl: String(g.thumbnail_url),
    candidateId: String(g.candidate_id),
    format: g.format as GeneratedClip['format'],
    aspectRatio: g.aspect_ratio as GeneratedClip['aspectRatio'],
    width: Number(g.width),
    height: Number(g.height),
    durationSec: Number(g.duration_sec),
    fileSizeBytes: Number(g.file_size_bytes),
    codecVideo: String(g.codec_video),
    codecAudio: String(g.codec_audio),
    captionPreset: g.caption_preset as GeneratedClip['captionPreset'],
    previewUrl: `/api/video/preview/${g.id}`,
    downloadUrl: `/api/video/download/${g.id}`,
    validation: JSON.parse(String(g.validation_json)),
    createdAt: String(g.created_at),
  }));
}

export function deleteProjectById(projectId: string): boolean {
  const clips = db
    .prepare('SELECT file_path FROM generated_clips WHERE project_id = ?')
    .all(projectId) as Array<{ file_path: string }>;
  for (const c of clips) {
    if (c.file_path && fs.existsSync(c.file_path)) {
      fs.unlinkSync(c.file_path);
    }
  }
  const meta = db
    .prepare('SELECT local_source_path, source_type FROM video_metadata WHERE project_id = ?')
    .get(projectId) as { local_source_path: string | null; source_type: string } | undefined;
  if (meta?.local_source_path && meta.source_type === 'upload' && fs.existsSync(meta.local_source_path)) {
    fs.unlinkSync(meta.local_source_path);
  }
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  return result.changes > 0;
}
