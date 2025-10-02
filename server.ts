// server.ts - Custom Next.js server with WebSocket support
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from "@google/genai";
import { serverLogger } from './lib/logger';
import gemini, { genAI, ttsClient } from './lib/gemini';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const wsPort = parseInt(process.env.WS_PORT || '3001', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function handleChatRequest(ws: any, message: any) {
  console.log('handle chat request')
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'GOOGLE_GENERATIVE_AI_API_KEY not set'
    }));
    return;
  }
  
  try {
    const { messages } = message;

    console.log('handle chat request2')
    
    if (!messages || !Array.isArray(messages)) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Missing or invalid messages'
      }));
      return;
    }

    // Convert messages to Gemini format
    const history = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Send stream start event
    ws.send(JSON.stringify({
      type: "stream_start",
      message: "Starting to generate response",
      requestId: message.requestId
    }));

    try {
      console.log('handle chat request3')
    
      const result = await genAI.models.generateContentStream({
        model: gemini.flash2.modelId,
        contents: history,
      });
      // const result = [{ 'text': '1'}, {'text': '2'}, {'text': '3'}]

      let fullResponse = '';

      // Stream response chunks
      for await (const chunk of result) {
        const text = chunk.text;
        if (text && ws.readyState === ws.OPEN) {
          fullResponse += text;
          
          ws.send(JSON.stringify({
            type: "stream_chunk",
            content: text,
            finish_reason: null,
            requestId: message.requestId
          }));
        }
      }

      console.log('handle chat request4')
    console.log('handle chat request5')
    console.log('handle chat request6')

      // Send completion signal
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "stream_complete",
          content: fullResponse,
          finish_reason: "stop",
          requestId: message.requestId
        }));
      }

    } catch (streamError: any) {
      console.error('Stream generation error:', streamError);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "error",
          error: streamError?.message || "Error generating response",
          requestId: message.requestId
        }));
      }
    }

  } catch (error: any) {
    console.error('Chat request error:', error);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error?.message || "Error processing chat request",
        requestId: message.requestId
      }));
    }
  }
}

async function handleTTSRequest(ws: any, message: any) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'GOOGLE_GENERATIVE_AI_API_KEY not set'
    }));
    return;
  }

  try {
    const { text } = message;
    
    if (!text) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Missing or invalid text'
      }));
      return;
    }

    // Send stream start event
    ws.send(JSON.stringify({
      type: "stream_start",
      message: "Starting to generate response",
      requestId: message.requestId
    }));

    try {
      const result = await ttsClient.models.generateContentStream({
        model: gemini.flash25TTS.modelId,
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
      
      let fullAudioBytes = new Uint8Array(0);
      let chunkCount = 0;
      const MIN_CHUNK_SIZE = 4096;

      let buffer = new Uint8Array(0);

      for await (const chunk of result) {
        const candidate = chunk.candidates?.[0];
        if (candidate && candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data && ws.readyState === ws.OPEN) {

              const audioBuffer = Buffer.from(part.inlineData.data, 'base64');

              // Accumulate into buffer
              const combined = new Uint8Array(buffer.length + audioBuffer.length);
              combined.set(buffer);
              combined.set(audioBuffer, buffer.length);
              buffer = combined;

              // Send when buffer reaches minimum size OR if this is the last chunk
              if (buffer.length >= MIN_CHUNK_SIZE) {
                chunkCount++;

                ws.send(JSON.stringify({
                  type: "stream_chunk",
                  content: buffer,
                  finish_reason: null,
                  requestId: message.requestId
                }));

                const merged = new Uint8Array(fullAudioBytes.length + buffer.length);
                merged.set(fullAudioBytes);
                merged.set(buffer, fullAudioBytes.length);
                fullAudioBytes = merged;
                
                buffer = new Uint8Array(0); // Reset buffer
              }
            }
          }
        }
      }

      // Send completion signal
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "stream_complete",
          content: fullAudioBytes,
          finish_reason: "stop",
          requestId: message.requestId
        }));
      }

      console.log(`TTS completed: ${chunkCount} chunks sent`);
  

    } catch (streamError: any) {
      console.error('TTS stream generation error:', streamError);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "error",
          error: streamError?.message || "Error generating tts response",
          requestId: message.requestId
        }));
      }
    }

  } catch (error: any) {
    console.error('TTS request error:', error);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error?.message || "Error processing tts request",
        requestId: message.requestId
      }));
    }
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    
    serverLogger(req as any, res);
    
    handle(req, res, parsedUrl);
  });

  // Create separate WebSocket server on different port to avoid HMR conflicts
  const wsServer = createServer();
  const wss = new WebSocketServer({ 
    server: wsServer,
    path: '/api/chat/websocket'
  });

  wss.on('connection', (ws, request) => {
    console.log('New WebSocket connection established');
    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'WebSocket connection established successfully',
      timestamp: Date.now()
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Message:', message);
        console.log('Received message type:', message.type);

        switch (message.type) {
          case 'chat_request':
            await handleChatRequest(ws, message);
            break;

          case 'tts_request':
            await handleTTSRequest(ws, message);
            break;
          
          case 'ping':
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: Date.now(),
              requestId: message.requestId
            }));
            break;
          
          case 'cancel_request':
            // Handle request cancellation
            ws.send(JSON.stringify({
              type: 'request_cancelled',
              requestId: message.requestId
            }));
            break;
            
          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${message.type}`,
              requestId: message.requestId
            }));
        }
      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message: Invalid JSON'
        }));
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`WebSocket connection closed: ${code} - ${reason}`);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        }));
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // Send heartbeat every 30 seconds
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  wsServer.listen(wsPort, () => {
    console.log(`> WebSocket server running on ws://${hostname}:${wsPort}/api/chat/websocket`);
  });
});