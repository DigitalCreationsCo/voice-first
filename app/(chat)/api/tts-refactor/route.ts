import { NextRequest, NextResponse } from 'next/server';
import { ApiError, GoogleGenAI, Modality } from "@google/genai";
import * as AudioHelpers from '@/lib/audio/audio-helpers'; 

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const message = await req.json();
        const { text, parentRequestId, requestId } = message;

        console.log(`
          ╔════════════════════════════════════════╗
          ║   SERVER: TTS REQUEST RECEIVED         ║
          ╠════════════════════════════════════════╣
          ║ Parent (Chat) Request ID: ${parentRequestId}
          ║ TTS Request ID: ${requestId}
          ║ Text Length: ${text?.length || 0} chars
          ║ Text Preview: ${text?.substring(0, 80) || 'N/A'}
          ╚════════════════════════════════════════╝
        `);

        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'GOOGLE_GENERATIVE_AI_API_KEY not set', parentRequestId, requestId })}\n\n`));
          controller.close();
          return;
        }

        if (!text) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Missing or invalid text', parentRequestId, requestId })}\n\n`));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`event: tts_stream_start\ndata: ${JSON.stringify({ message: "Starting TTS generation", parentRequestId, requestId })}\n\n`));

        try {
          const startTime = Date.now();

          const cleanedText = text.replace(/[\n\r*]+/g, '').replace(/[^\x20-\x7E]+/g, '');
          console.log('Original text length:', cleanedText.length);

          const isFullLengthText = process.env.FULL_LENGTH_AUDIO_PLAYBACK == 'true' ? true : false;
          let limitedText: string;
          if (isFullLengthText) {
            limitedText = cleanedText;
          } else {
            const MAX_TTS_LENGTH = 200;
            function findFirstSentenceEnd(str: string): number | null {
              const match = str.match(/[.!?]/);
              return match ? (match.index! + 1) : null;
            }

            if (cleanedText.length <= 30) {
              limitedText = cleanedText;
            } else {
              const after30 = cleanedText.slice(30);
              const sentenceEnd = findFirstSentenceEnd(after30);

              if (sentenceEnd !== null) {
                limitedText = cleanedText.slice(0, 30 + sentenceEnd);
              } else {
                const firstSentenceEnd = findFirstSentenceEnd(cleanedText);
                if (firstSentenceEnd !== null && firstSentenceEnd <= MAX_TTS_LENGTH) {
                  limitedText = cleanedText.slice(0, firstSentenceEnd);
                } else {
                  limitedText = cleanedText.slice(0, MAX_TTS_LENGTH);
                }
              }
            }
          }
          console.log('Limited text length:', limitedText.length);

          console.log('Sending text to generate audio: ', limitedText);

          const result = await genAI.models.generateContentStream({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: limitedText }] }],
            config: {
              candidateCount: 1,
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Charon' }
                },
              },
            },
          })
            .catch((e: ApiError) => {
              console.error('error name: ', e.name);
              console.error('error message: ', e.message);
              console.error('error status: ', e.status);
              throw e;
            });

          let audioChunkIndex = 0;
          let totalBytesReceived = 0;
          const chunkTimings: number[] = [];

          for await (const chunk of result) {
            const chunkStartTime = Date.now();
            const candidate = chunk.candidates?.[0];
            console.log(`🎤 Starting to receive audio chunks from Gemini...`);

            if (candidate && candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {

                  const isValidBase64 = AudioHelpers.AudioDebugger.validate(
                    part.inlineData.data,
                    AudioHelpers.AudioFormat.BASE64_STRING
                  );

                  if (!isValidBase64) {
                    console.error(`❌ Invalid base64 in chunk ${audioChunkIndex}`);
                    controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: `Invalid base64 data in chunk ${audioChunkIndex}`, parentRequestId, requestId })}\n\n`));
                    controller.close();
                    return;
                  }

                  const chunkInfo = {
                    index: audioChunkIndex,
                    base64Length: part.inlineData.data.length,
                    mimeType: part.inlineData.mimeType,
                    decodedBytes: Buffer.from(part.inlineData.data, 'base64').length
                  };

                  console.log(`📦 Chunk ${audioChunkIndex}:`, chunkInfo);

                  controller.enqueue(encoder.encode(`event: tts_stream_chunk\ndata: ${JSON.stringify({ content: part.inlineData.data, chunkIndex: audioChunkIndex, parentRequestId, finish_reason: null, requestId })}\n\n`));

                  audioChunkIndex++;

                  const audioChunk = Buffer.from(part.inlineData.data, 'base64');
                  totalBytesReceived += audioChunk.length;

                  chunkTimings.push(Date.now() - chunkStartTime);
                }
              }
            }
          }

          const totalTime = Date.now() - startTime;
          const avgChunkTime = chunkTimings.reduce((a, b) => a + b, 0) / chunkTimings.length;

          console.log(`
            ╔════════════════════════════════════════╗
            ║   SERVER: TTS GENERATION COMPLETE      ║
            ╠════════════════════════════════════════╣
            ║ Total Chunks: ${audioChunkIndex}
            ║ Total Bytes: ${totalBytesReceived}
            ║ Total Time: ${totalTime}ms
            ║ Avg Chunk Time: ${avgChunkTime.toFixed(2)}ms
            ║ Parent Request ID: ${parentRequestId}
            ║ TTS Request ID: ${requestId}
            ╚════════════════════════════════════════╝
          `);

          controller.enqueue(encoder.encode(`event: tts_stream_complete\ndata: ${JSON.stringify({ totalChunks: audioChunkIndex, parentRequestId, finish_reason: "stop", requestId })}\n\n`));

        } catch (error: any) {
          console.error(`
            ╔════════════════════════════════════════╗
            ║   SERVER: TTS GENERATION ERROR         ║
            ╠════════════════════════════════════════╣
            ║ Error: ${error.message}
            ║ Parent Request: ${parentRequestId}
            ║ TTS Request: ${requestId}
            ║ Stack: ${error.stack?.split('\n')[0]}
            ╚════════════════════════════════════════╝
          `);

          controller.enqueue(encoder.encode(`event: tts_error\ndata: ${JSON.stringify({ error: error?.message || "Error generating tts response", parentRequestId, requestId })}\n\n`));
        }
      } catch (error: any) {
        console.error(`
          ╔════════════════════════════════════════╗
          ║   SERVER: TTS REQUEST ERROR            ║
          ╠════════════════════════════════════════╣
          ║ Error: ${error.message}
          ║ Stack: ${error.stack?.split('\n')[0]}
          ╚════════════════════════════════════════╝
        `);

        controller.enqueue(encoder.encode(`event: tts_error\ndata: ${JSON.stringify({ error: error?.message || "Error processing tts request", requestId: (await req.json()).requestId })}\n\n`));
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