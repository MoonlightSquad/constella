"""ONNX Runtime сесія: одна тепла модель на процес, warm-up при старті.

Лейбли беруться з meta.json, а не з коду: міняти модель на іншу з тим самим
контрактом {drawings,neutral,sexy,porn,hentai} — це правка конфіга, не правка сервісу.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time

import numpy as np
import onnxruntime as ort

from .decode import UndecodableImage, to_tensor

logger = logging.getLogger("nsfw.classifier")


class ModelMisconfigured(Exception):
    """Вага не збігається з meta.json — сервіс не повинен відповідати взагалі."""


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits.astype(np.float32) - float(np.max(logits))
    exp = np.exp(shifted)
    return exp / float(exp.sum())


class Classifier:
    def __init__(self, model_path: str, meta_path: str, intra_op_threads: int) -> None:
        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)
        labels = [label.lower() for label in meta["labels"]]
        self.labels = labels
        self.model_tag = meta.get("tag") or os.path.basename(model_path)
        self.image_size = int(meta.get("image_size", 224))
        if set(labels) != {"drawings", "neutral", "sexy", "porn", "hentai"}:
            raise ModelMisconfigured(f"unexpected label set: {labels}")
        # Зважений хеш з meta.json: підмінена або обірвана вага не повинна мовчки
        # міняти вердикти модерації.
        expected = meta.get("sha256")
        if expected:
            digest = hashlib.sha256()
            with open(model_path, "rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise ModelMisconfigured(f"model sha256 {digest.hexdigest()} != meta {expected}")

        options = ort.SessionOptions()
        # Третє ядро лишається за decode, Caddy і OS; більше потоків на цій машині
        # просто перемелювали б кеш.
        options.intra_op_num_threads = intra_op_threads
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(
            model_path,
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.input_name = self.session.get_inputs()[0].name
        self.warm_up()

    def warm_up(self) -> None:
        # Перший inference на ORT — це JIT і аллокація арени; без нього перший
        # користувач отримав би таймаут замість вердикту.
        blank = np.zeros((1, 3, self.image_size, self.image_size), dtype=np.float32)
        self.session.run(None, {self.input_name: blank})
        logger.info("model warm", extra={"model": self.model_tag, "input": self.input_name})

    def scores(self, raw: bytes) -> tuple[dict[str, float], float]:
        started = time.perf_counter()
        tensor = to_tensor(raw, self.image_size)
        logits = self.session.run(None, {self.input_name: tensor})[0][0]
        probabilities = _softmax(logits)
        scores = {label: float(p) for label, p in zip(self.labels, probabilities)}
        return scores, (time.perf_counter() - started) * 1000.0


__all__ = ["Classifier", "ModelMisconfigured", "UndecodableImage"]
