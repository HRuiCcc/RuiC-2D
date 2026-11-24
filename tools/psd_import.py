"""最小 PSD 分层读取器：只依赖 Pillow + numpy，不引入额外包。

支持 Photoshop 常见的 8 位 RGB / 灰度 PSD，图层压缩支持 RAW 与 RLE。
不支持：PSB、16/32 位、CMYK、ZIP 压缩图层、图层组、图层样式与混合模式。
图层按从下到上的顺序返回；隐藏图层会被保留但合成时跳过。
"""
import base64
import io
import struct
from pathlib import Path

import numpy as np
from PIL import Image

MAX_SIDE = 4096
MAX_WORK = 2048
MAX_LAYERS = 100

# 这些扩展块的长度字段是 8 字节（PSD 里也如此），不跳对会把后续块读错。
BIG_KEYS = {
    b'LMsk', b'Lr16', b'Lr32', b'Layr', b'Mt16', b'Mt32', b'Mtrn', b'Alph',
    b'FMsk', b'lnk2', b'lnk3', b'lnkE', b'FEid', b'FXid', b'PxSD',
}


class PsdError(ValueError):
    pass


def _raw(f, size):
    data = f.read(size)
    if len(data) < size:
        raise PsdError('PSD 文件不完整，可能下载或复制时被截断')
    return data


def _u16(f):
    return struct.unpack('>H', _raw(f, 2))[0]


def _i16(f):
    return struct.unpack('>h', _raw(f, 2))[0]


def _u32(f):
    return struct.unpack('>I', _raw(f, 4))[0]


def _i32(f):
    return struct.unpack('>i', _raw(f, 4))[0]


def _packbits(data, expected):
    """解 PSD 的 PackBits（RLE）行数据。"""
    out = bytearray()
    i, n = 0, len(data)
    while i < n and len(out) < expected:
        header = data[i]
        i += 1
        if header < 128:
            count = header + 1
            out.extend(data[i:i + count])
            i += count
        elif header > 128:
            count = 257 - header
            if i >= n:
                break
            out.extend(bytes([data[i]]) * count)
            i += 1
        # header == 128 是空操作
    if len(out) < expected:
        raise PsdError('PSD 图层压缩数据损坏')
    return bytes(out[:expected])


def _read_channel(f, width, height, length):
    compression = _u16(f)
    size = width * height
    if compression == 0:
        return _raw(f, size)
    if compression == 1:
        counts = [_u16(f) for _ in range(height)]
        chunks = []
        for count in counts:
            chunks.append(_packbits(_raw(f, count), width))
        return b''.join(chunks)
    if compression in (2, 3):
        raise PsdError(
            '图层使用了 ZIP 压缩，暂不支持。请在 Photoshop 首选项 → 文件处理里关闭「压缩 PSD 文件」，'
            '或把图层合并后重新保存。'
        )
    raise PsdError(f'未知的 PSD 图层压缩方式（{compression}）')


def _unicode_name(extra_end, f):
    name = None
    while f.tell() + 12 <= extra_end:
        signature = f.read(4)
        if signature not in (b'8BIM', b'8B64'):
            break
        key = _raw(f, 4)
        if key in BIG_KEYS:
            size = struct.unpack('>Q', _raw(f, 8))[0]
        else:
            size = _u32(f)
        payload = _raw(f, size)
        if key == b'luni' and len(payload) >= 4:
            chars = struct.unpack('>I', payload[:4])[0]
            try:
                name = payload[4:4 + chars * 2].decode('utf-16-be').strip('\x00').strip()
            except UnicodeDecodeError:
                pass
    f.seek(extra_end)
    return name


