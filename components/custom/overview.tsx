import { motion } from "framer-motion";
import Link from "next/link";

import { LogoGoogle, MessageIcon, VercelIcon } from "./icons";

export const Overview = ({ launchConversation }: {
  launchConversation: (args: any) => void;
}) => {
  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mt-20 mx-4 md:mx-0"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-4 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700">
        <p className="flex flex-row justify-center gap-4 items-center text-zinc-900 dark:text-zinc-50">
          <MessageIcon /> Say Hi to Chatter
        </p>
        <p>
          Chatter is a voice-first language-learning app. Select an instructor or language to start conversating. Press the microphone button to speak — your instructor hears your voice, transcribes it in real time, and responds for a fluid, natural conversation experience.
        </p>
        <div>
          Select a language
          <div>
            {languagesAndInstructors.map(l => <Flag code={l.code} onPress={() => launchConversation(l.language)} />)}
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

function Flag ({ code, onPress }: { code: any; onPress: any }) {
  return (
  <Button onClick={onPress} className='hover:bg-transparent rounded-full bg-transparent'>
    <FlagIcon code={code} size={36} />
  </Button>
  )
};