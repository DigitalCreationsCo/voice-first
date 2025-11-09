import { NextRequest, NextResponse } from 'next/server';
import { ApiError, GoogleGenAI, Modality } from "@google/genai";
import { createParser, parseChunk, ParserConfig } from '@/lib/parser';
import * as AudioHelpers from '@/lib/audio/audio-helpers'; 

// Load environment variables
// In Next.js, environment variables are typically loaded automatically or accessed via process.env
// No explicit 'config' call needed here if .env.local is set up correctly.

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function POST(req: NextRequest) {
  // Set up SSE headers
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const message = await req.json();

        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'GOOGLE_GENERATIVE_AI_API_KEY not set' })}\n\n`));
          controller.close();
          return;
        }

        const { messages, requestId } = message;

        if (!messages || !Array.isArray(messages)) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Missing or invalid messages' })}\n\n`));
          controller.close();
          return;
        }

        const history = messages.map((msg: any) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }));

        try {
          const terminatingChar = ';';
          const streamParserConfig: ParserConfig = {
            keys: ["rating", "difficulty", "translations", "text"],
            streamKeys: ["text"],
            optionalKeys: ["rating", "difficulty", "translations"],
            jsonKeys: ["translations"],
            terminator: terminatingChar,
            delimiter: ':'
          };

          const streamParserConfigString = `
The output must always be parsable by the following stream parser configuration:
- keys: ${JSON.stringify(streamParserConfig.keys)}
- streamKeys: ${JSON.stringify(streamParserConfig.streamKeys)}
- optionalKeys: ${JSON.stringify(streamParserConfig.optionalKeys)}
- jsonKeys: ${JSON.stringify(streamParserConfig.jsonKeys)}
- terminator: "${streamParserConfig.terminator}"
- delimiter: "${streamParserConfig.delimiter}"

Rules:
- All top-level keys (rating, difficulty, translations, text) must be present in the correct order, separated by terminator, and end with terminator.
- The "translations" field must be JSON with a list of objects (with keys: word, translation, phonetic, audio), using only valid JSON (double quotes).
- All keys must appear exactly as in this configuration.
`;

          const result = await genAI.models.generateContentStream({
            model: "gemini-2.0-flash",
            contents: history,
            config: {
              systemInstruction: `
You are a foreign language tutor helping the user learn to speak the chosen language conversationally.
Start every conversation at a beginner level. As the user's ability improves, increase the difficulty naturally and gradually. You must only ever reply using the target language.

After each user message, do three things:
1. Correct any mistakes in the user's message (if it was written in the target language).
2. Respond in the target language at an appropriate difficulty level.
3. Provide key vocabulary translations and phonetic approximations for 5-10 important or challenging words from YOUR response and any corrected words from the user's message.

Format your output exactly as "rating: <numeric_rating>; difficulty: <numeric_difficulty>; translations: <translation_object>; text: <your_text_response>;" (do not include explanations, comments, or extra text).

Constraints:
- IMPORTANT: Use terminator to separate all top-level fields: rating, difficulty, translations, text. All top-level fields must end with a terminator.
- Do not repeat user messages verbatim unless you are correcting them as part of your reply. Corrections are only for target language attempts.
- Do not use markdown.
- The top-level fields must be presented in this strict order: rating, difficulty, translations, text.
- <numeric_rating> must always be numeric (omit only if the user’s message was not in the target language).
- <numeric_difficulty> must always be numeric between 1–5.
- <translation_object> must be a JSON object ( not a list ) with this format (always valid JSON with double quotes and proper commas): each key is a lowercase word in the target language, and each value is an object with this format: {
      "word": "<lowercase word in target language>",
      "language": "<the target language>",
      "translation": "<lowercase meaning in English, with context if needed>",
      "phonetic": "<simple English approximation>",
      "audioUrl": "<placeholder URL, to be generated server-side>"
    }
  (e.g., {"bonjour": {...}, "merci": {...}})
- <your_text_response> must be fully formed, ending naturally (not cut mid-sentence), and can include punctuation and multiple sentences.
- Include up to 10 translation items in "translations".
- Each "word" in "translations" must come from your latest message or a corrected user word.
- Do not repeat previously included words.
- Never include additional prose, comments, or explanations outside the required format.
- Respond in the language chosen by the user only.

${streamParserConfigString}

Example output 1 (if the user spoke correctly in Spanish): 'rating: 90; difficulty: 2; translations: {"hablaremos": {"word": "hablaremos", "language": "Spanish", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audioUrl": ""}, "comida": {"word": "comida", "language": "Spanish", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": ""}}; text: ¡Muy bien! Hoy hablaremos sobre la comida!;',

Example output 2 (if the user spoke in English and needs correction): 'rating: null; difficulty: 1; translations: {"aujourd'hui": {"word": "aujourd'hui", "language": "French", "translation": "today", "phonetic": "oh-zhoor-dwee", "audioUrl": ""}, "apprendre": {"word": "apprendre", "language": "French", "translation": "to learn", "phonetic": "ah-pron-druh", "audioUrl": ""}}; text: Bonjour! Aujourd'hui, nous allons apprendre quelques mots français.;'
              `,
              responseMimeType: "text/plain",
              maxOutputTokens: 350,
              candidateCount: 1
            },
          }).catch((e: ApiError) => {
            console.error('error name: ', e.name);
            console.error('error message: ', e.message);
            console.error('error status: ', e.status);
            throw e;
          });

          let parser = createParser(streamParserConfig);
          let chunkIndex = 0;

          controller.enqueue(encoder.encode(`event: stream_start\ndata: ${JSON.stringify({ message: "Starting to generate response", requestId })}\n\n`));

          for await (const chunk of result) {
            let text = chunk.text;

            if (!text) {
              console.error('❌ No text chunk returned');
              controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'No text chunk response', requestId })}\n\n`));
              controller.close();
              return;
            }

            text = text.replace(/[\r\n]+$/, '');

            const { parser: newParser, updates } = parseChunk(parser, text);
            parser = newParser;

            for (const update of updates) {
              if (update.type === "stream") {
                controller.enqueue(encoder.encode(`event: stream_chunk\ndata: ${JSON.stringify({ content: update.delta, requestId, chunkIndex })}\n\n`));
              }

              if (update.type === "complete") {
                controller.enqueue(encoder.encode(`event: stream_complete\ndata: ${JSON.stringify({ content: update.data.text, totalChunks: chunkIndex, finish_reason: "stop", requestId, metadata: update.data })}\n\n`));
              }
            }
            chunkIndex++;
          }
        } catch (streamError: any) {
          console.error('Stream generation error:', streamError);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: streamError?.message || "Error generating response", requestId })}\n\n`));
        }
      } catch (error: any) {
        console.error('Chat request error:', error);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Error processing chat request", requestId: (await req.json()).requestId })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}