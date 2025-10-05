// server.ts - Custom Next.js server with WebSocket support
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from "@google/genai";
import { config } from 'dotenv';

config({
  path: ".env.local",
});

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const wsPort = parseInt(process.env.WS_PORT || '3001', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})    

async function handleChatRequest(ws: any, message: any) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'GOOGLE_GENERATIVE_AI_API_KEY not set'
    }));
    return;
  }
  
  try {
    const { messages } = message;
    
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
      const result = await genAI.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents: history,
        config: {
          maxOutputTokens: 100,
        },
      });

      let fullResponse = '';
      let chunkIndex = 0; 

      // Stream response chunks
      for await (const chunk of result) {
        const text = chunk.text;
        if (text && ws.readyState === ws.OPEN) {
          fullResponse += text;
          
          ws.send(JSON.stringify({
            type: "stream_chunk",
            content: text,
            chunkIndex: chunkIndex,
            finish_reason: null,
            requestId: message.requestId
          }));

          chunkIndex++;
        }
      }

      // Send completion signal
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "stream_complete",
          content: fullResponse,
          totalChunks: chunkIndex,
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
  console.log('handleTTSRequest called')
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'GOOGLE_GENERATIVE_AI_API_KEY not set'
    }));
    return;
  }

  try {
    const { text, parentRequestId } = message;
    
    if (!text) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Missing or invalid text'
      }));
      return;
    }

    // Send stream start event
    ws.send(JSON.stringify({
      type: "tts_stream_start",
      message: "Starting to generate TTS response",
      requestId: message.requestId,
      parentRequestId: parentRequestId
    }));

    try {
      const result = await genAI.models.generateContentStream({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          maxOutputTokens: 200,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: 'Algenib' } 
            },
          },
        },
      });
      
      let fullAudioBytes = new Uint8Array(0);
      let audioChunkIndex = 0; // ✅ Track audio chunks separately

      for await (const chunk of result) {
        const candidate = chunk.candidates?.[0];
        if (candidate && candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data && ws.readyState === ws.OPEN) {

              ws.send(JSON.stringify({
                type: "tts_stream_chunk",
                content: part.inlineData.data,
                chunkIndex: audioChunkIndex, 
                parentRequestId: parentRequestId,
                finish_reason: null,
                requestId: message.requestId
              }));
      
              audioChunkIndex++; // ✅ Increment for each audio chunk

              const audioChunk = Buffer.from(part.inlineData.data, 'base64');
              const merged = new Uint8Array(fullAudioBytes.length + audioChunk.length);
              merged.set(fullAudioBytes);
              merged.set(audioChunk, fullAudioBytes.length);
              fullAudioBytes = merged;
            }
          }
        }
      }

      // Send completion signal
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "tts_stream_complete",
          content: Buffer.from(fullAudioBytes).toString('base64'), // ✅ Convert to base64
          chunkIndex: audioChunkIndex,
          parentRequestId: parentRequestId,
          finish_reason: "stop",
          requestId: message.requestId
        }));
      }

      console.log(`TTS completed with ${audioChunkIndex} audio chunks`);

    } catch (streamError: any) {
      console.error('TTS stream generation error:', streamError);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "tts_error",
          error: streamError?.message || "Error generating tts response",
          parentRequestId: parentRequestId,
          requestId: message.requestId
        }));
      }
    }

  } catch (error: any) {
    console.error('TTS request error:', error);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'tts_error',
        error: error?.message || "Error processing tts request",
        requestId: message.requestId
      }));
    }
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    
    // serverLogger(req as any, res);
    
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
      } catch (error: any) {
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