def read_psd(path):
    """读取 PSD，返回 {width, height, layers:[{name, bounds, image, visible, opacity}]}。"""
    path = Path(path)
    if not path.is_file():
        raise PsdError('找不到 PSD 文件')
    with path.open('rb') as f:
        if _raw(f, 4) != b'8BPS':
            raise PsdError('这不是有效的 PSD 文件（缺少 8BPS 标记）')
        version = _u16(f)
        if version != 1:
            raise PsdError('暂不支持 PSB 大文档格式，请在 Photoshop 中「另存为」普通 PSD')
        _raw(f, 6)
        _u16(f)  # channels
        height = _u32(f)
        width = _u32(f)
        depth = _u16(f)
        color_mode = _u16(f)
        if depth != 8:
            raise PsdError(f'目前只支持 8 位深度的 PSD（当前 {depth} 位）')
        if color_mode not in (1, 3):
            raise PsdError('目前只支持 RGB 或灰度 PSD，请在 Photoshop 里转换颜色模式')
        if width < 16 or height < 16:
            raise PsdError('PSD 尺寸过小，请使用边长 64–4096 像素的文件')
        if max(width, height) > MAX_SIDE:
            raise PsdError(f'PSD 边长请控制在 {MAX_SIDE} 像素以内（当前 {width}×{height}）')

        for _ in range(2):  # 颜色模式数据 + 图像资源
            size = _u32(f)
            f.seek(size, 1)

        layer_mask_size = _u32(f)
        layer_mask_end = f.tell() + layer_mask_size
        if layer_mask_size < 4:
            raise PsdError('PSD 没有图层信息，请在 Photoshop 保存时勾选「最大兼容」')
        layer_info_size = _u32(f)
        layer_info_end = f.tell() + layer_info_size
        count = struct.unpack('>h', _raw(f, 2))[0]
        if count == 0:
            raise PsdError('PSD 没有可导入的图层')
        if abs(count) > MAX_LAYERS:
            raise PsdError(f'PSD 图层过多（{abs(count)} 个），请合并到 {MAX_LAYERS} 个以内再导入')

        records = []
        for index in range(abs(count)):
            top, left, bottom, right = struct.unpack('>4i', _raw(f, 16))
            channel_count = _u16(f)
            channels = [(_i16(f), _u32(f)) for _ in range(channel_count)]
            if _raw(f, 4) != b'8BIM':
                raise PsdError('PSD 图层信息损坏（混合模式标记不正确）')
            _raw(f, 4)  # 混合模式
            opacity = _raw(f, 1)[0]
            _raw(f, 1)  # clipping
            flags = _raw(f, 1)[0]
            _raw(f, 1)
            extra_size = _u32(f)
            extra_end = f.tell() + extra_size

            mask_size = _u32(f)
            f.seek(mask_size, 1)
            blend_size = _u32(f)
            f.seek(blend_size, 1)
            name_len = _raw(f, 1)[0]
            name = _raw(f, name_len).decode('mac_roman', 'replace')
            f.seek((4 - ((name_len + 1) % 4)) % 4, 1)
            unicode_name = _unicode_name(extra_end, f)

            records.append({
                'name': unicode_name or name.strip(),
                'bounds': (left, top, right, bottom),
                'channels': channels,
                'visible': not bool(flags & 2),
                'opacity': opacity,
                'index': index,
            })
        if f.tell() > layer_info_end:
            raise PsdError('PSD 图层信息损坏')

        layers = []
        for record in records:
            left, top, right, bottom = record['bounds']
            w, h = max(0, right - left), max(0, bottom - top)
            pixels = {}
            for channel_id, length in record['channels']:
                if w <= 0 or h <= 0:
                    break
                pixels[channel_id] = _read_channel(f, w, h, length)
            if w <= 0 or h <= 0 or not pixels:
                continue
            try:
                if color_mode == 1:
                    gray = np.frombuffer(pixels[0], np.uint8).reshape(h, w)
                    arr = np.empty((h, w, 4), np.uint8)
                    arr[..., 0] = arr[..., 1] = arr[..., 2] = gray
                else:
                    arr = np.empty((h, w, 4), np.uint8)
                    for index in range(3):
                        if index not in pixels:
                            raise PsdError('PSD 图层缺少颜色通道')
                        arr[..., index] = np.frombuffer(pixels[index], np.uint8).reshape(h, w)
                if -1 in pixels:
                    arr[..., 3] = np.frombuffer(pixels[-1], np.uint8).reshape(h, w)
                else:
                    arr[..., 3] = 255
            except ValueError as error:
                raise PsdError(f'PSD 图层数据损坏：{error}')
            if record['opacity'] < 255:
                arr[..., 3] = (arr[..., 3].astype(np.uint16) * record['opacity'] // 255).astype(np.uint8)
            layers.append({
                'name': record['name'] or f'图层 {record["index"] + 1}',
                'bounds': (left, top, right, bottom),
                'image': Image.fromarray(arr, 'RGBA'),
                'visible': record['visible'],
                'opacity': record['opacity'],
            })
        # 读完图层通道数据后跳到图层与蒙版区末尾，图像数据不需要再解析。
        f.seek(layer_mask_end)
    if not layers:
        raise PsdError('PSD 没有带像素的图层（文字层需要先栅格化）')
    return {'width': width, 'height': height, 'layers': layers}


def working_size(width, height):
    scale = min(1.0, MAX_WORK / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale)), scale


def _composite_at(canvas, image, x, y):
    w, h = image.size
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(canvas.width, x + w), min(canvas.height, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(image.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def composite(doc, width, height, scale=1.0):
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    for layer in doc['layers']:
        if not layer['visible']:
            continue
        image = layer['image']
        left, top, right, bottom = layer['bounds']
        if scale != 1:
            image = image.resize(
                (max(1, round((right - left) * scale)), max(1, round((bottom - top) * scale))),
                Image.LANCZOS,
            )
            left, top = round(left * scale), round(top * scale)
        _composite_at(canvas, image, left, top)
    return canvas


def inspect(path):
    doc = read_psd(path)
    width, height, scale = working_size(doc['width'], doc['height'])
    base = composite(doc, width, height, scale)
    preview = base.copy()
    preview.thumbnail((1280, 1280), Image.LANCZOS)
    buffer = io.BytesIO()
    preview.save(buffer, format='PNG', optimize=True)
    return {
        'ok': True,
        'width': width,
        'height': height,
        'layers': [layer['name'] for layer in doc['layers'] if layer['visible']],
        'layerCount': sum(1 for layer in doc['layers'] if layer['visible']),
        'preview': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode(),
    }
