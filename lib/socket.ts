// WebSocket client implementation
class ChatWebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private isManuallyDisconnected = false;
    private pendingRequests = new Map();
    private requestIdCounter = 0;
  
    constructor(url: string) {
      this.url = url;
    }
  
    connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(this.url);
          this.isManuallyDisconnected = false;
  
          this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            resolve();
          };
  
          this.ws.onmessage = (event) => {
            this.handleMessage(event);
          };
  
          this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.handleDisconnection();
          };
  
          this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(error);
          };
  
        } catch (error) {
          reject(error);
        }
      });
    }
  
    private handleMessage(event: MessageEvent) {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'connection_established':
            console.log('Connection established:', message.message);
            break;
          
          case 'stream_start':
            this.handleStreamStart(message);
            break;
          
          case 'stream_chunk':
            this.handleStreamChunk(message);
            break;
          
          case 'stream_complete':
            this.handleStreamComplete(message);
            break;
          
          case 'error':
            this.handleError(message);
            break;
          
          case 'pong':
            console.log('Received pong:', message.timestamp);
            break;
          
          case 'heartbeat':
            // Server heartbeat - connection is alive
            break;
          
          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  
    private handleStreamStart(message: any) {
      const request = this.pendingRequests.get(message.requestId);
      if (request && request.onStreamStart) {
        request.onStreamStart(message);
      }
    }
  
    private handleStreamChunk(message: any) {
      const request = this.pendingRequests.get(message.requestId);
      if (request && request.onChunk) {
        request.onChunk(message.content);
      }
    }
  
    private handleStreamComplete(message: any) {
      const request = this.pendingRequests.get(message.requestId);
      if (request) {
        if (request.onComplete) {
          request.onComplete(message.content);
        }
        this.pendingRequests.delete(message.requestId);
      }
    }
  
    private handleError(message: any) {
      const request = this.pendingRequests.get(message.requestId);
      if (request && request.onError) {
        request.onError(message.error);
      } else {
        console.error('WebSocket error:', message.error);
      }
      if (message.requestId) {
        this.pendingRequests.delete(message.requestId);
      }
    }
  
    private handleDisconnection() {
      if (!this.isManuallyDisconnected && this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          this.reconnectAttempts++;
          this.connect().catch(console.error);
        }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts)); // Exponential backoff
      }
    }
  
    sendChatMessage(
      messages: any[], 
      callbacks: {
        onStreamStart?: (message: any) => void;
        onChunk?: (chunk: string) => void;
        onComplete?: (fullResponse: string) => void;
        onError?: (error: string) => void;
      }
    ): string {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not connected');
      }
  
      const requestId = (++this.requestIdCounter).toString();
      
      // Store callbacks for this request
      this.pendingRequests.set(requestId, callbacks);
  
      const message = {
        type: 'chat_request',
        messages,
        requestId
      };
  
      this.ws.send(JSON.stringify(message));
      return requestId;
    }
  
    ping(): void {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const requestId = (++this.requestIdCounter).toString();
        this.ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
          requestId
        }));
      }
    }
  
    cancelRequest(requestId: string): void {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'cancel_request',
          requestId
        }));
      }
      this.pendingRequests.delete(requestId);
    }
  
    disconnect(): void {
      this.isManuallyDisconnected = true;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.pendingRequests.clear();
    }
  
    get isConnected(): boolean {
      return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
  }
  
  // Usage example
  async function exampleUsage() {
    const client = new ChatWebSocketClient('ws://localhost:3000/api/chat/websocket');
    
    try {
      await client.connect();
      console.log('Connected to WebSocket');
  
      const messages = [
        { role: 'user', content: 'Hello! Can you help me with JavaScript?' }
      ];
  
      let fullResponse = '';
  
      const requestId = client.sendChatMessage(messages, {
        onStreamStart: (message) => {
          console.log('Stream started:', message.message);
        },
        onChunk: (chunk) => {
          fullResponse += chunk;
          console.log('Received chunk:', chunk);
          // Update UI with new chunk
        },
        onComplete: (response) => {
          console.log('Stream completed. Full response:', response);
          // Update UI to show completion
        },
        onError: (error) => {
          console.error('Stream error:', error);
          // Show error in UI
        }
      });
  
      // You can cancel the request if needed
      // setTimeout(() => client.cancelRequest(requestId), 5000);
  
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  }
  
  // Export for use in React components or other modules
  export { ChatWebSocketClient };
  
  // For browser environments
  if (typeof window !== 'undefined') {
    (window as any).ChatWebSocketClient = ChatWebSocketClient;
  }