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
          const model = 'gemini-2.5-flash-preview-tts';

          // outputs text and audio
          // const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
          // const session = await client.live.connect({
            const session = await client.models.generateContentStream({
            model: model,
            contents: [{ parts: [{ text }] }],
            // callbacks: {
            //   onopen: () => {
            //     console.log('TTS session opened');
            //   },
            //   onmessage: async (message) => {
            //     // console.log('message ', message)
            //     console.log('message part', message.serverContent?.modelTurn?.parts[0])
            //     // Extract audio data from the response
            //     const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;
                
            //     if (audio) {
            //       try {
            //         // Decode the audio data and stream it
            //         // const audioBuffer = decode(audio.data);
            //         const audioBuffer = Buffer.from(audio.data!, 'base64');
            //         controller.enqueue(new Uint8Array(audioBuffer));
            //       } catch (error) {
            //         console.error('Error processing audio data:', error);
            //       }
            //     }
            //   },
            //   onerror: (error) => {
            //     console.error('TTS session error:', error);
            //     controller.error(new Error(`TTS Error: ${error.message}`));
            //   },
            //   onclose: (event) => {
            //     console.log('TTS session closed:', event.reason);
            //     controller.close();
            //   },
            // },
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

          // Handle the async stream response from generateContentStream
          for await (const chunk of session) {
            // Each chunk may contain audio data in the first candidate's inlineData
            const candidate = chunk.candidates?.[0];
            if (candidate && candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  // The audio data is base64-encoded
                  const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                  controller.enqueue(new Uint8Array(audioBuffer));
                }
              }
            }
          }
          controller.close();
          // Send the text to be converted to speech
          // await session.sendRealtimeInput({
          //   text: text,
          // });

          // Close the session after sending the text
          // session.close();

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