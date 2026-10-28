#!/usr/bin/env python3
"""Готує артефакти моделі для образу: `model.onnx` + `meta.json`.

Запускається один раз на збірці (див. Dockerfile), тому тут можна мати залежності,
яких немає в рантаймі. Два шляхи:

  --source hf              експорт з apache-2.0 ваг через optimum + динамічна
                           int8-квантизація, і головне — порівняння ONNX-сесії з
                           transformers-еталоном на тому самому вході. Якщо
                           розбіжність перевищує допуск, збірка падає.
  --source hub-onnx        завантажити чужий готовий ONNX за піненним revision і
                           sha256. Швидше (без torch), але цей репо не має теґу
                           ліцензії — для продакшену обирайте `hf`.

`meta.json` — єдине джерело лейблів і розміру входу для сервісу: міняємо модель,
конфиг міняється сам, код — ні.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import statistics
import time
from pathlib import Path

UPSTREAM_MODEL = "LukeJacob2023/nsfw-image-detector"
UPSTREAM_REVISION = "d6c321d7b1c6e2ff6e8f338bf610ce782cfae19b"
# onnx-community — ре-експорт тієї самої UPSTREAM_MODEL, але у того репо немає
# license-теґу, тож продакшен-шлях — `hf`.
HUB_ONNX_REPO = "onnx-community/nsfw-image-detector-ONNX"
HUB_ONNX_REVISION = "6626debca038a8f7aa1729b1eaee3bd4eb929ad6"
HUB_ONNX_FILE = "onnx/model_int8.onnx"
HUB_ONNX_SHA256 = ""  # заповніть на першому успішному завантаженні, інакше флаг --allow-unverified

REQUIRED_LABELS = {"drawings", "neutral", "sexy", "porn", "hentai"}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json_from_hub(repo: str, revision: str, filename: str) -> dict:
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(repo_id=repo, revision=revision, filename=filename)
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def upstream_shape(revision: str) -> tuple[list[str], int]:
    config = read_json_from_hub(UPSTREAM_MODEL, revision, "config.json")
    id2label = {int(key): value for key, value in config["id2label"].items()}
    labels = [id2label[index].lower() for index in sorted(id2label)]
    processor = read_json_from_hub(UPSTREAM_MODEL, revision, "preprocessor_config.json")
    size = processor.get("size") or {"height": 224, "width": 224}
    return labels, int(size.get("height", 224))


def synthetic_image(size: int):
    """Детермінований вхід без випадковості: той самий кадр на будь-якій машині."""
    from PIL import Image
    import numpy as np

    base = np.zeros((size, size, 3), dtype=np.uint8)
    axis = np.linspace(0, 255, size, dtype=np.uint8)
    base[:, :, 0] = axis[:, None]
    base[:, :, 1] = axis[None, :]
    base[:, :, 2] = (axis[:, None] + axis[None, :]) // 2
    return Image.fromarray(base, "RGB")


def export_with_optimum(model_id: str, revision: str, opset: int, workdir: Path) -> Path:
    # CLI `optimum-cli export onnx` не має --revision (ні в 1.x, ні в 2.x), а пін
    # revision для нас обов'язковий, тому кличемо main_export напряму.
    from optimum.exporters.onnx import main_export

    target = workdir / "fp32"
    main_export(
        model_name_or_path=model_id,
        output=target,
        task="image-classification",
        opset=opset,
        revision=revision,
        use_subprocess=True,
    )
    return target / "model.onnx"


def quantize_int8(source: Path, target: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    # На aarch64 динамічна квантизація в QUInt8, на x86 — у QInt8: ORT на цих
    # платформах мають різні швидкі шляхи для цих типів.
    weight_type = QuantType.QUInt8 if platform.machine() == "aarch64" else QuantType.QInt8
    quantize_dynamic(str(source), str(target), weight_type=weight_type)


def verify(model_path: Path, revision: str, image_size: int, tolerance: float) -> dict:
    """ORT проти transformers-еталону на одному вході. Інтернет тут уже не потрібен,
    крім ваг еталону, які хаб завантажить у кеш."""
    import numpy as np
    import onnxruntime as ort
    import torch
    from transformers import AutoImageProcessor, AutoModelForImageClassification

    image = synthetic_image(image_size)
    processor = AutoImageProcessor.from_pretrained(UPSTREAM_MODEL, revision=revision)
    inputs = processor(images=image, return_tensors="pt")
    reference = AutoModelForImageClassification.from_pretrained(UPSTREAM_MODEL, revision=revision)
    reference.eval()
    with torch.no_grad():
        ref_logits = reference(**inputs).logits[0].numpy()

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    ort_logits = session.run(None, {session.get_inputs()[0].name: inputs["pixel_values"].numpy()})[0][0]

    def softmax(vector):
        shifted = vector - float(vector.max())
        exp = np.exp(shifted)
        return exp / exp.sum()

    max_diff = float(abs(ref_logits - ort_logits).max())
    variation = float(0.5 * abs(softmax(ref_logits) - softmax(ort_logits)).sum())
    result = {
        "input_name": session.get_inputs()[0].name,
        "max_logit_abs_diff": round(max_diff, 6),
        "softmax_total_variation": round(variation, 6),
        "top1_match": bool(int(ref_logits.argmax()) == int(ort_logits.argmax())),
        "tolerance_total_variation": tolerance,
    }
    if variation > tolerance or not result["top1_match"]:
        raise SystemExit(f"export does not match the reference model: {result}")
    return result


def benchmark(model_path: Path, image_size: int, runs: int) -> dict:
    import numpy as np
    import onnxruntime as ort

    tensor = np.zeros((1, 3, image_size, image_size), dtype=np.float32)
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    name = session.get_inputs()[0].name
    session.run(None, {name: tensor})
    samples = []
    for _ in range(runs):
        started = time.perf_counter()
        session.run(None, {name: tensor})
        samples.append((time.perf_counter() - started) * 1000.0)
    return {
        "runs": runs,
        "warm_p50_ms": round(statistics.median(samples), 1),
        "warm_p95_ms": round(sorted(samples)[max(runs - 1, int(runs * 0.95) - 1)], 1),
        "note": "нульовий вхід без decode: нижня межа чистої інференції на машині збірки",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.environ.get("ARTIFACT_OUT", "artifacts"))
    parser.add_argument("--source", choices=["hf", "hub-onnx"], default="hf")
    parser.add_argument("--revision", default=UPSTREAM_REVISION)
    parser.add_argument("--quant", choices=["int8", "fp32"], default="int8")
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--tolerance", type=float, default=0.05)
    parser.add_argument("--bench-runs", type=int, default=20)
    parser.add_argument("--sha256", default=os.environ.get("HUB_ONNX_SHA256", HUB_ONNX_SHA256))
    parser.add_argument("--allow-unverified", action="store_true")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    labels, image_size = upstream_shape(args.revision)
    if set(labels) != REQUIRED_LABELS:
        raise SystemExit(f"model label set changed, the API contract would break: {labels}")

    workdir = out / "_work"
    final = out / "model.onnx"

    if args.source == "hf":
        fp32 = export_with_optimum(UPSTREAM_MODEL, args.revision, args.opset, workdir)
        if args.quant == "int8":
            quantize_int8(fp32, final)
        else:
            shutil.copyfile(fp32, final)
        verified = verify(final, args.revision, image_size, args.tolerance)
        shutil.rmtree(workdir, ignore_errors=True)
    else:
        from huggingface_hub import hf_hub_download

        cached = hf_hub_download(
            repo_id=HUB_ONNX_REPO,
            revision=HUB_ONNX_REVISION,
            filename=HUB_ONNX_FILE,
        )
        digest = hashlib.sha256(Path(cached).read_bytes()).hexdigest()
        if args.sha256 and digest != args.sha256:
            raise SystemExit(f"checksum mismatch for {HUB_ONNX_FILE}: got {digest}")
        if not args.sha256 and not args.allow_unverified:
            raise SystemExit(f"no --sha256 given; first run reports {digest}, pin it and rerun")
        # copy, не move: файл у кеші Hugging Face — symlink, і переміщення зіпсувало б
        # кеш для наступних запусків.
        shutil.copyfile(cached, final)
        verified = {"skipped": "third-party export, no torch reference in this path", "sha256": digest}

    meta = {
        "tag": f"nsfw-vit-base-{image_size}-{args.source}-{args.quant}",
        "upstream_model": UPSTREAM_MODEL,
        "revision": args.revision,
        "source": args.source,
        "quantization": args.quant,
        "opset": args.opset,
        "labels": labels,
        "image_size": image_size,
        "sha256": sha256_of(final),
        "bytes": final.stat().st_size,
        "verified": verified,
        "benchmark": benchmark(final, image_size, args.bench_runs),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
