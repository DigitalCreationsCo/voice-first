import { create } from 'zustand';
import { 
  loadTranslations, 
  saveTranslations, 
  incrementUsageCount as incrementUsageCountAction,
  getVocabularyStats,
  clearLanguageTranslations 
} from '@/app/actions/translations';
import { LanguageName, TranslationData, TranslationsByLanguage } from '../utils';

interface TranslationStore {
  // State
  translations: TranslationsByLanguage;
  currentLanguage: LanguageName | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentLanguage: (language: LanguageName) => Promise<void>;
  addTranslations: (language: string, newTranslations: Record<string, TranslationData>) => Promise<void>;
  getTranslation: (language: string, word: string) => TranslationData | undefined;
  getLanguageTranslations: (language: string) => Record<string, TranslationData>;
  incrementUsageCount: (language: string, word: string) => void;
  clearLanguage: (language: string) => Promise<void>;
  refreshStats: () => Promise<{ [language: string]: number }>;
}

export const useTranslationStore = create<TranslationStore>((set, get) => ({
  translations: {},
  currentLanguage: null,
  isLoading: false,
  error: null,

  setCurrentLanguage: async (language: LanguageName) => {
    const state = get();
    
    // If already loaded, just switch
    if (state.translations[language]) {
      set({ currentLanguage: language });
      return;
    }

    // Load from database
    try {
      set({ isLoading: true, error: null });
      const translations = await loadTranslations(language);
      
      set(state => ({
        translations: {
          ...state.translations,
          [language]: translations
        },
        currentLanguage: language,
        isLoading: false
      }));
      
      console.log(`✅ Loaded ${Object.keys(translations).length} translations for ${language}`);
    } catch (error: any) {
      console.error(`❌ Failed to load translations for ${language}:`, error);
      set({ isLoading: false, error: error.message });
    }
  },

  addTranslations: async (language: string, newTranslations: Record<string, TranslationData>) => {
    const state = get();
    const existingTranslations = state.translations[language] || {};
    
    // Merge new translations
    const mergedTranslations = {
      ...existingTranslations,
      ...Object.fromEntries(
        Object.entries(newTranslations).map(([key, value]) => [
          key.toLowerCase(),
          {
            ...value,
            addedAt: Date.now(),
            usageCount: existingTranslations[key.toLowerCase()]?.usageCount || 0
          }
        ])
      )
    };

    // Update in-memory store immediately
    set(state => ({
      translations: {
        ...state.translations,
        [language]: mergedTranslations
      }
    }));

    // Persist to database (async, non-blocking)
    try {
      await saveTranslations(language, newTranslations);
      console.log(`✅ Saved ${Object.keys(newTranslations).length} new translations for ${language}`);
    } catch (error: any) {
      console.error('❌ Failed to persist translations:', error);
      set({ error: error.message });
    }
  },

  getTranslation: (language: string, word: string) => {
    const state = get();
    return state.translations[language]?.[word.toLowerCase()];
  },

  getLanguageTranslations: (language: string) => {
    const state = get();
    return state.translations[language] || {};
  },

  incrementUsageCount: (language: string, word: string) => {
    // Update in-memory immediately
    set(state => {
      const translation = state.translations[language]?.[word.toLowerCase()];
      if (!translation) return state;

      return {
        translations: {
          ...state.translations,
          [language]: {
            ...state.translations[language],
            [word.toLowerCase()]: {
              ...translation,
              usageCount: (translation.usageCount || 0) + 1
            }
          }
        }
      };
    });

    // Async persist to database (non-blocking)
    incrementUsageCountAction(language, word).catch(console.error);
  },

  clearLanguage: async (language: string) => {
    try {
      await clearLanguageTranslations(language);
      
      set(state => {
        const newTranslations = { ...state.translations };
        delete newTranslations[language];
        return { translations: newTranslations };
      });
      
      console.log(`✅ Cleared translations for ${language}`);
    } catch (error: any) {
      console.error(`❌ Failed to clear ${language} translations:`, error);
      set({ error: error.message });
    }
  },

  refreshStats: async () => {
    try {
      return await getVocabularyStats();
    } catch (error: any) {
      console.error('❌ Failed to get stats:', error);
      return {};
    }
  }
}));
