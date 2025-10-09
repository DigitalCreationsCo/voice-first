import { AudioManager, convertInt16ToFloat32 } from "./audio-manager";

export class SpeechRecognitionManager extends AudioManager {
  private recognition: any = null;
  private isListening: boolean = false;
  private onResult: ((text: string) => void) | null = null;
  private onInterimResult: ((text: string) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private interimDebounceTimer: NodeJS.Timeout | null = null;
  private interimDebounceDelay: number = 4000;
  private mediaStream: MediaStream | null = null;
  private audioTracks: MediaStreamTrack[] = [];

  async initialize() {
    await this.initializeAudioContext();

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = async (event: any) => this.handleRecognitionResult(event);
    this.recognition.onerror = (event: any) => this.onError?.(event.error);
    this.recognition.onend = () => {
      this.isListening = false;
      if (this.interimDebounceTimer) {
        clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = null;
      }
    };
  }


  private handleRecognitionResult(event: any) {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript && this.onResult) {
      if (this.interimDebounceTimer) {
        clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = null;
      }
      this.onResult(finalTranscript);
    }
    
    if (interimTranscript && this.onInterimResult) {
      if (this.interimDebounceTimer) {
        clearTimeout(this.interimDebounceTimer);
      }
      
      this.interimDebounceTimer = setTimeout(() => {
        if (this.onInterimResult) {
          this.onInterimResult(interimTranscript);
        }
        this.interimDebounceTimer = null;
      }, this.interimDebounceDelay);
    }
  };

