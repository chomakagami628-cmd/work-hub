# Work Hub PWA v1.0.6

今まで使っているGoogle Apps Scriptは変更せず、Work HubをiPhone向けPWAとして使うための版です。

## 構成

- 本体・周辺機器：既存のApps Scriptをそのまま使用
- ゲームソフト：既存のApps Scriptをそのまま使用
- 送料：既存のApps Scriptをそのまま使用
- YA Explorer：新しく「YA Explorer専用Apps Script」を別プロジェクトとして用意

既存3つのApps Scriptは再デプロイ・書き換え不要です。

## YA ExplorerのiPhone版

PWAの「🔨 YA Explorer」を押すとURL入力欄が表示されます。

Yahoo!オークションの商品ページURLを貼り付けて「取得」→ YA Explorer互換の info JSON を生成 → クリップボードへコピーします。

Chrome拡張版と違い、iPhoneのPWAでは現在開いているYahoo!オークションページを直接読み取れないため、URLを専用Apps Scriptへ渡して解析します。

## YA Explorer専用Apps Scriptの設定

1. Google Apps Scriptで「新しいプロジェクト」を作成
2. `Code_YA_Explorer_PWA.gs` のコードを貼り付ける
3. `YA_TOKEN` を自分だけの認証キーに変更する
4. 「デプロイ」→「新しいデプロイ」
5. 種類：ウェブアプリ
6. 次のユーザーとして実行：自分
7. アクセスできるユーザー：PWAからアクセスできる設定
8. デプロイしてWebアプリURLをコピー
9. Work Hub PWA → ⚙️ → Google Sheets接続設定 → 「YA Explorer（PWA専用）」へURLと認証キーを入力

このYA Explorer用Apps Scriptは、既存の本体・周辺機器／ゲームソフト／送料用Apps Scriptとは別物です。

## iPhoneでPWAとして使う

PWAファイルをWebサーバー（HTTPS）に配置してください。

例：`index.html` がHTTPSで開ける状態にします。

iPhoneのSafariでそのURLを開き、共有メニューから「ホーム画面に追加」を選択します。

ホーム画面の「Work Hub」から起動すると、アプリ風のstandalone表示になります。

## 注意

PWAはChrome拡張機能ではないため、以下のChrome専用機能はPWA版では使いません。

- Ctrl+Qでサイドパネルを開く機能
- Chromeタブを左から4番目へ開く機能
- chrome.storage
- chrome.scripting
- 現在開いているYahoo!オークションページを直接読み取る機能

外部サイトは通常の新しいブラウザタブ／ウィンドウとして開きます。

## v1.0.6 更新内容

- 本体・ゲームのローマ字検索（例：mario → マリオ）
- 本体カテゴリをタップで開閉。起動時は閉じ、検索中は該当カテゴリを展開
- 【本体(Wii)】などのカテゴリ名を保持（先頭番号は非表示）
- 本体価格表の同梱データをChrome拡張 v1.0.4 に更新
- PWAの保存設定・高速化・50件ずつ表示・ゲーム新規追加修正を維持

更新時はZIP内のファイルをGitHubの同じ場所に上書きしてください。
既存の接続設定・保存データは維持されます。接続済みの場合は「最新を取得」でスプレッドシートの現在のデータを反映できます。
