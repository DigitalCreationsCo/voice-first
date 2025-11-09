// useAudioManager.ts
import { useCallback, useRef, useState, useEffect } from 'react';
import { SpeechRecognitionManager } from '../lib/audio/speech-recognition-manager';
import { toast } from 'sonner';

interface UseAudioManagerReturn {
  // Speech Recognition
  startListening: () => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
  transcript: string;
  setTranscript: (transcript: string) => void;
  interimTranscript: string;
  setInterimTranscript: (interimTranscript: string) => void;
  
  // TTS Playback
  synthesizeSpeech: (text: string, messageId: string) => Promise<Uint8Array>;
  synthesizeSpeechStream: (
    text: string, 
    messageId: string, 
    onCompleteAudio?: (messageId: string, audioData: Uint8Array) => void, 
  ) => void;
  playMessageAudio: (audioData: any, messageId: string) => void;
  stopPlayback: () => void;
  playFallbackSpeech: (text:string, messageId: string) => void;
  isPlaying: boolean;
  currentlyPlayingMessageId: string | null;
  
  // State
  isInitialized: boolean;
  initializeAudio?: any;
  playAudioBufferDirect: (data: Uint8Array) => void;
}

interface AudioManagerOptions {
  allowConcurrentRequests?: boolean;
  maxQueueSize?: number;
  queueEvictionTimeMs?: number;
}

export function useAudioManager(options?: AudioManagerOptions) {
  const managerRef = useRef<SpeechRecognitionManager | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyPlayingMessageId, setCurrentlyPlayingMessageId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  // Initialize manager
  useEffect(() => {
    const initializeManager = async () => {
      console.log('Initializing SpeechRecognitionManager')
      try {
        if (!managerRef.current) {
          managerRef.current = new SpeechRecognitionManager(options);
          await managerRef.current.initialize();
          setIsInitialized(true);
        }
      } catch (error: any) {
        console.error('Error initializing audio manager:', error);
      }
    };

    const handleUserInteraction = () => {
      initializeManager();
      document.removeEventListener('mousemove', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('mousemove', handleUserInteraction);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      document.removeEventListener('mousemove', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  // Playback state change handler
  const handlePlaybackStateChange = useCallback((playing: boolean, messageId: string | null) => {
    setIsPlaying(playing);
    setCurrentlyPlayingMessageId(messageId);
  }, []);

  // Enqueue ordered audio chunk
  const enqueueAudioChunk = useCallback(async (
    requestId: string,
    chunkIndex: number,
    audioData: string,
    messageId: string
  ) => {
    if (!managerRef.current) return;
    await managerRef.current.processStreamedAudioChunk(
      requestId,
      chunkIndex,
      audioData,
      messageId,
      handlePlaybackStateChange
    );
  }, [handlePlaybackStateChange]);

  // Mark request complete
  const markRequestComplete = useCallback((requestId: string) => {
    if (!managerRef.current) return;
    managerRef.current.markRequestComplete(requestId);
  }, []);

  // const synthesizeSpeech = useCallback(async (text: string, messageId: string) => {
  //   if (!managerRef.current || !isInitialized) {
  //     console.error('Audio manager not initialized');
  //     throw Error('Audio manager not initialized');
  //   }

  //   try {
  //     const audioData = await managerRef.current.synthesizeSpeech(
  //       text,
  //       messageId,
  //       (isPlaying, msgId) => {
  //         setIsPlaying(isPlaying);
  //         setCurrentlyPlayingMessageId(msgId);
  //       }
  //     );
  //     return audioData;
  //   } catch (error: any) {
  //     console.error('Error synthesizing speech:', error);
  //     setIsPlaying(false);
  //     setCurrentlyPlayingMessageId(null);
  //   }
  // }, [isInitialized]);
  
  // Play full message audio
  const playMessageAudio = useCallback(async (audioData: string, messageId: string) => {
    if (!managerRef.current) return;
    await managerRef.current.playMessageAudio(
      audioData,
      messageId,
      handlePlaybackStateChange
    );
  }, [handlePlaybackStateChange]);

  // Play audio buffer directly
  const playAudioDirect = useCallback(async (audioData: string) => {
    if (!managerRef.current) return;
    await managerRef.current.playAudioBufferDirect(
      audioData,
      handlePlaybackStateChange
    );
  }, [handlePlaybackStateChange]);

  // Stop all audio
  const stopPlayback = useCallback(() => {
    if (!managerRef.current) return;
    managerRef.current.stopAudio();
    setIsPlaying(false);
    setCurrentlyPlayingMessageId(null);
  }, []);

  const stopRequest = useCallback((requestId: string) => {
    if (!managerRef.current) return;
    managerRef.current.stopRequest(requestId);
  }, []);

  // Speech recognition
  const startListening = useCallback(async () => {
    if (!managerRef.current) return;
    setIsListening(true);

    try {
      await managerRef.current?.startListening(
        (finalText) => {
          setTranscript(finalText);
          setInterimTranscript('');
        },
        (interim) => {
          setInterimTranscript(interim);
        },
        (error: any) => {
          console.error('Speech recognition error:', error);
          setIsListening(false);
        }
      );
    } catch (error: any) {
      console.error('Error starting listening:', error);
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!managerRef.current) return;
    managerRef.current.stopListening();
    setIsListening(false);
  }, []);

  // Transcription correction
  const correctTranscription = useCallback(async (
    rawTranscript: string,
    messages: string[] = []
  ) => {
    if (!managerRef.current) return { corrected: rawTranscript, confidence: 0.5, changes: [] };
    return await managerRef.current.correctTranscription(rawTranscript, messages);
  }, []);

  // Fallback speech
  const playFallbackSpeech = useCallback((text: string) => {
    if (!managerRef.current) return;
    managerRef.current.playFallbackSpeech(text);
  }, []);

  // Queue stats
  const getQueueStats = useCallback((requestId: string) => {
    if (!managerRef.current) return null;
    return managerRef.current.getQueueStats(requestId);
  }, []);

  // Set concurrent requests policy
  const setAllowConcurrentRequests = useCallback((allow: boolean) => {
    if (!managerRef.current) return;
    managerRef.current.setAllowConcurrentRequests(allow);
  }, []);

   // Set interim result delay
   const setInterimResultDelay = useCallback((delayMs: number) => {
    if (!managerRef.current) return;
    managerRef.current.setInterimResultDelay(delayMs);
  }, []);

  return {
    isInitialized,
    isListening,
    isPlaying,
    currentlyPlayingMessageId,

    enqueueAudioChunk,
    markRequestComplete,
    playMessageAudio,
    playAudioDirect,
    stopPlayback,
    stopRequest,

    startListening,
    stopListening,
    correctTranscription,
    transcript,
    setTranscript,
    interimTranscript,
    setInterimTranscript,

    playFallbackSpeech,
    getQueueStats,
    setAllowConcurrentRequests,
    setInterimResultDelay,
    // synthesizeSpeech,
  };
}