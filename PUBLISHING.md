# GitHub Pages 公開用ファイル

アプリはHTMLと相対パスのJavaScript moduleで構成された静的サイトです。リポジトリのルートへ置き、PagesのソースをGitHub Actionsにすると、`main`への更新ごとに付属ワークフローがテストして公開します。

## 初回設定

1. リポジトリの **Settings → Pages** を開きます。
2. **Build and deployment → Source** を **GitHub Actions** に設定します。
3. 公開用ファイルをリポジトリのルートへコミットします。
4. **Actions** で `Deploy writing motion lab to GitHub Pages` の実行を確認します。成功後、`github-pages` 環境に公開URLが表示されます。

## 配信ファイル

- `index.html`
- `app.js`
- `analysis-core.mjs`
- `trial-store.mjs`

`README.md`と`test-analysis-core.mjs`は説明・検証用です。ブラウザ実行にNode.jsは不要ですが、GitHub ActionsはJavaScript構文と21件の自動テストを確認してから公開します。Hand Landmarkerのライブラリ、WASM、モデルはアプリ実行時にCDNから読み込まれます。

GitHub Freeの個人アカウントではPagesソースのリポジトリを公開にする必要があります。サイトは公開インターネット上で表示されます。[GitHub Pagesの作成条件](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

