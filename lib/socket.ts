export interface ChatMessageCallbacks {
  onStreamStart?: (message: any) => void;
  onChunk?: (requestId: string, chunk: string, chunkIndex: number) => void;
  onComplete?: (fullResponse: string, message: any) => void;
  onError?: (error: string) => void;
  onTTSStreamStart?: (message: any) => void;
  onTTSChunk?: (parentRequestId: string, audioChunk: string, chunkIndex: number) => void;
  onTTSComplete?: (requestId: string, fullAudio: string, totalChunks: number) => void;
};

interface MessageRequest extends ChatMessageCallbacks {

};

class ChatWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isManuallyDisconnected = false;
  private pendingRequests = new Map<string, MessageRequest>();
  private requestIdCounter = 0;
  private onConnectionChange: ((connected: boolean) => void) | null = null;
  
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
          if (this.onConnectionChange) this.onConnectionChange(true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          if (this.onConnectionChange) this.onConnectionChange(false);
          this.handleDisconnection();
        };

        this.ws.onerror = (error: any) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error: any) {
        reject(error);
      }
    });
  }

  private handleMessage(event: MessageEvent) {
    try {
      console.log('🔵 RAW WEBSOCKET MESSAGE:', event);

      const message = JSON.parse(event.data);
      console.log('🔵 PARSED MESSAGE:', message);

      switch (message.type) {
        case 'connection_established':
          console.log('🤝 Connection established:', message.message);
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

        case 'tts_stream_start':
          this.handleTTSStreamStart(message);
          break;

        case 'tts_stream_chunk':
          this.handleTTSStreamChunk(message);
          break;
        
        case 'tts_stream_complete':
          this.handleTTSStreamComplete(message);
          break;
        
        case 'error':
        case 'tts_error':
          this.handleError(message);
          break;
        
        case 'pong':
          console.log('🏓 Received pong:', message.timestamp);
          break;
        
        case 'heartbeat':
          break;
        
        default:
          console.warn('⚠️ Unknown message type:', message.type);
      }
    } catch (error: any) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  }

  private handleStreamStart(message: any) {
    console.log('📨 Chat Stream Start Handler:', message, {
      requestId: message.requestId,
      hasPendingRequest: this.pendingRequests.has(message.requestId),
    });

    const request = this.pendingRequests.get(message.requestId);
    if (request && request.onStreamStart) {
      console.log('   ✅ Calling onStreamStart callback');
      request.onStreamStart(message);
    }
  }

  private handleStreamChunk(message: any) {
    console.log('📨 Chat Chunk Handler:', {
      requestId: message.requestId,
      chunkIndex: message.chunkIndex,
      contentLength: message.content?.length
    });

    const request = this.pendingRequests.get(message.requestId);
    if (request && request.onChunk) {
      console.log('   ✅ Calling onChunk callback');
      request.onChunk(message.requestId, message.content, message.chunkIndex);
    }
  }

  private handleStreamComplete(message: any) {
    console.log('📨 Chat Complete Handler:', {
      requestId: message.requestId,
      contentLength: message.content?.length,
      message: message
    });

    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      if (request.onComplete) {
        console.log('   ✅ Calling onComplete callback');
        request.onComplete(message.content, message);
      }
      // Don't delete here - TTS might still need it
      // this.pendingRequests.delete(message.requestId);
    }
  }

  private handleTTSStreamStart(message: any) {
    console.log('📨 TTS Stream Start Handler:', {
      parentRequestId: message.parentRequestId,
      requestId: message.requestId,
      hasPendingRequest: this.pendingRequests.has(message.parentRequestId),
      allPendingKeys: Array.from(this.pendingRequests.keys())
    });

    const request = this.pendingRequests.get(message.parentRequestId);
    
    if (!request) {
      console.error(`   ❌ No pending request found for parentRequestId: ${message.parentRequestId}`);
      console.log('   Available requests:', Array.from(this.pendingRequests.keys()));
      return;
    }

    if (request.onTTSStreamStart) {
      console.log('   ✅ Calling onTTSStreamStart callback');
      request.onTTSStreamStart(message);
    } else {
      console.warn('   ⚠️ Request found but no onTTSStreamStart callback');
    }
  }

  private handleTTSStreamChunk(message: any) {
    console.log('📨 TTS Chunk Handler:', {
      parentRequestId: message.parentRequestId,
      chunkIndex: message.chunkIndex,
      contentLength: message.content?.length,
      hasPendingRequest: this.pendingRequests.has(message.parentRequestId)
    });

    const request = this.pendingRequests.get(message.parentRequestId);

    if (!request) {
      console.error(`   ❌ No pending request found for parentRequestId: ${message.parentRequestId}`);
      console.log('   Available requests:', Array.from(this.pendingRequests.keys()));
      return;
    }

    if (request.onTTSChunk) {
      console.log(`✅ Calling onTTSChunk callback`);
      request.onTTSChunk(message.parentRequestId, message.content, message.chunkIndex); 
    } else {
      console.warn(`⚠️ Request found but no onTTSChunk callback`);
    }
  }

  private handleTTSStreamComplete(message: any) {
    console.log('📨 TTS Complete Handler:', {
      parentRequestId: message.parentRequestId,
      totalChunks: message.totalChunks,
      contentLength: message.content?.length,
      hasPendingRequest: this.pendingRequests.has(message.parentRequestId)
    });
  
    const request = this.pendingRequests.get(message.parentRequestId);
    
    if (!request) {
      console.error(`❌ No pending request for parentRequestId: ${message.parentRequestId}`);
      console.log('   Available requests:', Array.from(this.pendingRequests.keys()));
      return;
    }
    
    if (request.onTTSComplete) {
      console.log('   ✅ Calling onTTSComplete callback');
      request.onTTSComplete(message.parentRequestId, message.content, message.totalChunks);
    } else {
      console.warn('   ⚠️ Request found but no onTTSComplete callback');
    }

    // console.log(`   🗑️ Cleaning up pending request: ${message.parentRequestId}`);
    this.pendingRequests.delete(message.parentRequestId);
  }

  private handleError(message: any) {
    console.error('📨 Error Handler:', {
      type: message.type,
      requestId: message.requestId,
      parentRequestId: message.parentRequestId,
      error: message.error
    });

    const requestId = message.parentRequestId || message.requestId;
    const request = this.pendingRequests.get(requestId);

    if (request && request.onError) {
      console.log('   ✅ Calling onError callback');
      request.onError(message.error);
    } else {
      console.error('   ❌ No error handler found, logging error:', message.error);
    }

    if (requestId) {
      this.pendingRequests.delete(requestId);
    }
  }

  private handleDisconnection() {
    if (!this.isManuallyDisconnected && this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(`🔄 Attempting to reconnect in ${delay}ms (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect().catch(console.error);
      }, delay); 
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  setConnectionChangeCallback(callback: (connected: boolean) => void) {
    this.onConnectionChange = callback;
  }
  
  sendChatMessage(
    messages: any[],
    callbacks: ChatMessageCallbacks
  ): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const requestId = (++this.requestIdCounter).toString();
    
    console.log('📤 Sending Chat Message:', {
      requestId,
      messageCount: messages.length,
      hasCallbacks: {
        onStreamStart: !!callbacks.onStreamStart,
        onChunk: !!callbacks.onChunk,
        onComplete: !!callbacks.onComplete,
        onTTSStreamStart: !!callbacks.onTTSStreamStart,
        onTTSChunk: !!callbacks.onTTSChunk,
        onTTSComplete: !!callbacks.onTTSComplete,
        onError: !!callbacks.onError
      }
    });

    this.pendingRequests.set(requestId, callbacks);

    const message = {
      type: 'chat_request',
      messages,
      requestId
    };

    this.ws.send(JSON.stringify(message));
    return requestId;
  }

  sendTTSRequest(
    text: string,
    chunkIndex: number,
    parentRequestId: string,
    callbacks?: ChatMessageCallbacks,
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const requestId = (++this.requestIdCounter).toString();
    
    console.log('📤 Sending TTS Request:', {
      requestId,
      parentRequestId,
      textLength: text.length,
      textPreview: text.substring(0, 50),
      hasCallbacks: !!callbacks
    });

    const message = {
      type: 'tts_request',
      text,
      chunkIndex,
      parentRequestId,
      requestId
    };

    if (callbacks) {
      console.log('   ✅ Storing callbacks under requestId:', requestId);
      this.pendingRequests.set(requestId, callbacks);
    } else {
      console.log('   ℹ️ No callbacks provided - using existing callbacks from parentRequestId:', parentRequestId);
    }

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
      console.log('🚫 Canceling request:', requestId);
      this.ws.send(JSON.stringify({
        type: 'cancel_request',
        requestId
      }));
    }
    this.pendingRequests.delete(requestId);
  }

  disconnect(): void {
    console.log('🔌 Disconnecting WebSocket');
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

  getPendingRequests(): string[] {
    return Array.from(this.pendingRequests.keys());
  }
}

// Export for use in React components or other modules
export { ChatWebSocketClient };

// For browser environments
if (typeof window !== 'undefined') {
  (window as any).ChatWebSocketClient = ChatWebSocketClient;
}