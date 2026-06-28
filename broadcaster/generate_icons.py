#!/usr/bin/env python3
import os
import sys

# Force headless Qt platform so it works in CI environments
os.environ["QT_QPA_PLATFORM"] = "minimal"

try:
    from PyQt5.QtWidgets import QApplication
    from PyQt5.QtGui import QPixmap, QPainter, QColor, QPen
    from PyQt5.QtCore import Qt, QBuffer, QByteArray
except ImportError as e:
    print(f"Error: PyQt5 is required to run this script. {e}")
    sys.exit(1)

def create_radio_icon(size):
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing)
    
    # Calculate scale factor relative to 512px baseline design
    scale = size / 512.0
    
    # 1. Central Emitter Dot
    painter.setBrush(QColor("#f43f5e"))
    painter.setPen(Qt.NoPen)
    dot_size = int(96 * scale)
    dot_pos = int(208 * scale)
    painter.drawEllipse(dot_pos, dot_pos, dot_size, dot_size)
    
    # 2. Concentric Waves
    painter.setBrush(Qt.NoBrush)
    pen_width = max(1, int(32 * scale))
    pen = QPen(QColor("#f43f5e"), pen_width)
    pen.setCapStyle(Qt.RoundCap)
    painter.setPen(pen)
    
    # Inner waves
    inner_pos = int(128 * scale)
    inner_size = int(256 * scale)
    painter.drawArc(inner_pos, inner_pos, inner_size, inner_size, -60 * 16, 120 * 16)
    painter.drawArc(inner_pos, inner_pos, inner_size, inner_size, 120 * 16, 120 * 16)
    
    # Outer waves
    outer_pos = int(48 * scale)
    outer_size = int(416 * scale)
    painter.drawArc(outer_pos, outer_pos, outer_size, outer_size, -50 * 16, 100 * 16)
    painter.drawArc(outer_pos, outer_pos, outer_size, outer_size, 130 * 16, 100 * 16)
    
    painter.end()
    return pixmap

def get_png_bytes(pixmap):
    byte_array = QByteArray()
    buffer = QBuffer(byte_array)
    buffer.open(QBuffer.WriteOnly)
    pixmap.save(buffer, "PNG")
    return byte_array.data()

def write_ico(png_data, filename):
    # ICO format header: 6 bytes
    # Reserved (2), Type (2), Count (2)
    header = b'\x00\x00\x01\x00\x01\x00'
    
    # Directory entry: 16 bytes
    # Width (1), Height (1), ColorCount (1), Reserved (1), Planes (2), BitCount (2), BytesSize (4), Offset (4)
    # 0 for width/height indicates 256x256
    width = 0
    height = 0
    color_count = 0
    reserved = 0
    planes = 1
    bit_count = 32
    bytes_size = len(png_data)
    offset = 6 + 16
    
    directory = (
        width.to_bytes(1, 'little') +
        height.to_bytes(1, 'little') +
        color_count.to_bytes(1, 'little') +
        reserved.to_bytes(1, 'little') +
        planes.to_bytes(2, 'little') +
        bit_count.to_bytes(2, 'little') +
        bytes_size.to_bytes(4, 'little') +
        offset.to_bytes(4, 'little')
    )
    
    with open(filename, 'wb') as f:
        f.write(header)
        f.write(directory)
        f.write(png_data)

def write_icns(png_data, filename):
    # ICNS format: 'icns' (4 bytes), FileLength (4 bytes, big-endian)
    # Followed by block: Type (4 bytes), Length (4 bytes, big-endian), Data
    # 'ic09' block type represents a 512x512 PNG-encoded icon
    block_type = b'ic09'
    block_len = 8 + len(png_data)
    file_len = 8 + block_len
    
    header = b'icns' + file_len.to_bytes(4, 'big')
    block = block_type + block_len.to_bytes(4, 'big') + png_data
    
    with open(filename, 'wb') as f:
        f.write(header)
        f.write(block)

def main():
    # Set up dummy QApplication for QPixmap / QPainter initialization
    app = QApplication(sys.argv)
    
    # Define and create assets directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(current_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    # 1. Save standard PNG icon (512x512)
    png_path = os.path.join(assets_dir, "icon.png")
    pixmap_512 = create_radio_icon(512)
    pixmap_512.save(png_path, "PNG")
    print(f"[+] Saved PNG icon to: {png_path}")
    
    # 2. Save Windows ICO icon (256x256 PNG embedded in ICO structure)
    ico_path = os.path.join(assets_dir, "icon.ico")
    pixmap_256 = create_radio_icon(256)
    png_bytes_256 = get_png_bytes(pixmap_256)
    write_ico(png_bytes_256, ico_path)
    print(f"[+] Saved ICO icon to: {ico_path}")
    
    # 3. Save macOS ICNS icon (512x512 PNG embedded in ICNS structure)
    icns_path = os.path.join(assets_dir, "icon.icns")
    png_bytes_512 = get_png_bytes(pixmap_512)
    write_icns(png_bytes_512, icns_path)
    print(f"[+] Saved ICNS icon to: {icns_path}")

if __name__ == "__main__":
    main()
