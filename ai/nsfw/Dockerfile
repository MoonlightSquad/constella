# Два stage: у першому робимо ONNX з ваг і перевіряємо експорт, у другому — лише
# inference. AI-box не повинен бачити нічого, крім одного файлу ваги і одного токена.
#
#   docker build -t constella-nsfw:local .
#   docker build -t constella-nsfw:local \
#     --build-arg MODEL_SOURCE=hub-onnx --build-arg HUB_ONNX_SHA256=<sha> .
#
# Збірка прив'язана до архітектури машини (інтенсивність і тип квантизації
# різняться для x86_64/aarch64), тож образ збираємо на боксі, а не на ноутбуці.
#
# ARG TORCH_INDEX_URL="" — на aarch64 CPU-варіанти torch вже в PyPI, а зайвий
# індекс там лише ламає резолв.
FROM python:3.11-slim AS model
ARG MODEL_SOURCE=hf
ARG MODEL_QUANT=int8
ARG HUB_ONNX_SHA256=
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build

COPY build-requirements.txt .
RUN pip install --no-cache-dir \
    ${TORCH_INDEX_URL:+--extra-index-url ${TORCH_INDEX_URL}} \
    -r build-requirements.txt \
 && pip freeze > /build-pip-freeze.txt

COPY export_model.py .
# HUB_ONNX_SHA256 потрапляє в export_model.py через env; без нього шлях hub-onnx
# зупиняє збірку, щоб ніхто не заціпив unpinned ваги.
RUN python export_model.py \
      --output /artifacts \
      --source "${MODEL_SOURCE}" \
      --quant "${MODEL_QUANT}" \
      ${HUB_ONNX_SHA256:+--sha256 "${HUB_ONNX_SHA256}"}

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_PATH=/app/artifacts/model.onnx
WORKDIR /app

RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip freeze > /app/pip-freeze.txt

COPY app ./app
COPY --from=model /artifacts ./artifacts
COPY --from=model /build-pip-freeze.txt ./build-pip-freeze.txt

USER 10001:10001
EXPOSE 8000
# Один процес свідомо: модель одна і тепла, worker'и подвоїли б RSS і з'їли б ядра.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--workers", "1"]
