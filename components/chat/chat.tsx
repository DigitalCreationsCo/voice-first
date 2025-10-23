"use client";

import { Overview } from "../custom/overview";
import React, {
  useRef,
  useEffect,
  useCallback,
  useReducer,
  memo
} from "react";
import { toast } from "sonner";
import {
  buildUIMessage, generateMessageId, getWebSocketUrl, TranslationData, UIMessage
} from "@/lib/utils";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { ChatWebSocketClient } from "@/lib/socket";
import { Message } from "./message";
import { MultimodalInput } from "./multimodal-input";
import { AudioDebugger, AudioFormat, TTSDebugLogger } from "@/lib/audio/helpers";

/**
 * Performance/memo improvements & scroll-to-bottom bugfix rationale:
 *  1. Memoize Message so that it only re-renders when its props (the message object) actually change.
 *     This is the most important step: if a Message never re-renders due to an unrelated component rerender,
 *     then clicking inside it will not affect parent scroll position.
 *  2. Use React.useCallback for play/stop handlers to avoid remounting child functions.
 *  3. Pass only what is strictly needed to Message via props to limit unnecessary props references.
 *  4. Only re-render <MessagesList /> when messages change, not parent states.
 *  5. (Other ideas at bottom of file.)
 */

type State = {
  messages: UIMessage[];
  input: string;
  isConnected: boolean;
  error: string;
  isLoading: boolean;
  attachments: Array<any>;
};
type Actions =
  | { type: 'setMessages', payload: UIMessage[] }
  | { type: 'addMessage', payload: UIMessage }
  | { type: 'updateMessage', id: string, updater: (msg: UIMessage) => UIMessage }
  | { type: 'setInput', payload: string }
  | { type: 'setIsConnected', payload: boolean }
  | { type: 'setError', payload: string }
  | { type: 'setIsLoading', payload: boolean }
  | { type: 'setAttachments', payload: any[] };

function stateReducer(state: State, action: Actions): State {
  switch (action.type) {
    case 'setMessages': return { ...state, messages: action.payload };
    case 'addMessage': return { ...state, messages: [...state.messages, action.payload] };
    case 'updateMessage':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? action.updater(m) : m
        ),
      };
    case 'setInput': return { ...state, input: action.payload };
    case 'setIsConnected': return { ...state, isConnected: action.payload };
    case 'setError': return { ...state, error: action.payload };
    case 'setIsLoading': return { ...state, isLoading: action.payload };
    case 'setAttachments': return { ...state, attachments: action.payload };
    default: return state;
  }
}

// ----------- Memoized MessageList --------------
interface MessageListProps {
  messages: UIMessage[];
  chatId: string;
  playMessageAudio: (audio: string, id: string) => void;
  stopPlayback: () => void;
  isPlaying: boolean;
  currentlyPlayingMessageId: string | null;
  handleChildInteractiveClick: (e?: React.SyntheticEvent | Event) => void;
}
const MessageList = memo(function MessageList({
  messages,
  chatId,
  playMessageAudio,
  stopPlayback,
  isPlaying,
  currentlyPlayingMessageId,
  handleChildInteractiveClick
}: MessageListProps) {
  // Callback is memoized so Message also won't re-render due to parent handler changes
  const handlePlayAudio = useCallback(
    (audioData: string, msgId: string) => () => {
      if (currentlyPlayingMessageId === msgId && isPlaying) {
        stopPlayback();
      } else if (audioData) {
        playMessageAudio(audioData, msgId);
      }
    },
    [currentlyPlayingMessageId, isPlaying, playMessageAudio, stopPlayback]
  );

  return (
    <>
      {messages.map((message) => (
        <Message
          key={message.id}
          chatId={chatId}
          message={message}
          isPlayAudioDisabled={isPlaying && currentlyPlayingMessageId !== message.id}
          onPlayAudio={handlePlayAudio(message.audioData!, message.id)}
          isCurrentlyPlaying={currentlyPlayingMessageId === message.id && isPlaying}
          onInteractive={handleChildInteractiveClick}
        />
      ))}
    </>
  );
});

