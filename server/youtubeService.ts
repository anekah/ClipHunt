import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CommentSignal,
  HeatmapPoint,
  TranscriptSegment,
} from '../src/shared/types.ts';

const execFileAsync = promisify(execFile);

export interface YouTubeChapter {
  title: string;
  startSec: number;
}

export interface YouTubeLookupResult {
  accessible: boolean;
  downloadable: boolean;
  restrictionReason?: string;
  errorCode?: string;
  title?: string;
  channelName?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  uploadDate?: string;
  description?: string;
  chapters?: YouTubeChapter[];
  transcript?: TranscriptSegment[];
  commentSignals?: CommentSignal[];
  heatmapPoints?: HeatmapPoint[];
  subtitlesAvailable?: boolean;
  directStreamUrl?: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function extractJsonAfter(html: string, marker: string): Record<string, unknown> | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const regex = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(xml)) !== null) {
    const startSec = Number(match[1]);
    const dur = Number(match[2] || '3');
    const rawText = decodeHtmlEntities(
      match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    );
    if (Number.isFinite(startSec) && rawText) {
      segments.push({
        id: `yt_cap_${idx++}`,
        startSec: Math.round(startSec * 10) / 10,
        endSec: Math.round((startSec + Math.max(0.8, dur)) * 10) / 10,
        text: rawText,
      });
    }
  }
  return segments;
}

function parseTimedTextJson3(jsonText: string): TranscriptSegment[] {
  try {
    const parsed = JSON.parse(jsonText) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };
    const segments: TranscriptSegment[] = [];
    let idx = 0;
    for (const ev of parsed.events ?? []) {
      if (typeof ev.tStartMs !== 'number' || !Array.isArray(ev.segs)) continue;
      const text = ev.segs
        .map((s) => s.utf8 ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || text === '\n') continue;
      const startSec = Math.round((ev.tStartMs / 1000) * 10) / 10;
      const durSec = Math.max(1.0, (ev.dDurationMs ?? 3000) / 1000);
      segments.push({
        id: `yt_j3_${idx++}`,
        startSec,
        endSec: Math.round((startSec + durSec) * 10) / 10,
        text,
      });
    }
    return segments;
  } catch {
    return [];
  }
}

function parseChaptersFromDescription(description: string, durationSec: number): YouTubeChapter[] {
  const chapters: YouTubeChapter[] = [];
  const lineRegex = /^(?:\s*[-•*]?\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s+[-–—:]?\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(description)) !== null) {
    const parts = m[1].split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) continue;
    const sec =
      parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
    const title = m[2].trim();
    if (title && (durationSec <= 0 || sec < durationSec)) {
      chapters.push({ title, startSec: sec });
    }
  }
  return chapters;
}

