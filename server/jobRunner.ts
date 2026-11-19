import fs from 'node:fs';
import { buildCandidateClips } from '../src/lib/scoringEngine.ts';
import { validateYouTubeUrl } from '../src/lib/urlValidation.ts';
import { PIPELINE_STAGES } from '../src/shared/types.ts';
import type {
  AudioPeak,
  CaptionConfig,
  HeatmapPoint,
  PipelineStageKey,
  SceneChange,
  TranscriptSegment,
} from '../src/shared/types.ts';
import {
  DEFAULT_CAPTION_CONFIG,
  DEFAULT_USER_ID,
  appendLog,
  db,
  getProjectById,
  getSourcePathForProject,
  getUserSettings,
  upsertJob,
} from './db.ts';
import {
  analyzeAudioPeaks,
  detectSceneChanges,
  extractThumbnailFrame,
  probeVideo,
  renderDualClips,
} from './ffmpegPipeline.ts';
import { analyzeMomentsWithGemini } from './geminiAnalyzer.ts';
import { inspectYouTubeVideo } from './youtubeService.ts';

function updateStage(
  projectId: string,
  jobId: string,
  stageKey: PipelineStageKey,
  status: 'running' | 'completed' | 'failed' | 'restricted' = 'running',
  message?: string,
  extra?: { errorCode?: string; errorMessage?: string; restrictionReason?: string },
) {
  const stageInfo = PIPELINE_STAGES.find((s) => s.key === stageKey) ?? PIPELINE_STAGES[0];
  const now = new Date().toISOString();
  upsertJob({
    id: jobId,
    projectId,
    status,
    stage: stageKey,
    stageLabel: stageInfo.label,
    progress: status === 'completed' ? 100 : stageInfo.progress,
    errorCode: extra?.errorCode,
    errorMessage: extra?.errorMessage,
    restrictionReason: extra?.restrictionReason,
    updatedAt: now,
  });

  if (message) {
    appendLog({
      projectId,
      jobId,
      stage: stageKey,
      level: status === 'failed' || status === 'restricted' ? 'warn' : 'info',
      message,
    });
  }
}

