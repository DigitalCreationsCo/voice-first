import { NextRequest, NextResponse } from "next/server";
import { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { genAI } from "@/lib/gemini";

// Store WebSocket server instance
let wss: WebSocketServer | null = null;

// Initialize WebSocket server if not already created
function initWebSocketServer() {
  if (!wss) {
    wss = new WebSocketServer({ 
      port: 0, // Let the system assign a port
      noServer: true // We'll handle the upgrade manually
    });

    wss.on('connection', handleWebSocketConnection);
  }
  return wss;
}

async function handleWebSocketConnection(ws: any, request: IncomingMessage) {
  console.log('New WebSocket connection established');

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'WebSocket connection established successfully'
  }));

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message);

      if (message.type === 'chat_request') {
        await handleChatRequest(ws, message);
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error: any) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error);
  });
}

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

    // Convert OpenAI-style messages to Gemini format
    const history = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Send stream start event
    ws.send(JSON.stringify({
      type: "stream_start",
      message: "Starting to generate response"
    }));

    try {
      const result = await genAI.models.generateContentStream({
        model: "gemini-2.0-flash-exp",
        contents: history,
      });

      let fullResponse = '';

      // Stream response chunks
      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          
          // Check if WebSocket is still open before sending
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: "stream_chunk",
              content: text,
              finish_reason: null
            }));
          } else {
            console.log('WebSocket closed during streaming');
            break;
          }
        }
      }

      // Send completion signal
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "stream_complete",
          content: fullResponse,
          finish_reason: "stop"
        }));
      }

    } catch (streamError: any) {
      console.error('Stream generation error:', streamError);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: "error",
          error: streamError?.message || "Error generating response"
        }));
      }
    }

  } catch (error: any) {
    console.error('Chat request error:', error);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error?.message || "Error processing chat request"
      }));
    }
  }
}

// Handle WebSocket upgrade
export async function GET(req: NextRequest) {
  const upgrade = req.headers.get("upgrade");
  const connection = req.headers.get("connection");
  
  if (upgrade !== "websocket" || !connection?.toLowerCase().includes("upgrade")) {
    return new NextResponse("Expected WebSocket upgrade", { status: 426 });
  }

  // For Next.js Edge Runtime, we need to handle this differently
  // This is a simplified approach - in production, you might want to use a custom server
  
  return new NextResponse("WebSocket upgrade not supported in Next.js API routes. Use a custom server.", { 
    status: 501,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
}

// Alternative: Server-Sent Events approach (recommended for Next.js)
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new NextResponse("GOOGLE_GENERATIVE_AI_API_KEY not set", { status: 500 });
  }

  try {
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new NextResponse(JSON.stringify({
        error: "Missing or invalid messages"
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Convert OpenAI-style messages to Gemini format
    const history = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Create a readable stream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await genAI.models.generateContentStream({
            model: "gemini-2.0-flash-exp",
            contents: history,
          });

          // Send stream start event
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "stream_start",
              message: "Starting to generate response"
            })}\n\n`
          ));

          let fullResponse = '';

          // Stream response chunks
          for await (const chunk of result) {
            const text = chunk.text;
            if (text) {
              fullResponse += text;
              controller.enqueue(new TextEncoder().encode(
                `data: ${JSON.stringify({
                  type: "stream_chunk",
                  content: text,
                  finish_reason: null
                })}\n\n`
              ));
            }
          }

          // Send completion signal
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "stream_complete",
              content: fullResponse,
              finish_reason: "stop"
            })}\n\n`
          ));

          controller.close();
        } catch (streamError: any) {
          console.error('Stream generation error:', streamError);
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "error",
              error: streamError?.message || "Error generating response"
            })}\n\n`
          ));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error: any) {
    console.error('Request handling error:', error);
    return new NextResponse(JSON.stringify({
      error: error?.message || "Error processing request"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}