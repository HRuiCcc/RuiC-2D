"""PSD 分层读取器的自测：自己写一个最小的分层 PSD，再读回来校验。

运行：python3 tools/test_psd.py
"""
import json
import struct
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import psd_import


def packbits(data):
    out = bytearray()
    i, n = 0, len(data)
    while i < n:
        run = 1
        while i + run < n and run < 128 and data[i + run] == data[i]:
            run += 1
        if run >= 3:
            out.append(257 - run)
            out.append(data[i])
            i += run
            continue
        start = i
        i += 1
        while i < n and i - start < 128:
            if i + 2 < n and data[i] == data[i + 1] == data[i + 2]:
                break
            i += 1
        out.append(i - start - 1)
        out += data[start:i]
    return bytes(out)


def write_psd(path, width, height, layers):
    records = bytearray(struct.pack('>h', len(layers)))
    channel_data = bytearray()
    for layer in layers:
        plane = layer['rgba']
        top, left = layer['y'], layer['x']
        bottom, right = top + plane.shape[0], left + plane.shape[1]
        records += struct.pack('>4i', top, left, bottom, right)
        channels = [(0, plane[..., 0]), (1, plane[..., 1]), (2, plane[..., 2]), (-1, plane[..., 3])]
        records += struct.pack('>H', len(channels))
        for channel_id, data in channels:
            rle = layer.get('rle', False)
            if rle:
                rows = [packbits(row.tobytes()) for row in data]
                payload = bytearray()
                for packed in rows:
                    payload += struct.pack('>H', len(packed))
                for packed in rows:
                    payload += packed
            else:
                payload = bytearray(data.tobytes())
            records += struct.pack('>hI', channel_id, len(payload) + 2)
            channel_data += struct.pack('>H', 1 if rle else 0) + payload
        records += b'8BIM' + b'norm' + bytes([layer.get('opacity', 255), 0, layer.get('flags', 0), 0])
        extra = bytearray(struct.pack('>I', 0) + struct.pack('>I', 0))
        name = layer['name'].encode('utf-8')
        extra += bytes([len(name)]) + name
        extra += b'\0' * ((4 - ((len(name) + 1) % 4)) % 4)
        unicode = layer['name'].encode('utf-16-be')
        block = struct.pack('>I', len(layer['name'])) + unicode
        extra += b'8BIM' + b'luni' + struct.pack('>I', len(block)) + block
        records += struct.pack('>I', len(extra)) + extra
    layer_info = bytes(records) + bytes(channel_data)
    layer_mask = struct.pack('>I', len(layer_info)) + layer_info + struct.pack('>I', 0)
    data = bytearray(b'8BPS' + struct.pack('>H', 1) + b'\0' * 6)
    data += struct.pack('>HIIHH', 4, height, width, 8, 3)
    data += struct.pack('>I', 0) + struct.pack('>I', 0)
    data += struct.pack('>I', len(layer_mask)) + layer_mask
    data += struct.pack('>H', 0) + bytes(width * height * 3)
    Path(path).write_bytes(bytes(data))


def solid(width, height, rgba):
    arr = np.zeros((height, width, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3] = rgba
    return arr


def main():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'layers.psd'
        write_psd(path, 64, 64, [
            {'name': '身体', 'x': 5, 'y': 5, 'rgba': solid(40, 40, (30, 90, 220, 255)), 'rle': True},
            {'name': '刘海', 'x': 20, 'y': 20, 'rgba': solid(20, 20, (255, 20, 20, 128))},
            {'name': '隐藏层', 'x': 48, 'y': 48, 'rgba': solid(10, 10, (20, 220, 30, 255)), 'flags': 2},
        ])
        doc = psd_import.read_psd(path)
        assert doc['width'] == 64 and doc['height'] == 64, doc['width']
        assert [layer['name'] for layer in doc['layers']] == ['身体', '刘海', '隐藏层']
        assert [layer['visible'] for layer in doc['layers']] == [True, True, False]
        assert doc['layers'][0]['bounds'] == (5, 5, 45, 45)
        assert doc['layers'][1]['image'].getpixel((0, 0)) == (255, 20, 20, 128)

        width, height, scale = psd_import.working_size(64, 64)
        assert (width, height, scale) == (64, 64, 1.0)
        base = psd_import.composite(doc, width, height, scale)
        assert base.getpixel((10, 10)) == (30, 90, 220, 255)
        assert base.getpixel((25, 25)) == (143, 55, 120, 255)
        assert base.getpixel((53, 53))[3] == 0, '隐藏图层不应出现在合成图里'

        info = psd_import.inspect(path)
        assert info['width'] == 64 and info['height'] == 64
        assert info['layers'] == ['身体', '刘海']
        assert info['preview'].startswith('data:image/png;base64,')
        print(json.dumps({'ok': True, 'layers': len(doc['layers']), 'previewBytes': len(info['preview'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
