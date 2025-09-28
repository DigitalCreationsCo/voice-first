import { GoogleGenAI, Modality } from '@google/genai';
import { decode } from '@/lib/utils';

const client = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
});

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
          // Initialize the live session
          const model = 'gemini-2.5-flash-preview-native-audio-dialog';
          
          const session = await client.live.connect({
            model: model,
            callbacks: {
              onopen: () => {
                console.log('TTS session opened');
              },
              onmessage: async (message) => {
                // Extract audio data from the response
                const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;
                
                if (audio) {
                  try {
                    // Decode the audio data and stream it
                    const audioBuffer = decode(audio.data);
                    controller.enqueue(new Uint8Array(audioBuffer));
                  } catch (error) {
                    console.error('Error processing audio data:', error);
                  }
                }
              },
              onerror: (error) => {
                console.error('TTS session error:', error);
                controller.error(new Error(`TTS Error: ${error.message}`));
              },
              onclose: (event) => {
                console.log('TTS session closed:', event.reason);
                controller.close();
              },
            },
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { 
                  prebuiltVoiceConfig: { voiceName: 'Orus' } 
                },
              },
            },
          });

          // Send the text to be converted to speech
          await session.sendRealtimeInput({
            text: text,
          });

          // Close the session after sending the text
          session.close();

        } catch (error) {
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
        'Content-Type': 'audio/wav',
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