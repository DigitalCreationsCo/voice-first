import { TranslationData } from "@/lib/utils";
import Link from "next/link";
import React, { memo, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ClickableWord = memo(
  ({
    word,
    onWordClick,
    children,
  }: {
    word: string;
    onWordClick: (word: string) => void;
    children: string;
  }) => (
    <span
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onWordClick(word);
      }}
      className="cursor-pointer text-blue-600 hover:text-blue-800 underline dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </span>
  )
);

ClickableWord.displayName = "ClickableWord";

// Tokenize English words with punctuation, keep punctuation as separate tokens
const WORD_TOKENIZE_REGEX = /([a-zA-ZÀ-ÿ0-9'-]+|[.,!?;:]|\s+)/g;

// Clean a word by trimming and lowercasing, for translation lookup
const normalizeWord = (w: string) =>
  w
    .toLocaleLowerCase()
    .replace(/^[.,!?;:]+|[.,!?;:]+$/g, "") // remove leading/trailing punctuation
    .trim();

export const NonMemoizedMarkdown = ({
  translations,
  selectedWord,
  onWordClick,
  children,
}: {
  translations?: Record<string, TranslationData>;
  selectedWord: string;
  onWordClick: (word: string) => void;
  children: string;
}) => {
  const processText = useCallback(
    (text: string) => {
      if (!translations) return text;
      const tokens = text.match(WORD_TOKENIZE_REGEX);

      if (!tokens) return text;

      return tokens.map((token, index) => {
        const isInvalidToken = /^\s+$/.test(token) || /^[.,!?;:]$/.test(token)
        if (isInvalidToken) {
          return token;
        }
        const lookup = normalizeWord(token);
        if (lookup && translations[lookup]) {
          return (
            <ClickableWord
              key={`${selectedWord}-${index}`}
              word={lookup}
              onWordClick={onWordClick}
            >
              {token}
            </ClickableWord>
          );
        }
        return token;
      });
    },
    [translations, onWordClick, selectedWord]
  );

  const components = useMemo(
    () => ({
      p: ({ children }: any) => {
        const processedContent = React.Children.toArray(children).map((child, idx) => {
          if (typeof child === "string") {
            return <React.Fragment key={idx}>{processText(child)}</React.Fragment>;
          }
          return child;
        });

        return <p>{processedContent}</p>;
      },
      code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        return !inline && match ? (
          <pre
            {...props}
            className={`${className} text-sm w-[80dvw] md:max-w-[500px] overflow-x-scroll bg-zinc-100 p-3 rounded-lg mt-2 dark:bg-zinc-800`}
          >
            <code className={match[1]}>{children}</code>
          </pre>
        ) : (
          <code
            className={`${className} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
            {...props}
          >
            {children}
          </code>
        );
      },
      ol: ({ node, children, ...props }: any) => (
        <ol className="list-decimal list-outside ml-4" {...props}>
          {children}
        </ol>
      ),
      li: ({ node, children, ...props }: any) => (
        <li className="" {...props}>
          {children}
        </li>
      ),
      ul: ({ node, children, ...props }: any) => (
        <ul className="list-disc list-outside ml-4" {...props}>
          {children}
        </ul>
      ),
      strong: ({ node, children, ...props }: any) => (
        <span className="font-semibold" {...props}>
          {children}
        </span>
      ),
      a: ({ node, children, ...props }: any) => (
        <Link
          className="text-blue-500 hover:underline"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </Link>
      ),
    }),
    [processText]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.translations === nextProps.translations &&
    prevProps.selectedWord === nextProps.selectedWord &&
    prevProps.onWordClick === nextProps.onWordClick
);
