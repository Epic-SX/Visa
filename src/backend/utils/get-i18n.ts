/**
 * Ticket 08: i18n 共通ユーティリティ
 * UI / PDF で同一文言を利用
 */

import * as fs from 'fs';
import * as path from 'path';

export type SupportedLocale = 'ja' | 'en' | 'zh';

const SUPPORTED_LOCALES: SupportedLocale[] = ['ja', 'en', 'zh'];

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

/**
 * 指定 locale の i18n JSON を読み込む
 * 言語追加時は config/i18n/<locale>.json を追加するだけでよい
 */
export function getI18n(locale: SupportedLocale): Record<string, unknown> {
  const configDir = process.env.I18N_CONFIG_DIR ?? path.join(process.cwd(), 'config', 'i18n');
  const filePath = path.join(configDir, `${locale}.json`);

  if (!fs.existsSync(filePath)) {
    // fallback to ja
    if (locale !== 'ja') {
      return getI18n('ja');
    }
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