export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
}) {
  const [state, dispatch] = useReducer(stateReducer, {
    messages: initialMessages,
    input: '',
    isConnected: false,
    error: '',
    isLoading: false,
    attachments: [],
  });

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const autoScrollToBottomRef = useRef(true);

  const scrollToBottom = React.useCallback(() => {
    if (!autoScrollToBottomRef.current) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const lastMessagesLengthRef = useRef(state.messages.length);
  React.useEffect(() => {
    if (state.messages.length > lastMessagesLengthRef.current) {
      autoScrollToBottomRef.current = true;
      scrollToBottom();
    }
    lastMessagesLengthRef.current = state.messages.length;
  }, [state.messages.length, scrollToBottom]);

  const lastIsLoadingRef = useRef(state.isLoading);
  React.useEffect(() => {
    if (lastIsLoadingRef.current && !state.isLoading) {
      autoScrollToBottomRef.current = true;
      scrollToBottom();
    }
    lastIsLoadingRef.current = state.isLoading;
  }, [state.isLoading, scrollToBottom]);

  const handleChildInteractiveClick = React.useCallback((e?: React.SyntheticEvent | Event) => {
    autoScrollToBottomRef.current = false;
  }, []);

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

  // Stable callbacks
  const setInput = useCallback((value: string) => dispatch({ type: 'setInput', payload: value }), []);
  const setAttachments = useCallback((value: any[]) => dispatch({ type: 'setAttachments', payload: value }), []);

  useEffect(() => {
    const wsUrl = getWebSocketUrl()
    const client = new ChatWebSocketClient(wsUrl);
    client.setConnectionChangeCallback((connected) => {
      dispatch({ type: 'setIsConnected', payload: connected });
      if (!connected) {
        dispatch({ type: 'setError', payload: 'Disconnected from server. Reconnecting...' });
      } else {
        dispatch({ type: 'setError', payload: '' });
      }
    });

    client.connect()
      .then(() => {
        console.log('Connected successfully');
        clientRef.current = client;
      })
      .catch((err) => {
        console.error('Connection failed:', err);
        dispatch({ type: 'setError', payload: 'Failed to connect to chat server' });
      });

    return () => {
      client.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isPlaying && isListening && interimTranscript) {
      console.info('User input detected. Interrupting audio playback.')
      stopPlayback();
    }
  }, [isPlaying, isListening, interimTranscript, stopPlayback]);

  const handleSubmitMessageRef = useRef<any>();
  useEffect(() => { handleSubmitMessageRef.current = handleSubmitMessage; });
  useEffect(() => {
    if (isListening && transcript && !state.isLoading) {
      handleSubmitMessageRef.current(transcript, true);
    }
  }, [transcript, isListening, state.isLoading]);

  const stop = useCallback(() => {
    dispatch({ type: 'setIsLoading', payload: false });
    stopListening();
    stopPlayback();
    stopRequest(currentlyPlayingMessageId!);
  }, [stopListening, stopPlayback, stopRequest, currentlyPlayingMessageId]);

  const handleSubmitMessage = useCallback(async (text: string, isAudio = false) => {
    if (!text.trim() || state.isLoading || !clientRef.current?.isConnected) return;

    const userMessageId = generateMessageId();
    const assistantMessageId = generateMessageId();

    const userMessage = buildUIMessage({ id: userMessageId, role: "user", content: text, isAudio });
    const updatedMessages = [...state.messages, userMessage];
    dispatch({ type: 'setMessages', payload: updatedMessages });

    dispatch({ type: 'setInput', payload: '' });
    dispatch({ type: 'setIsLoading', payload: true });
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

          dispatch({ type: 'setIsLoading', payload: true });
          dispatch({
            type: 'updateMessage',
            id: assistantMessageId,
            updater: (msg: UIMessage) =>
              ({ ...msg, content: (msg.content ?? '') + textChunk }),
          });
          if (!state.messages.some(m => m.id === assistantMessageId)) {
            dispatch({ type: 'addMessage', payload: buildUIMessage({ id: assistantMessageId, role: 'assistant', content: textChunk }) });
          }
        },

        onComplete: (fullResponse, message) => {
          TTSDebugLogger.logStage(chatRequestId, 'Text generation complete', {
            fullResponseLength: fullResponse.length,
            preview: fullResponse.substring(0, 100),
            message: message
          });

          let { metadata } = message;
          let { rating, difficulty, translations } = metadata;

          if (typeof translations === 'string' && translations.trim().length > 0) {
            try {
              const parsedTranslations = JSON.parse(translations);
              if (
                parsedTranslations &&
                typeof parsedTranslations === 'object' &&
                !Array.isArray(parsedTranslations) &&
                Object.keys(parsedTranslations).length > 0
              ) {
                translations = parsedTranslations as TranslationData;
              } else {
                translations = undefined;
              }
            } catch {
              translations = undefined;
            }
          } else if (
            !translations ||
            typeof translations !== 'object' ||
            Array.isArray(translations) ||
            Object.keys(translations).length === 0
          ) {
            translations = undefined;
          }

          if (!Number.isNaN(rating)) {
            dispatch({
              type: 'updateMessage',
              id: userMessageId,
              updater: (msg: UIMessage) =>
                ({ ...msg, languageRating: rating }),
            });
          }

          setTranscript('');
          dispatch({ type: 'setIsLoading', payload: false });

          TTSDebugLogger.logStage(chatRequestId, 'Sending TTS request');
          const ttsRequestId = clientRef.current?.sendTTSRequest(
            fullResponse,
            0,
            chatRequestId
          );
          TTSDebugLogger.updateSession(chatRequestId, { ttsRequestId });

          dispatch({
            type: 'updateMessage',
            id: assistantMessageId,
            updater: (msg: UIMessage) =>
              ({ ...msg, content: fullResponse, translations }),
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

            dispatch({
              type: 'updateMessage',
              id: assistantMessageId,
              updater: (msg: UIMessage) =>
                ({ ...msg, audioData: fullAudio }),
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

          dispatch({ type: 'setError', payload: errorMsg });
          dispatch({ type: 'setIsLoading', payload: false });
          setTranscript('');
        }
      });
    } catch (err: any) {
      console.error('Submit message error:', err);
      dispatch({ type: 'setError', payload: err.message || 'Failed to send message' });
      dispatch({ type: 'setIsLoading', payload: false });
    }
  }, [enqueueAudioChunk, markRequestComplete, setTranscript, setAllowConcurrentRequests, state.messages, state.isLoading]);

  const handleStartListening = useCallback(() => {
    try {
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
      });

      dispatch({ type: 'addMessage', payload: firstAssistantMessage });
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

              dispatch({
                type: 'updateMessage',
                id: assistantMessageId,
                updater: (msg: UIMessage) =>
                  ({ ...msg, audioData: fullAudio }),
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

            dispatch({ type: 'setError', payload: errorMsg });
            dispatch({ type: 'setIsLoading', payload: false });
            setTranscript('');
          }
        }
      );
    } catch (err: any) {
      console.error('Launch language conversation error:', err);
      dispatch({ type: 'setError', payload: err.message || 'Failed to launch language conversation' });
      dispatch({ type: 'setIsLoading', payload: false });
    }
  }, [markRequestComplete, enqueueAudioChunk, setTranscript, setAllowConcurrentRequests]);

  // ----- Memoized input, interim, loading, overview -----
  const renderedInterimTranscript = React.useMemo(() => (
    interimTranscript ? (
      <div className="w-full max-w-2xl px-4">
        <div className="flex justify-end">
          <div className="max-w-[80%] p-3 rounded-lg bg-blue-400 text-white opacity-70">
            <p className="">{interimTranscript}</p>
            <div className="text-xs mt-1">Speaking...</div>
          </div>
        </div>
      </div>
    ) : null
  ), [interimTranscript]);

  const renderedLoading = React.useMemo(() => (
    state.isLoading ? (
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
    ) : null
  ), [state.isLoading]);

  const renderedOverview = React.useMemo(() =>
    state.messages.length === 0 ? <Overview launchConversation={launchLanguageConversation} /> : null,
    [state.messages.length, launchLanguageConversation]
  );

  const renderedInput = React.useMemo(() => (
    <MultimodalInput
      input={state.input}
      setInput={setInput}
      isLoading={state.isLoading}
      stop={stop}
      attachments={state.attachments}
      setAttachments={setAttachments}
      messages={state.messages}
      handleSubmitMessage={handleSubmitMessage}
      isListening={isListening}
      handleStartListening={handleStartListening}
      handleStopListening={handleStopListening}
      interimTranscript={interimTranscript}
      isPlaying={isPlaying}
    />
  ), [
    state.input, setInput, state.isLoading, stop, state.attachments,
    setAttachments, state.messages, handleSubmitMessage,
    isListening, handleStartListening, handleStopListening, interimTranscript, isPlaying
  ]);

  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="shrink-0 flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {state.messages.length === 0 && renderedOverview}

          <MessageList
            messages={state.messages}
            chatId={id}
            playMessageAudio={playMessageAudio}
            stopPlayback={stopPlayback}
            isPlaying={isPlaying}
            currentlyPlayingMessageId={currentlyPlayingMessageId}
            handleChildInteractiveClick={handleChildInteractiveClick}
          />

          {renderedInterimTranscript}

          {renderedLoading}

          <div
            ref={messagesEndRef}
            className="shrink-0 min-w-[24px] min-h-[24px]"
          />
        </div>

        <form className="flex flex-row gap-2 relative items-end w-full md:max-w-[500px] max-w-[calc(100dvw-32px)] px-4 md:px-0">
          {renderedInput}
        </form>
        <div className="bg-primary min-h-[2000px] w-full">
          hello
        </div>
      </div>
    </div>
  );
}

/**
 * Additional possible improvements to further control scroll behavior:
 * - If message content changes but the size (height) of the container does not, do not call scrollToBottom().
 * - Use ResizeObserver on messagesEndRef/messagesContainerRef and log heights before/after change before re-scrolling.
 * - You may choose to only auto-scroll if (messagesEndRef.offsetTop - scrollTop) is within 100px of the previous bottom (i.e., "stick to bottom" only if user was at bottom).
 * - For the most robust fix, ensure all logic which causes scrollToBottom() only runs on actual new message/assistant reply insertions, not on translation expansion events within Message.
 * - If subcomponents (like translation expand/collapse UI) are lifting state up, keep those state fields inside the memoized Message component or even in local state only, not in Chat parent.
 */

