"""Generate icon.png (any) and icon-maskable.png (with safe area padding)."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "logo-concepts" / "logo-2-refined.png"

# 1. Standard icon — used as-is
standard = Image.open(SRC).convert("RGBA")
standard.save(ROOT / "icon.png", "PNG", optimize=True)
print(f"icon.png: {standard.size}")

# 2. Maskable icon — PWA spec: inner 80% is safe area
# Resize logo to 80% and center on full canvas (background already dark navy)
SIZE = 1024
SAFE = int(SIZE * 0.80)
canvas = Image.new("RGBA", (SIZE, SIZE), (10, 11, 15, 255))  # match --bg #0a0b0f
resized = standard.resize((SAFE, SAFE), Image.LANCZOS)
offset = (SIZE - SAFE) // 2
canvas.paste(resized, (offset, offset), resized)
canvas.save(ROOT / "icon-maskable.png", "PNG", optimize=True)
print(f"icon-maskable.png: {canvas.size}")
