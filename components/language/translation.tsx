import React, { useState, useRef, useMemo } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { TranslationData } from '@/lib/utils';

interface TranslationProps {
  translationData: TranslationData;
  wordKey: string;
  selectedLanguage?: string;
  className?: string;
}

export const Translation: React.FC<TranslationProps> = ({
  translationData,
  wordKey,
  selectedLanguage = 'Target Language',
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const wordData = useMemo(() => translationData[wordKey],[wordKey, translationData]);

  if (!wordData) {
    return (
      <div className={`p-4 border border-red-200 rounded-lg bg-red-50 ${className}`}>
        <p className="text-red-600">Translation not found for key: "{wordKey}"</p>
      </div>
    );
  }

  const handlePlayAudio = async () => {
    if (!wordData.audioUrl && !wordData.word) {
      setAudioError(true);
      return;
    }

    try {
      setIsLoading(true);
      setAudioError(false);

      // If we have an audioUrl, use it
      if (wordData.audioUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        
        audioRef.current = new Audio(wordData.audioUrl);
        audioRef.current.onloadstart = () => setIsLoading(true);
        audioRef.current.oncanplay = () => setIsLoading(false);
        audioRef.current.onplay = () => setIsPlaying(true);
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.onerror = () => {
          setAudioError(true);
          setIsPlaying(false);
          setIsLoading(false);
        };

        await audioRef.current.play();
      } else {
        // Fallback to Web Speech API
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(wordData.word);
          utterance.onstart = () => {
            setIsPlaying(true);
            setIsLoading(false);
          };
          utterance.onend = () => setIsPlaying(false);
          utterance.onerror = () => {
            setAudioError(true);
            setIsPlaying(false);
            setIsLoading(false);
          };
          
          speechSynthesis.speak(utterance);
        } else {
          setAudioError(true);
          setIsLoading(false);
        }
      }
    } catch (error) {
      setAudioError(true);
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  return (
    <div className={`p-4 lg:w-full border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow ${className}`}>
      {/* Compact horizontal layout */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left section: Language indicator and audio controls */}
        <div className="flex items-center justify-between sm:justify-start sm:flex-shrink-0 sm:w-auto">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {selectedLanguage}
          </span>
          <div className="flex items-center space-x-2 ml-3">
            {audioError && (
              <span className="text-xs text-red-500 hidden sm:inline">Audio unavailable</span>
            )}
            <button
              onClick={isPlaying ? stopAudio : handlePlayAudio}
              disabled={isLoading}
              className={`
                p-1.5 rounded-full transition-all duration-200 flex-shrink-0
                ${isLoading 
                  ? 'bg-gray-100 cursor-not-allowed' 
                  : isPlaying 
                    ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                    : 'bg-blue-100 hover:bg-blue-200 text-blue-600'
                }
                ${audioError ? 'opacity-50' : ''}
              `}
              title={isPlaying ? 'Stop audio' : 'Play pronunciation'}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPlaying ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Original word */}
          <div className="min-w-0">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block">
              Original
            </label>
            <p className="text-lg sm:text-xl font-semibold text-gray-900 mt-0.5 truncate" title={wordData.word}>
              {wordData.word}
            </p>
          </div>

          {/* Translation */}
          <div className="min-w-0">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block">
              Translation
            </label>
            <p className="text-base sm:text-lg text-gray-700 mt-0.5 truncate" title={wordData.english}>
              {wordData.english}
            </p>
          </div>

          {/* Phonetic pronunciation */}
          {wordData.phonetic && (
            <div className="min-w-0 col-span-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block">
                Pronunciation
              </label>
              <p className="text-sm sm:text-base text-gray-600 font-mono mt-0.5 truncate" title={`/${wordData.phonetic}/`}>
                /{wordData.phonetic}/
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile audio error message */}
      {audioError && (
        <div className="mt-2 sm:hidden">
          <span className="text-xs text-red-500">Audio unavailable</span>
        </div>
      )}
    </div>
  );
};

export default Translation;
