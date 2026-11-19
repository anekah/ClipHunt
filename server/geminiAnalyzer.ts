import { GoogleGenAI, Type } from '@google/genai';
import { AiCandidateInsight } from '../src/lib/scoringEngine';
import { AudioPeak, CommentSignal, SceneChange, TranscriptSegment } from '../src/shared/types';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function analyzeMomentsWithGemini(params: {
  title: string;
  durationSec: number;
  transcript: TranscriptSegment[];
  audioPeaks: AudioPeak[];
  sceneChanges: SceneChange[];
  commentSignals: CommentSignal[];
}): Promise<{ insights: AiCandidateInsight[]; usedGemini: boolean; warning?: string }> {
  const ai = createGeminiClient();
  if (!ai) {
    return {
      insights: [],
      usedGemini: false,
    };
  }

  const transcriptText = params.transcript
    .map((t) => `[${t.startSec.toFixed(1)}s - ${t.endSec.toFixed(1)}s] ${t.text}`)
    .join('\n');

  const prompt = [
    `Video Title: ${params.title}`,
    `Total Duration: ${params.durationSec.toFixed(1)}s`,
    `Audio Peaks (seconds & intensity): ${JSON.stringify(params.audioPeaks)}`,
    `Scene Changes (seconds): ${JSON.stringify(params.sceneChanges.slice(0, 12))}`,
    `Comment Timestamp Cues: ${JSON.stringify(params.commentSignals)}`,
    '',
    'Transcript:',
    transcriptText || '(No spoken transcript available)',
    '',
    'Identify up to 3 distinct 20-second viral clip anchor moments (peakTimestampSec) that have a strong setup, surprising/funny payoff, and reaction. Never claim virality is guaranteed—explain why the moment works.',
  ].join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are ClipHunt Viral Detection Engine. Analyze transcript, audio reactions, and comment signals to pinpoint peak timestamps for 20-second clips.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              peakTimestampSec: {
                type: Type.NUMBER,
                description: 'Timestamp in seconds where the punchline or key reaction peaks.',
              },
              category: {
                type: Type.STRING,
                description: 'Short category like Comedy & Reaction, Plot Twist, or Honest Confession.',
              },
              explanation: {
                type: Type.STRING,
                description: 'Clear 1-2 sentence explanation of the setup, payoff, and why viewers engage.',
              },
              humourScore: {
                type: Type.NUMBER,
                description: 'Score 0-100 for humour and entertainment value.',
              },
              contextPayoffScore: {
                type: Type.NUMBER,
                description: 'Score 0-100 for narrative setup and payoff completeness.',
              },
              emotionalImpactScore: {
                type: Type.NUMBER,
                description: 'Score 0-100 for surprise, tension, or emotional resonance.',
              },
            },
          },
        },
      },
    });

    const raw = (response.text ?? '[]').trim();
    const parsed = JSON.parse(raw) as AiCandidateInsight[];
    if (!Array.isArray(parsed)) {
      return { insights: [], usedGemini: true };
    }
    return { insights: parsed, usedGemini: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      insights: [],
      usedGemini: false,
      warning: `Gemini analysis unavailable (${msg}); fell back to acoustic, visual, and transcript signal scoring.`,
    };
  }
}