  /**
   * Start listening with echo cancellation
   */
  async startListening(
    onResult: (text: string) => void,
    onInterimResult: (text: string) => void,
    onError: (error: string) => void
  ) {
    if (!this.recognition) await this.initialize();
    
    this.onResult = onResult;
    this.onInterimResult = onInterimResult;
    this.onError = onError;

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioTracks = this.mediaStream.getAudioTracks();

      const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
      this.inputGainNode = this.audioContext!.createGain();
      this.inputGainNode.gain.value = this.ORIGINAL_GAIN_VALUE;
      source.connect(this.inputGainNode);

      this.audioTracks.forEach(track => {
        console.log('Audio Track ', track);
        const settings = track.getSettings();
        console.log('Microphone settings:', settings);
        console.log('Echo cancellation:', settings.echoCancellation);
        console.log('\n');
      });

      this.recognition.start();
      this.isListening = true;

    } catch (error: any) {
      console.error('Error starting listening:', error);
      if (this.onError) {
        this.onError('Failed to access microphone');
      }
    }
  }

  stopListening() {
    this.recognition?.stop();
    
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }

    this.audioTracks.forEach(track => track.stop());
    this.audioTracks = [];
    this.mediaStream = null;
    
    this.isListening = false;
  }

  /**
   * Process streamed audio chunks with ordering
   * Primary method for handling WebSocket audio streams
   */
  async processStreamedAudioChunk(
    requestId: string,
    chunkIndex: number,
    audioData: string,
    messageId: string,
    onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void
  ): Promise<void> {
    await this.enqueueOrderedAudioChunk(
      requestId,
      chunkIndex,
      audioData,
      messageId,
      onPlaybackStateChange
    );
  }

  // /**
  //  * @deprecated Use processStreamedAudioChunk instead
  //  * LEGACY: Kept for backward compatibility with HTTP-based TTS
  //  */
  // async synthesizeSpeech(
  //   text: string,
  //   messageId: string,
  //   onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void
  // ): Promise<Uint8Array> {
  //   try {
  //     if (!this.audioContext) {
  //       await this.initializeAudioContext();
  //     }

  //     if (this.audioContext!.state === 'suspended') {
  //       await this.audioContext!.resume();
  //     }

  //     this.currentlyPlayingMessageId = messageId;

  //     const response = await fetch('/api/tts', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({ text }),
  //     });

  //     if (!response.ok) {
  //       const errorData = await response.text();
  //       throw new Error(`TTS API error: ${response.status} ${response.statusText} - ${errorData}`);
  //     }

  //     if (!response.body) {
  //       throw new Error("Response body is empty.");
  //     }

  //     const reader = response.body.getReader();
  //     let totalBytesReceived = 0;
  //     const SAMPLE_RATE = 24000;
  //     const CHANNELS = 1;
  //     let remainingBytes = new Uint8Array(0);
  //     const allAudioChunks: Uint8Array[] = [];

  //     while (true) {
  //       const { done, value } = await reader.read();

  //       if (value && value.byteLength > 0) {
  //         totalBytesReceived += value.byteLength;
          
  //         allAudioChunks.push(value);
          
  //         const combinedBytes = new Uint8Array(remainingBytes.length + value.length);
  //         combinedBytes.set(remainingBytes);
  //         combinedBytes.set(value, remainingBytes.length);
          
  //         const completeBytes = combinedBytes.length - (combinedBytes.length % 2);
          
  //         if (completeBytes >= 2) {
  //           const audioData = combinedBytes.subarray(0, completeBytes);
  //           const float32Data = convertInt16ToFloat32(audioData);
            
  //           if (float32Data.length > 0) {
  //             try {
  //               const audioBuffer = this.audioContext!.createBuffer(
  //                 CHANNELS, 
  //                 float32Data.length, 
  //                 SAMPLE_RATE
  //               );
  //               audioBuffer.getChannelData(0).set(float32Data);
  //               this.audioQueue.push(audioBuffer);
  //             } catch (bufferError) {
  //               console.error('Error creating audio buffer:', bufferError);
  //               continue;
  //             }
  //           }
            
  //           remainingBytes = combinedBytes.subarray(completeBytes);
  //         } else {
  //           remainingBytes = combinedBytes;
  //         }

  //         const MIN_CHUNKS_TO_START_PLAYBACK = 1;
  //         if (!this.isPlaying && this.audioQueue.length >= MIN_CHUNKS_TO_START_PLAYBACK) {
  //           this.playQueuedAudioWithReduceInputGain(onPlaybackStateChange);
  //         }
  //       }

  //       if (done) {
  //         console.log(`Audio stream finished. Total bytes: ${totalBytesReceived}`);
          
  //         if (remainingBytes.length >= 2) {
  //           const float32Data = convertInt16ToFloat32(remainingBytes);
  //           if (float32Data.length > 0) {
  //             try {
  //               const audioBuffer = this.audioContext!.createBuffer(
  //                 CHANNELS, 
  //                 float32Data.length, 
  //                 SAMPLE_RATE
  //               );
  //               audioBuffer.getChannelData(0).set(float32Data);
  //               this.audioQueue.push(audioBuffer);
  //             } catch (bufferError) {
  //               console.error('Error creating final audio buffer:', bufferError);
  //             }
  //           }
  //         }
          
  //         if (!this.isPlaying && this.audioQueue.length > 0) {
  //           this.playQueuedAudioWithReduceInputGain(onPlaybackStateChange);
  //         }
  //         break;
  //       }
  //     }

  //     const totalLength = allAudioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  //     const completeAudioData = new Uint8Array(totalLength);
  //     let offset = 0;
      
  //     for (const chunk of allAudioChunks) {
  //       completeAudioData.set(chunk, offset);
  //       offset += chunk.length;
  //     }

  //     return completeAudioData;
  //   } catch (error: any) {
  //     console.error('Error in synthesizeSpeech:', error);
  //     this.isPlaying = false;
  //     this.currentlyPlayingMessageId = null;
  //     onPlaybackStateChange?.(false, null);
  //     throw error;
  //   }
  // }

  async correctTranscription(
    rawTranscript: string,
    messages: string[] = []
  ): Promise<{ corrected: string; confidence: number; changes: string[] }> {
    try {
      const response = await fetch('/api/correct-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript: rawTranscript,
          messages: messages.slice(-5, -1),
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error('Speech correction failed:', error);
      return { 
        corrected: rawTranscript, 
        confidence: 0.5,
        changes: []
      };
    }
  }
  
  setInterimResultDelay(delayMs: number) {
    this.interimDebounceDelay = delayMs;
  }

  protected getIsListening() {
    return this.isListening;
  }
}

export { convertInt16ToFloat32 };