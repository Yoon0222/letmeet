from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


INPUT_DIR = Path(r"C:\Users\SEPC\Downloads\peanut-screenshots-v2")
OUTPUT_DIR = Path(r"C:\Users\SEPC\Documents\PythonProject\pickleball\iphone-screenshots")

TARGET_W = 1179
TARGET_H = 2556
STATUS_H = 72
HOME_H = 38


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def edge_color(img: Image.Image, y: int) -> tuple[int, int, int]:
    pixels = [
        img.getpixel((0, y))[:3],
        img.getpixel((img.width - 1, y))[:3],
        img.getpixel((img.width // 2, y))[:3],
    ]
    return tuple(sum(pixel[i] for pixel in pixels) // len(pixels) for i in range(3))


def draw_status_bar(draw: ImageDraw.ImageDraw, bg: tuple[int, int, int]) -> None:
    ink = (17, 24, 39) if luminance(bg) > 130 else (255, 255, 255)
    draw.text((54, 24), "9:41", fill=ink, font=font(27, bold=True))

    # Dynamic Island style cutout.
    island_w, island_h = 146, 42
    island_x = (TARGET_W - island_w) // 2
    draw.rounded_rectangle(
        [island_x, 16, island_x + island_w, 16 + island_h],
        radius=island_h // 2,
        fill=(8, 10, 14),
    )

    # Cellular bars.
    x = TARGET_W - 180
    base_y = 48
    for i, h in enumerate([8, 12, 16, 20]):
        draw.rounded_rectangle(
            [x + i * 9, base_y - h, x + i * 9 + 5, base_y],
            radius=2,
            fill=ink,
        )

    # Wi-Fi mark, intentionally simple at screenshot scale.
    wx, wy = TARGET_W - 130, 33
    draw.arc([wx, wy, wx + 30, wy + 24], 205, 335, fill=ink, width=3)
    draw.arc([wx + 7, wy + 8, wx + 23, wy + 21], 205, 335, fill=ink, width=3)
    draw.ellipse([wx + 13, wy + 20, wx + 17, wy + 24], fill=ink)

    # Battery.
    bx, by = TARGET_W - 82, 29
    draw.rounded_rectangle([bx, by, bx + 42, by + 22], radius=6, outline=ink, width=3)
    draw.rounded_rectangle([bx + 44, by + 7, bx + 48, by + 15], radius=2, fill=ink)
    draw.rounded_rectangle([bx + 5, by + 5, bx + 32, by + 17], radius=4, fill=ink)


def draw_home_indicator(draw: ImageDraw.ImageDraw, bg: tuple[int, int, int]) -> None:
    ink = (8, 10, 14) if luminance(bg) > 130 else (255, 255, 255)
    w, h = 164, 6
    x = (TARGET_W - w) // 2
    y = TARGET_H - 24
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=ink)


def convert(path: Path) -> None:
    img = Image.open(path).convert("RGB")
    top_bg = edge_color(img, 0)
    bottom_bg = edge_color(img, img.height - 1)

    available_h = TARGET_H - STATUS_H - HOME_H
    scale = min(TARGET_W / img.width, available_h / img.height)
    scaled = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (TARGET_W, TARGET_H), top_bg)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, STATUS_H, TARGET_W, TARGET_H], fill=bottom_bg)

    x = (TARGET_W - scaled.width) // 2
    y = STATUS_H
    canvas.paste(scaled, (x, y))

    draw = ImageDraw.Draw(canvas)
    if x > 0:
        draw.rectangle([0, STATUS_H, x, STATUS_H + scaled.height], fill=edge_color(img, img.height // 2))
        draw.rectangle([x + scaled.width, STATUS_H, TARGET_W, STATUS_H + scaled.height], fill=edge_color(img, img.height // 2))

    draw_status_bar(draw, top_bg)
    draw_home_indicator(draw, bottom_bg)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT_DIR / path.name, optimize=True)


def main() -> None:
    for path in sorted(INPUT_DIR.glob("*.png")):
        convert(path)
        print(f"created {OUTPUT_DIR / path.name}")


if __name__ == "__main__":
    main()
