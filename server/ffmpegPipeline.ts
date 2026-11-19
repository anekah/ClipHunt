import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateAssSubtitles } from '../src/lib/subtitles';
import {
  AudioPeak,
  CaptionConfig,
  SceneChange,
  TranscriptSegment,
  ValidationReport,
} from '../src/shared/types';
import { CLIPS_DIR, MEDIA_DIR, TMP_DIR } from './db';

const execFileAsync = promisify(execFile);

export interface VideoProbeInfo {
  durationSec: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
  codecVideo: string;
  codecAudio: string;
}

export async function verifyFfmpegAvailable(): Promise<{ ffmpeg: string; ffprobe: string }> {
  const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
  const { stdout: probeOut } = await execFileAsync('ffprobe', ['-version'], { timeout: 5000 });
  return {
    ffmpeg: stdout.split('\n')[0] || 'ffmpeg',
    ffprobe: probeOut.split('\n')[0] || 'ffprobe',
  };
}

export async function probeVideo(filePath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 15000 },
  );

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0),
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream),
    codecVideo: videoStream?.codec_name ?? 'none',
    codecAudio: audioStream?.codec_name ?? 'none',
  };
}

/**
 * Extracts a single JPEG frame from an uploaded video file to use as the project thumbnail.
 */
export async function extractThumbnailFrame(
  filePath: string,
  projectId: string,
): Promise<string | null> {
  const thumbPath = path.join(MEDIA_DIR, `thumb_${projectId}.jpg`);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        '1.0',
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-2',
        '-q:v',
        '4',
        thumbPath,
      ],
      { timeout: 15000 },
    );
    if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
      return thumbPath;
    }
    return null;
  } catch {
    return null;
  }
}

export async function analyzeAudioPeaks(filePath: string): Promise<AudioPeak[]> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        filePath,
        '-af',
        'astats=metadata=1:reset=15,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
        '-f',
        'null',
        '-',
      ],
      { timeout: 30000, maxBuffer: 6 * 1024 * 1024 },
    );

    const samples: Array<{ pts: number; db: number }> = [];
    let currentPts = 0;

    for (const line of stderr.split('\n')) {
      const ptsMatch = line.match(/pts_time:([0-9.]+)/);
      if (ptsMatch) {
        currentPts = Number(ptsMatch[1]);
      }
      const rmsMatch = line.match(/RMS_level=(-?[0-9.]+)/);
      if (rmsMatch) {
        const db = Number(rmsMatch[1]);
        if (Number.isFinite(db) && db > -60 && db <= 0) {
          samples.push({ pts: currentPts, db });
        }
      }
    }

    if (samples.length === 0) return [];
    const sortedDbs = [...samples].map((s) => s.db).sort((a, b) => a - b);
    const medianDb = sortedDbs[Math.floor(sortedDbs.length / 2)];
    const threshold = Math.min(-8, medianDb + 4.5);

    const peaks: AudioPeak[] = [];
    for (const s of samples) {
      if (s.db >= threshold) {
        const delta = s.db - medianDb;
        const intensity = Math.min(98, Math.max(62, Math.round(68 + delta * 2.4)));
        if (!peaks.some((p) => Math.abs(p.timestampSec - s.pts) < 6)) {
          peaks.push({
            timestampSec: Math.round(s.pts * 10) / 10,
            intensity,
            kind: intensity >= 82 ? 'laughter' : 'excitement',
          });
        }
      }
    }

    return peaks.slice(0, 12);
  } catch {
    return [];
  }
}

export async function detectSceneChanges(filePath: string): Promise<SceneChange[]> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        filePath,
        '-vf',
        "select='gt(scene,0.035)',showinfo",
        '-f',
        'null',
        '-',
      ],
      { timeout: 30000, maxBuffer: 6 * 1024 * 1024 },
    );

    const scenes: SceneChange[] = [];
    for (const line of stderr.split('\n')) {
      const m = line.match(/pts_time:([0-9.]+)/);
      if (m) {
        const ts = Math.round(Number(m[1]) * 10) / 10;
        if (!scenes.some((s) => Math.abs(s.timestampSec - ts) < 2.5)) {
          scenes.push({ timestampSec: ts, score: 0.48 });
        }
      }
    }
    return scenes.slice(0, 20);
  } catch {
    return [];
  }
}

