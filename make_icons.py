"""Generate PNG icons for the extension. Pure stdlib, no dependencies.
Run: python make_icons.py
Produces icons/icon16.png, icon48.png, icon128.png
"""
import os
import zlib
import struct

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")

BG = (255, 0, 0)        # YouTube red
CARD = (255, 255, 255)  # white "document"
LINE = (224, 30, 30)    # red text lines
SS = 4                  # supersampling factor for smooth edges


def rounded_rect(nx, ny, x0, y0, x1, y1, r):
    """Return True if normalized point (nx, ny) is inside a rounded rect."""
    if nx < x0 or nx > x1 or ny < y0 or ny > y1:
        return False
    cx = min(max(nx, x0 + r), x1 - r)
    cy = min(max(ny, y0 + r), y1 - r)
    return (nx - cx) ** 2 + (ny - cy) ** 2 <= r * r


def sample(nx, ny):
    """Color (r, g, b, a) at normalized coord."""
    # text lines on the card
    if rounded_rect(nx, ny, 0.36, 0.34, 0.64, 0.385, 0.02):
        return (*LINE, 255)
    if rounded_rect(nx, ny, 0.36, 0.475, 0.64, 0.52, 0.02):
        return (*LINE, 255)
    if rounded_rect(nx, ny, 0.36, 0.61, 0.56, 0.655, 0.02):
        return (*LINE, 255)
    # white card
    if rounded_rect(nx, ny, 0.28, 0.24, 0.72, 0.76, 0.05):
        return (*CARD, 255)
    # red rounded background
    if rounded_rect(nx, ny, 0.0, 0.0, 1.0, 1.0, 0.2):
        return (*BG, 255)
    return (0, 0, 0, 0)


def render(size):
    big = size * SS
    px = bytearray(size * size * 4)
    for oy in range(size):
        for ox in range(size):
            R = G = B = A = 0
            for sy in range(SS):
                for sx in range(SS):
                    nx = ((ox * SS + sx) + 0.5) / big
                    ny = ((oy * SS + sy) + 0.5) / big
                    r, g, b, a = sample(nx, ny)
                    A += a
                    R += r * a
                    G += g * a
                    B += b * a
            n = SS * SS
            i = (oy * size + ox) * 4
            if A > 0:
                px[i] = R // A
                px[i + 1] = G // A
                px[i + 2] = B // A
            px[i + 3] = A // n
    return bytes(px)


def write_png(path, size, rgba):
    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    row = size * 4
    for y in range(size):
        raw.append(0)  # no filter
        raw += rgba[y * row : (y + 1) * row]
    idat = zlib.compress(bytes(raw), 9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 48, 128):
        write_png(os.path.join(OUT_DIR, f"icon{size}.png"), size, render(size))
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
