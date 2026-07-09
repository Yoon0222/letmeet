import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  type Language,
  type TranslationKey,
  languageLabels,
  languages,
  translations,
} from '@/i18n/translations';

const STORAGE_KEY = 'pinut.language';

type TranslateParams = Record<string, string | number>;

type I18nContextValue = {
  language: Language;
  languageLabels: typeof languageLabels;
  languages: typeof languages;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: TranslationKey, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function isLanguage(value: string | null): value is Language {
  return value === 'ko' || value === 'en';
}

function readTranslation(language: Language, key: TranslationKey): string {
  const value = key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, translations[language]);

  if (typeof value === 'string') return value;
  return key;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ko');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (mounted && isLanguage(stored)) setLanguageState(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) =>
      interpolate(readTranslation(language, key), params),
    [language],
  );

  const value = useMemo(
    () => ({ language, languageLabels, languages, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
