/**
 * Tiny i18n. Loads locale JSON files at module load, falls back to en,
 * supports `{var}` interpolation.
 */
import en from './locales/en.json' with { type: 'json' };
import zhCN from './locales/zh-CN.json' with { type: 'json' };

export type Locale = 'en' | 'zh-CN';

type Dict = Record<string, string>;

const LOCALES: Record<Locale, Dict> = {
  en: en as Dict,
  'zh-CN': zhCN as Dict,
};

let currentLocale: Locale = detectLocale();

/**
 * Detect locale from env. LANG=zh_CN.UTF-8 → zh-CN, anything else → en.
 * Honors CLIHUB_LANG > LC_ALL > LANG.
 */
export function detectLocale(): Locale {
  const raw =
    process.env.CLIHUB_LANG ||
    process.env.LC_ALL ||
    process.env.LANG ||
    '';
  const normalized = raw.replace('_', '-').toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate. Falls back to en, then to the key itself if no translation
 * exists. `{name}` placeholders are replaced from `vars`.
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const dict = LOCALES[currentLocale] ?? LOCALES.en;
  const fallback = LOCALES.en;
  const template = dict[key] ?? fallback[key] ?? key;
  return interpolate(template, vars);
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}
