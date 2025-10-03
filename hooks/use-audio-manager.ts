// useAudioManager.ts
import { useCallback, useRef, useState, useEffect } from 'react';
import { SpeechRecognitionManager } from '@/lib/speech';

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
  isPlayingAudio: boolean;
  currentlyPlayingId: string | null;
  
  // State
  isInitialized: boolean;
  initializeAudio?: any;
  playAudioBufferDirect: (data: Uint8Array) => void;
}

export function useAudioManager(): UseAudioManagerReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Single manager instance
  const managerRef = useRef<SpeechRecognitionManager | null>(null);

  // Initialize once on mount
  useEffect(() => {
    const initializeManager = async () => {
      console.log('Initializing SpeechRecognitionManager')
      try {
        managerRef.current = new SpeechRecognitionManager();
        await managerRef.current.initialize();
        setIsInitialized(true);
      } catch (error) {
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
        managerRef.current.stopListening();
        managerRef.current.destroy();
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.error('Audio manager not initialized');
    }

    try {
      await managerRef.current?.startListening(
        (finalText) => {
          setTranscript(finalText);
          setInterimTranscript('');
        },
        (interim) => {
          setInterimTranscript(interim);
        },
        (error) => {
          console.error('Speech recognition error:', error);
          setIsListening(false);
        }
      );
      setIsListening(true);
    } catch (error) {
      console.error('Error starting listening:', error);
      setIsListening(false);
    }
  }, [isInitialized]);

  const stopListening = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stopListening();
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const synthesizeSpeech = useCallback(async (text: string, messageId: string) => {
    if (!managerRef.current || !isInitialized) {
      console.error('Audio manager not initialized');
      throw Error('Audio manager not initialized');
    }

    try {
      const audioData = await managerRef.current.synthesizeSpeech(
        text,
        messageId,
        (isPlaying, msgId) => {
          setIsPlayingAudio(isPlaying);
          setCurrentlyPlayingId(msgId);
        }
      );
      return audioData;
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      setIsPlayingAudio(false);
      setCurrentlyPlayingId(null);
    }
  }, [isInitialized]);
  
  const synthesizeSpeechStream: UseAudioManagerReturn['synthesizeSpeechStream'] = useCallback((
    text,
    messageId,
    onCompleteAudio?
  ) => {
    if (!managerRef.current || !isInitialized) {
      console.error('Audio manager not initialized');
      return;
    }

    // Generate sequence from timestamp for ordering
    const sequenceNumber = Date.now();

    try {
      managerRef.current.synthesizeSpeechStream(
        text,
        messageId,
        sequenceNumber,
        (isPlaying, msgId) => {
          setIsPlayingAudio(isPlaying);
          setCurrentlyPlayingId(msgId);
        },
        onCompleteAudio
      );
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      setIsPlayingAudio(false);
      setCurrentlyPlayingId(null);
    }
  }, [isInitialized]);

  const playMessageAudio = useCallback((audioData: any, messageId: any) => {
    if (!managerRef.current || !isInitialized) {
      console.error('Audio manager not initialized');
      return;
    }

    managerRef.current.playMessageAudio(
      audioData, 
      messageId, 
      (isPlaying, msgId) => {
        setIsPlayingAudio(isPlaying);
        setCurrentlyPlayingId(msgId);
      }
    );
  }, [isInitialized])

  const stopPlayback = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stopAudio();
      setIsPlayingAudio(false);
      setCurrentlyPlayingId(null);
    }
  }, [isInitialized]);

  const playFallbackSpeech = useCallback((text: string, messageId: string) => {
    if (!managerRef.current || !isInitialized) {
      console.error('Audio manager not initialized');
    }
    
    if (managerRef.current) {
      managerRef.current.playFallbackSpeech(text);
      setIsPlayingAudio(true);
      setCurrentlyPlayingId(messageId);
    }
  }, [isInitialized]);

  const playAudioBufferDirect = useCallback((buffer: Uint8Array) => {
    if (!isInitialized) {
      console.error('Speech Recognition Manager not initialized');
    }
    if (!managerRef.current) {
      console.error('ManagerRef current: ', managerRef.current);
    }

    if (managerRef.current) {
      managerRef.current.playAudioBufferDirect(buffer, (isPlaying, msgId) => {
        setIsPlayingAudio(isPlaying);
        setCurrentlyPlayingId(msgId);
      })
      setIsPlayingAudio(true);
    } 
  }, [isInitialized]);

  return {
    startListening,
    stopListening,
    isListening,
    transcript,
    setTranscript,
    interimTranscript,
    setInterimTranscript,
    synthesizeSpeech,
    synthesizeSpeechStream,
    playMessageAudio,
    stopPlayback,
    playFallbackSpeech,
    isPlayingAudio,
    currentlyPlayingId,
    isInitialized,
    playAudioBufferDirect
  };
}