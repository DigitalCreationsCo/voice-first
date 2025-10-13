import { UIMessage } from "@/lib/utils";
import { InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  boolean,
  integer,
  uniqueIndex,
  text,
  index,
} from "drizzle-orm/pg-core";


export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;


export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  messages: json("messages").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
});

export type Chat = Omit<InferSelectModel<typeof chat>, "messages"> & {
  messages: Array<UIMessage>;
};


export const reservation = pgTable("Reservation", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  details: json("details").notNull(),
  hasCompletedPayment: boolean("hasCompletedPayment").notNull().default(false),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
});

export type Reservation = InferSelectModel<typeof reservation>;


export const translations = pgTable('translations', {
  id: uuid('id').primaryKey(), // Format: {userId}_{language}_{word}
  userId: uuid('user_id').notNull(),
  language: text('language').notNull(),
  word: text('word').notNull(),
  english: text('english').notNull(),
  phonetic: text('phonetic').notNull(),
  audioUrl: text('audio_url').notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Composite unique constraint: one translation per user/language/word
  userLanguageWordIdx: uniqueIndex('user_language_word_idx')
    .on(table.userId, table.language, table.word),
  
  // Index for fast lookups by user and language
  userLanguageIdx: index('user_language_idx')
    .on(table.userId, table.language),
  
  // Index for sorting by usage
  usageCountIdx: index('usage_count_idx')
    .on(table.userId, table.language, table.usageCount),
}));

export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;