# Claude へのルール(survive-chinatown)

- まず `amataro3-dot/muddys-notes` の `CLAUDE.md` と `survive-chinatown/survive-chinatown_handoff.md` を読む(ルールと引き継ぎはそこが基準)
- 「書いて」と言われるまで、コードは書かない
- 上げるたびに `node tools/set-version.mjs 新しい番号` でキャッシュよけの番号をそろえる(番号は引き継ぎメモの version と同じ)
- 変えたら必ずテストを通す: `node tests/solo_test.js`、`python3 tests/combat_test.py . <画像フォルダ>`、`python3 tests/police_test.py . <画像フォルダ>`、`python3 tests/gun_test.py . <画像フォルダ>`、`python3 tests/online_test.py . <画像フォルダ>`、`node tests/lang_check.js`、`python3 tests/lang_test.py . <画像フォルダ>`
- 画面に出す文は、日本語・英語・韓国語の3つで作る。`tr('日本語の文')` で書いて、`i18n.js` の辞書に英語・韓国語を足す
