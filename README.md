# survive-chinatown

SURVIVE CHINATOWN(チャイナタウンで生き延びろ)。Muddy's Games のゲームの1つ(作成中)。

スマホ(横画面)で遊べる、ミニGTA風の3Dゲーム。

- ひとりで遊ぶ: 5つの配達ミッション。警察から逃げる
- みんなで配達競争(オンライン、2〜4人): 荷物を取って届けると1点。ぶつかって奪える。3点先取

## ファイル
- `index.html` / `style.css`
- `main.js` … ゲーム本体(街・車・人・警察・ミッション・配達競争の画面側)。Three.js r128 を cdnjs から読む
- `lobby.js` … ロビー(ルームを作る・参加・待合室)
- `online.js` … 配達競争の通信。ホストが荷物・点数を決める
- `firebase.js` … Firebase(fugo-daifugo プロジェクト)。ルームは `sc-rooms/1234`
- `backguard.js` … 戻るボタンの確認(全ゲーム共通)
- `tests/` … テスト。`tools/set-version.mjs` … キャッシュよけの番号をそろえる道具

メモ: `amataro3-dot/muddys-notes` の `survive-chinatown/`
