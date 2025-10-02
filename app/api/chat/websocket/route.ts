import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Check if the request is a WebSocket upgrade request
  const upgrade = request.headers.get('upgrade');
  console.log('websocket route upgrade ', upgrade);
  
  if (upgrade !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  // Get the socket from the request (this is available in Next.js when deployed)
  const { socket, response } = await upgradeWebSocket(request);

  socket.onopen = () => {
    console.log('WebSocket connection opened');
    socket.send(JSON.stringify({ 
      type: 'connection', 
      message: 'Connected to WebSocket server' 
    }));
  };

  socket.onmessage = (event) => {
    console.log('Received message:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      
      // Echo the message back to the client
      socket.send(JSON.stringify({
        type: 'echo',
        message: `Server received: ${data.message}`,
        timestamp: new Date().toISOString()
      }));
      
      // Handle different message types
      switch (data.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        case 'chat':
          // Broadcast to all connected clients (you'd need to implement client management)
          socket.send(JSON.stringify({
            type: 'chat',
            message: data.message,
            user: data.user || 'Anonymous',
            timestamp: new Date().toISOString()
          }));
          break;
        default:
          socket.send(JSON.stringify({ 
            type: 'error', 
            message: 'Unknown message type' 
          }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      socket.send(JSON.stringify({ 
        type: 'error', 
        message: 'Invalid JSON format' 
      }));
    }
  };

  socket.onclose = () => {
    console.log('WebSocket connection closed');
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return response;
}

// Helper function to upgrade HTTP connection to WebSocket
async function upgradeWebSocket(request: NextRequest) {
  // In a real deployment, this would be handled by the runtime
  // For development, you might need to use a different approach
  
  // This is a simplified version - in production, Next.js handles the upgrade
  const webSocketKey = request.headers.get('sec-websocket-key');
  const webSocketVersion = request.headers.get('sec-websocket-version');
  
  if (!webSocketKey || webSocketVersion !== '13') {
    throw new Error('Invalid WebSocket request');
  }

  // Create WebSocket response headers
  const responseHeaders = new Headers({
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Accept': generateWebSocketAccept(webSocketKey),
  });

  // Note: This is a simplified implementation
  // In a real Next.js deployment, the platform handles the WebSocket upgrade
  const response = new Response(null, {
    status: 101,
    statusText: 'Switching Protocols',
    headers: responseHeaders,
  });

  // Mock socket object for development
  const socket = {
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as ((error: any) => void) | null,
    send: (data: string) => {
      console.log('Sending:', data);
    },
  };

  return { socket, response };
}

// Generate WebSocket accept key
function generateWebSocketAccept(key: string): string {
  const crypto = require('crypto');
  const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  return crypto
    .createHash('sha1')
    .update(key + WEBSOCKET_MAGIC_STRING)
    .digest('base64');
}
