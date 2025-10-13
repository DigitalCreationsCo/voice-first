import { LanguageName, TranslationData } from "@/lib/utils";
import Link from "next/link";
import React, { memo, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ClickableWord = memo(({ 
  word, 
  onWordClick, 
  children 
}: { 
  word: string; 
  onWordClick: (word: string) => void; 
  children: string;
}) => (
  <span
    onClick={() => onWordClick(word)}
    className="cursor-pointer text-blue-600 hover:text-blue-800 underline dark:text-blue-400 dark:hover:text-blue-300"
  >
    {children}
  </span>
));

ClickableWord.displayName = 'ClickableWord';

const WORD_SPLIT_REGEX = /(\s+|[.,!?;:])/;
const PUNCTUATION_REGEX = /[.,!?;:]/g;

const NonMemoizedMarkdown = ({ translations, wordKey, onWordClick, children }: { 
  translations?: Record<string, TranslationData>;
  wordKey: string;
  onWordClick: (word: string) => void;
  children: string;
}) => {
  const processText = useCallback((text: string) => {
    console.log('Markdown process text: ', text);
    if (!translations) return text;
    
    const parts = text.split(WORD_SPLIT_REGEX);
    
    return parts.map((part, index) => {
      if (!part || /^\s+$/.test(part) || /^[.,!?;:]+$/.test(part)) {
        return part;
      }
      
      const cleanWord = part.toLowerCase().replace(PUNCTUATION_REGEX, '');
      console.log('cleanWord: ', cleanWord);

      if (cleanWord && translations[cleanWord]) {
        console.log('Found word in translations: ', cleanWord);
        return (
          <ClickableWord
            key={`${wordKey}-${index}`}
            word={cleanWord}
            onWordClick={onWordClick}
          >
            {part}
          </ClickableWord>
        );
      }
      
      return part;
    });
  }, [translations, onWordClick, wordKey]);

  const components = useMemo(() => ({
    p: ({ children }: any) => {
      const processedContent = React.Children.toArray(children).map((child, idx) => {
        if (typeof child === 'string') {
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
  }), [processText]);

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
    prevProps.wordKey === nextProps.wordKey &&
    prevProps.onWordClick === nextProps.onWordClick,
);
