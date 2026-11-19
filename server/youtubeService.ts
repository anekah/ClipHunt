import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TranscriptSegment } from '../src/shared/types.ts';

const execFileAsync = promisify(execFile);

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
  transcript?: TranscriptSegment[];
  subtitlesAvailable?: boolean;
  downloadedSegmentPath?: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const regex = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(xml)) !== null) {
    const startSec = Number(match[1]);
    const dur = Number(match[2] || '3');
    const rawText = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
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
        accessible: true,
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

  // 2. Fallback: Fetch public oEmbed + watch page public caption track metadata
  let title = '';
  let channelName = '';
  let thumbnailUrl = '';

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
      thumbnailUrl = oembed.thumbnail_url || '';
    }
  } catch {
    // Continue to watch page inspection
  }

  let transcript: TranscriptSegment[] = [];
  let durationSec = 0;
  let description = '';
  let uploadDate = '';

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
      if (/isLiveContent":true/.test(html) && !/isLiveNow":false/.test(html)) {
        return {
          accessible: true,
          downloadable: false,
          errorCode: 'LIVE_STREAM_UNSUPPORTED',
          restrictionReason:
            'This URL points to a live stream. ClipHunt supports recorded videos or authorized local uploads.',
          title: title || `YouTube Live (${videoId})`,
          channelName: channelName || 'YouTube Creator',
          thumbnailUrl,
        };
      }

      const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
      if (lenMatch) durationSec = Number(lenMatch[1]);

      const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
      if (descMatch) {
        try {
          description = JSON.parse(`"${descMatch[1]}"`);
        } catch {
          description = descMatch[1];
        }
      }

      const dateMatch = html.match(/"publishDate":"([^"]+)"/);
      if (dateMatch) uploadDate = dateMatch[1];

      const captionMatch = html.match(/"captionTracks":(\[[\s\S]*?\])/);
      if (captionMatch) {
        let baseUrl: string | undefined;
        try {
          const tracks = JSON.parse(captionMatch[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
          const enTrack = tracks.find((t) => t.languageCode?.startsWith('en')) ?? tracks[0];
          baseUrl = enTrack?.baseUrl;
        } catch {
          const urlMatch = captionMatch[1].match(/"baseUrl":"([^"]+)"/);
          baseUrl = urlMatch?.[1];
        }
        if (baseUrl) {
          const capUrl = baseUrl.replace(/\\u0026/g, '&');
          const capResp = await fetch(capUrl, { signal: AbortSignal.timeout(6000) });
          if (capResp.ok) {
            const xml = await capResp.text();
            transcript = parseTimedTextXml(xml);
          }
        }
      }
    }
  } catch {
    // Public watch page blocked or timed out
  }

  if (!title) {
    return {
      accessible: false,
      downloadable: false,
      errorCode: 'METADATA_UNAVAILABLE',
      restrictionReason:
        'Could not verify public access for this YouTube video (it may be private, deleted, or rate-limited in this environment). Upload your authorized MP4/MOV file directly to clip and render immediately.',
    };
  }

  // Note: In cloud containers without yt-dlp or when YouTube blocks direct media stream fetching,
  // we honestly report downloadable=false so we never fabricate fake video streams!
  return {
    accessible: true,
    downloadable: false,
    errorCode: 'DIRECT_STREAM_UNAVAILABLE',
    restrictionReason:
      'Public video metadata was verified, but direct video stream extraction is unavailable from this server environment without authorized local media (yt-dlp media streams require a local residential session or direct creator upload). Upload the MP4/MOV file below to run full FFmpeg audio/scene analysis and download 16:9 + 9:16 clips.',
    title,
    channelName: channelName || 'YouTube Creator',
    thumbnailUrl,
    durationSec,
    uploadDate,
    description,
    transcript,
    subtitlesAvailable: transcript.length > 0,
  };
}