function extractHeatMarkers(html: string): HeatmapPoint[] {
  const points: HeatmapPoint[] = [];
  const regex =
    /"heatMarkerRenderer":\{"timeRangeStartMillis":(\d+),"markerDurationMillis":(\d+),"heatMarkerIntensityScoreNormalized":([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const startSec = Math.round((Number(m[1]) / 1000) * 10) / 10;
    const durSec = Math.round((Number(m[2]) / 1000) * 10) / 10;
    const intensity = Math.max(0, Math.min(1, Number(m[3])));
    if (Number.isFinite(startSec) && Number.isFinite(intensity)) {
      points.push({
        startSec,
        endSec: Math.round((startSec + Math.max(1, durSec)) * 10) / 10,
        intensity,
      });
    }
  }
  return points;
}

export async function inspectYouTubeVideo(
  normalizedUrl: string,
  videoId: string,
): Promise<YouTubeLookupResult> {
  // 1. Check if yt-dlp is installed on the host and inspect metadata safely (no auth/DRM bypass)
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['--dump-single-json', '--no-playlist', '--skip-download', normalizedUrl],
      { timeout: 20000, maxBuffer: 6 * 1024 * 1024 },
    );
    const info = JSON.parse(stdout) as Record<string, unknown>;
    if (info.is_live) {
      return {
        accessible: false,
        downloadable: false,
        errorCode: 'LIVE_STREAM_UNSUPPORTED',
        restrictionReason:
          'Active live streams cannot be segmented cleanly until the broadcast ends. Upload a recorded MP4 once finished.',
        title: String(info.title || 'Live Broadcast'),
        channelName: String(info.uploader || info.channel || 'YouTube Creator'),
        thumbnailUrl: String(info.thumbnail || ''),
      };
    }

    return {
      accessible: true,
      downloadable: true,
      title: String(info.title || 'YouTube Video'),
      channelName: String(info.uploader || info.channel || 'YouTube Creator'),
      thumbnailUrl: String(info.thumbnail || ''),
      durationSec: Number(info.duration || 0),
      uploadDate: String(info.upload_date || ''),
      description: String(info.description || ''),
      subtitlesAvailable: Boolean(info.subtitles || info.automatic_captions),
    };
  } catch (ytErr) {
    const msg = ytErr instanceof Error ? ytErr.message : String(ytErr);
    if (/Private video|Sign in|age|confirm your age|unavailable|This video has been removed/i.test(msg)) {
      return {
        accessible: false,
        downloadable: false,
        errorCode: 'VIDEO_RESTRICTED',
        restrictionReason:
          'This YouTube video is private, deleted, age-restricted, or region-restricted. ClipHunt never bypasses access controls—please upload an authorized local copy instead.',
      };
    }
  }

  // 2. Fetch public oEmbed + watch page public metadata, captions, chapters, and heatmap
  let title = '';
  let channelName = '';
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedResp = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );

    if (oembedResp.status === 401 || oembedResp.status === 403) {
      return {
        accessible: false,
        downloadable: false,
        errorCode: 'EMBED_RESTRICTED',
        restrictionReason:
          'The creator has restricted external embedding or the video is private. Use the Authorized Video Upload workflow to process a video file you own.',
      };
    }
    if (oembedResp.status === 404) {
      return {
        accessible: false,
        downloadable: false,
        errorCode: 'VIDEO_UNAVAILABLE',
        restrictionReason:
          'This YouTube video does not exist or has been removed by the uploader.',
      };
    }
    if (oembedResp.ok) {
      const oembed = (await oembedResp.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      title = oembed.title || '';
      channelName = oembed.author_name || '';
      if (oembed.thumbnail_url) thumbnailUrl = oembed.thumbnail_url;
    }
  } catch {
    // Continue to watch page inspection
  }

  let transcript: TranscriptSegment[] = [];
  let durationSec = 0;
  let description = '';
  let uploadDate = '';
  let chapters: YouTubeChapter[] = [];
  let heatmapPoints: HeatmapPoint[] = [];
  let commentSignals: CommentSignal[] = [];
  let directStreamUrl: string | undefined;

  try {
    const pageResp = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (pageResp.ok) {
      const html = await pageResp.text();
      const playerResp = extractJsonAfter(html, 'ytInitialPlayerResponse = ') as {
        playabilityStatus?: { status?: string; reason?: string };
        videoDetails?: {
          title?: string;
          author?: string;
          lengthSeconds?: string;
          shortDescription?: string;
          isLiveContent?: boolean;
        };
        microformat?: {
          playerMicroformatRenderer?: { publishDate?: string };
        };
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{ baseUrl?: string; languageCode?: string }>;
          };
        };
        streamingData?: {
          formats?: Array<{ url?: string; mimeType?: string }>;
        };
      } | null;

      if (playerResp?.playabilityStatus?.status === 'LOGIN_REQUIRED') {
        const reason = playerResp.playabilityStatus.reason || '';
        if (/age|private/i.test(reason)) {
          return {
            accessible: false,
            downloadable: false,
            errorCode: 'VIDEO_RESTRICTED',
            restrictionReason:
              reason ||
              'This YouTube video requires sign-in or age confirmation. Upload an authorized local copy instead.',
          };
        }
      }

      if (
        playerResp?.videoDetails?.isLiveContent &&
        /isLiveNow":true/.test(html)
      ) {
        return {
          accessible: false,
          downloadable: false,
          errorCode: 'LIVE_STREAM_UNSUPPORTED',
          restrictionReason:
            'This URL points to an active live stream. ClipHunt supports recorded videos or authorized local uploads.',
          title: title || playerResp.videoDetails.title || `YouTube Live (${videoId})`,
          channelName: channelName || playerResp.videoDetails.author || 'YouTube Creator',
          thumbnailUrl,
        };
      }

      if (playerResp?.videoDetails) {
        if (!title && playerResp.videoDetails.title) title = playerResp.videoDetails.title;
        if (!channelName && playerResp.videoDetails.author)
          channelName = playerResp.videoDetails.author;
        if (playerResp.videoDetails.lengthSeconds)
          durationSec = Number(playerResp.videoDetails.lengthSeconds) || 0;
        if (playerResp.videoDetails.shortDescription)
          description = playerResp.videoDetails.shortDescription;
      }

      if (!durationSec) {
        const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (lenMatch) durationSec = Number(lenMatch[1]);
      }

      if (!description) {
        const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        if (descMatch) {
          try {
            description = JSON.parse(`"${descMatch[1]}"`);
          } catch {
            description = descMatch[1];
          }
        }
      }

      uploadDate =
        playerResp?.microformat?.playerMicroformatRenderer?.publishDate ||
        html.match(/"publishDate":"([^"]+)"/)?.[1] ||
        '';

      // Direct un-ciphered progressive MP4 stream if exposed without cipher
      const directFmt = (playerResp?.streamingData?.formats ?? []).find(
        (f) => typeof f.url === 'string' && f.url.startsWith('https://') && f.mimeType?.includes('video/mp4'),
      );
      if (directFmt?.url) {
        directStreamUrl = directFmt.url;
      }

      // Extract captions from playerCaptionsTracklistRenderer
      const tracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const pickedTrack = tracks.find((t) => t.languageCode?.startsWith('en')) ?? tracks[0];
      if (pickedTrack?.baseUrl) {
        const baseUrl = pickedTrack.baseUrl.replace(/\\u0026/g, '&');
        try {
          const j3Resp = await fetch(`${baseUrl}&fmt=json3`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(6000),
          });
          if (j3Resp.ok) {
            const j3Text = await j3Resp.text();
            if (j3Text.trim()) {
              transcript = parseTimedTextJson3(j3Text);
            }
          }
          if (transcript.length === 0) {
            const xmlResp = await fetch(baseUrl, { signal: AbortSignal.timeout(6000) });
            if (xmlResp.ok) {
              const xmlText = await xmlResp.text();
              if (xmlText.trim()) {
                transcript = parseTimedTextXml(xmlText);
              }
            }
          }
        } catch {
          // Proceed with chapters/description cues if caption endpoint timed out
        }
      }

      heatmapPoints = extractHeatMarkers(html);
    }
  } catch {
    // Public watch page blocked or timed out; oEmbed title/thumbnail still valid
  }

  if (!title) {
    return {
      accessible: false,
      downloadable: false,
      errorCode: 'METADATA_UNAVAILABLE',
      restrictionReason:
        'Could not verify public access for this YouTube video (it may be private, deleted, or rate-limited). Upload an authorized MP4/MOV file instead.',
    };
  }

  if (durationSec <= 0) {
    durationSec = 180;
  }

  if (description) {
    chapters = parseChaptersFromDescription(description, durationSec);
    commentSignals = chapters.map((ch) => ({
      timestampSec: ch.startSec,
      commentText: `Chapter highlight: ${ch.title}`,
      likes: 120,
      matchedPhrase: ch.title.toLowerCase(),
    }));
  }

  // Build fallback transcript cues from chapters or description lines when timed captions are empty
  if (transcript.length === 0) {
    if (chapters.length > 0) {
      transcript = chapters.map((ch, idx) => ({
        id: `yt_ch_${idx}`,
        startSec: ch.startSec,
        endSec: Math.min(
          durationSec,
          chapters[idx + 1]?.startSec ?? ch.startSec + 20,
        ),
        text: ch.title,
      }));
    } else {
      const summaryLine =
        description
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 15 && !l.startsWith('http')) || title;
      transcript = [
        {
          id: 'yt_meta_1',
          startSec: 0,
          endSec: Math.min(durationSec, 22),
          text: `${title} — opening setup`,
        },
        {
          id: 'yt_meta_2',
          startSec: Math.round(durationSec * 0.35),
          endSec: Math.min(durationSec, Math.round(durationSec * 0.35) + 22),
          text: summaryLine.slice(0, 140),
        },
        {
          id: 'yt_meta_3',
          startSec: Math.round(durationSec * 0.7),
          endSec: Math.min(durationSec, Math.round(durationSec * 0.7) + 22),
          text: `${title} — climax & audience payoff`,
        },
      ];
    }
  }

  return {
    accessible: true,
    downloadable: Boolean(directStreamUrl),
    title,
    channelName: channelName || 'YouTube Creator',
    thumbnailUrl,
    durationSec,
    uploadDate,
    description,
    chapters,
    transcript,
    commentSignals,
    heatmapPoints,
    subtitlesAvailable: transcript.length > 0,
    directStreamUrl,
  };
}
