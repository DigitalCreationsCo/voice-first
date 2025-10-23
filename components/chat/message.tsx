"use client";

import { motion } from "framer-motion";
import { BotIcon, UserIcon } from "../custom/icons";
import { Markdown } from "../custom/markdown";
import { PreviewAttachment } from "./preview-attachment";
import { PlayIcon, StarIcon, Volume2Icon } from "lucide-react";
import { Button } from "../ui/button";
import { UIMessage } from "@/lib/utils";
import Translation from "../language/translation";
import { useState, memo, useCallback } from "react";

// Memoized attachment preview list for performance
const MemoizedPreviewAttachmentList = memo(function MemoizedPreviewAttachmentList({
  attachments,
}: {
  attachments: Array<any>;
}) {
  return (
    <div className="flex flex-row gap-2 mt-2">
      {attachments.map((attachment) => (
        <PreviewAttachment key={attachment.url} attachment={attachment} />
      ))}
    </div>
  );
});

const MemoizedTranslation = memo(Translation);

interface MessageComponentProps {
  chatId: string;
  message: UIMessage;
  toolInvocations?: Array<any>;
  attachments?: Array<any>;
  isPlayAudioDisabled: boolean;
  onPlayAudio: () => void;
  isCurrentlyPlaying: boolean;
}

const MessageComponent: React.FC<MessageComponentProps> = ({
  chatId,
  message,
  toolInvocations,
  attachments,
  isPlayAudioDisabled,
  onPlayAudio,
  isCurrentlyPlaying,
}) => {
  const [selectedWord, setSelectedWord] = useState<string>("");

  // Helper: get current scroll Y
  const getScrollY = () => {
    if (typeof window !== "undefined") return window.scrollY;
    return 0;
  };
  // Helper: set scroll Y
  const setScrollY = (y: number) => {
    if (typeof window !== "undefined") window.scrollTo({ top: y });
  };

  // Wrap click to prevent scroll/anchor focus jump on span/buttons
  const handleWordClick = useCallback(
    (word: string, e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        const y = getScrollY();
        setSelectedWord(word);
        setTimeout(() => setScrollY(y), 0);
      } else {
        setSelectedWord(word);
      }
    },
    []
  );

  // Prevent scroll jumping for play audio button and icon wrappers
  const handlePlayAudioClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const y = getScrollY();
    onPlayAudio();
    setTimeout(() => setScrollY(y), 0);
  };

  return (
    <motion.div
      className="max-w-2xl w-full md:px-0 px-4 first-of-type:pt-20 flex justify-start"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <div
        className={`inline-flex flex-col items-start min-w-[120px] max-w-2xl w-fit relative p-3 rounded-lg leading-relaxed
          ${message.role === "user"
            ? "bg-blue-500 text-white ml-auto self-end"
            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 self-start w-full"
          }`}
      >
        <div
          className={`flex flex-col w-full items-start whitespace-pre-line
          ${message.role === "assistant"
            ? "self-start"
            : "self-end"
          }`}
        >
          <span
            className={`flex-shrink-0 w-5 h-5 border-[1.6px] rounded-sm p-0.5 overflow-clip
              ${message.role === "assistant"
                ? "self-start text-zinc-500 border-zinc-500"
                : "self-end ml-2 text-zinc-300 border-zinc-300"
              }`}
          >
            {message.role === "assistant" ? <BotIcon /> : <UserIcon />}
          </span>
          <Markdown
            selectedWord={selectedWord}
            translations={message.translations}
            onWordClick={(word: string, e?: React.MouseEvent) =>
              handleWordClick(word, e)
            }
          >
            {message.content}
          </Markdown>
        </div>

        {message.role === "assistant" && message.audioData && (
          <div className="flex justify-end items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePlayAudioClick}
              disabled={isPlayAudioDisabled}
              className="text-xs"
              tabIndex={0}
              type="button"
            >
              {isCurrentlyPlaying ? (
                <Volume2Icon size={14} />
              ) : (
                <PlayIcon size={14} />
              )}
            </Button>
          </div>
        )}

        {Number(message.languageRating) ? (
          <div className="flex self-end items-center gap-1">
            <StarIcon className="fill-yellow-500" size={12} />
            <p className="text-sm">{message.languageRating}</p>
          </div>
        ) : null}

        {attachments && (
          <MemoizedPreviewAttachmentList attachments={attachments} />
        )}

        {message.role === "assistant" &&
          message.translations &&
          selectedWord && (
            <MemoizedTranslation
              translations={message.translations}
              selectedWord={selectedWord}
              selectedLanguage={"German"}
            />
          )}
      </div>
    </motion.div>
  );
};

interface MemoizedMessageProps {
  chatId: string;
  message: UIMessage;
  isPlayAudioDisabled: boolean;
  onPlayAudio: () => void;
  isCurrentlyPlaying: boolean;
  onInteractive?: (e?: React.SyntheticEvent | Event) => void;
}

export const Message = memo(
  function MemoizedMessage({
    chatId,
    message,
    isPlayAudioDisabled,
    onPlayAudio,
    isCurrentlyPlaying,
    onInteractive,
  }: MemoizedMessageProps) {
    // You may want to pass onInteractive to subcomponents for user click handling
    return (
      <MessageComponent
        chatId={chatId}
        message={message}
        isPlayAudioDisabled={isPlayAudioDisabled}
        onPlayAudio={onPlayAudio}
        isCurrentlyPlaying={isCurrentlyPlaying}
        // toolInvocations, attachments, etc, can be added as needed
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.message === nextProps.message &&
    prevProps.isPlayAudioDisabled === nextProps.isPlayAudioDisabled &&
    prevProps.isCurrentlyPlaying === nextProps.isCurrentlyPlaying
);