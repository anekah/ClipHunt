import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCandidateClips,
  computeWeightedScore,
  extractCommentTimestampSignals,
  optimizeClipWindow,
  validateWeights,
} from './scoringEngine';
import { DEFAULT_SCORING_WEIGHTS, TranscriptSegment } from '../shared/types';

test('validates default weights sum to 100%', () => {
  const res = validateWeights(DEFAULT_SCORING_WEIGHTS);
  assert.equal(res.valid, true);
  assert.equal(res.total, 100);
});

test('computes weighted candidate score accurately', () => {
  const score = computeWeightedScore(
    {
      humour: 90,
      contextPayoff: 80,
      audioReactions: 70,
      audienceEngagement: 60,
      visualInterest: 50,
      emotionalImpact: 40,
      clipCompleteness: 100,
    },
    DEFAULT_SCORING_WEIGHTS,
  );
  // 90*0.25 + 80*0.20 + 70*0.15 + 60*0.15 + 50*0.10 + 40*0.10 + 100*0.05 = 22.5 + 16 + 10.5 + 9 + 5 + 4 + 5 = 72
  assert.equal(score, 72);
});

test('extracts timestamp signals and viral phrases from comments', () => {
  const signals = extractCommentTimestampSignals(
    [
      { text: '01:14 this part killed me!! I replayed this 5 times', likes: 420 },
      { text: 'Great episode overall', likes: 12 },
      { text: 'Wait for it at 0:32', likes: 95 },
      { text: 'Fake timestamp 99:99', likes: 10 },
    ],
    180,
  );
  assert.equal(signals.length, 2);
  assert.equal(signals[0].timestampSec, 74);
  assert.equal(signals[0].matchedPhrase, 'this part killed me');
  assert.equal(signals[1].timestampSec, 32);
});

test('optimizes 20.0s clip window to avoid cutting off utterances', () => {
  const transcript: TranscriptSegment[] = [
    { id: '1', startSec: 12, endSec: 21, text: 'Here is the setup to the story.' },
    { id: '2', startSec: 21.2, endSec: 27, text: 'And then the punchline hits hard!' },
    { id: '3', startSec: 27.2, endSec: 32, text: 'Everyone in the room lost it.' },
  ];
  const window = optimizeClipWindow(25, 60, transcript, 20.0);
  assert.equal(Math.round((window.endSec - window.startSec) * 10) / 10, 20.0);
  assert.equal(window.startSec, 12);
  assert.equal(window.endSec, 32);
});

test('builds ranked non-overlapping 20.0s candidates', () => {
  const candidates = buildCandidateClips({
    projectId: 'proj_test',
    durationSec: 90,
    transcript: [
      { id: 't1', startSec: 10, endSec: 20, text: 'Wait for the twist right here!' },
      { id: 't2', startSec: 20.2, endSec: 30, text: 'I accidentally dropped the live mic!' },
      { id: 't3', startSec: 55, endSec: 75, text: 'Another completely separate story payoff.' },
    ],
    audioPeaks: [
      { timestampSec: 22, intensity: 92, kind: 'laughter' },
      { timestampSec: 65, intensity: 74, kind: 'excitement' },
    ],
    sceneChanges: [{ timestampSec: 21, score: 0.6 }],
    commentSignals: [{ timestampSec: 22, commentText: '0:22 funniest moment', likes: 300, matchedPhrase: 'funniest moment' }],
    heatmapPoints: [{ startSec: 18, endSec: 28, intensity: 0.94 }],
    weights: DEFAULT_SCORING_WEIGHTS,
  });
  assert.ok(candidates.length >= 2);
  assert.equal(candidates[0].rank, 1);
  assert.equal(candidates[0].isSelected, true);
  assert.equal(candidates[0].durationSec, 20.0);
  assert.ok(candidates[0].predictedEngagementScore > candidates[1].predictedEngagementScore);
});

test('detects setup-and-payoff moments cleanly without external AI insights', () => {
  const candidates = buildCandidateClips({
    projectId: 'proj_local_only',
    durationSec: 65,
    transcript: [
      { id: '1', startSec: 10, endSec: 18, speaker: 'Host', text: 'Wait, did you really turn on the live feed?' },
      { id: '2', startSec: 18.2, endSec: 26, speaker: 'Guest', text: 'I actually asked for extra reverb live on air!' },
      { id: '3', startSec: 26.2, endSec: 30, speaker: 'Host', text: 'No way everyone heard that!' },
    ],
    audioPeaks: [{ timestampSec: 24, intensity: 88, kind: 'laughter' }],
    sceneChanges: [{ timestampSec: 25, score: 0.5 }],
    commentSignals: [],
    heatmapPoints: [],
    weights: DEFAULT_SCORING_WEIGHTS,
  });

  assert.equal(candidates[0].category, 'Comedy & Reaction');
  assert.ok(candidates[0].predictedEngagementScore >= 65);
  assert.match(candidates[0].reason, /question-and-payoff|vocal intensity spike/i);
});
