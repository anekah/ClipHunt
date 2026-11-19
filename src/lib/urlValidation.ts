export interface YouTubeValidationResult {
  valid: boolean;
  videoId?: string;
  normalizedUrl?: string;
  isLiveUrl?: boolean;
  errorCode?: 'EMPTY_URL' | 'INVALID_PROTOCOL' | 'SSRF_BLOCKED' | 'UNSUPPORTED_HOST' | 'MISSING_VIDEO_ID';
  errorMessage?: string;
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const PRIVATE_OR_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
]);

function isPrivateIpHost(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (PRIVATE_OR_LOCAL_HOSTS.has(clean)) return true;
  if (/^10\./.test(clean)) return true;
  if (/^192\.168\./.test(clean)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)) return true;
  if (/^127\./.test(clean)) return true;
  if (/\.local$/.test(clean) || /\.internal$/.test(clean)) return true;
  return false;
}

export function validateYouTubeUrl(rawInput: string): YouTubeValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      errorCode: 'EMPTY_URL',
      errorMessage: 'Paste a YouTube video URL to begin analysis.',
    };
  }

  let parsed: URL;
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch {
    return {
      valid: false,
      errorCode: 'INVALID_PROTOCOL',
      errorMessage: 'The input does not look like a valid web URL.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      errorCode: 'INVALID_PROTOCOL',
      errorMessage: 'Only HTTP and HTTPS YouTube URLs are supported.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateIpHost(host)) {
    return {
      valid: false,
      errorCode: 'SSRF_BLOCKED',
      errorMessage: 'Local or private network addresses are not permitted.',
    };
  }

  const allowedHosts = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
  ]);

  if (!allowedHosts.has(host)) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_HOST',
      errorMessage:
        'Only YouTube URLs (youtube.com or youtu.be) are supported here. Use Authorized Upload for local video files.',
    };
  }

  let videoId: string | null = null;
  let isLiveUrl = false;

  if (host === 'youtu.be') {
    const segment = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    videoId = segment;
  } else {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (parsed.searchParams.has('v')) {
      videoId = parsed.searchParams.get('v');
    } else if (pathParts[0] === 'shorts' && pathParts[1]) {
      videoId = pathParts[1];
    } else if (pathParts[0] === 'embed' && pathParts[1]) {
      videoId = pathParts[1];
    } else if (pathParts[0] === 'live' && pathParts[1]) {
      videoId = pathParts[1];
      isLiveUrl = true;
    }
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return {
      valid: false,
      errorCode: 'MISSING_VIDEO_ID',
      errorMessage:
        'Could not locate a valid 11-character YouTube video ID in that link.',
    };
  }

  return {
    valid: true,
    videoId,
    isLiveUrl,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function formatTimestamp(seconds: number, includeTenths = false): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped - Math.floor(clamped)) * 10);
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return includeTenths ? `${base}.${tenths}` : base;
}
