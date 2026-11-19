import type { CaptionConfig, TranscriptSegment } from '../shared/types.ts';

function hexToAssBgr(hex: string, alphaPercent = 0): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = full.slice(0, 2).toUpperCase();
  const g = full.slice(2, 4).toUpperCase();
  const b = full.slice(4, 6).toUpperCase();
  // ASS alpha: 00 = opaque, FF = transparent
  const alphaByte = Math.round(Math.max(0, Math.min(1, alphaPercent)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `&H${alphaByte}${b}${g}${r}`;
}

function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

const EMPHASIS_WORDS = new Set([
  'never',
  'literally',
  'actually',
  'wait',
  'viral',
  'funny',
  'secret',
  'crash',
  'million',
  'broke',
  'shocked',
  'punchline',
  'twist',
  'live',
  'instant',
  'crazy',
  'best',
  'worst',
  'zero',
  'everything',
]);

function chunkWordsIntoCaptions(
  transcript: TranscriptSegment[],
  clipStartSec: number,
  clipEndSec: number,
  maxWordsPerLine = 5,
): Array<{ start: number; end: number; words: string[] }> {
  const cues: Array<{ start: number; end: number; words: string[] }> = [];
  const duration = Math.max(1, clipEndSec - clipStartSec);

  for (const seg of transcript) {
    if (seg.endSec <= clipStartSec || seg.startSec >= clipEndSec) continue;
    const clippedStart = Math.max(0, seg.startSec - clipStartSec);
    const clippedEnd = Math.min(duration, seg.endSec - clipStartSec);
    if (clippedEnd - clippedStart < 0.25) continue;

    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const totalChunks = Math.ceil(words.length / maxWordsPerLine);
    const chunkDur = (clippedEnd - clippedStart) / totalChunks;

    for (let i = 0; i < totalChunks; i++) {
      const slice = words.slice(i * maxWordsPerLine, (i + 1) * maxWordsPerLine);
      cues.push({
        start: clippedStart + i * chunkDur,
        end: clippedStart + (i + 1) * chunkDur,
        words: slice,
      });
    }
  }

  return cues;
}

export function generateAssSubtitles(params: {
  transcript: TranscriptSegment[];
  clipStartSec: number;
  clipEndSec: number;
  captionConfig: CaptionConfig;
  playResX: number;
  playResY: number;
}): string {
  const { transcript, clipStartSec, clipEndSec, captionConfig, playResX, playResY } = params;

  const isVertical = playResY > playResX;
  const scaleFactor = isVertical ? playResY / 1920 : playResY / 720;
  const fontSize = Math.round(captionConfig.fontSize * (isVertical ? 1.25 : 0.86) * scaleFactor);

  const primaryColour = hexToAssBgr(captionConfig.primaryColor, 0);
  const highlightColour = hexToAssBgr(captionConfig.highlightColor, 0);
  const effectiveOpacity = captionConfig.backgroundOpacity > 0.05 ? Math.max(0.75, captionConfig.backgroundOpacity) : 0;
  const backAlpha = 1 - Math.max(0, Math.min(1, effectiveOpacity));
  const backColour = hexToAssBgr(captionConfig.backgroundColor, backAlpha);

  const useOpaqueBox = effectiveOpacity > 0.05;
  const borderStyle = useOpaqueBox ? 3 : 1;
  const outline = useOpaqueBox ? 12 : 4;
  const shadow = useOpaqueBox ? 0 : 2;
  const alignment = captionConfig.position === 'center' ? 5 : 2;
  const marginV =
    captionConfig.position === 'center'
      ? 0
      : isVertical
        ? Math.round(playResY * 0.24)
        : Math.round(playResY * 0.16);
  const marginH = Math.round(playResX * 0.08);
  const boldFlag = -1;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,DejaVu Sans,${fontSize},${primaryColour},${highlightColour},${useOpaqueBox ? backColour : '&H00000000'},${backColour},${boldFlag},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginH},${marginH},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const cues = chunkWordsIntoCaptions(
    transcript,
    clipStartSec,
    clipEndSec,
    isVertical ? 4 : 6,
  );

  const events = cues.map((cue) => {
    const upper =
      captionConfig.preset === 'high_energy' || captionConfig.preset === 'bold_viral';
    const renderedWords = cue.words.map((rawWord) => {
      const clean = rawWord.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const escaped = escapeAssText(upper ? rawWord.toUpperCase() : rawWord);
      if (EMPHASIS_WORDS.has(clean) || rawWord.endsWith('!') || rawWord.endsWith('?')) {
        return `{\\c${highlightColour}\\b1}${escaped}{\\r}`;
      }
      return escaped;
    });
    const text = renderedWords.join(' ');
    return `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${text}`;
  });

  return [...header, ...events, ''].join('\n');
}
