'use server';

import { db } from '@/db/queries';
import { translations } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { auth } from 'auth';
import { TranslationData } from '@/lib/utils';

/**
 * Load all translations for a user's language
 */
export async function loadTranslations(language: string): Promise<Record<string, TranslationData>> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const results = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.userId, session.user.id),
        eq(translations.language, language)
      )
    );

  const translationsMap: Record<string, TranslationData> = {};
  results.forEach(row => {
    translationsMap[row.word.toLowerCase()] = {
      word: row.word,
      language: row.language,
      english: row.english,
      phonetic: row.phonetic,
      audioUrl: row.audioUrl,
      usageCount: row.usageCount,
      addedAt: row.addedAt.getTime(),
    };
  });

  return translationsMap;
}

/**
 * Save or update translations for a language
 */
export async function saveTranslations(
  language: string, 
  newTranslations: Record<string, TranslationData>
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;
  const now = new Date();

  // Use upsert (insert or update on conflict)
  const values = Object.values(newTranslations).map(t => ({
    id: `${userId}_${language}_${t.word.toLowerCase()}`,
    userId,
    language,
    word: t.word,
    english: t.english,
    phonetic: t.phonetic,
    audioUrl: t.audioUrl,
    usageCount: t.usageCount || 0,
    addedAt: now,
    updatedAt: now,
  }));

  if (values.length === 0) return;

  // Batch upsert using Drizzle's onConflictDoUpdate
  await db
    .insert(translations)
    .values(values as any)
    .onConflictDoUpdate({
      target: [translations.userId, translations.language, translations.word],
      set: {
        english: sql`excluded.english`,
        phonetic: sql`excluded.phonetic`,
        audioUrl: sql`excluded.audio_url`,
        updatedAt: now,
      },
    });
}

/**
 * Increment usage count for a word
 */
export async function incrementUsageCount(language: string, word: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const id = `${session.user.id}_${language}_${word.toLowerCase()}`;

  await db
    .update(translations)
    .set({
      usageCount: sql`${translations.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(translations.id, id));
}

/**
 * Get vocabulary statistics
 */
export async function getVocabularyStats(): Promise<{ [language: string]: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const results = await db
    .select({
      language: translations.language,
      count: sql<number>`count(*)::int`,
    })
    .from(translations)
    .where(eq(translations.userId, session.user.id))
    .groupBy(translations.language);

  const stats: { [language: string]: number } = {};
  results.forEach(row => {
    stats[row.language] = row.count;
  });

  return stats;
}

/**
 * Get most frequently used words
 */
export async function getMostUsedWords(language: string, limit: number = 20) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.userId, session.user.id),
        eq(translations.language, language)
      )
    )
    .orderBy(desc(translations.usageCount))
    .limit(limit);
}

/**
 * Clear all translations for a language
 */
export async function clearLanguageTranslations(language: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .delete(translations)
    .where(
      and(
        eq(translations.userId, session.user.id),
        eq(translations.language, language)
      )
    );
}