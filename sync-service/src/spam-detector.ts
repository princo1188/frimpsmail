import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface SpamAnalysis {
  is_spam: boolean;
  confidence: number; // 0–1
  reason: string;
  source: 'header' | 'ai_second_pass';
}

/**
 * Layer 1: Parse X-Spam-Score and X-Spam-Status headers.
 * Returns null if no spam headers present.
 */
export function analyzeSpamHeaders(headers: Record<string, string>): SpamAnalysis | null {
  const scoreHeader = headers['x-spam-score'] ?? headers['X-Spam-Score'];
  const statusHeader = headers['x-spam-status'] ?? headers['X-Spam-Status'];

  if (!scoreHeader && !statusHeader) return null;

  const score = scoreHeader ? parseFloat(scoreHeader) : NaN;
  const isYes = statusHeader?.toLowerCase().startsWith('yes') ?? false;

  if (isNaN(score) && !isYes) return null;

  const confidence = isNaN(score) ? (isYes ? 0.9 : 0.1) : Math.min(score / 10, 1.0);

  return {
    is_spam: isYes || score >= 5,
    confidence,
    reason: statusHeader ?? `X-Spam-Score: ${score}`,
    source: 'header',
  };
}

/**
 * Layer 2: AI second-pass for borderline or header-less inbox messages.
 * Only called when header analysis is inconclusive (score 2–5 or no headers).
 */
export async function analyzeSpamWithAI(
  subject: string,
  fromAddress: string,
  bodyText: string,
): Promise<SpamAnalysis> {
  const prompt = `Analyze this email for spam. Reply with JSON only: {"is_spam": boolean, "confidence": 0-1, "reason": "brief explanation"}

From: ${fromAddress}
Subject: ${subject}
Body (first 500 chars): ${bodyText.slice(0, 500)}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]) as { is_spam: boolean; confidence: number; reason: string };
    return { ...parsed, source: 'ai_second_pass' };
  } catch {
    return { is_spam: false, confidence: 0, reason: 'AI analysis failed', source: 'ai_second_pass' };
  }
}

/**
 * Determine if a message needs AI second-pass (borderline spam score or no headers).
 */
export function needsAISecondPass(headers: Record<string, string>): boolean {
  const scoreHeader = headers['x-spam-score'] ?? headers['X-Spam-Score'];
  if (!scoreHeader) return true; // No headers — check with AI
  const score = parseFloat(scoreHeader);
  return !isNaN(score) && score >= 2 && score < 5; // Borderline range
}
