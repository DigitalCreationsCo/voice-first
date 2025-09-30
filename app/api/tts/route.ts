import { Modality } from '@google/genai';
import gemini, { ttsClient } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const isPartial = new URL(req.url).searchParams.get('partial') === 'true';

    if (!text) {
      return new Response('Bad Request: Text is required.', { status: 400 });
    }
    // Create a readable stream for audio data
    const stream = new ReadableStream({
      async start(controller) {
        try {

          const session = await ttsClient.models.generateContentStream({
            model: gemini.flash2TTS.modelId,
            contents: [{ parts: [{ text }] }],
            config: {
              maxOutputTokens: 1000,
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { 
                  prebuiltVoiceConfig: { voiceName: 'Algenib' } 
                },
              },
            },
          });

          let chunkCount = 0;
          const MIN_CHUNK_SIZE = 4096; // Buffer small chunks for smoother delivery
          let buffer = new Uint8Array(0);

          for await (const chunk of session) {
            const candidate = chunk.candidates?.[0];
            if (candidate && candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  const audioBuffer = Buffer.from(part.inlineData.data, 'base64');

                  // Accumulate into buffer
                  const combined = new Uint8Array(buffer.length + audioBuffer.length);
                  combined.set(buffer);
                  combined.set(audioBuffer, buffer.length);
                  buffer = combined;

                  // Send when buffer reaches minimum size OR if this is the last chunk
                  if (buffer.length >= MIN_CHUNK_SIZE) {
                    controller.enqueue(new Uint8Array(buffer));
                    chunkCount++;
                    buffer = new Uint8Array(0); // Reset buffer
                  }
                }
              }
            }
          }

          // Flush any remaining buffer
          if (buffer.length > 0) {
            controller.enqueue(new Uint8Array(buffer));
            chunkCount++;
          }
          
          console.log(`TTS completed: ${chunkCount} chunks sent`);
          controller.close();

        } catch (error) {
          console.error('Error in TTS stream:', error);
          controller.error(new Error(`Failed to generate TTS: ${error.message}`));
        }
      },
      cancel() {
        console.log('TTS stream cancelled');
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'audio/pcm',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error('Error in TTS API:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}