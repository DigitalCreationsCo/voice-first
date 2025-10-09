import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { ApiError, GoogleGenAI, Modality } from "@google/genai";
import { config } from 'dotenv';
import { AudioDebugger, AudioFormat } from './lib/audio/helpers.js';

config({
  path: ".env.local",
});

const hostname = 'localhost';
const wsPort = parseInt(process.env.WS_PORT || '3001', 10);

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
      }).catch((e: ApiError) => {
        console.error('error name: ', e.name);
        console.error('error message: ', e.message);
        console.error('error status: ', e.status);
        throw e;
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
  try {
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
      console.error('❌ API key not set');
      ws.send(JSON.stringify({
        type: 'error',
        error: 'GOOGLE_GENERATIVE_AI_API_KEY not set'
      }));
      return;
    }
    
    if (!text) {
      console.error('❌ No text provided');
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Missing or invalid text'
      }));
      return;
    }

    console.log(`📤 Sending TTS stream start to client`);
    ws.send(JSON.stringify({
      type: "tts_stream_start",
      message: "Starting TTS generation",
      parentRequestId: parentRequestId,
      requestId: requestId
    }));

    try {
      const startTime = Date.now();

      console.log('Sending text to generate audio: ', text);
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
      })
      .then((res) => {
        console.log('Response from gemini api: ', res);
        return res;
      })
      .catch((e: ApiError) => {
        console.error('error name: ', e.name);
        console.error('error message: ', e.message);
        console.error('error status: ', e.status);
        throw e;
      });
      
      let fullAudioBytes = new Uint8Array(0);
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

              const isValidBase64 = AudioDebugger.validate(
                part.inlineData.data,
                AudioFormat.BASE64_STRING
              );
              
              if (!isValidBase64) {
                console.error(`❌ Invalid base64 in chunk ${audioChunkIndex}`);
                ws.send(JSON.stringify({
                  type: 'error',
                  error: `Invalid base64 data in chunk ${audioChunkIndex}`,
                  parentRequestId,
                  requestId
                }));
                return;
              }

              const chunkInfo = {
                index: audioChunkIndex,
                base64Length: part.inlineData.data.length,
                mimeType: part.inlineData.mimeType,
                decodedBytes: Buffer.from(part.inlineData.data, 'base64').length
              };
  
              console.log(`📦 Chunk ${audioChunkIndex}:`, chunkInfo);
              console.log('ws.readyState === ws.OPEN ', ws.readyState === ws.OPEN);
              
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  type: "tts_stream_chunk",
                  content: part.inlineData.data,
                  chunkIndex: audioChunkIndex,
                  parentRequestId: parentRequestId,
                  finish_reason: null,
                  requestId: requestId
                }));
                console.log(`   ✓ Sent chunk ${audioChunkIndex} to client`);
              } else {
                console.error(`   ❌ WebSocket closed, cannot send chunk ${audioChunkIndex}`);
                return;
              }
      
              audioChunkIndex++;

              const audioChunk = Buffer.from(part.inlineData.data, 'base64');
              totalBytesReceived += audioChunk.length;

              const merged = new Uint8Array(fullAudioBytes.length + audioChunk.length);
              merged.set(fullAudioBytes);
              merged.set(audioChunk, fullAudioBytes.length);
              fullAudioBytes = merged;

              chunkTimings.push(Date.now() - chunkStartTime);
            }
          }
        }
      }

      const totalTime = Date.now() - startTime;
      const avgChunkTime = chunkTimings.reduce((a, b) => a + b, 0) / chunkTimings.length;
  
      if (ws.readyState === ws.OPEN) {
        const fullBase64 = Buffer.from(fullAudioBytes).toString('base64');

        console.log(`
          ╔════════════════════════════════════════╗
          ║   SERVER: TTS GENERATION COMPLETE      ║
          ╠════════════════════════════════════════╣
          ║ Total Chunks: ${audioChunkIndex}
          ║ Total Bytes: ${totalBytesReceived}
          ║ Full Base64 Length: ${fullBase64.length}
          ║ Total Time: ${totalTime}ms
          ║ Avg Chunk Time: ${avgChunkTime.toFixed(2)}ms
          ║ Parent Request ID: ${parentRequestId}
          ║ TTS Request ID: ${requestId}
          ╚════════════════════════════════════════╝
                `);

        ws.send(JSON.stringify({
          type: "tts_stream_complete",
          content: fullBase64,
          totalChunks: audioChunkIndex,
          parentRequestId: parentRequestId,
          finish_reason: "stop",
          requestId: requestId
        }));

        console.log(`✓ Sent completion message to client`);
      }
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

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "tts_error",
          error: error?.message || "Error generating tts response",
          parentRequestId: parentRequestId,
          requestId: requestId
        }));
      }
    }

  } catch (error: any) {
    console.error(`
      ╔════════════════════════════════════════╗
      ║   SERVER: TTS REQUEST ERROR            ║
      ╠════════════════════════════════════════╣
      ║ Error: ${error.message}
      ║ Parent Request: ${message.parentRequestId}
      ║ TTS Request: ${message.requestId}
      ║ Stack: ${error.stack?.split('\n')[0]}
      ╚════════════════════════════════════════╝
          `);
    
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'tts_error',
        error: error?.message || "Error processing tts request",
        requestId: message.requestId
      }));
    }
  }
}

const wsServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.version,
      environment: process.env.NODE_ENV || 'development'
    }));
    return;
  }

  if (req.url === '/api/chat/websocket') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Wrong protocol detected.'
    }));
    return;
  }

  // For all other requests, return 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

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
          // Don't await - handle asynchronously to avoid blocking
          handleChatRequest(ws, message).catch(error => {
            console.error('Error in chat request handler:', error);
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Internal server error',
                requestId: message.requestId
              }));
            }
          });
          break;

        case 'tts_request':
          // Don't await - handle asynchronously to avoid blocking
          handleTTSRequest(ws, message).catch(error => {
            console.error('Error in TTS request handler:', error);
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'tts_error',
                error: 'Internal server error',
                requestId: message.requestId
              }));
            }
          });
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
  }, 30000); 
});

wsServer.listen(wsPort, () => {
  console.log(`> WebSocket server running on ws://${hostname}:${wsPort}/api/chat/websocket`);
});