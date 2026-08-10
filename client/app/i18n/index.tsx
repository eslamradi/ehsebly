import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { en, type Translations } from './locales/en';
import { ar } from './locales/ar';
import { franco } from './locales/franco';
import { resolvePlural, type LocaleCode, type PluralForms } from './plural';

export type { LocaleCode };

const TABLES: Record<LocaleCode, Translations> = { en, ar, franco };

/** Only Arabic is right-to-left — Franco is Egyptian Arabic in Latin script, so it reads LTR. */
export const RTL_LOCALES: readonly LocaleCode[] = ['ar'];

/**
 * The locales the picker offers. Franco is deliberately absent for now
 * (2026-08-09) — everything behind it stays in place: the table, the Arabic
 * plural rules it shares, and its coverage in verifyTranslations, so it can
 * be re-enabled by putting it back in this array and nothing will have
 * rotted in the meantime.
 */
export const LOCALE_ORDER: readonly LocaleCode[] = ['en', 'ar'];

const STORAGE_KEY = 'asemly.locale';

/**
 * Dot-path into the string table: `t('assignment.title')`. Typed loosely on
 * purpose — a fully-typed recursive key path makes every call site's error
 * message unreadable, and `verifyTranslations.ts` already proves at build time
 * that all three tables carry identical keys, which is the property that
 * actually matters.
 */
function lookup(table: Translations, path: string): string | PluralForms | undefined {
  return path.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, table) as string | PluralForms | undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type TranslateValues = Record<string, string | number> & { count?: number };

export type I18nContextValue = {
  locale: LocaleCode;
  isRTL: boolean;
  /** Null until the stored preference has been read — screens render nothing rather than flashing the wrong language. */
  ready: boolean;
  t: (path: string, values?: TranslateValues) => string;
  setLocale: (next: LocaleCode) => Promise<void>;
  /**
   * True only when a direction change could not be applied automatically and
   * the user has to reopen the app themselves. Distinct from "reloading",
   * which needs no UI because the app is about to disappear.
   */
  needsReopen: boolean;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/** Maps the device's language tag onto a supported locale; Franco is never auto-detected since no OS reports it. */
function detectDeviceLocale(): LocaleCode {
  const tags = Localization.getLocales();
  const languageCode = tags[0]?.languageCode ?? 'en';
  return languageCode === 'ar' ? 'ar' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en');
  const [ready, setReady] = useState(false);
  const [needsReopen, setNeedsReopen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolved: LocaleCode;
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as LocaleCode | null;
        // Checked against what the picker currently offers, not against every
        // table that exists: a tester who had already chosen Franco before it
        // was hidden would otherwise land in a language the picker can't show
        // as selected, which reads as a broken control.
        resolved = stored && LOCALE_ORDER.includes(stored) ? stored : detectDeviceLocale();
      } catch {
        // A storage read failure must not block the app behind a blank screen.
        resolved = detectDeviceLocale();
      }
      if (cancelled) {
        return;
      }
      // The native layer keeps its own RTL flag across launches. If it
      // disagrees with the stored locale — first run after choosing Arabic,
      // or a reinstall — reconcile it here so the very next render is already
      // laid out correctly, instead of on some later reload.
      const shouldBeRTL = RTL_LOCALES.includes(resolved);
      if (I18nManager.isRTL !== shouldBeRTL) {
        I18nManager.allowRTL(shouldBeRTL);
        I18nManager.forceRTL(shouldBeRTL);
      }
      setLocaleState(resolved);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(
    async (next: LocaleCode) => {
      if (next === locale) {
        return;
      }
      try {
        await AsyncStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Persisting is best-effort; the switch itself should still happen.
      }

      const directionChanged = RTL_LOCALES.includes(next) !== I18nManager.isRTL;
      if (!directionChanged) {
        // English <-> Franco, or re-picking a same-direction locale: swapping
        // the string table is enough, so this is instant with no reload.
        setLocaleState(next);
        return;
      }

      // Yoga resolves writing direction once at startup, so flipping it has to
      // be followed by a reload for any already-mounted layout to mirror.
      I18nManager.allowRTL(RTL_LOCALES.includes(next));
      I18nManager.forceRTL(RTL_LOCALES.includes(next));
      setLocaleState(next);
      try {
        await Updates.reloadAsync();
        // Unreachable in practice — the app is replaced before this returns.
      } catch {
        // Expo Go and dev clients have no programmatic reload. Ask the user to
        // reopen instead; the mount effect reconciles direction on next launch
        // either way, so the app is never left permanently half-flipped.
        setNeedsReopen(true);
      }
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => {
    const table = TABLES[locale];
    return {
      locale,
      isRTL: RTL_LOCALES.includes(locale),
      ready,
      needsReopen,
      setLocale,
      t: (path, values) => {
        const entry = lookup(table, path) ?? lookup(en, path);
        if (entry === undefined) {
          // Surfacing the key beats rendering an empty string — a missing
          // label is then obvious on screen and in a screenshot.
          return path;
        }
        const template =
          typeof entry === 'string' ? entry : resolvePlural(entry, locale, values?.count ?? 0);
        return interpolate(template, values);
      },
    };
  }, [locale, ready, needsReopen, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
