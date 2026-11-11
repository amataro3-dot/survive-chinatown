// ことばの辞書のチェック(Claude 用): node tests/lang_check.js
// main.js・lobby.js・online.js の tr('…') と、index.html の data-t の日本語が、全部 i18n.js の辞書にあるか確かめる
const fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
global.window = global; global.document = {}; eval(R('i18n.js'));
const D = window.T_DICT, miss = [], jp = /[ぁ-んァ-ヶ一-龥]/;
const need = k => { if (jp.test(k) && !D[k]) miss.push(k); };
for (const f of ['main.js', 'lobby.js', 'online.js']) {
  const s = R(f);
  for (const m of s.matchAll(/tr\(\s*(?:[^'"()]*\?\s*)?(['"])((?:\\.|(?!\1).)*)\1(?:\s*:\s*(['"])((?:\\.|(?!\3).)*)\3)?/g)) { need(m[2].replace(/\\'/g, "'")); if (m[4]) need(m[4].replace(/\\'/g, "'")); }
  // 表示のときに tr() に通す文(ミッション・武器・店の名前・街の人のセリフとQ&A)
  for (const m of s.matchAll(/(?:title|text|done|name|ok|ng): '([^']+)'/g)) need(m[1]);
  for (const m of s.matchAll(/shopMark\('\w+', '([^']+)'/g)) need(m[1]);
}
const html = R('index.html');
for (const m of html.matchAll(/<(\w+)[^>]*\bdata-t\b[^>]*>([\s\S]*?)<\/\1>/g)) need(m[2].trim());
for (const m of html.matchAll(/placeholder="([^"]+)"[^>]*data-tp/g)) need(m[1]);
for (const k in D) if (!Array.isArray(D[k]) || D[k].length !== 2 || D[k].some(v => !v || jp.test(v))) miss.push('訳がおかしい: ' + k);
console.log(miss.length ? 'NG 辞書にない(または訳がおかしい):\n' + [...new Set(miss)].join('\n') : 'OK 全部の文が辞書にある(' + Object.keys(D).length + 'こ)');
process.exit(miss.length ? 1 : 0);
