"""PDF logos → PNG (1024x1024) for icon use."""
import pypdfium2 as pdfium
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
OUT = Path(__file__).parent

sources = [
    ("ios-app-icon-rounded-square--dark-navy-background-.pdf", "logo-1-flat.png"),
    ("ios-app-icon-rounded-square--dark-navy-background- (1).pdf", "logo-2-refined.png"),
    ("ios-app-icon-rounded-square--dark-navy-background- (2).pdf", "logo-3-3d.png"),
]

for src, out_name in sources:
    src_path = DOWNLOADS / src
    if not src_path.exists():
        print(f"MISSING: {src_path}")
        continue
    pdf = pdfium.PdfDocument(str(src_path))
    page = pdf[0]
    # 1024 px at standard PDF DPI
    bitmap = page.render(scale=1024 / page.get_width())
    pil = bitmap.to_pil()
    pil.save(OUT / out_name, "PNG", optimize=True)
    print(f"OK: {out_name} ({pil.size})")
