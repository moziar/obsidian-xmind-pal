import en from './locales/en';
import zhCn from './locales/zh-cn';

type TranslationDict = Record<string, string>;

const locales: Record<string, TranslationDict> = {
	'en': en,
	'zh': zhCn,
	'zh-cn': zhCn,
	'zh-tw': zhCn,
};

const DEFAULT_LOCALE = 'en';

let currentLocale: string = DEFAULT_LOCALE;

/**
 * Set the active locale. Falls back to English if the locale is not available.
 * Supports language-family fallback (e.g. "zh-TW" -> "zh").
 * Locale matching is case-insensitive.
 */
export function setLocale(locale: string): void {
	const normalized = locale.toLowerCase();

	if (locales[normalized]) {
		currentLocale = normalized;
		return;
	}

	// Try language family (e.g. "zh-TW" -> "zh")
	const family = normalized.split('-')[0];
	if (locales[family]) {
		currentLocale = family;
		return;
	}

	currentLocale = DEFAULT_LOCALE;
}

/**
 * Translate a key with optional parameters.
 * Template parameters use `{name}` syntax, e.g. t('error.fileNotFound', { name: 'foo.xmind' })
 * Falls back to English, then to the key itself if no translation is found.
 */
export function t(key: string, params?: Record<string, string | number>): string {
	const bundle = locales[currentLocale] ?? locales[DEFAULT_LOCALE];
	let text = bundle[key] ?? locales[DEFAULT_LOCALE][key] ?? key;

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.split(`{${k}}`).join(String(v));
		}
	}

	return text;
}
