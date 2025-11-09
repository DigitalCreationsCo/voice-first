import { useTranslationStore } from "@/lib/store/translations";
import { TranslationData } from "@/lib/utils";

export function useCurrentLanguageTranslations() {
    const currentLanguage = useTranslationStore(state => state.currentLanguage);
    const translations = useTranslationStore(state => 
      currentLanguage ? state.translations[currentLanguage] : {}
    );
    
    return translations;
  }
  
  export function useAddMessageTranslations() {
    const addTranslations = useTranslationStore(state => state.addTranslations);
    const currentLanguage = useTranslationStore(state => state.currentLanguage);
  
    return async (messageTranslations: Record<string, TranslationData>) => {
      if (!currentLanguage) {
        console.warn('No current language set, cannot add translations');
        return;
      }
      await addTranslations(currentLanguage, messageTranslations);
    };
  }
  
  export function useWordClickHandler() {
    const currentLanguage = useTranslationStore(state => state.currentLanguage);
    const getTranslation = useTranslationStore(state => state.getTranslation);
    const incrementUsageCount = useTranslationStore(state => state.incrementUsageCount);
  
    return (word: string) => {
      if (!currentLanguage) return null;
      
      const translation = getTranslation(currentLanguage, word);
      if (translation) {
        incrementUsageCount(currentLanguage, word);
      }
      
      return translation;
    };
  }