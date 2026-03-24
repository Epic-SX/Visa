/**
 * 診断結果画面を生成してスクリーンショット用HTMLを出力します。
 *
 * 使い方:
 * 1. バックエンドを起動: npm run dev:backend
 * 2. 本スクリプトを実行: node scripts/demo-diagnosis-result.js
 * 3. 生成された demo-result.html をブラウザで開く
 * 4. スクリーンショットを撮影（Win+Shift+S 等）
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/api\/v1$/, '');
const DEMO_ANSWERS = {
  business_plan_quality: 'good',
  capital_amount: 7000000,
  office_type: 'dedicated_office',
  office_lease_confirmed: true,
  office_dedicated: true,
  business_experience_years: 5,
  plans_to_hire_employees: true,
  employee_count_planned: 3,
  previous_visa_rejections: 0,
  previous_visa_approvals: 1,
  financial_stability_rating: 'good',
  business_scale: 'medium'
};

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8')
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, data: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toHtml(res) {
  const j = res.judgment || {};
  const s = res.scoring || {};
  const g = res.generation || {};
  const headline = escapeHtml(g.headline || '診断結果');
  const explanation = escapeHtml(g.explanationText || '').replace(/\n/g, '<br>');
  const disclaimer = escapeHtml(g.disclaimer || '本診断は情報提供目的であり許可を保証するものではありません。');
  const todos = (g.todoItems || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>診断結果</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Yu Gothic', sans-serif; margin: 24px; max-width: 720px; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 16px; }
    .status { font-size: 1.2rem; margin: 12px 0; padding: 8px 12px; background: #f0f4f8; border-radius: 6px; }
    .score { font-size: 1.1rem; margin: 12px 0; }
    .section { margin: 20px 0; padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
    .footer { margin-top: 32px; padding: 12px; font-size: 0.85rem; color: #666; border-top: 1px solid #ddd; }
    ul { margin: 8px 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>${headline}</h1>
  <div class="status">判定: ${escapeHtml(j.eligibilityStatus || '-')}（${j.eligibilityStatus === 'A' ? '良好' : j.eligibilityStatus === 'B' ? '要検討' : '要改善'}）</div>
  <div class="score">総合スコア: ${escapeHtml(s.totalScore != null ? s.totalScore : '-')}</div>
  <div class="section">
    <strong>説明</strong>
    <p>${explanation || '-'}</p>
  </div>
  ${todos ? `<div class="section"><strong>確認事項</strong><ul>${todos}</ul></div>` : ''}
  <div class="footer">${disclaimer}</div>
</body>
</html>`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL を .env に設定してください');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  let sessionId;
  try {
    const r = await client.query(
      `INSERT INTO diagnostic_sessions (locale, answers, status) VALUES ('ja', '{}', 'in_progress') RETURNING id`
    );
    sessionId = r.rows[0].id;
    console.log('セッション作成:', sessionId);
  } finally {
    client.release();
    await pool.end();
  }

  const url = `${API_BASE}/api/diagnosis/run`;
  const body = {
    sessionId,
    answers: DEMO_ANSWERS,
    locale: 'ja',
    tier: 'better',
    serviceType: 'service1'
  };

  console.log('診断APIを呼び出し中...', url);

  let res;
  try {
    res = await post(url, body);
  } catch (err) {
    console.error('API接続エラー。バックエンドが起動しているか確認してください:', err.message);
    process.exit(1);
  }

  if (res.status !== 200) {
    console.error('APIエラー:', res.status, res.data);
    process.exit(1);
  }

  const html = toHtml(res.data);
  const outPath = path.join(__dirname, '..', 'demo-result.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log('出力:', outPath);
  console.log('このファイルをブラウザで開き、スクリーンショットを撮影してください。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
