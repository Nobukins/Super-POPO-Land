#!/usr/bin/env python3
"""ポポのスプライトシートを 8bit 風のパレット番号データ (js/sprites.js) に変換する。

使い方:
    python3 tools/make_sprites.py [assets/popo_sheet.png] [js/sprites.js]

処理内容:
  1. シートを 7 コマ (idle, jump, crouch, right1, right2, left1, left2) に分割
     - 拡大済みの画像 (例: 1 コマ 320px) でも、1 ドットの大きさを自動検出して 32px に縮小
  2. 色を最大 8 色のパレットに減色 (近い色はまとめる / 半透明は透明 or 不透明に二値化)
  3. 走りコマのスピード線 (本体から離れた横線) を取り除いた「歩き」コマも生成
  4. パレット番号の文字列として JS に書き出す (file:// でも読み込める)
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "popo_sheet.png"
DST = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "js" / "sprites.js"

FRAME_NAMES = ["idle", "jump", "crouch", "right1", "right2", "left1", "left2"]
CELL = 32
MAX_COLORS = 8


def detect_scale(img: Image.Image) -> int:
    """横に同じ色が続く最小の長さ = 1 ドットの大きさ とみなす。"""
    px = img.load()
    best = img.width
    for y in range(0, img.height, max(1, img.height // 64)):
        run = 1
        for x in range(1, img.width):
            if px[x, y] == px[x - 1, y]:
                run += 1
            else:
                if px[x - 1, y][3] > 0:
                    best = min(best, run)
                run = 1
    return max(1, best)


def downsample(img: Image.Image, scale: int) -> Image.Image:
    """各ドットの中心付近の色を採用 (アンチエイリアスのにじみを避ける)。"""
    w, h = img.width // scale, img.height // scale
    out = Image.new("RGBA", (w, h))
    src, dst = img.load(), out.load()
    for y in range(h):
        for x in range(w):
            dst[x, y] = src[x * scale + scale // 2, y * scale + scale // 2]
    return out


def quantize(img: Image.Image):
    px = img.load()
    counts = {}
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    # 出現数の多い順に、近い色はまとめながらパレットを作る
    palette = []
    for color, _ in sorted(counts.items(), key=lambda kv: -kv[1]):
        if all(sum((a - b) ** 2 for a, b in zip(color, p)) > 40 ** 2 for p in palette):
            palette.append(color)
        if len(palette) >= MAX_COLORS:
            break

    def nearest(c):
        return min(range(len(palette)), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, palette[i])))

    grid = []
    for y in range(img.height):
        row = []
        for x in range(img.width):
            r, g, b, a = px[x, y]
            row.append(-1 if a < 128 else nearest((r, g, b)))
        grid.append(row)
    return palette, grid


def components(frame):
    h, w = len(frame), len(frame[0])
    seen = [[False] * w for _ in range(h)]
    comps = []
    for sy in range(h):
        for sx in range(w):
            if frame[sy][sx] < 0 or seen[sy][sx]:
                continue
            stack, comp = [(sx, sy)], []
            seen[sy][sx] = True
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and frame[ny][nx] >= 0:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            comps.append(comp)
    return comps


def strip_detached(frame):
    """本体 (最大の連結成分) 以外のドットを消す。"""
    comps = components(frame)
    main = max(comps, key=len)
    keep = set(main)
    return [[c if (x, y) in keep else -1 for x, c in enumerate(row)] for y, row in enumerate(frame)]


def encode(frame):
    chars = ".0123456789"
    return ["".join(chars[c + 1] for c in row) for row in frame]


def main():
    sheet = Image.open(SRC).convert("RGBA")
    scale = detect_scale(sheet)
    small = downsample(sheet, scale) if scale > 1 else sheet
    palette, grid = quantize(small)
    n = small.width // CELL
    frames = {}
    for i, name in enumerate(FRAME_NAMES[:n]):
        frames[name] = [row[i * CELL:(i + 1) * CELL] for row in grid[:CELL]]
    # 歩き用 (スピード線なし) コマ
    for name in ("right1", "right2", "left1", "left2"):
        if name in frames:
            frames["walk_" + name] = strip_detached(frames[name])

    hex_palette = ["#%02x%02x%02x" % c for c in palette]
    body = {
        "size": CELL,
        "palette": hex_palette,
        "frames": {k: encode(v) for k, v in frames.items()},
    }
    js = (
        "// 自動生成ファイル: python3 tools/make_sprites.py で再生成できます\n"
        "// 元画像: " + SRC.name + f" (1 ドット = {scale}px を検出, {len(palette)} 色に減色)\n"
        "window.POPO_SPRITES = " + json.dumps(body, indent=1) + ";\n"
    )
    DST.write_text(js, encoding="utf-8")
    print(f"wrote {DST} : scale={scale}, colors={hex_palette}, frames={list(frames)}")


if __name__ == "__main__":
    main()
