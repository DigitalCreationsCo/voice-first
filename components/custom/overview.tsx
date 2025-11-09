import { useState } from "react";
import { motion } from "framer-motion";
import { BotIcon, MessageIcon } from "./icons";
import { FlagIcon, FlagIconCode } from "react-flag-kit";
import { Button } from "../ui/button";

interface LanguageConfig {
  code: string;
  language: string;
  flag?: string;
  instructor?: {
    name: string;
  };
}

const languagesAndInstructors: LanguageConfig[] = [
  {
    code: "DE",
    language: "German",
  },
  // Add more languages for better UX:
  {
    code: "FR",
    language: "French",
  },
  {
    code: "ES",
    language: "Spanish",
  },
  {
    code: "IT",
    language: "Italian",
  },
  {
    code: "JP",
    language: "Japanese",
  },
];

export const Overview = ({
  launchConversation,
}: {
  launchConversation: (args: any) => void;
}) => {
  const [selectedLang, setSelectedLang] = useState<string | null>(null);

  // Helpful hint on hover or selection
  const getSubtitle = () => {
    if (!selectedLang) return "Choose a language to get started";
    const lang = languagesAndInstructors.find((l) => l.code === selectedLang);
    return `Start chatting in ${lang?.language}`;
  };

  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mt-20 mx-4 md:mx-0 cursor-default"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.25 }}
    >
      <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-4 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700 shadow-lg">
        <p className="flex flex-row justify-center gap-2 items-center text-lg mb-2">
          <span className="w-5 h-5 border-[1.6px] rounded-sm p-0.5 overflow-clip border-zinc-500 text-zinc-500 dark:text-zinc-400 flex items-center justify-center">
            <BotIcon />
          </span>
          <MessageIcon size={20} />{" "}
          <span className="font-semibold text-zinc-700 dark:text-zinc-200">
            Say Hi to Chatter
          </span>
        </p>
        <p className="whitespace-pre-wrap text-center text-base text-zinc-700 dark:text-zinc-200 leading-relaxed">
          {`Chatter is a voice-first assistant for learning languages. \nTalk or type to start a conversation.`}
        </p>
      </div>
      <div className="flex flex-col items-center mt-8">
        <p className="text-sm font-medium text-center mb-3 text-zinc-700 dark:text-zinc-200 transition-colors">
          {getSubtitle()}
        </p>
        <div className="flex flex-row flex-wrap justify-center mt-1 mb-2">
          {languagesAndInstructors.map((l) => (
            <Flag
              key={`flag-${l.code}`}
              code={l.code}
              language={l.language}
              selected={selectedLang === l.code}
              onPress={() => {
                setSelectedLang(l.code);
                setTimeout(() => launchConversation(l.language), 250);
              }}
              onHover={() => setSelectedLang(l.code)}
              onBlur={() => setSelectedLang(null)}
            />
          ))}
        </div>
        <span className="mt-3 text-xs text-center text-zinc-400 dark:text-zinc-500">
          You can always change your language later.
        </span>
      </div>
    </motion.div>
  );
};

function Flag({
  code,
  language,
  selected,
  onPress,
  onHover,
  onBlur,
}: {
  code: string;
  language: string;
  selected?: boolean;
  onPress: any;
  onHover?: () => void;
  onBlur?: () => void;
}) {
  return (
    <Button
      onClick={onPress}
      onMouseEnter={onHover}
      onMouseLeave={onBlur}
      onFocus={onHover}
      onBlur={onBlur}
      className={`border-none h-fit shadow-sm border-[1.5px] ${
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/70 text-blue-700 dark:text-blue-200"
          : "border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-800 dark:text-zinc-300"
      } rounded-lg px-6 pt-2 pb-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex flex-col items-center gap-2 min-w-[68px] focus-visible:ring-2 focus-visible:ring-blue-400`}
      style={{
        transform: selected ? "scale(1.08)" : undefined,
        boxShadow: selected
          ? "0 0 0 2px #3b82f6, 0 1px 4px 0 rgba(0,0,0,.04)"
          : undefined,
      }}
      tabIndex={0}
      aria-label={`Choose ${language}`}
    >
      <FlagIcon code={code as FlagIconCode} size={38} />
      <span>{language}</span>
    </Button>
  );
}