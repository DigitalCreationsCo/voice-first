"use client";

import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { Overview } from "../custom/overview";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import { toast } from "sonner";
import { buildUIMessage, generateMessageId, getWebSocketUrl, UIMessage } from "@/lib/utils";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { ChatWebSocketClient } from "@/lib/socket";
import { Message } from "./message";
import { MultimodalInput } from "./multimodal-input";
import { AudioConverter, AudioDebugger, AudioFormat, TTSDebugLogger } from "@/lib/audio/helpers";

export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<any>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const clientRef = useRef<ChatWebSocketClient | null>(null);

  const {
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
  } = useAudioManager();

  useEffect(() => {
    const wsUrl = getWebSocketUrl()
    const client = new ChatWebSocketClient(wsUrl);
    
    client.setConnectionChangeCallback((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setError('Disconnected from server. Reconnecting...');
      } else {
        setError('');
      }
    });

    client.connect()
      .then(() => {
        console.log('Connected successfully');
        clientRef.current = client;
      })
      .catch((err) => {
        console.error('Connection failed:', err);
        setError('Failed to connect to chat server');
      });

    return () => {
      client.disconnect();
    };
  }, []);

  // Auto-stop playback when voice input
  useEffect(() => {
    if (isPlaying && isListening && interimTranscript) {
      console.info('User input detected. Interrupting audio playback.')
      stopPlayback();
    }
  }, [isPlaying, isListening, interimTranscript])

  // Handle final transcript from voice input
  useEffect(() => {
    if (isListening && transcript && !isLoading) {
      handleSubmitMessage(transcript, true);
    }
  }, [transcript]);

  const stop = useCallback(() => {
    setIsLoading(false);
    stopListening();
    stopPlayback();
    stopRequest(currentlyPlayingMessageId!);
  }, [stopListening, stopPlayback]);

  const handleSubmitMessage = useCallback(async (text: string, isAudio = false) => {
    if (!text.trim() || isLoading || !clientRef.current?.isConnected) return;

    const userMessageId = generateMessageId();
    const assistantMessageId = generateMessageId();

    const userMessage = buildUIMessage({ id: userMessageId, role: "user", content: text, isAudio });
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    setInput('');
    setIsLoading(true);
    setAllowConcurrentRequests(true);

    try {
      const chatRequestId = clientRef.current.sendChatMessage(updatedMessages, {
        onStreamStart: (message) => {
          TTSDebugLogger.startSession(chatRequestId, assistantMessageId);
          TTSDebugLogger.logStage(chatRequestId, 'Chat stream started', { requestId: message.requestId });
        },

        onChunk: async (requestId, textChunk, chunkIndex) => {
          TTSDebugLogger.updateSession(chatRequestId, { 
            textChunksReceived: chunkIndex + 1 
          });
          TTSDebugLogger.logStage(chatRequestId, `Text chunk ${chunkIndex} received`, {
            length: textChunk.length,
            preview: textChunk.substring(0, 50)
          });

          setIsLoading(true);
          setMessages(prev => {
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && msg.id === assistantMessageId)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, content: assistantMessage.content + textChunk },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [
              ...prev, 
              buildUIMessage({ 
                id: assistantMessageId, 
                role: 'assistant', 
                content: textChunk 
              })
            ];
          });

        },

        onComplete: (fullResponse) => {
          TTSDebugLogger.logStage(chatRequestId, 'Text generation complete', {
            fullResponseLength: fullResponse.length,
            preview: fullResponse.substring(0, 100)
          });

          setTranscript('');
          setIsLoading(false);

          TTSDebugLogger.logStage(chatRequestId, 'Sending TTS request');
          const ttsRequestId = clientRef.current?.sendTTSRequest(
            fullResponse, 
            0, 
            chatRequestId
          );

          TTSDebugLogger.updateSession(chatRequestId, { ttsRequestId });

          setMessages(prev => {
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && msg.id === assistantMessageId)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, content: fullResponse },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [...prev];
          });
        },

        onTTSStreamStart(message) {
          TTSDebugLogger.logStage(chatRequestId, 'TTS stream started', message);
        },

        onTTSChunk(requestId, audioChunk, audioChunkIndex) {
          TTSDebugLogger.updateSession(chatRequestId, { 
            audioChunksReceived: audioChunkIndex + 1 
          });

          console.group(`📥 TTS Chunk ${audioChunkIndex}`);
          TTSDebugLogger.logStage(chatRequestId, `Audio chunk ${audioChunkIndex} received`, {
            requestId,
            base64Length: audioChunk?.length,
            chunkIndex: audioChunkIndex
          });
          
          try {
            if (!AudioDebugger.validate(audioChunk, AudioFormat.BASE64_STRING)) {
              throw new Error('Invalid base64 audio data');
            }
            
            AudioDebugger.log('Raw audio chunk', audioChunk, AudioFormat.BASE64_STRING, {
              chunkIndex: audioChunkIndex,
              requestId
            });
  
            enqueueAudioChunk(
              requestId, 
              audioChunkIndex,
              audioChunk,
              assistantMessageId
            );

            TTSDebugLogger.logStage(chatRequestId, `Enqueued chunk ${audioChunkIndex} for playback`);
            console.groupEnd();
          } catch (error: any) {
            TTSDebugLogger.logError(chatRequestId, `Chunk ${audioChunkIndex} processing failed: ${error.message}`, {
              audioChunkIndex,
              error: error.stack
            });
            console.groupEnd();
            AudioDebugger.printSummary();
          }
        },

        onTTSComplete(requestId, fullAudio, totalChunks) {
          TTSDebugLogger.logStage(chatRequestId, 'TTS generation complete', {
            requestId,
            totalChunks,
            fullAudioLength: fullAudio?.length
          });
  
          console.group(`✅ TTS Complete`);

          try {
            markRequestComplete(chatRequestId);
            TTSDebugLogger.logStage(chatRequestId, 'Marked request complete in audio queue');

            setMessages(prev => {
              const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && msg.id === assistantMessageId)
              const assistantMessage = prev[assistantMessageIndex];
              
              if (assistantMessage) {
                TTSDebugLogger.logStage(chatRequestId, 'Stored full audio in message');
                return [
                  ...prev.slice(0, assistantMessageIndex), 
                  { ...assistantMessage, audioData: fullAudio },
                  ...prev.slice(assistantMessageIndex + 1), 
                ];
              }

              TTSDebugLogger.logError(chatRequestId, 'Assistant message not found when storing audio');
              return [...prev];
            });

            TTSDebugLogger.printSummary(chatRequestId);
            AudioDebugger.printSummary();
            AudioDebugger.clearLogs();
            TTSDebugLogger.clearSession(chatRequestId);
            
            console.groupEnd();
          } catch (error: any) {
            TTSDebugLogger.logError(chatRequestId, `TTS complete processing failed: ${error.message}`, {
              error: error.stack
            });
            console.groupEnd();
          }
        },
        onError: (errorMsg) => {
          TTSDebugLogger.logError(chatRequestId, errorMsg);
          TTSDebugLogger.printSummary(chatRequestId);
          AudioDebugger.printSummary();

          setError(errorMsg);
          setIsLoading(false);
          setTranscript('');
        }
      });
    } catch (err: any) {
      console.error('Submit message error:', err);
      setError(err.message || 'Failed to send message');
      setIsLoading(false);
    }
  }, [messages, enqueueAudioChunk, markRequestComplete]);

  const handleStartListening = useCallback(() => {
    try {
      if (isPlaying) {
        toast.info('Please wait for audio to finish');
        return;
      }

      startListening();
    } catch (error: any) {
      console.error('Failed to start listening:', error);
      toast.error('An error occurred while initializing');
    }
  }, [isInitialized, isPlaying, startListening]);

  const handleStopListening = useCallback(() => {
    stopListening();
  }, [stopListening]);

  const launchLanguageConversation = useCallback((language: string) => {
    try {
      const assistantMessageId = generateMessageId();
      const content = "Hi! What would you like to discuss in " + language + "?";

      const firstAssistantMessage = buildUIMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: content
      })

      setMessages(prev => [...prev, firstAssistantMessage]);
      setAllowConcurrentRequests(true);

      const chatRequestId = '1'
      clientRef.current?.sendTTSRequest(
        content,
        0, 
        chatRequestId,
        {
          onTTSStreamStart(message) {
            TTSDebugLogger.startSession(chatRequestId, assistantMessageId);
            TTSDebugLogger.logStage(chatRequestId, 'TTS stream started', message);
          },

          onTTSChunk(requestId, audioChunk, audioChunkIndex) {
            TTSDebugLogger.updateSession(chatRequestId, { 
              audioChunksReceived: audioChunkIndex + 1 
            });
            TTSDebugLogger.logStage(chatRequestId, `Audio chunk ${audioChunkIndex} received`, {
              requestId,
              base64Length: audioChunk?.length,
              chunkIndex: audioChunkIndex
            });

            try {
              if (!AudioDebugger.validate(audioChunk, AudioFormat.BASE64_STRING)) {
                throw new Error('Invalid base64 audio data');
              }

              AudioDebugger.log('Raw audio chunk', audioChunk, AudioFormat.BASE64_STRING, {
                chunkIndex: audioChunkIndex,
                requestId
              });
    
              enqueueAudioChunk(
                chatRequestId,
                audioChunkIndex,
                audioChunk, 
                assistantMessageId
              );
              
              TTSDebugLogger.logStage(chatRequestId, `Enqueued chunk ${audioChunkIndex} for playback`);
              console.groupEnd();
            } catch (error: any) {
              TTSDebugLogger.logError(chatRequestId, `Chunk ${audioChunkIndex} processing failed: ${error.message}`, {
                audioChunkIndex,
                error: error.stack
              });
              console.groupEnd();
              AudioDebugger.printSummary();
            }
          },

          onTTSComplete(requestId, fullAudio, totalChunks) {
            TTSDebugLogger.logStage(chatRequestId, 'TTS generation complete', {
              requestId,
              totalChunks,
              fullAudioLength: fullAudio?.length
            });

            console.group(`✅ TTS Complete`);

            try {
              markRequestComplete(chatRequestId);
              TTSDebugLogger.logStage(chatRequestId, 'Marked request complete in audio queue');

              setMessages(prev => {
                const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && msg.id === assistantMessageId)
                const assistantMessage = prev[assistantMessageIndex];
                
                if (assistantMessage) {
                  TTSDebugLogger.logStage(chatRequestId, 'Stored full audio in message');
                  return [
                    ...prev.slice(0, assistantMessageIndex), 
                    { ...assistantMessage, audioData: fullAudio },
                    ...prev.slice(assistantMessageIndex + 1), 
                  ];
                }

                TTSDebugLogger.logError(chatRequestId, 'Assistant message not found when storing audio');
                return [...prev];
              });

              TTSDebugLogger.printSummary(chatRequestId);
              AudioDebugger.printSummary();
              AudioDebugger.clearLogs();
              TTSDebugLogger.clearSession(chatRequestId);

              console.groupEnd();
            } catch (error: any) {
              TTSDebugLogger.logError(chatRequestId, `TTS complete processing failed: ${error.message}`, {
                error: error.stack
              });
              console.groupEnd();
            }
          },
          onError: (errorMsg) => {
            TTSDebugLogger.logError(chatRequestId, errorMsg);
            TTSDebugLogger.printSummary(chatRequestId);
            AudioDebugger.printSummary();
    
            setError(errorMsg);
            setIsLoading(false);
            setTranscript('');
          }
        }
      );
    } catch (err: any) {
      console.error('Launch language conversation error:', err);
      setError(err.message || 'Failed to launch language conversation');
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="flex flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {messages.length === 0 && <Overview launchConversation={launchLanguageConversation} />}
          
          {/* Audiocontext initialized: {String(isInitialized)}
          <br/>
          Transcript(test): {transcript}
          <br/>
          Interim Transcript(test): {interimTranscript} */}

          {messages.map((message) => (
            <Message 
              key={message.id}
              chatId={id}
              message={message}
              isPlayAudioDisabled={isPlaying && currentlyPlayingMessageId !== message.id}
              onPlayAudio={() => 
                currentlyPlayingMessageId === message.id
                  ? stopPlayback()
                  : playMessageAudio(message.audioData!, message.id)}
              isCurrentlyPlaying={currentlyPlayingMessageId === message.id}
              // toolInvocations={message.toolInvocations}
              // attachments={message.attachments}
            />
          ))}

          {/* Show interim transcript */}
          {interimTranscript && (
            <div className="w-full max-w-2xl px-4">
              <div className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded-lg bg-blue-400 text-white opacity-70">
                  <p className="">{interimTranscript}</p>
                  <div className="text-xs mt-1">Speaking...</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="w-full max-w-2xl px-4">
              <div className="flex justify-center">
                <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            ref={messagesEndRef}
            className="shrink-0 min-w-[24px] min-h-[24px]"
          />
        </div>

        <form className="flex flex-row gap-2 relative items-end w-full md:max-w-[500px] max-w-[calc(100dvw-32px)] px-4 md:px-0">
          <MultimodalInput
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            handleSubmitMessage={handleSubmitMessage}
            isListening={isListening}
            handleStartListening={handleStartListening}
            handleStopListening={handleStopListening}
            interimTranscript={interimTranscript}
            isPlaying={isPlaying}
          />
        </form>
      </div>
    </div>
  );
}

