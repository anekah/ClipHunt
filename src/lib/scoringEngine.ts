import { DEFAULT_SCORING_WEIGHTS } from '../shared/types.ts';
import type {
  AudioPeak,
  CandidateClip,
  CommentSignal,
  HeatmapPoint,
  SceneChange,
  ScoringWeights,
  SignalScores,
  TranscriptSegment,
} from '../shared/types.ts';

export const TARGET_CLIP_DURATION_SEC = 20.0;

const ENGAGEMENT_PHRASES = [
  'this part killed me',
  'funniest moment',
  'the funniest',
  'i replayed this',
  'replayed this',
  'wait for it',
  'the ending',
  'timestamp',
  "can't stop laughing",
  'cant stop laughing',
  'died laughing',
  'best part',
  'plot twist',
  'so unexpected',
];

const HUMOUR_KEYWORDS = [
  'wait',
  'actually',
  'no way',
  'seriously',
  'laugh',
  'haha',
  'joke',
  'accidentally',
  'forgot',
  'honest',
  'literally',
  'wrong',
  'disaster',
  'twist',
  'punchline',
  'secret',
  'busted',
  'broke',
  'caught',
  'surprise',
];

export function validateWeights(weights: ScoringWeights): { valid: boolean; total: number } {
  const total =
    weights.humour +
    weights.contextPayoff +
    weights.audioReactions +
    weights.audienceEngagement +
    weights.visualInterest +
    weights.emotionalImpact +
    weights.clipCompleteness;
  return {
    valid: Math.abs(total - 100) < 0.01,
    total: Math.round(total * 100) / 100,
  };
}

export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const { total } = validateWeights(weights);
  if (total <= 0) return { ...DEFAULT_SCORING_WEIGHTS };
  const scale = 100 / total;
  return {
    humour: weights.humour * scale,
    contextPayoff: weights.contextPayoff * scale,
    audioReactions: weights.audioReactions * scale,
    audienceEngagement: weights.audienceEngagement * scale,
    visualInterest: weights.visualInterest * scale,
    emotionalImpact: weights.emotionalImpact * scale,
    clipCompleteness: weights.clipCompleteness * scale,
  };
}

