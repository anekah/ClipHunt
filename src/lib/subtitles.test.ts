import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAssSubtitles } from './subtitles';

test('generates valid ASS subtitles relative to clip window', () => {
  const ass = generateAssSubtitles({
    transcript: [
      { id: '1', startSec: 5, endSec: 10, text: 'Before window' },
      { id: '2', startSec: 12, endSec: 18, text: 'Wait this actually happened live!' },
    ],
    clipStartSec: 10,
    clipEndSec: 30,
    captionConfig: {
      enabled: true,
      preset: 'bold_viral',
      fontSize: 60,
      primaryColor: '#FFFFFF',
      highlightColor: '#A78BFA',
      backgroundColor: '#09090B',
      backgroundOpacity: 0.72,
      position: 'center',
    },
    playResX: 1080,
    playResY: 1920,
  });

  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.doesNotMatch(ass, /Before window/);
  assert.match(ass, /Dialogue: 0,0:00:02\.00,0:00:05\.00/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:08\.00/);
  assert.match(ass, /\{\\c&H00FA8BA7\\b1\}ACTUALLY\{\\r\}/);
});