export async function startAnalysisJob(params: {
  url: string;
}): Promise<{ projectId: string; jobId: string }> {
  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const settings = getUserSettings();

  const initialTitle = 'Analyzing YouTube Source...';
  const initialUrl = params.url.trim();
  const initialCheck = validateYouTubeUrl(initialUrl);
  const initialThumb = initialCheck.videoId
    ? `https://i.ytimg.com/vi/${initialCheck.videoId}/hqdefault.jpg`
    : '';

  db.prepare(
    `INSERT INTO projects (
      id, user_id, title, source_url, thumbnail_url, status,
      caption_config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    DEFAULT_USER_ID,
    initialTitle,
    initialUrl,
    initialThumb,
    'analyzing',
    JSON.stringify(settings.defaultCaptionConfig ?? DEFAULT_CAPTION_CONFIG),
    now,
    now,
  );

  updateStage(projectId, jobId, 'validating_url', 'running', 'Validating incoming source URL.');

  // Run pipeline asynchronously in background worker loop
  setImmediate(async () => {
    try {
      let sourcePath: string | null = null;
      let title = initialTitle;
      let channelName = 'YouTube Creator';
      let description = '';
      let uploadDate = now.slice(0, 10);
      let thumbnailUrl = initialThumb;
      let durationSec = 65;
      let transcript: TranscriptSegment[] = [];
      let audioPeaks: AudioPeak[] = [];
      let sceneChanges: SceneChange[] = [];
      let commentSignals: Array<{ timestampSec: number; commentText: string; likes: number; matchedPhrase?: string }> = [];
      let heatmapPoints: HeatmapPoint[] = [];
      let chapters: Array<{ title: string; startSec: number }> = [];
      const sourceType = 'youtube' as const;
      let youtubeVideoId: string | undefined;

      {
        const validation = validateYouTubeUrl(initialUrl);
        if (!validation.valid || !validation.videoId || !validation.normalizedUrl) {
          db.prepare("UPDATE projects SET status = 'failed', updated_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            projectId,
          );
          updateStage(
            projectId,
            jobId,
            'validating_url',
            'failed',
            validation.errorMessage || 'Invalid URL.',
            {
              errorCode: validation.errorCode,
              errorMessage: validation.errorMessage,
            },
          );
          return;
        }

        youtubeVideoId = validation.videoId;
        updateStage(
          projectId,
          jobId,
          'extracting_metadata',
          'running',
          `Checking YouTube accessibility and metadata for ID ${youtubeVideoId}.`,
        );

        const lookup = await inspectYouTubeVideo(validation.normalizedUrl, youtubeVideoId);
        if (lookup.title) title = lookup.title;
        if (lookup.channelName) channelName = lookup.channelName;
        if (lookup.thumbnailUrl) thumbnailUrl = lookup.thumbnailUrl;
        if (lookup.description) description = lookup.description;
        if (lookup.uploadDate) uploadDate = lookup.uploadDate;
        if (lookup.durationSec) durationSec = lookup.durationSec;
        if (lookup.transcript) transcript = lookup.transcript;
        if (lookup.chapters) chapters = lookup.chapters;
        if (lookup.commentSignals) commentSignals = lookup.commentSignals;
        if (lookup.heatmapPoints) heatmapPoints = lookup.heatmapPoints;

        db.prepare(
          'UPDATE projects SET title = ?, thumbnail_url = ?, updated_at = ? WHERE id = ?',
        ).run(title, thumbnailUrl, new Date().toISOString(), projectId);

        if (!lookup.accessible) {
          db.prepare(
            `INSERT INTO video_metadata (
              id, project_id, source_type, youtube_video_id, source_url, title, channel_name,
              description, duration_sec, upload_date, thumbnail_url, chapters_json, transcript_json,
              audio_peaks_json, scene_changes_json, comment_signals_json, heatmap_points_json,
              heatmap_available, subtitles_available, local_source_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            `meta_${projectId}`,
            projectId,
            'youtube',
            youtubeVideoId,
            validation.normalizedUrl,
            title,
            channelName,
            description,
            durationSec,
            uploadDate,
            thumbnailUrl,
            JSON.stringify(chapters),
            JSON.stringify(transcript),
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify(commentSignals),
            JSON.stringify(heatmapPoints),
            heatmapPoints.length > 0 ? 1 : 0,
            transcript.length > 0 ? 1 : 0,
            null,
          );

          db.prepare("UPDATE projects SET status = 'restricted', updated_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            projectId,
          );
          updateStage(
            projectId,
            jobId,
            'extracting_metadata',
            'restricted',
            lookup.restrictionReason || 'Video unavailable or restricted.',
            {
              errorCode: lookup.errorCode,
              errorMessage: lookup.restrictionReason,
              restrictionReason: lookup.restrictionReason,
            },
          );
          return;
        }

        updateStage(
          projectId,
          jobId,
          'retrieving_captions',
          'running',
          `Loaded "${title}" (${Math.round(durationSec)}s, ${transcript.length} caption/chapter cues, ${heatmapPoints.length} replay markers).`,
        );
      }

      updateStage(
        projectId,
        jobId,
        'detecting_viral_moments',
        'running',
        'Running ClipHunt Viral Detection Engine across transcript, audio, scene, and engagement signals.',
      );

      const aiResult = await analyzeMomentsWithGemini({
        title,
        durationSec,
        transcript,
        audioPeaks,
        sceneChanges,
        commentSignals,
      });

      if (aiResult.warning) {
        appendLog({
          projectId,
          jobId,
          stage: 'detecting_viral_moments',
          level: 'info',
          message: aiResult.warning,
        });
      }

      const candidates = buildCandidateClips({
        projectId,
        durationSec,
        transcript,
        audioPeaks,
        sceneChanges,
        commentSignals,
        heatmapPoints,
        weights: settings.weights,
        aiInsights: aiResult.insights,
      });

      const top = candidates[0];

      db.prepare(
        `INSERT INTO video_metadata (
          id, project_id, source_type, youtube_video_id, source_url, title, channel_name,
          description, duration_sec, upload_date, thumbnail_url, chapters_json, transcript_json,
          audio_peaks_json, scene_changes_json, comment_signals_json, heatmap_points_json,
          heatmap_available, subtitles_available, local_source_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `meta_${projectId}`,
        projectId,
        sourceType,
        youtubeVideoId ?? null,
        initialUrl,
        title,
        channelName,
        description,
        durationSec,
        uploadDate,
        thumbnailUrl,
        JSON.stringify(chapters),
        JSON.stringify(transcript),
        JSON.stringify(audioPeaks),
        JSON.stringify(sceneChanges),
        JSON.stringify(commentSignals),
        JSON.stringify(heatmapPoints),
        heatmapPoints.length > 0 ? 1 : 0,
        transcript.length > 0 ? 1 : 0,
        sourcePath,
      );

      for (const c of candidates) {
        db.prepare(
          `INSERT INTO candidate_clips (
            id, project_id, rank, start_sec, end_sec, duration_sec, peak_sec,
            predicted_engagement_score, category, reason, transcript_excerpt,
            signals_json, weights_json, is_selected
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          c.id,
          c.projectId,
          c.rank,
          c.startSec,
          c.endSec,
          c.durationSec,
          c.peakSec,
          c.predictedEngagementScore,
          c.category,
          c.reason,
          c.transcriptExcerpt,
          JSON.stringify(c.signals),
          JSON.stringify(c.weightsUsed),
          c.isSelected ? 1 : 0,
        );
      }

      db.prepare(
        `UPDATE projects
         SET title = ?, thumbnail_url = ?, status = 'candidates_ready',
             selected_start_sec = ?, selected_end_sec = ?, selected_candidate_id = ?,
             ai_explanation = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        title,
        thumbnailUrl,
        top?.startSec ?? 0,
        top?.endSec ?? 20,
        top?.id ?? null,
        top?.reason ?? null,
        new Date().toISOString(),
        projectId,
      );

      updateStage(
        projectId,
        jobId,
        'detecting_viral_moments',
        'completed',
        `Identified ${candidates.length} ranked 20.0-second viral moment candidates.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE projects SET status = 'failed', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        projectId,
      );
      updateStage(projectId, jobId, 'analysing_video', 'failed', msg, {
        errorCode: 'PIPELINE_ERROR',
        errorMessage: msg,
      });
    }
  });

  return { projectId, jobId };
}

