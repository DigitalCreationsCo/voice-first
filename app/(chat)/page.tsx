import { Chat } from "@/components/chat/chat";
import { generateMessageId, UIMessage } from "@/lib/utils";

const initialMessages:UIMessage[] = [
  // {
  //   "id": "49dece18-9b65-4b7b-ad95-35fef1339c35",
  //   "role": "assistant",
  //   "content": "Ah, öffentliches Reden! Ein sehr interessantes und nützliches Thema. Hast du bereits Erfahrung damit, oder möchtest du dich darauf vorbereiten? Was genau interessiert dich daran?",
  //   "timestamp": 1759561152626,
  //   "isAudio": false,
  //   translations: {
  //     öffentliches: {
  //       word: "öffentliches",
  //       language: "German",
  //       translation: "public",
  //       phonetic: "UH-fent-likh-es",
  //       audioUrl: "https://dictionary.audio/public_de.mp3"
  //     },
  //     bereits: {
  //       word: "bereits",
  //       language: "German",
  //       translation: "already",
  //       phonetic: "beh-RYTS",
  //       audioUrl: "https://dictionary.audio/already_de.mp3"
  //     },
  //     möchtest: {
  //       word: "möchtest",
  //       language: "German",
  //       translation: "would like",
  //       phonetic: "MURKH-test",
  //       audioUrl: "https://dictionary.audio/wouldlike_de.mp3"
  //     },
  //     vorbereiten: {
  //       word: "vorbereiten",
  //       language: "German",
  //       translation: "to prepare",
  //       phonetic: "FOR-beh-ry-ten",
  //       audioUrl: "https://dictionary.audio/prepare_de.mp3"
  //     },
  //   }
  // },
];

export default async function Page() {
  const id = generateMessageId();
  return (
    <Chat key={id} id={id} initialMessages={initialMessages} />
  )
}