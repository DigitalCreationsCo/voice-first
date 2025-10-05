"use client";

import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { Overview } from "../custom/overview";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
import { toast } from "sonner";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "../custom/icons";
import { PreviewAttachment } from "./preview-attachment";
import useWindowSize from "../../hooks/use-window-size";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { buildUIMessage, decode, generateMessageId, getWebSocketUrl, UIMessage } from "@/lib/utils";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { PlayIcon, Square, Volume2 } from "lucide-react";
import { ChatWebSocketClient } from "@/lib/socket";
import { convertInt16ToFloat32 } from "@/lib/speech-recognition-manager";
import { Message } from "./message";
import { MultimodalInput } from "./multimodal-input";

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
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages);

    setInput('');
    setIsLoading(true);
    setAllowConcurrentRequests(true);

    try {
      const chatRequestId = clientRef.current.sendChatMessage(updatedMessages, {
        onStreamStart: (message) => {
          console.log('Chat stream started');
        },

        onChunk: async (requestId, textChunk, chunkIndex) => {
          console.info('Chat chunk: ', textChunk);
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
          console.log('onComplete full response: ', fullResponse);
          setTranscript('');
          setIsLoading(false);

          clientRef.current?.sendTTSRequest(
            fullResponse, 
            0, 
            chatRequestId
          )

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
          console.log('TTS stream started ', message);
        },
        onTTSChunk(requestId, audioChunk, audioChunkIndex) {
          console.log('TTS Chunk received:', {
            requestId,
            audioChunkIndex,
            audioDataLength: audioChunk?.length
          });
          
          const decoded = decode(audioChunk);
          console.log('Decoded audio length:', decoded.length);
          
          enqueueAudioChunk(
            requestId, 
            audioChunkIndex,
            decode(audioChunk),
            assistantMessageId
          );
        },

        onTTSComplete(requestId, fullAudio, chunkIndex) {
          console.log('TTS complete for request: ', requestId);
          markRequestComplete(chatRequestId);

          setMessages(prev => {
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && msg.id === assistantMessageId)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, audioData: decode(fullAudio) },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [...prev];
          });
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setIsLoading(false);
          setTranscript('');
        }
      });
    } catch (err: any) {
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

  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="flex flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {messages.length === 0 && <Overview />}
          
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

