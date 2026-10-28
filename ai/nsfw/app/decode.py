"""Байти зображення -> вхід тензор-сесії.

Процесор `LukeJacob2023/nsfw-image-detector` (VitImageProcessor, preprocessor_config.json)
робить рівно три речі: resize до 224x224 білінійно, /255 і нормалізацію (x-0.5)/0.5.
Тому тут немає transformers/torch — залежність від них додала б ~2 ГБ до образу заради
трьох рядків, які можна перевірити очима.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

MEAN = np.array([0.5, 0.5, 0.5], dtype=np.float32)
STD = np.array([0.5, 0.5, 0.5], dtype=np.float32)


class UndecodableImage(Exception):
    """Картинки немає, або піратський/битий файл. Це 422, не 500: вердикту немає."""


def to_tensor(raw: bytes, size: int = 224) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image = image.convert("RGB")
            image = image.resize((size, size), Image.Resampling.BILINEAR)
            array = np.asarray(image, dtype=np.float32)
    except Exception as exc:  # PIL кидає до десятків різних типів залежно від файлу
        raise UndecodableImage(str(exc) or exc.__class__.__name__) from exc

    array = array / 255.0
    array = (array - MEAN) / STD
    return np.ascontiguousarray(array.transpose(2, 0, 1)[np.newaxis, ...])
