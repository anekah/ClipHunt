import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import multer from 'multer';
import { buildCandidateClips, validateWeights } from './src/lib/scoringEngine.ts';
import {
  DEFAULT_CAPTION_CONFIG,
  MEDIA_DIR,
  TMP_DIR,
  db,
  deleteProjectById,
  getGeneratedClipRecord,
  getJobById,
  getProjectById,
  getSourcePathForProject,
  getUserSettings,
  getUserUsage,
  listAllGeneratedClips,
  listProjects,
  saveUserSettings,
} from './server/db.ts';
import { verifyFfmpegAvailable } from './server/ffmpegPipeline.ts';
import {
  attachSourceVideoToProject,
  startAnalysisJob,
  startRenderJob,
  startUploadedVideoJob,
} from './server/jobRunner.ts';
import type { CaptionConfig, ScoringWeights } from './src/shared/types.ts';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver') as {
  ZipArchive: new (options?: { zlib?: { level?: number } }) => import('archiver').Archiver;
};

const PORT = Number(process.env.PORT || 3000);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 250);

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: maxUploadMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
      'application/octet-stream',
    ]);
    if (allowed.has(file.mimetype) || /\.(mp4|mov|webm|mkv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported video format. Please upload MP4, MOV, WebM, or MKV.'));
    }
  },
});

function streamVideoWithRanges(filePath: string, req: Request, res: Response) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Video file not found on disk.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

