import base64
import re
import urllib.parse
from pathlib import Path
import markdown

GUIDES_DIR = Path(__file__).parent
IMAGES_DIR = GUIDES_DIR / "images"

def embed_images(html: str) -> str:
    def replace_img(match):
        alt = match.group(1)
        raw_src = match.group(2)
        src = urllib.parse.unquote(raw_src)
        img_path = IMAGES_DIR / Path(src).name
        if img_path.exists():
            ext = img_path.suffix.lower()
            mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}.get(ext.lstrip("."), "image/png")
            data = base64.b64encode(img_path.read_bytes()).decode()
            return f'<img alt="{alt}" src="data:{mime};base64,{data}" style="max-width:100%;border-radius:6px;margin:16px 0;border:1px solid var(--border);display:block;">'
        return f'<img alt="{alt}" src="{src}" style="max-width:100%;border-radius:6px;margin:16px 0;border:1px solid var(--border);display:block;">'
    return re.sub(r'<img alt="([^"]*)" src="([^"]*)"[^>]*/?>', replace_img, html)

def embed_logo() -> str:
    logo_path = IMAGES_DIR / "rusty_bot.png"
    if logo_path.exists():
        data = base64.b64encode(logo_path.read_bytes()).decode()
        return f"data:image/png;base64,{data}"
    return "https://www.rustybot.co.uk/rusty_bot.png"

def convert():
    md_path = GUIDES_DIR / "open_a_draw.md"
    html_path = GUIDES_DIR / "open_a_draw.html"

    md_content = md_path.read_text(encoding="utf-8")

    html_body = markdown.markdown(
        md_content,
        extensions=["fenced_code", "tables", "codehilite"],
    )
    html_body = embed_images(html_body)

    logo_src = embed_logo()

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>How to Open a Draw — RustyBot Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  :root {{
    --bg: #0d0d0d;
    --panel: #1a1a1a;
    --panel-hover: #222;
    --border: #2a2a2a;
    --text: #ddd;
    --dim: #888;
    --accent: #e8d900;
    --accent-dim: rgba(232, 217, 0, 0.25);
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    background: var(--bg);
    color: var(--text);
    font-family: 'Titillium Web', sans-serif;
    line-height: 1.7;
  }}
  .hero-wrap {{
    background: #111;
    border-bottom: 1px solid var(--border);
  }}
  .hero {{
    max-width: 820px;
    margin: 0 auto;
    text-align: center;
    padding: 48px 24px 32px;
  }}
  .hero-logo {{
    max-width: 100px;
    margin-bottom: 12px;
  }}
  .hero h1 {{
    font-size: 2.2rem;
    font-weight: 700;
    color: #fff;
  }}
  .hero h1 span {{ color: var(--accent); }}
  .hero p {{
    font-size: 1rem;
    color: var(--dim);
    margin-top: 2px;
  }}
  .hero-rule {{
    width: 50px;
    height: 2px;
    background: var(--accent);
    margin: 14px auto 0;
  }}
  .nav-wrap {{
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(13, 13, 13, 0.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }}
  .quick-nav {{
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 10px 24px;
  }}
  .quick-nav a {{
    color: var(--dim);
    text-decoration: none;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 5px 12px;
    border-radius: 3px;
    transition: color 0.2s, background 0.2s;
  }}
  .quick-nav a:hover {{
    color: var(--accent);
    background: rgba(232, 217, 0, 0.06);
  }}
  .container {{ max-width: 820px; margin: 0 auto; padding: 32px 24px 0; }}
  h1 {{
    font-size: 1.6rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.5rem;
  }}
  h2 {{
    font-size: 1.1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--accent);
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
  }}
  h3 {{
    font-size: 1rem;
    font-weight: 700;
    color: #eee;
    margin-top: 1.5rem;
    margin-bottom: 0.4rem;
  }}
  p {{ margin-bottom: 0.75rem; }}
  ul, ol {{ margin: 0.5rem 0 1rem 1.8rem; }}
  li {{ margin-bottom: 0.15rem; }}
  code {{
    background: var(--panel);
    color: var(--accent);
    padding: 0.15em 0.45em;
    border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.88em;
  }}
  pre {{
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    overflow-x: auto;
    margin: 0.75rem 0;
  }}
  pre code {{ background: none; color: var(--text); padding: 0; }}
  blockquote {{
    border-left: 3px solid var(--accent-dim);
    padding: 0.6rem 1rem;
    margin: 0.75rem 0;
    background: var(--panel);
    border-radius: 0 6px 6px 0;
    color: var(--dim);
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.85rem;
  }}
  th, td {{
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }}
  th {{
    background: var(--panel);
    color: var(--accent);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 0.8rem;
  }}
  td {{ background: var(--bg); }}
  tr:nth-child(even) td {{ background: var(--panel); }}
  hr {{ border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }}
  strong {{ color: #fff; }}
  a {{ color: var(--accent); text-decoration: none; transition: color 0.2s; }}
  a:hover {{ color: #fff; }}
  .back-top {{
    position: fixed;
    bottom: 32px;
    right: 32px;
    z-index: 99;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--dim);
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s, color 0.2s, opacity 0.3s;
    opacity: 0;
    pointer-events: none;
  }}
  .back-top.visible {{
    opacity: 1;
    pointer-events: auto;
  }}
  .back-top:hover {{
    background: var(--panel-hover);
    border-color: var(--accent-dim);
    color: var(--accent);
  }}
  footer {{
    text-align: center;
    padding: 28px 0;
    border-top: 1px solid var(--border);
    color: #555;
    font-size: 0.78rem;
    margin-top: 2rem;
  }}
  footer a {{ color: var(--dim); text-decoration: none; transition: color 0.2s; }}
  footer a:hover {{ color: var(--accent); }}
  @media (max-width: 600px) {{
    .hero h1 {{ font-size: 1.6rem; }}
    .container {{ padding: 20px 16px 0; }}
    table {{ font-size: 0.78rem; }}
  }}
</style>
</head>
<body>

<div class="hero-wrap">
  <header class="hero">
    <img class="hero-logo" src="{logo_src}" alt="RustyBot Logo">
    <h1>RustyBot <span>Guide</span></h1>
    <p>How to open a draw — step by step</p>
    <div class="hero-rule"></div>
  </header>
</div>

<div class="nav-wrap">
  <nav class="quick-nav" id="quickNav"></nav>
</div>

<div class="container">
{html_body}

  <footer>
    <p>RustyBot is an unofficial EVE Online tool, not affiliated with CCP Games.</p>
  </footer>
</div>

<a href="#" class="back-top" id="backTop" title="Back to top"><i class="fa-solid fa-arrow-up"></i></a>

<script>
  (function() {{
    var nav = document.getElementById('quickNav');
    var headings = document.querySelectorAll('.container h2');
    headings.forEach(function(h) {{
      var id = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      h.id = id;
      var a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = h.textContent;
      nav.appendChild(a);
    }});
    var btn = document.getElementById('backTop');
    window.addEventListener('scroll', function() {{
      btn.classList.toggle('visible', window.scrollY > 400);
    }});
  }})();
</script>

</body>
</html>"""

    html_path.write_text(page, encoding="utf-8")
    print(f"Written: {html_path}")

if __name__ == "__main__":
    convert()
