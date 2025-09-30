import { Modality } from '@google/genai';
import { ttsClient } from '@/lib/google';


export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) {
      return new Response('Bad Request: Text is required.', { status: 400 });
    }

    // Create a readable stream for audio data
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const model = 'gemini-2.5-flash-preview-tts';
          const session = await ttsClient.models.generateContentStream({
            model: model,
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

          for await (const chunk of session) {
            const candidate = chunk.candidates?.[0];
            if (candidate && candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                // part.inlineData.data is expected server-side — avoid double base64 encode
                if (part.inlineData && part.inlineData.data) {
                  // The audio data is base64-encoded
                  const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                  controller.enqueue(new Uint8Array(audioBuffer));
                }
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.close();
          console.error('Error initializing TTS session:', error);
          controller.error(new Error(`Failed to initialize TTS: ${error.message}`));
        }
      },
      cancel() {
        console.log('TTS stream cancelled');
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error in TTS API:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}