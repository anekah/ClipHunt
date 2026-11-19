import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimestamp, validateYouTubeUrl } from './urlValidation';

test('accepts standard watch, short, shorts, and live YouTube URLs', () => {
  const watch = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
  assert.equal(watch.valid, true);
  assert.equal(watch.videoId, 'dQw4w9WgXcQ');
  assert.equal(watch.normalizedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  const short = validateYouTubeUrl('https://youtu.be/jNQXAC9IVRw?si=abc');
  assert.equal(short.valid, true);
  assert.equal(short.videoId, 'jNQXAC9IVRw');

  const shorts = validateYouTubeUrl('https://youtube.com/shorts/aqz-KE-bpKQ');
  assert.equal(shorts.valid, true);
  assert.equal(shorts.videoId, 'aqz-KE-bpKQ');

  const live = validateYouTubeUrl('https://www.youtube.com/live/5qap5aO4i9A');
  assert.equal(live.valid, true);
  assert.equal(live.isLiveUrl, true);
});

test('rejects empty, SSRF local/private hosts, non-YouTube domains, and malformed IDs', () => {
  assert.equal(validateYouTubeUrl('   ').errorCode, 'EMPTY_URL');
  assert.equal(validateYouTubeUrl('http://127.0.0.1:8080/watch?v=dQw4w9WgXcQ').errorCode, 'SSRF_BLOCKED');
  assert.equal(validateYouTubeUrl('http://169.254.169.254/latest/meta-data').errorCode, 'SSRF_BLOCKED');
  assert.equal(validateYouTubeUrl('https://vimeo.com/123456789').errorCode, 'UNSUPPORTED_HOST');
  assert.equal(validateYouTubeUrl('ftp://youtube.com/watch?v=dQw4w9WgXcQ').errorCode, 'INVALID_PROTOCOL');
  assert.equal(validateYouTubeUrl('https://www.youtube.com/watch?v=too_short').errorCode, 'MISSING_VIDEO_ID');
});

test('formats timestamps cleanly with optional tenths', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(85.4), '01:25');
  assert.equal(formatTimestamp(85.4, true), '01:25.4');
});
