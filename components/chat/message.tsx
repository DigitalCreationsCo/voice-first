"use client";

import { motion } from "framer-motion";
import { BotIcon, UserIcon } from "../custom/icons";
import { Markdown } from "../custom/markdown";
import { PreviewAttachment } from "./preview-attachment";
import { PlayIcon, Square, StarIcon, Volume2Icon } from "lucide-react";
import { Button } from "../ui/button";
import { UIMessage } from "@/lib/utils";
// import { Weather } from "../custom/weather";
// import { AuthorizePayment } from "../flights/authorize-payment";
// import { DisplayBoardingPass } from "../flights/boarding-pass";
// import { CreateReservation } from "../flights/create-reservation";
// import { FlightStatus } from "../flights/flight-status";
// import { ListFlights } from "../flights/list-flights";
// import { SelectSeats } from "../flights/select-seats";
// import { VerifyPayment } from "../flights/verify-payment";

export const Message = ({
  chatId,
  message,
  toolInvocations,
  attachments,
  isPlayAudioDisabled,
  onPlayAudio,
  isCurrentlyPlaying
}: {
  chatId: string;
  message: UIMessage;
  toolInvocations?: Array<any> | undefined;
  attachments?: Array<any>;
  isPlayAudioDisabled: boolean;
  onPlayAudio: () => void;isCurrentlyPlaying: boolean;
}) => {
  return (
    <motion.div
      className="max-w-2xl w-full md:px-0 px-4 first-of-type:pt-20 flex justify-start"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <div
        className={`inline-flex flex-col items-start min-w-[120px] max-w-2xl w-fit relative p-3 rounded-lg leading-relaxed
          ${message.role === 'user'
            ? 'bg-blue-500 text-white ml-auto self-end'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 self-start'
          }`}
      >
        <div className={`flex flex-col w-full items-start whitespace-pre-line
          ${message.role === 'assistant'
            ? 'self-start'
            : 'self-end'
          }`}>
          <span
            className={`flex-shrink-0 w-5 h-5 border-[1.6px] rounded-sm p-0.5 mr-2 overflow-clip
              ${message.role === 'assistant'
                ? 'self-start text-zinc-500 border-zinc-500'
                : 'self-end ml-2 text-zinc-300 border-zinc-300'
              }`}
          >
            {message.role === 'assistant' ? <BotIcon /> : <UserIcon />}
          </span>
        <Markdown>{message.content}</Markdown>
        </div>

        {message.role === 'assistant' && message.audioData && (
          <div className="flex justify-end items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onPlayAudio}
              disabled={isPlayAudioDisabled}
              className="text-xs"
            >
              {isCurrentlyPlaying ? <Volume2Icon size={14} /> : <PlayIcon size={14} />}
            </Button>
          </div>
        )}
        
        {message.languageRating && (
          <div className="flex self-end items-center gap-1">
            <StarIcon className="fill-yellow-500" size={12} />
            <p className='text-sm'>
              {message.languageRating}
            </p>
          </div>
        )}

        {attachments && (
          <div className="flex flex-row gap-2 mt-2">
            {attachments.map((attachment) => (
              <PreviewAttachment key={attachment.url} attachment={attachment} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