async function createApp() {
  try {
    await verifyFfmpegAvailable();
  } catch (err) {
    console.warn(
      'FFmpeg/FFprobe availability check failed at startup:',
      err instanceof Error ? err.message : String(err),
    );
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Serve generated/static assets in both dev and production
  app.use('/src/assets', express.static(path.resolve(process.cwd(), 'src/assets')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'cliphunt-api', time: new Date().toISOString() });
  });

  app.get('/api/dashboard', (_req, res) => {
    const usage = getUserUsage();
    const projects = listProjects();
    const settings = getUserSettings();
    res.json({ usage, projects, settings });
  });

  app.post('/api/video/analyze', async (req, res) => {
    try {
      const { url } = req.body as {
        url?: string;
      };

      if (!url || !url.trim()) {
        res.status(400).json({ error: 'Please provide a YouTube video URL.' });
        return;
      }

      const result = await startAnalysisJob({ url });
      res.status(202).json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to start analysis job.',
      });
    }
  });

  app.post('/api/video/upload', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No video file uploaded.' });
        return;
      }
      const ext = path.extname(req.file.originalname) || '.mp4';
      const renamedPath = `${req.file.path}${ext}`;
      fs.renameSync(req.file.path, renamedPath);

      const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
      const result = await startUploadedVideoJob({
        filePath: renamedPath,
        originalName: req.file.originalname,
        title,
      });
      res.status(202).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Video upload failed.',
      });
    }
  });

  app.post('/api/projects/:projectId/attach-source', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No video file uploaded.' });
        return;
      }
      const ext = path.extname(req.file.originalname) || '.mp4';
      const renamedPath = `${req.file.path}${ext}`;
      fs.renameSync(req.file.path, renamedPath);

      const project = await attachSourceVideoToProject({
        projectId: String(req.params.projectId),
        filePath: renamedPath,
        originalName: req.file.originalname,
      });
      res.json({ project });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to attach video file.',
      });
    }
  });

  app.get('/api/video/status/:jobId', (req, res) => {
    const job = getJobById(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Analysis job not found.' });
      return;
    }
    const project = getProjectById(job.projectId);
    res.json({ job, project });
  });

  app.get('/api/video/candidates/:jobId', (req, res) => {
    const job = getJobById(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    const project = getProjectById(job.projectId);
    res.json({ candidates: project?.candidates ?? [], project });
  });

  app.post('/api/video/select-clip', (req, res) => {
    const { projectId, candidateId, startSec, endSec, captionConfig } = req.body as {
      projectId: string;
      candidateId?: string;
      startSec: number;
      endSec: number;
      captionConfig?: CaptionConfig;
    };

    const project = getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    if (typeof startSec !== 'number' || typeof endSec !== 'number' || endSec <= startSec) {
      res.status(400).json({ error: 'Invalid start or end timestamp.' });
      return;
    }

    const now = new Date().toISOString();
    if (candidateId) {
      db.prepare('UPDATE candidate_clips SET is_selected = 0 WHERE project_id = ?').run(projectId);
      db.prepare('UPDATE candidate_clips SET is_selected = 1 WHERE id = ? AND project_id = ?').run(
        candidateId,
        projectId,
      );
    }

    db.prepare(
      `UPDATE projects
       SET selected_candidate_id = COALESCE(?, selected_candidate_id),
           selected_start_sec = ?, selected_end_sec = ?,
           caption_config_json = COALESCE(?, caption_config_json),
           updated_at = ?
       WHERE id = ?`,
    ).run(
      candidateId ?? null,
      startSec,
      endSec,
      captionConfig ? JSON.stringify(captionConfig) : null,
      now,
      projectId,
    );

    res.json({ project: getProjectById(projectId) });
  });

  app.post('/api/video/regenerate-candidate', (req, res) => {
    const { projectId } = req.body as { projectId: string };
    const project = getProjectById(projectId);
    if (!project || !project.metadata) {
      res.status(404).json({ error: 'Project metadata not found.' });
      return;
    }

    const settings = getUserSettings();
    const candidates = buildCandidateClips({
      projectId,
      durationSec: project.metadata.durationSec,
      transcript: project.metadata.transcript,
      audioPeaks: project.metadata.audioPeaks,
      sceneChanges: project.metadata.sceneChanges,
      commentSignals: project.metadata.commentSignals,
      heatmapPoints: project.metadata.heatmapPoints,
      weights: settings.weights,
      maxCandidates: 5,
    });

    db.prepare('DELETE FROM candidate_clips WHERE project_id = ?').run(projectId);
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

    res.json({ project: getProjectById(projectId) });
  });

  app.post('/api/video/render', async (req, res) => {
    try {
      const { projectId, candidateId, startSec, endSec, captionConfig } = req.body as {
        projectId: string;
        candidateId?: string;
        startSec: number;
        endSec: number;
        captionConfig?: CaptionConfig;
      };

      const project = getProjectById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const resolvedCandidateId =
        candidateId || project.selectedCandidateId || project.candidates[0]?.id || 'manual';

      const result = await startRenderJob({
        projectId,
        candidateId: resolvedCandidateId,
        startSec,
        endSec,
        captionConfig: captionConfig ?? project.captionConfig ?? DEFAULT_CAPTION_CONFIG,
      });

      res.status(202).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to start rendering job.',
      });
    }
  });

  app.get('/api/video/stream/:projectId', (req, res) => {
    const sourcePath = getSourcePathForProject(req.params.projectId);
    if (!sourcePath) {
      res.status(404).json({ error: 'Playable source video unavailable.' });
      return;
    }
    streamVideoWithRanges(sourcePath, req, res);
  });

  app.get('/api/video/preview/:clipId', (req, res) => {
    const rec = getGeneratedClipRecord(req.params.clipId);
    if (!rec) {
      res.status(404).json({ error: 'Generated clip not found.' });
      return;
    }
    streamVideoWithRanges(rec.filePath, req, res);
  });

  app.get('/api/video/download/:clipId', (req, res) => {
    const rec = getGeneratedClipRecord(req.params.clipId);
    if (!rec || !fs.existsSync(rec.filePath)) {
      res.status(404).json({ error: 'Clip file not found.' });
      return;
    }
    const slug = rec.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const filename = `cliphunt-${slug || 'clip'}-${rec.format}.mp4`;
    res.download(rec.filePath, filename);
  });

  app.get('/api/projects/:projectId/download-all', (req, res) => {
    const project = getProjectById(req.params.projectId);
    if (!project || project.generatedClips.length === 0) {
      res.status(404).json({ error: 'No generated clips found for this project.' });
      return;
    }

    const latestByFormat = new Map<string, ReturnType<typeof getGeneratedClipRecord>>();
    for (const clip of project.generatedClips) {
      if (!latestByFormat.has(clip.format)) {
        const rec = getGeneratedClipRecord(clip.id);
        if (rec && fs.existsSync(rec.filePath)) {
          latestByFormat.set(clip.format, rec);
        }
      }
    }

    if (latestByFormat.size === 0) {
      res.status(404).json({ error: 'Clip files missing on disk.' });
      return;
    }

    const slug = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cliphunt-${slug || project.id}-bundle.zip"`,
    );

    const archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });
    archive.pipe(res);

    for (const [format, rec] of latestByFormat.entries()) {
      if (rec) {
        archive.file(rec.filePath, {
          name: `cliphunt-${slug || 'clip'}-${format}.mp4`,
        });
      }
    }
    archive.finalize();
  });

  app.get('/api/projects', (_req, res) => {
    res.json({ projects: listProjects() });
  });

  app.get('/api/projects/:projectId/thumbnail', (req, res) => {
    const safeId = req.params.projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const thumbPath = path.join(MEDIA_DIR, `thumb_${safeId}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(thumbPath);
  });

  app.get('/api/projects/:projectId', (req, res) => {
    const project = getProjectById(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project });
  });

  app.delete('/api/projects/:projectId', (req, res) => {
    const deleted = deleteProjectById(req.params.projectId);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/clips', (_req, res) => {
    res.json({ clips: listAllGeneratedClips() });
  });

  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getUserSettings() });
  });

  app.put('/api/settings', (req, res) => {
    const body = req.body as {
      weights: ScoringWeights;
      defaultCaptionConfig: CaptionConfig;
      autoValidateClips: boolean;
      preferDirectHttps: boolean;
    };

    const check = validateWeights(body.weights);
    if (!check.valid) {
      res.status(400).json({
        error: `Scoring weights must total 100% (currently ${check.total}%).`,
      });
      return;
    }

    const updated = saveUserSettings(body);
    res.json({ settings: updated });
  });

  // Ensure unmatched API routes return JSON 404 rather than HTML SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'ClipHunt API endpoint not found.' });
  });

  // Always serialize Express errors (including multer & JSON syntax errors) as JSON
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    if (res.headersSent) return;
    res.status(400).json({ error: message });
  });

  // Frontend Vite middleware in dev, dist static in production
  const isProd = process.env.NODE_ENV === 'production';
  let useStaticDist = isProd;

  if (!useStaticDist) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      useStaticDist = true;
    }
  }

  if (useStaticDist) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipHunt server listening on http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start ClipHunt server:', err);
  process.exit(1);
});
