export interface ChatMessageCallbacks {
  onStreamStart?: (message: any) => void;
  onChunk?: (requestId: string, chunk: string, chunkIndex: number) => void;
  onComplete?: (fullResponse: string, message: any) => void;
  onError?: (error: string) => void;
  onTTSStreamStart?: (message: any) => void;
  onTTSChunk?: (parentRequestId: string, audioChunk: string, chunkIndex: number) => void;
  onTTSComplete?: (requestId: string, fullAudio: string, totalChunks: number) => void;
};

class SSEClient {
  private chatUrl: string;
  private ttsUrl: string;
  private pendingRequests = new Map<string, ChatMessageCallbacks>();
  private requestIdCounter = 0;

  constructor(chatUrl: string, ttsUrl: string) {
    this.chatUrl = chatUrl;
    this.ttsUrl = ttsUrl;
  }

  private generateRequestId(): string {
    return (++this.requestIdCounter).toString();
  }

  sendChatMessage(messages: any[], callbacks: ChatMessageCallbacks): string {
    const requestId = this.generateRequestId();
    this.pendingRequests.set(requestId, callbacks);

    fetch(this.chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, requestId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json();
          callbacks.onError?.(errorData.error || 'Failed to fetch chat stream');
          this.pendingRequests.delete(requestId);
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkIndex = 0;

        while (true) {
          const { value, done } = await reader!.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let eventEndIndex;
          while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
            const eventString = buffer.substring(0, eventEndIndex);
            buffer = buffer.substring(eventEndIndex + 2);

            const lines = eventString.split('\n');
            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring('event: '.length);
              } else if (line.startsWith('data: ')) {
                eventData = line.substring('data: '.length);
              }
            }

            try {
              const data = JSON.parse(eventData);
              switch (eventType) {
                case 'stream_start':
                  callbacks.onStreamStart?.(data);
                  break;
                case 'stream_chunk':
                  callbacks.onChunk?.(data.requestId, data.content, data.chunkIndex);
                  chunkIndex = data.chunkIndex;
                  break;
                case 'stream_complete':
                  callbacks.onComplete?.(data.content, data);
                  break;
                case 'error':
                  callbacks.onError?.(data.error);
                  this.pendingRequests.delete(requestId);
                  break;
                default:
                  console.warn('Unknown SSE event type:', eventType, data);
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError, eventData);
              callbacks.onError?.('Error parsing SSE data');
              this.pendingRequests.delete(requestId);
            }
          }
        }
      })
      .catch((error) => {
        console.error('Fetch chat stream error:', error);
        callbacks.onError?.(error.message || 'Network error');
        this.pendingRequests.delete(requestId);
      });

    return requestId;
  }

  sendTTSRequest(text: string, chunkIndex: number, parentRequestId: string, callbacks?: ChatMessageCallbacks): string {
    const requestId = this.generateRequestId();
    const currentCallbacks = callbacks || this.pendingRequests.get(parentRequestId);

    if (!currentCallbacks) {
      console.error('No callbacks found for TTS request');
      return '';
    }

    fetch(this.ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, parentRequestId, requestId, chunkIndex }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json();
          currentCallbacks.onError?.(errorData.error || 'Failed to fetch TTS stream');
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let audioChunkIndex = 0;

        while (true) {
          const { value, done } = await reader!.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let eventEndIndex;
          while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
            const eventString = buffer.substring(0, eventEndIndex);
            buffer = buffer.substring(eventEndIndex + 2);

            const lines = eventString.split('\n');
            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring('event: '.length);
              } else if (line.startsWith('data: ')) {
                eventData = line.substring('data: '.length);
              }
            }

            try {
              const data = JSON.parse(eventData);
              switch (eventType) {
                case 'tts_stream_start':
                  currentCallbacks.onTTSStreamStart?.(data);
                  break;
                case 'tts_stream_chunk':
                  currentCallbacks.onTTSChunk?.(data.parentRequestId, data.content, data.chunkIndex);
                  audioChunkIndex = data.chunkIndex;
                  break;
                case 'tts_stream_complete':
                  currentCallbacks.onTTSComplete?.(data.parentRequestId, data.content, data.totalChunks);
                  break;
                case 'tts_error':
                  currentCallbacks.onError?.(data.error);
                  break;
                default:
                  console.warn('Unknown SSE TTS event type:', eventType, data);
              }
            } catch (parseError) {
              console.error('Error parsing SSE TTS data:', parseError, eventData);
              currentCallbacks.onError?.('Error parsing SSE TTS data');
            }
          }
        }
      })
      .catch((error) => {
        console.error('Fetch TTS stream error:', error);
        currentCallbacks.onError?.(error.message || 'Network error');
      });

    return requestId;
  }

  // No explicit connect/disconnect for SSE, as it's request-based
  // We'll simulate connection status for compatibility with Chat component
  get isConnected(): boolean {
    return true; // Always considered connected for HTTP requests
  }

  disconnect(): void {
    // No explicit disconnect for SSE
    this.pendingRequests.clear();
  }

  setConnectionChangeCallback(callback: (connected: boolean) => void) {
    // For SSE, we can immediately report connected
    callback(true);
  }

  cancelRequest(requestId: string): void {
    // For SSE, cancellation is harder once a fetch has started.
    // We can at least remove callbacks to prevent further processing.
    this.pendingRequests.delete(requestId);
    console.warn(`SSE request cancellation for ${requestId} is best-effort.`);
  }
}

export { SSEClient };