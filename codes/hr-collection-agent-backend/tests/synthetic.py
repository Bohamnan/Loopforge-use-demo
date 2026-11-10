"""Synthetic documents (fictional person) for tests and the manual spike (B-06).

Standard library only. All text is upper-case ASCII so the 5x7 bitmap font can render it.
"""

import struct
import zlib

# Fictional resume used as ground truth by the spike.
RESUME_LINES = [
    "ZHANG SAN",
    "BACKEND ENGINEER",
    "PHONE 13800138000",
    "EMAIL ZS@EXAMPLE.COM",
    "CITY SHANGHAI",
    "SKILLS PYTHON SQL",
    "EDUCATION",
    "EXAMPLE UNIVERSITY BSC COMPUTER SCIENCE 2015 2019",
    "WORK EXPERIENCE",
    "EXAMPLE CORP BACKEND ENGINEER 2019 2024",
]

# 5x7 bitmap font (rows top to bottom, '#' = ink) for the synthetic PNG.
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".####"],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    " ": ["....."] * 7,
}


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _assemble_pdf(objs: list[bytes]) -> bytes:
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def build_text_pdf(pages: list[list[str]]) -> bytes:
    """Minimal PDF with a text layer: one list of lines per page (Helvetica)."""
    n = len(pages)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n))
    font_id = 3 + 2 * n
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode(),
    ]
    for i, lines in enumerate(pages):
        ops = ["BT", "/F1 14 Tf", "50 780 Td", "18 TL"]
        ops += [f"({_escape(line)}) Tj T*" for line in lines]
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objs.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {4 + 2 * i} 0 R >>".encode()
        )
        objs.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Font /BaseFont /Helvetica >>")
    return _assemble_pdf(objs)


def render_gray(lines: list[str], scale: int = 4) -> tuple[int, int, bytes]:
    """Render lines with the bitmap font; return (width, height, 8-bit gray rows)."""
    char_w, char_h, gap, margin = 5, 7, 1, 4
    width = (max(len(x) for x in lines) * (char_w + gap) + 2 * margin) * scale
    height = (len(lines) * (char_h + 3) + 2 * margin) * scale
    pixels = [bytearray(b"\xff" * width) for _ in range(height)]
    for row_i, line in enumerate(lines):
        for col_i, ch in enumerate(line):
            glyph = FONT.get(ch, FONT[" "])
            for gy, row in enumerate(glyph):
                for gx, cell in enumerate(row):
                    if cell != "#":
                        continue
                    x0 = (margin + col_i * (char_w + gap) + gx) * scale
                    y0 = (margin + row_i * (char_h + 3) + gy) * scale
                    for dy in range(scale):
                        pixels[y0 + dy][x0 : x0 + scale] = b"\x00" * scale
    return width, height, b"".join(bytes(r) for r in pixels)


def build_png(lines: list[str], scale: int = 4) -> bytes:
    """Grayscale PNG of the lines."""
    width, height, gray = render_gray(lines, scale)
    raw = b"".join(b"\x00" + gray[y * width : (y + 1) * width] for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def build_scan_pdf(lines: list[str], scale: int = 4) -> bytes:
    """Scan-style PDF: a single page that is only an image (no text layer)."""
    width, height, gray = render_gray(lines, scale)
    data = zlib.compress(gray)
    content = b"q %d 0 0 %d 0 0 cm /Im0 Do Q" % (width, height)
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
        b"/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>" % (width, height),
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
        b"/BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n"
        % (width, height, len(data))
        + data
        + b"\nendstream",
    ]
    return _assemble_pdf(objs)