export function computeWeightedScore(
  signals: SignalScores,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): number {
  const w = normalizeWeights(weights);
  const raw =
    (signals.humour * w.humour +
      signals.contextPayoff * w.contextPayoff +
      signals.audioReactions * w.audioReactions +
      signals.audienceEngagement * w.audienceEngagement +
      signals.visualInterest * w.visualInterest +
      signals.emotionalImpact * w.emotionalImpact +
      signals.clipCompleteness * w.clipCompleteness) /
    100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function parseTimestampToSeconds(token: string): number | null {
  const parts = token.trim().split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s >= 60) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

export function extractCommentTimestampSignals(
  comments: Array<{ text: string; likes: number }>,
  durationSec: number,
): CommentSignal[] {
  const signals: CommentSignal[] = [];
  const tsRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;

  for (const comment of comments) {
    const lower = comment.text.toLowerCase();
    const matchedPhrase = ENGAGEMENT_PHRASES.find((phrase) => lower.includes(phrase));
    let match: RegExpExecArray | null;
    tsRegex.lastIndex = 0;
    while ((match = tsRegex.exec(comment.text)) !== null) {
      const sec = parseTimestampToSeconds(match[1]);
      if (sec !== null && sec >= 0 && sec <= durationSec) {
        signals.push({
          timestampSec: sec,
          commentText: comment.text,
          likes: Math.max(0, comment.likes),
          matchedPhrase,
        });
      }
    }
  }
  return signals.sort((a, b) => b.likes - a.likes);
}

/**
 * Optimizes a 20.0-second [startSec, endSec] clip window around a viral peak timestamp:
 * - Includes setup context before the peak (~9-11s before peak)
 * - Keeps reaction/payoff afterward (~9-11s after peak)
 * - Aligns start/end boundaries to transcript utterance edges so sentences are not cut off mid-word
 */
export function optimizeClipWindow(
  peakSec: number,
  videoDurationSec: number,
  transcript: TranscriptSegment[],
  clipDurationSec: number = TARGET_CLIP_DURATION_SEC,
): { startSec: number; endSec: number; completenessScore: number } {
  const safeDuration = Math.max(clipDurationSec, videoDurationSec);
  if (safeDuration <= clipDurationSec + 0.05) {
    return { startSec: 0, endSec: clipDurationSec, completenessScore: 94 };
  }

  // Default anchor puts the peak around 55% into the 20s window (11s setup, 9s payoff/reaction)
  const idealStart = Math.max(
    0,
    Math.min(safeDuration - clipDurationSec, peakSec - clipDurationSec * 0.55),
  );

  // Search nearby candidate starts within +/- 3.0s to align cleanly with transcript sentence starts/ends
  let bestStart = idealStart;
  let bestCompleteness = 65;

  const candidateStarts = new Set<number>([Number(idealStart.toFixed(1))]);
  for (const seg of transcript) {
    if (Math.abs(seg.startSec - idealStart) <= 4.0) {
      candidateStarts.add(Number(seg.startSec.toFixed(1)));
    }
    const alignedToEnd = seg.endSec - clipDurationSec;
    if (Math.abs(alignedToEnd - idealStart) <= 4.0) {
      candidateStarts.add(Number(alignedToEnd.toFixed(1)));
    }
  }

  for (const rawStart of candidateStarts) {
    const start = Math.max(0, Math.min(safeDuration - clipDurationSec, rawStart));
    const end = start + clipDurationSec;

    // Ensure the peak remains inside the sweet spot [start + 4s, end - 3s]
    if (peakSec < start + 3.0 || peakSec > end - 2.5) continue;

    let cutPenalty = 0;
    let boundaryBonus = 0;

    for (const seg of transcript) {
      // Mid-sentence cut at start?
      if (seg.startSec < start - 0.35 && seg.endSec > start + 0.35) {
        cutPenalty += 22;
      }
      // Mid-sentence cut at end?
      if (seg.startSec < end - 0.35 && seg.endSec > end + 0.35) {
        cutPenalty += 25;
      }
      // Cleanly starts near segment start
      if (Math.abs(seg.startSec - start) <= 0.45) {
        boundaryBonus += 18;
      }
      // Cleanly ends near segment end
      if (Math.abs(seg.endSec - end) <= 0.5) {
        boundaryBonus += 18;
      }
    }

    const distancePenalty = Math.abs(start - idealStart) * 2.0;
    const score = Math.max(35, Math.min(99, 72 + boundaryBonus - cutPenalty - distancePenalty));

    if (score > bestCompleteness) {
      bestCompleteness = score;
      bestStart = start;
    }
  }

  const finalStart = Math.round(bestStart * 10) / 10;
  const finalEnd = Math.round((finalStart + clipDurationSec) * 10) / 10;

  return {
    startSec: finalStart,
    endSec: finalEnd,
    completenessScore: Math.round(bestCompleteness),
  };
}

export interface AiCandidateInsight {
  peakTimestampSec: number;
  category: string;
  explanation: string;
  humourScore: number;
  contextPayoffScore: number;
  emotionalImpactScore: number;
}

export function buildCandidateClips(params: {
  projectId: string;
  durationSec: number;
  transcript: TranscriptSegment[];
  audioPeaks: AudioPeak[];
  sceneChanges: SceneChange[];
  commentSignals: CommentSignal[];
  heatmapPoints: HeatmapPoint[];
  weights: ScoringWeights;
  aiInsights?: AiCandidateInsight[];
  maxCandidates?: number;
}): CandidateClip[] {
  const {
    projectId,
    durationSec,
    transcript,
    audioPeaks,
    sceneChanges,
    commentSignals,
    heatmapPoints,
    weights,
    aiInsights = [],
    maxCandidates = 4,
  } = params;

  // Gather candidate anchor timestamps from AI insights, audio peaks, comment signals, and transcript excitement
  const seedAnchors: Array<{
    peakSec: number;
    aiInsight?: AiCandidateInsight;
  }> = [];

  for (const insight of aiInsights) {
    if (insight.peakTimestampSec >= 0 && insight.peakTimestampSec <= durationSec) {
      seedAnchors.push({ peakSec: insight.peakTimestampSec, aiInsight: insight });
    }
  }

  for (const peak of audioPeaks) {
    seedAnchors.push({ peakSec: peak.timestampSec });
  }

  for (const sig of commentSignals) {
    seedAnchors.push({ peakSec: sig.timestampSec });
  }

  for (const hm of heatmapPoints) {
    if (hm.intensity >= 0.7) {
      seedAnchors.push({ peakSec: (hm.startSec + hm.endSec) / 2 });
    }
  }

  // Fallback anchors evenly spaced if the video is very quiet or short
  if (seedAnchors.length === 0) {
    const safeDur = Math.max(TARGET_CLIP_DURATION_SEC, durationSec);
    seedAnchors.push(
      { peakSec: safeDur * 0.28 },
      { peakSec: safeDur * 0.55 },
      { peakSec: safeDur * 0.8 },
    );
  }

  // Deduplicate anchors within 12 seconds of each other (preferring AI insight anchors)
  const deduped: typeof seedAnchors = [];
  for (const anchor of seedAnchors) {
    const existing = deduped.find((d) => Math.abs(d.peakSec - anchor.peakSec) < 12);
    if (!existing) {
      deduped.push(anchor);
    } else if (!existing.aiInsight && anchor.aiInsight) {
      existing.aiInsight = anchor.aiInsight;
      existing.peakSec = anchor.peakSec;
    }
  }

  const scoredCandidates: CandidateClip[] = deduped.map((anchor, index) => {
    const { startSec, endSec, completenessScore } = optimizeClipWindow(
      anchor.peakSec,
      durationSec,
      transcript,
      TARGET_CLIP_DURATION_SEC,
    );

    const windowTranscript = transcript.filter(
      (t) => t.endSec >= startSec && t.startSec <= endSec,
    );
    const excerpt =
      windowTranscript.map((t) => t.text).join(' ').trim() ||
      'Captured visual & audio reaction sequence.';

    // Audio reaction score inside window
    const windowAudio = audioPeaks.filter(
      (p) => p.timestampSec >= startSec && p.timestampSec <= endSec,
    );
    const audioScore =
      windowAudio.length > 0
        ? Math.min(100, Math.max(...windowAudio.map((a) => a.intensity)))
        : 48;

    // Audience engagement score from comments + heatmap
    const windowComments = commentSignals.filter(
      (c) => c.timestampSec >= startSec - 4 && c.timestampSec <= endSec + 4,
    );
    const windowHeatmap = heatmapPoints.filter(
      (h) => h.endSec >= startSec && h.startSec <= endSec,
    );
    const commentBoost =
      windowComments.length > 0
        ? Math.min(
            98,
            60 +
              windowComments.reduce(
                (acc, c) => acc + (c.matchedPhrase ? 18 : 10) + Math.min(15, c.likes / 50),
                0,
              ),
          )
        : 0;
    const heatmapBoost =
      windowHeatmap.length > 0
        ? Math.round(Math.max(...windowHeatmap.map((h) => h.intensity)) * 96)
        : 0;
    const audienceEngagementScore =
      commentBoost || heatmapBoost
        ? Math.round(Math.max(commentBoost, heatmapBoost))
        : 44;

    // Visual interest from scene changes inside window
    const windowScenes = sceneChanges.filter(
      (s) => s.timestampSec >= startSec && s.timestampSec <= endSec,
    );
    const visualScore = Math.min(
      96,
      50 + windowScenes.length * 14 + (windowAudio.some((a) => a.kind === 'laughter') ? 10 : 0),
    );

    // Local linguistic & structural analysis (setup -> punchline -> reaction) when AI insight is absent
    const lowerExcerpt = excerpt.toLowerCase();
    const humourMatches = HUMOUR_KEYWORDS.filter((kw) => lowerExcerpt.includes(kw)).length;
    const hasExclamation = excerpt.includes('!');
    const hasQuestion = excerpt.includes('?');
    const hasDialogueTurn =
      new Set(windowTranscript.map((t) => t.speaker).filter(Boolean)).size >= 2;
    const hasSetupAndPayoff = (hasQuestion && hasExclamation) || windowTranscript.length >= 3;

    const humourScore = anchor.aiInsight
      ? anchor.aiInsight.humourScore
      : Math.min(
          94,
          50 +
            humourMatches * 9 +
            (hasSetupAndPayoff ? 10 : 0) +
            (windowAudio.some((a) => a.kind === 'laughter') ? 16 : 0),
        );

    const contextPayoffScore = anchor.aiInsight
      ? anchor.aiInsight.contextPayoffScore
      : Math.min(
          93,
          54 +
            (windowTranscript.length >= 2 ? 16 : 6) +
            (hasDialogueTurn ? 8 : 0) +
            (hasExclamation || hasQuestion ? 10 : 0),
        );

    const emotionalImpactScore = anchor.aiInsight
      ? anchor.aiInsight.emotionalImpactScore
      : Math.min(
          93,
          48 +
            (hasExclamation ? 14 : 0) +
            (hasQuestion ? 6 : 0) +
            Math.round(audioScore * 0.3),
        );

    const signals: SignalScores = {
      humour: Math.round(humourScore),
      contextPayoff: Math.round(contextPayoffScore),
      audioReactions: Math.round(audioScore),
      audienceEngagement: Math.round(audienceEngagementScore),
      visualInterest: Math.round(visualScore),
      emotionalImpact: Math.round(emotionalImpactScore),
      clipCompleteness: completenessScore,
    };

    const predictedEngagementScore = computeWeightedScore(signals, weights);

    const category =
      anchor.aiInsight?.category ||
      (windowAudio.some((a) => a.kind === 'laughter')
        ? 'Comedy & Reaction'
        : hasSetupAndPayoff
          ? 'Setup & Payoff'
          : windowScenes.length >= 2
            ? 'Dynamic Visual Payoff'
            : 'Story & Dialogue Hook');

    const reasonParts: string[] = [];
    if (anchor.aiInsight?.explanation) {
      reasonParts.push(anchor.aiInsight.explanation);
    } else {
      if (hasSetupAndPayoff) {
        reasonParts.push('Contains a complete question-and-payoff arc inside the 20s window');
      }
      if (windowAudio.length > 0) {
        reasonParts.push(
          `Strong vocal intensity spike (${windowAudio[0].kind.replace('_', ' ')}) at ${Math.round(windowAudio[0].timestampSec)}s`,
        );
      }
      if (windowComments.length > 0) {
        reasonParts.push(
          `Supported by ${windowComments.length} audience timestamp signal${windowComments.length > 1 ? 's' : ''}`,
        );
      }
      if (windowScenes.length > 0) {
        reasonParts.push(
          `${windowScenes.length} visual cut${windowScenes.length > 1 ? 's' : ''} inside window`,
        );
      }
      if (reasonParts.length === 0) {
        reasonParts.push('Balanced dialogue setup and clean 20.0-second narrative boundary.');
      }
    }

    return {
      id: `cand_${projectId}_${index + 1}`,
      projectId,
      rank: index + 1,
      startSec,
      endSec,
      durationSec: TARGET_CLIP_DURATION_SEC,
      peakSec: Math.round(anchor.peakSec * 10) / 10,
      predictedEngagementScore,
      category,
      reason: reasonParts.join('. '),
      transcriptExcerpt: excerpt,
      signals,
      weightsUsed: { ...weights },
      isSelected: false,
    };
  });

  // Sort by score descending, filter overlapping windows (> 10s overlap), and re-rank
  scoredCandidates.sort((a, b) => b.predictedEngagementScore - a.predictedEngagementScore);

  const nonOverlapping: CandidateClip[] = [];
  for (const cand of scoredCandidates) {
    const overlaps = nonOverlapping.some((picked) => {
      const overlap = Math.min(picked.endSec, cand.endSec) - Math.max(picked.startSec, cand.startSec);
      return overlap > 10;
    });
    if (!overlaps) {
      nonOverlapping.push(cand);
    }
    if (nonOverlapping.length >= maxCandidates) break;
  }

  return nonOverlapping.map((c, idx) => ({
    ...c,
    rank: idx + 1,
    isSelected: idx === 0,
  }));
}
