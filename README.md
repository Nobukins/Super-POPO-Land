# Super-POPO-Land

湊人のオリジナルキャラ「ポポ」を使った Super Mario Brothers オマージュゲームのプロトタイプです。

## 現在の初期版（MVP）

- ブラウザで遊べる 1 ステージ版（`index.html`）
- 操作: `←` `→` で移動、`Space` でジャンプ
- コインを取りながらゴール旗まで到達するとクリア
- キャラは 8bit 風のポポ表現で実装（Canvas 描画）

## 起動方法

静的ファイルだけで動作します。以下どちらでも起動できます。

1. `index.html` をブラウザで直接開く
2. ローカルサーバーを使う場合

```bash
cd /home/runner/work/Super-POPO-Land/Super-POPO-Land
python -m http.server 8000
```

`http://localhost:8000` にアクセスしてください。

## 今後の拡張方針

- 技術スタック（ゲームエンジン / アセット管理 / テスト戦略）を精査
- ステージ追加、敵・当たり判定・ゲームループの拡張
- コンテナ実行を見据えた構成に整理し、最終的に Kubernetes 上での運用を可能にする
