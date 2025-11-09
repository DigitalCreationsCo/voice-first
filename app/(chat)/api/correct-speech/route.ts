// /api/correct-speech/route.ts - Backend API
import gemini from '@/lib/gemini';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { transcript, messages } = await req.json();
  
  const { object } = await generateObject({
    model: gemini.flash2Lite,
    schema: z.object({
      corrected: z.string(),
      confidence: z.number().min(0).max(1),
      changes: z.array(z.string())
    }),
    prompt: buildCorrectionPrompt(transcript, messages)
  });
  
  return Response.json(object);
};


function buildCorrectionPrompt(transcript: string, messages: string[]): string {
    return `
You are a speech recognition correction system. Correct any transcription errors while preserving the speaker's intent.

Recent conversation:
${messages.join('\n')}

Raw transcription: "${transcript}"

Correct the transcription fixing:
- Homophones (their/there/they're)
- Misheard words
- Grammar errors
- Punctuation

Return JSON:
{
  "corrected": "corrected text",
  "original": "original transcript text",
  "confidence": 0.0-1.0,
  "changes": ["list of corrections made"]
}
    `.trim();
  }