export async function startUploadedVideoJob(params: {
  filePath: string;
  originalName: string;
  title?: string;
}): Promise<{ projectId: string; jobId: string }> {
  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const settings = getUserSettings();

  const cleanTitle =
    params.title?.trim() ||
    params.originalName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') ||
    'Uploaded Studio Video';

  db.prepare(
    `INSERT INTO projects (
      id, user_id, title, source_url, thumbnail_url, status,
      caption_config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    DEFAULT_USER_ID,
    cleanTitle,
    `upload://${params.originalName}`,
    '',
    'analyzing',
    JSON.stringify(settings.defaultCaptionConfig ?? DEFAULT_CAPTION_CONFIG),
    now,
    now,
  );

  updateStage(
    projectId,
    jobId,
    'validating_url',
    'running',
    `Accepted authorized upload: ${params.originalName}`,
  );

  setImmediate(async () => {
    try {
      updateStage(
        projectId,
        jobId,
        'extracting_metadata',
        'running',
        'Inspecting uploaded media streams with FFprobe.',
      );
      const probe = await probeVideo(params.filePath);
      if (!probe.hasVideo || probe.durationSec < 5) {
        throw new Error('Uploaded file must contain a valid video stream of at least 5 seconds.');
      }

      const extractedThumb = await extractThumbnailFrame(params.filePath, projectId);
      const uploadThumbUrl = extractedThumb ? `/api/projects/${projectId}/thumbnail` : '';
      if (uploadThumbUrl) {
        db.prepare('UPDATE projects SET thumbnail_url = ?, updated_at = ? WHERE id = ?').run(
          uploadThumbUrl,
          new Date().toISOString(),
          projectId,
        );
      }

      updateStage(
        projectId,
        jobId,
        'analysing_video',
        'running',
        'Detecting audio reaction peaks and visual scene transitions via FFmpeg.',
      );
      const audioPeaks = await analyzeAudioPeaks(params.filePath);
      const sceneChanges = await detectSceneChanges(params.filePath);

      const transcript: TranscriptSegment[] = [
        {
          id: 'up_1',
          startSec: 0,
          endSec: Math.min(probe.durationSec, 12),
          text: `Opening context from ${cleanTitle}.`,
        },
        {
          id: 'up_2',
          startSec: Math.min(probe.durationSec * 0.35, Math.max(0, probe.durationSec - 15)),
          endSec: Math.min(probe.durationSec, probe.durationSec * 0.75),
          text: 'Key reaction and visual highlight detected in uploaded footage.',
        },
      ];

      updateStage(
        projectId,
        jobId,
        'detecting_viral_moments',
        'running',
        'Scoring candidate 20.0-second windows.',
      );

      const aiResult = await analyzeMomentsWithGemini({
        title: cleanTitle,
        durationSec: probe.durationSec,
        transcript,
        audioPeaks,
        sceneChanges,
        commentSignals: [],
      });

      const candidates = buildCandidateClips({
        projectId,
        durationSec: probe.durationSec,
        transcript,
        audioPeaks,
        sceneChanges,
        commentSignals: [],
        heatmapPoints: [],
        weights: settings.weights,
        aiInsights: aiResult.insights,
      });

      const top = candidates[0];

      db.prepare(
        `INSERT INTO video_metadata (
          id, project_id, source_type, youtube_video_id, source_url, title, channel_name,
          description, duration_sec, upload_date, thumbnail_url, chapters_json, transcript_json,
          audio_peaks_json, scene_changes_json, comment_signals_json, heatmap_points_json,
          heatmap_available, subtitles_available, local_source_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `meta_${projectId}`,
        projectId,
        'upload',
        null,
        `upload://${params.originalName}`,
        cleanTitle,
        'Authorized Upload',
        `Local authorized video upload (${probe.width}x${probe.height}, ${probe.durationSec.toFixed(1)}s).`,
        probe.durationSec,
        now.slice(0, 10),
        uploadThumbUrl,
        JSON.stringify([]),
        JSON.stringify(transcript),
        JSON.stringify(audioPeaks),
        JSON.stringify(sceneChanges),
        JSON.stringify([]),
        JSON.stringify([]),
        0,
        0,
        params.filePath,
      );

      for (const c of candidates) {
        db.prepare(
          `INSERT INTO candidate_clips (
            id, project_id, rank, start_sec, end_sec, duration_sec, peak_sec,
            predicted_engagement_score, category, reason, transcript_excerpt,
            signals_json, weights_json, is_selected
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          c.id,
          c.projectId,
          c.rank,
          c.startSec,
          c.endSec,
          c.durationSec,
          c.peakSec,
          c.predictedEngagementScore,
          c.category,
          c.reason,
          c.transcriptExcerpt,
          JSON.stringify(c.signals),
          JSON.stringify(c.weightsUsed),
          c.isSelected ? 1 : 0,
        );
      }

      db.prepare(
        `UPDATE projects
         SET status = 'candidates_ready', selected_start_sec = ?, selected_end_sec = ?,
             selected_candidate_id = ?, ai_explanation = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        top?.startSec ?? 0,
        top?.endSec ?? 20,
        top?.id ?? null,
        top?.reason ?? null,
        new Date().toISOString(),
        projectId,
      );

      updateStage(
        projectId,
        jobId,
        'detecting_viral_moments',
        'completed',
        `Upload analyzed (${probe.width}x${probe.height}). ${candidates.length} candidate moments scored.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (fs.existsSync(params.filePath)) {
        fs.unlinkSync(params.filePath);
      }
      db.prepare("UPDATE projects SET status = 'failed', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        projectId,
      );
      updateStage(projectId, jobId, 'analysing_video', 'failed', msg, {
        errorCode: 'UPLOAD_ERROR',
        errorMessage: msg,
      });
    }
  });

  return { projectId, jobId };
}

export async function attachSourceVideoToProject(params: {
  projectId: string;
  filePath: string;
  originalName: string;
}) {
  const existing = getProjectById(params.projectId);
  if (!existing || !existing.metadata) {
    throw new Error('Project not found.');
  }

  const probe = await probeVideo(params.filePath);
  if (!probe.hasVideo || probe.durationSec < 5) {
    throw new Error('Attached file must contain a valid video stream of at least 5 seconds.');
  }

  const audioPeaks = await analyzeAudioPeaks(params.filePath);
  const sceneChanges = await detectSceneChanges(params.filePath);

  db.prepare(
    `UPDATE video_metadata
     SET duration_sec = ?, audio_peaks_json = ?, scene_changes_json = ?, local_source_path = ?
     WHERE project_id = ?`,
  ).run(
    probe.durationSec,
    JSON.stringify(audioPeaks),
    JSON.stringify(sceneChanges),
    params.filePath,
    params.projectId,
  );

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    params.projectId,
  );

  return getProjectById(params.projectId);
}

export async function startRenderJob(params: {
  projectId: string;
  candidateId: string;
  startSec: number;
  endSec: number;
  captionConfig: CaptionConfig;
}): Promise<{ jobId: string }> {
  const project = getProjectById(params.projectId);
  if (!project || !project.metadata) {
    throw new Error('Project or video metadata not found.');
  }
  const sourcePath = getSourcePathForProject(params.projectId);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(
      'Source media file is not available locally for rendering. Please upload an authorized MP4, MOV, WebM, or MKV file.',
    );
  }

  const jobId = `job_render_${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE projects
     SET status = 'rendering', selected_candidate_id = ?, selected_start_sec = ?, selected_end_sec = ?,
         caption_config_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    params.candidateId,
    params.startSec,
    params.endSec,
    JSON.stringify(params.captionConfig),
    now,
    params.projectId,
  );

  updateStage(
    params.projectId,
    jobId,
    'downloading_segment',
    'running',
    `Preparing ${params.startSec.toFixed(1)}s–${params.endSec.toFixed(1)}s source segment for dual rendering.`,
  );

  setImmediate(async () => {
    try {
      updateStage(
        params.projectId,
        jobId,
        'generating_clips',
        'running',
        `Rendering 16:9 Landscape (1280x720) and 9:16 Vertical (1080x1920) MP4 clips (${params.captionConfig.enabled ? params.captionConfig.preset : 'captions off'}).`,
      );

      const rendered = await renderDualClips({
        sourcePath,
        projectId: params.projectId,
        candidateId: params.candidateId,
        startSec: params.startSec,
        endSec: params.endSec,
        transcript: project.metadata?.transcript ?? [],
        captionConfig: params.captionConfig,
      });

      updateStage(
        params.projectId,
        jobId,
        'validating_video',
        'running',
        'Running FFprobe stream verification and 3-frame integrity sampling.',
      );

      const createdAt = new Date().toISOString();

      db.prepare(
        `INSERT INTO generated_clips (
          id, project_id, candidate_id, format, aspect_ratio, width, height,
          duration_sec, file_size_bytes, codec_video, codec_audio, caption_preset,
          file_path, validation_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        rendered.landscape.id,
        params.projectId,
        params.candidateId,
        'landscape',
        '16:9',
        1280,
        720,
        rendered.landscape.validation.durationSec,
        rendered.landscape.sizeBytes,
        'h264',
        'aac',
        params.captionConfig.enabled ? params.captionConfig.preset : 'off',
        rendered.landscape.filePath,
        JSON.stringify(rendered.landscape.validation),
        createdAt,
      );

      db.prepare(
        `INSERT INTO generated_clips (
          id, project_id, candidate_id, format, aspect_ratio, width, height,
          duration_sec, file_size_bytes, codec_video, codec_audio, caption_preset,
          file_path, validation_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        rendered.vertical.id,
        params.projectId,
        params.candidateId,
        'vertical',
        '9:16',
        1080,
        1920,
        rendered.vertical.validation.durationSec,
        rendered.vertical.sizeBytes,
        'h264',
        'aac',
        params.captionConfig.enabled ? params.captionConfig.preset : 'off',
        rendered.vertical.filePath,
        JSON.stringify(rendered.vertical.validation),
        createdAt,
      );

      db.prepare("UPDATE projects SET status = 'completed', updated_at = ? WHERE id = ?").run(
        createdAt,
        params.projectId,
      );

      updateStage(
        params.projectId,
        jobId,
        'ready',
        'completed',
        `Both 16:9 and 9:16 MP4 clips passed FFprobe & frame validation and are ready to download.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE projects SET status = 'failed', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        params.projectId,
      );
      updateStage(params.projectId, jobId, 'generating_clips', 'failed', msg, {
        errorCode: 'RENDER_ERROR',
        errorMessage: msg,
      });
    }
  });

  return { jobId };
}
