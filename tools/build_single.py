#!/usr/bin/env python3
"""index.html + style.css + js/*.js + favicon を 1 つの HTML にまとめる。

使い方:
    python3 tools/build_single.py [出力先]   (既定: dist/super-popo-land.html)

1 ファイルなので、メール添付・Claude の成果物 (Artifact)・任意の静的ホスティングにそのまま置けます。
"""
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "super-popo-land.html"


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="style.css" />', "<style>\n" + css + "</style>")

    icon = base64.b64encode((ROOT / "assets" / "favicon.png").read_bytes()).decode()
    html = html.replace('href="assets/favicon.png"', f'href="data:image/png;base64,{icon}"')

    def inline(m):
        src = (ROOT / m.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + src.replace("</script", "<\\/script") + "</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
