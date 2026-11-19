-- ClipHunt PostgreSQL / Supabase Database Schema
-- Mirrors the runtime schema used by ClipHunt backend persistence.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  plan_name TEXT NOT NULL DEFAULT 'Creator Pro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_usage (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_clips_limit INTEGER NOT NULL DEFAULT 60,
  monthly_clips_used INTEGER NOT NULL DEFAULT 0,
  storage_limit_mb INTEGER NOT NULL DEFAULT 2048,
  storage_used_mb NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','analyzing','candidates_ready','rendering','completed','restricted','failed')),
  selected_start_sec NUMERIC(8,2),
  selected_end_sec NUMERIC(8,2),
  selected_candidate_id TEXT,
  ai_explanation TEXT,
  caption_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_metadata (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube','upload','sample')),
  youtube_video_id TEXT,
  title TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_sec NUMERIC(10,2) NOT NULL,
  upload_date TEXT,
  thumbnail_url TEXT NOT NULL,
  chapters_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_peaks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  scene_changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  comment_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  heatmap_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  heatmap_available BOOLEAN NOT NULL DEFAULT FALSE,
  subtitles_available BOOLEAN NOT NULL DEFAULT FALSE,
  local_source_path TEXT
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','restricted')),
  stage TEXT NOT NULL,
  stage_label TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  restriction_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_project ON analysis_jobs(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS candidate_clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  start_sec NUMERIC(8,2) NOT NULL,
  end_sec NUMERIC(8,2) NOT NULL,
  duration_sec NUMERIC(8,2) NOT NULL DEFAULT 20.0,
  peak_sec NUMERIC(8,2) NOT NULL,
  predicted_engagement_score NUMERIC(5,2) NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  transcript_excerpt TEXT NOT NULL,
  signals_json JSONB NOT NULL,
  weights_json JSONB NOT NULL,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_candidate_clips_project ON candidate_clips(project_id, rank ASC);

CREATE TABLE IF NOT EXISTS generated_clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidate_clips(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('landscape','vertical')),
  aspect_ratio TEXT NOT NULL CHECK (aspect_ratio IN ('16:9','9:16')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_sec NUMERIC(8,2) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  codec_video TEXT NOT NULL,
  codec_audio TEXT NOT NULL,
  caption_preset TEXT NOT NULL,
  file_path TEXT NOT NULL,
  validation_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_clips_project ON generated_clips(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processing_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_logs_project ON processing_logs(project_id, timestamp ASC);

-- Row-Level Security (RLS) policies for Supabase deployment
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own generated clips" ON generated_clips
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = generated_clips.project_id AND p.user_id = auth.uid()
    )
  );
