/**
 * E-06–E-09: PDF 生成基盤
 * - 全テキストは i18n キー経由で構築（E-06）
 * - 日本語・中国語はフォント埋め込み対応（E-07）
 * - 生成前に prohibited_terms フィルタを必ず適用（E-08）
 * - 免責文言は pdf.disclaimer_fixed をフッターに強制表示（E-09）
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import type { Locale } from '@shared/types/layers';
import { getI18n, type SupportedLocale } from './get-i18n';
import { ProhibitedWordsFilter } from '../generation/prohibited-words-filter';

// pdfkit は動的 require（optional dependency 想定）
let PDFDocument: any;
try {
  PDFDocument = require('pdfkit');
} catch {
  PDFDocument = null;
}

/** E-07: 多言語フォント（未設定時は PDFKit デフォルト。本番では PDF_FONT_PATH_JA / PDF_FONT_PATH_ZH を必須設定すること。未設定時は文字化けリスク） */
const FONT_PATHS: Record<string, string> = {
  ja: process.env.PDF_FONT_PATH_JA || '',
  zh: process.env.PDF_FONT_PATH_ZH || '',
  en: ''
};

export interface PdfContent {
  headline?: string;
  todoItems?: string[];
  explanationText?: string;
  disclaimer?: string;
  [key: string]: string | string[] | undefined;
}

export interface PdfGeneratorOptions {
  locale: SupportedLocale;
  /** E-08: 適用する prohibited filter（呼び出し元で fromDatabase(pool) 推奨） */
  prohibitedFilter: ProhibitedWordsFilter;
  /** 追加の i18n キー（例: results.headline） */
  i18nKeys?: Record<string, string>;
}

/**
 * E-08: 文字列または文字列配列に prohibited フィルタを適用
 */
function applyProhibitedFilter(
  value: string | string[] | undefined,
  locale: Locale,
  filter: ProhibitedWordsFilter
): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return filter.filter(value, locale);
  return (value as string[]).map((s) => filter.filter(s, locale));
}

/**
 * PDF 生成（E-06: i18n ベース / E-09: フッターに disclaimer_fixed 強制）
 */
export async function generatePdf(
  pool: Pool,
  content: PdfContent,
  options: PdfGeneratorOptions
): Promise<Buffer> {
  if (!PDFDocument) {
    throw new Error('pdfkit is not installed. Run: npm install pdfkit @types/pdfkit');
  }

  const { locale, prohibitedFilter, i18nKeys = {} } = options;
  const safeLocale = ['ja', 'en', 'zh'].includes(locale) ? (locale as SupportedLocale) : 'ja';
  let t = getI18n(safeLocale) as Record<string, Record<string, string>>;
  let actualLocale: Locale = safeLocale as Locale;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // E-07: 日本語・中国語はフォント必須。未設定時はデモ救済モード（英語フォールバック）
  let fontFallbackWarning: string | null = null;
  
  if (safeLocale === 'ja' || safeLocale === 'zh') {
    const envKey = safeLocale === 'ja' ? 'PDF_FONT_PATH_JA' : 'PDF_FONT_PATH_ZH';
    const fontPath = FONT_PATHS[safeLocale]?.trim();
    
    if (!fontPath || !fs.existsSync(fontPath)) {
      // デモ救済モード: 英語にフォールバックして警告メッセージを追加
      console.warn(`[PDF Generator] ${envKey} not configured. Falling back to English PDF.`);
      
      const langName = safeLocale === 'ja' ? 'Japanese' : 'Chinese';
      fontFallbackWarning = `Note: ${langName} PDF is currently unavailable due to font configuration. ` +
        `This is an English version of your assessment results. ` +
        `For ${langName} PDF support, please contact support or configure ${envKey} in server settings.`;
      
      // 英語のi18nを使用（完全に差し替え）
      t = getI18n('en') as Record<string, Record<string, string>>;
      actualLocale = 'en';
    } else {
      doc.font(fontPath);
    }
  } else if (FONT_PATHS[safeLocale] && fs.existsSync(FONT_PATHS[safeLocale])) {
    // en: optional font
    doc.font(FONT_PATHS[safeLocale]);
  }

  // E-09: 固定免責（i18n の pdf.disclaimer_fixed）- フォールバック後のlocaleで再計算
  const disclaimerFixedRaw =
    (t?.pdf as Record<string, string>)?.disclaimer_fixed ??
    (t?.results as Record<string, string>)?.disclaimer ??
    'This assessment is for informational purposes only.';
  const disclaimerFixed = prohibitedFilter.filter(disclaimerFixedRaw, actualLocale);

  // E-06: Todo ラベルも i18n 対応
  const todoLabel =
    (t?.pdf as Record<string, string>)?.todo_label ?? 'Todo:';

  // E-08: 本文も必ずフィルタ通過（フォールバック後のlocaleを使用）
  const headline =
    applyProhibitedFilter(content.headline, actualLocale, prohibitedFilter) ?? t?.results?.headline ?? '';
  const todoItems = (applyProhibitedFilter(content.todoItems, actualLocale, prohibitedFilter) as string[]) ?? [];
  const explanationText =
    (applyProhibitedFilter(content.explanationText, actualLocale, prohibitedFilter) as string) ?? '';
  const contentDisclaimer =
    (applyProhibitedFilter(content.disclaimer, actualLocale, prohibitedFilter) as string) ?? disclaimerFixed;

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // フォントフォールバック警告を最上部に表示
  if (fontFallbackWarning) {
    doc.fontSize(10)
      .fillColor('#d97706')
      .text(fontFallbackWarning, { align: 'center' });
    doc.moveDown(2);
    doc.fillColor('#000000'); // 色をリセット
  }

  doc.fontSize(16).text(typeof headline === 'string' ? headline : String(headline), { align: 'left' });
  doc.moveDown();
  doc.fontSize(11).text(explanationText, { align: 'left' });
  doc.moveDown();
  if (todoItems.length) {
    doc.fontSize(12).text(todoLabel, { align: 'left' });
    todoItems.forEach((item) => doc.fontSize(10).text(`• ${item}`, { align: 'left' }));
    doc.moveDown();
  }
  doc.fontSize(10).text(contentDisclaimer, { align: 'left' });

  // E-09: 全 PDF 最下部に免責を強制挿入（削除不可設計）
  doc.moveDown(2);
  const footerY = doc.page.height - 50;
  doc.y = footerY;
  doc.fontSize(8).fillColor('#666').text(disclaimerFixed, 50, footerY, {
    align: 'center',
    width: doc.page.width - 100
  });

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/**
 * サーバ起動時に ProhibitedWordsFilter を取得して PDF 生成に渡す用
 */
export async function getProhibitedFilterForPdf(pool: Pool): Promise<ProhibitedWordsFilter> {
  return ProhibitedWordsFilter.fromDatabase(pool);
}
