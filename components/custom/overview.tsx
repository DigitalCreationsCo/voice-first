import { motion } from "framer-motion";
import Link from "next/link";

import { BotIcon, LogoGoogle, MessageIcon, VercelIcon } from "./icons";

export const Overview = ({ launchConversation }: {
  launchConversation: (args: any) => void;
}) => {
  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mt-20 mx-4 md:mx-0 cursor-default"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-4 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700">
        <p className="flex flex-row justify-center gap-2 items-center text-lg">
          <span className="w-5 h-5 border-[1.6px] rounded-sm p-0.5 overflow-clip border-zinc-500 dark:border-zinc-400">
            <BotIcon />
          </span>
          <MessageIcon size={20} /> Say Hi to Chatter
        </p>
        <p className="whitespace-pre-wrap">
          {`Chatter is a voice-first assistant for learning languages. 
Talk or type to start a conversation.`}
        </p>
        <div>
          <div>
            {languagesAndInstructors.map(l => 
              <Flag
              key={`flag-${l.code}`} 
              code={l.code} 
              language={l.language}
              onPress={() => launchConversation(l.language)} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface LanguageConfig {
  code: string;
  language: string;
  "instructor"?: {
    "name": string
  }
};

const languagesAndInstructors: LanguageConfig[] = [
  {
    code: 'DE',
    language: 'German',
  }
];

import { FlagIcon } from "react-flag-kit";
import { Button } from "../ui/button";

function Flag ({ code, language, onPress }: { 
  code: any; 
  language: any;
  onPress: any
}) {
  return (
  <Button onClick={onPress} className='h-fit border-none bg-transparent text-left border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 rounded-lg p-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex flex-col gap-2 rounded-full'>
    <FlagIcon code={code} size={36} />
    {language}
  </Button>
  )
};