async function sampleFrameHash(filePath: string, timestampSec: number, workDir: string): Promise<string> {
  const framePath = path.join(workDir, `frame_${timestampSec.toFixed(1)}.png`);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      String(timestampSec),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-f',
      'image2',
      framePath,
    ],
    { timeout: 15000 },
  );
  if (!fs.existsSync(framePath) || fs.statSync(framePath).size === 0) {
    throw new Error(`Failed to decode frame at ${timestampSec}s`);
  }
  const bytes = fs.readFileSync(framePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function validateRenderedClip(
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
  expectedAspect: '16:9' | '9:16',
  reRendered = false,
): Promise<ValidationReport> {
  const fileExists = fs.existsSync(filePath) && fs.statSync(filePath).size > 10_000;
  if (!fileExists) {
    return {
      passed: false,
      fileExists: false,
      hasVideoStream: false,
      hasAudioStream: false,
      durationSec: 0,
      durationWithinTolerance: false,
      width: 0,
      height: 0,
      aspectRatio: expectedAspect,
      resolutionValid: false,
      framesSampled: 0,
      frameMotionScore: 0,
      reRendered,
      message: 'Output file missing or empty.',
    };
  }

  const probe = await probeVideo(filePath);
  const durationWithinTolerance = Math.abs(probe.durationSec - 20.0) <= 0.25;
  const resolutionValid = probe.width === expectedWidth && probe.height === expectedHeight;

  const workDir = fs.mkdtempSync(path.join(TMP_DIR, 'val_'));
  let framesSampled = 0;
  let frameMotionScore = 0;
  let decodeOk = true;

  try {
    const hashes = new Set<string>();
    for (const ts of [0.5, 10.0, 19.2]) {
      const h = await sampleFrameHash(filePath, ts, workDir);
      hashes.add(h);
      framesSampled += 1;
    }
    frameMotionScore = Math.round((hashes.size / 3) * 100);
  } catch {
    decodeOk = false;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const passed =
    fileExists &&
    probe.hasVideo &&
    probe.hasAudio &&
    durationWithinTolerance &&
    resolutionValid &&
    decodeOk;

  const message = passed
    ? `Verified ${probe.width}x${probe.height} (${expectedAspect}), ${probe.durationSec.toFixed(2)}s, ${probe.codecVideo.toUpperCase()}/${probe.codecAudio.toUpperCase()}, ${framesSampled}/3 frames decoded.`
    : `Validation issue: duration=${probe.durationSec.toFixed(2)}s, resolution=${probe.width}x${probe.height}, video=${probe.hasVideo}, audio=${probe.hasAudio}, decode=${decodeOk}`;

  return {
    passed,
    fileExists,
    hasVideoStream: probe.hasVideo,
    hasAudioStream: probe.hasAudio,
    durationSec: Math.round(probe.durationSec * 100) / 100,
    durationWithinTolerance,
    width: probe.width,
    height: probe.height,
    aspectRatio: expectedAspect,
    resolutionValid,
    framesSampled,
    frameMotionScore,
    reRendered,
    message,
  };
}

export async function renderDualClips(params: {
  sourcePath: string;
  projectId: string;
  candidateId: string;
  startSec: number;
  endSec: number;
  transcript: TranscriptSegment[];
  captionConfig: CaptionConfig;
}): Promise<{
  landscape: {
    id: string;
    filePath: string;
    sizeBytes: number;
    validation: ValidationReport;
  };
  vertical: {
    id: string;
    filePath: string;
    sizeBytes: number;
    validation: ValidationReport;
  };
}> {
  const { sourcePath, projectId, candidateId, startSec, endSec, transcript, captionConfig } = params;
  const clipDur = Math.max(1.0, Math.round((endSec - startSec) * 10) / 10);
  const stamp = Date.now();
  const landscapeId = `clip_${projectId}_land_${stamp}`;
  const verticalId = `clip_${projectId}_vert_${stamp}`;

  const landscapePath = path.join(CLIPS_DIR, `${landscapeId}.mp4`);
  const verticalPath = path.join(CLIPS_DIR, `${verticalId}.mp4`);

  const workDir = fs.mkdtempSync(path.join(TMP_DIR, 'render_'));

  const runRenderPass = async (format: 'landscape' | 'vertical', outPath: string) => {
    const isVert = format === 'vertical';
    const w = isVert ? 1080 : 1280;
    const h = isVert ? 1920 : 720;

    let assFilename: string | null = null;
    if (captionConfig.enabled && captionConfig.preset !== 'off' && transcript.length > 0) {
      assFilename = `${format}.ass`;
      const assContent = generateAssSubtitles({
        transcript,
        clipStartSec: startSec,
        clipEndSec: startSec + clipDur,
        captionConfig,
        playResX: w,
        playResY: h,
      });
      fs.writeFileSync(path.join(workDir, assFilename), assContent, 'utf-8');
    }

    if (!isVert) {
      // Output A: 16:9 Landscape 1280x720
      const baseScale =
        'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0B0C10,setsar=1';
      const vf = assFilename ? `${baseScale},ass=${assFilename}` : baseScale;

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(startSec),
          '-i',
          sourcePath,
          '-t',
          String(clipDur),
          '-vf',
          vf,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '21',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-af',
          'aresample=async=1',
          '-movflags',
          '+faststart',
          outPath,
        ],
        { cwd: workDir, timeout: 90000 },
      );
    } else {
      // Output B: 9:16 Vertical 1080x1920 with blurred enlarged background + centered crisp foreground
      const filterParts = [
        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28,eq=brightness=-0.12[bg]',
        '[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg]',
        '[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[comp]',
      ];

      let mapLabel = '[comp]';
      if (assFilename) {
        filterParts.push(`[comp]ass=${assFilename}[outv]`);
        mapLabel = '[outv]';
      }

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(startSec),
          '-i',
          sourcePath,
          '-t',
          String(clipDur),
          '-filter_complex',
          filterParts.join(';'),
          '-map',
          mapLabel,
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '21',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-af',
          'aresample=async=1',
          '-movflags',
          '+faststart',
          outPath,
        ],
        { cwd: workDir, timeout: 90000 },
      );
    }
  };

  try {
    await runRenderPass('landscape', landscapePath);
    let landValidation = await validateRenderedClip(landscapePath, 1280, 720, '16:9', false);
    if (!landValidation.passed) {
      await runRenderPass('landscape', landscapePath);
      landValidation = await validateRenderedClip(landscapePath, 1280, 720, '16:9', true);
    }

    await runRenderPass('vertical', verticalPath);
    let vertValidation = await validateRenderedClip(verticalPath, 1080, 1920, '9:16', false);
    if (!vertValidation.passed) {
      await runRenderPass('vertical', verticalPath);
      vertValidation = await validateRenderedClip(verticalPath, 1080, 1920, '9:16', true);
    }

    if (!landValidation.passed || !vertValidation.passed) {
      throw new Error(
        `Clip validation failed after retry. Landscape: ${landValidation.message} | Vertical: ${vertValidation.message}`,
      );
    }

    return {
      landscape: {
        id: landscapeId,
        filePath: landscapePath,
        sizeBytes: fs.statSync(landscapePath).size,
        validation: landValidation,
      },
      vertical: {
        id: verticalId,
        filePath: verticalPath,
        sizeBytes: fs.statSync(verticalPath).size,
        validation: vertValidation,
      },
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
