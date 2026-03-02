"""ML model loading and inference for Valeon diagnostic endpoints."""

from __future__ import annotations

import io
import logging
import threading
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom Keras layers — must be registered BEFORE any model is loaded
# ---------------------------------------------------------------------------
# MBConvBlock is the core building block of the skin EfficientNet BEAST v2
# model. Keras 3 cannot deserialize custom layers from a .keras file unless
# the class is decorated with @register_keras_serializable AND imported
# (i.e. the decorator has actually run) before load_model() is called.
# We define it here at module import time so the registry is always populated.

import keras


@keras.saving.register_keras_serializable(package="custom")
class MBConvBlock(keras.layers.Layer):
    """Mobile Inverted Bottleneck Conv block with optional Squeeze-and-Excitation.

    Config keys mirror those stored in the .keras bundle:
        filters, kernel_size, strides, expand_ratio, se_ratio,
        drop_connect_rate, input_filters
    """

    def __init__(
        self,
        filters: int,
        kernel_size: int = 3,
        strides: int = 1,
        expand_ratio: int = 1,
        se_ratio: float = 0.25,
        drop_connect_rate: float = 0.0,
        input_filters: int = 0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.filters = filters
        self.kernel_size = kernel_size
        self.strides = strides
        self.expand_ratio = expand_ratio
        self.se_ratio = se_ratio
        self.drop_connect_rate = drop_connect_rate
        self.input_filters = input_filters

        self._expanded_filters = max(1, int(input_filters * expand_ratio))
        self._se_filters = max(1, int(input_filters * se_ratio))
        self._use_residual = (strides == 1 and input_filters == filters)

    def build(self, input_shape):
        # Expansion phase (pointwise) — skip when expand_ratio == 1
        if self.expand_ratio != 1:
            self._expand_conv = keras.layers.Conv2D(
                self._expanded_filters, 1, padding="same", use_bias=False
            )
            self._expand_bn = keras.layers.BatchNormalization()

        # Depthwise conv
        self._dw_conv = keras.layers.DepthwiseConv2D(
            self.kernel_size,
            strides=self.strides,
            padding="same",
            use_bias=False,
        )
        self._dw_bn = keras.layers.BatchNormalization()

        # Squeeze-and-Excitation
        if self.se_ratio > 0:
            self._se_reduce = keras.layers.Conv2D(
                self._se_filters, 1, padding="same", activation="swish"
            )
            self._se_expand = keras.layers.Conv2D(
                self._expanded_filters, 1, padding="same", activation="sigmoid"
            )

        # Pointwise projection
        self._project_conv = keras.layers.Conv2D(
            self.filters, 1, padding="same", use_bias=False
        )
        self._project_bn = keras.layers.BatchNormalization()

        # Stochastic depth (drop connect)
        if self.drop_connect_rate > 0 and self._use_residual:
            self._drop = keras.layers.Dropout(
                self.drop_connect_rate, noise_shape=(None, 1, 1, 1)
            )
        else:
            self._drop = None

        super().build(input_shape)

    def call(self, inputs, training=None):
        x = inputs

        # Expansion
        if self.expand_ratio != 1:
            x = keras.activations.swish(self._expand_bn(self._expand_conv(x), training=training))

        # Depthwise
        x = keras.activations.swish(self._dw_bn(self._dw_conv(x), training=training))

        # SE
        if self.se_ratio > 0:
            se = keras.layers.GlobalAveragePooling2D(keepdims=True)(x)
            se = self._se_expand(self._se_reduce(se))
            x = x * se

        # Projection
        x = self._project_bn(self._project_conv(x), training=training)

        # Residual + drop connect
        if self._use_residual:
            if self._drop is not None:
                x = self._drop(x, training=training)
            x = x + inputs

        return x

    def get_config(self):
        base = super().get_config()
        base.update(
            dict(
                filters=self.filters,
                kernel_size=self.kernel_size,
                strides=self.strides,
                expand_ratio=self.expand_ratio,
                se_ratio=self.se_ratio,
                drop_connect_rate=self.drop_connect_rate,
                input_filters=self.input_filters,
            )
        )
        return base


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "cataract": {
        "repo_id": "Arko007/Cataract-Detection-CNN",
        "arch_file": "model_architecture.json",
        "weights_file": "model_weights.weights.h5",
        "framework": "keras_json_weights",
        "input_size": (224, 224),
        "classes": ["Normal", "Cataract"],
    },
    "diabetic_retinopathy": {
        "repo_id": "Arko007/diabetic-retinopathy-v1",
        "filename": "best_model.h5",
        "framework": "tf",
        "input_size": (384, 384),
        "classes": [
            "No DR",
            "Mild",
            "Moderate",
            "Severe",
            "Proliferative DR",
        ],
    },
    "kidney": {
        "repo_id": "Arko007/kidney-ct-classifier-efficientnet",
        "filename": "best_model.pth",
        "framework": "pytorch_efficientnet",
        "input_size": (224, 224),
        "classes": ["Cyst", "Normal", "Stone", "Tumor"],
    },
    "skin": {
        "repo_id": "Arko007/skin-disease-detector-ai",
        # Custom EfficientNet BEAST v2 with MBConvBlock — Keras 3 .keras bundle
        "filename": "model.keras",
        "framework": "keras3",
        "input_size": (512, 512),
        "classes": [
            "Actinic Keratosis",
            "Basal Cell Carcinoma",
            "Dermatofibroma",
            "Nevus",
            "Pigmented Benign Keratosis",
            "Seborrheic Keratosis",
            "Squamous Cell Carcinoma",
            "Vascular Lesion",
        ],
    },
    "cardiac": {
        "repo_id": "Arko007/cardiac-mri-cnn",
        "filename": "best_model_epoch20_auc0.8129.pt",
        "framework": "pytorch_cardiac",
        "input_size": (224, 224),
        "classes": ["Normal", "Abnormal"],
    },
}

_loaded_models: dict[str, Any] = {}
_load_locks: dict[str, threading.Lock] = {k: threading.Lock() for k in MODEL_REGISTRY}


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------

def _preprocess_image_tf(image_bytes: bytes, target_size: tuple[int, int]) -> np.ndarray:
    """Return a (1, H, W, 3) float32 array normalised to [0, 1]."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(target_size, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_image_torch(image_bytes: bytes, target_size: tuple[int, int]):
    """Return a torch tensor (1, 3, H, W) with ImageNet normalisation."""
    import torch
    from torchvision import transforms

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    transform = transforms.Compose([
        transforms.Resize(target_size),
        transforms.CenterCrop(target_size),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])
    return transform(img).unsqueeze(0)


# ---------------------------------------------------------------------------
# Cardiac CNN architecture (PyTorch — weights-only .pt)
# ---------------------------------------------------------------------------

def _build_cardiac_model(num_classes: int = 2):
    import torch.nn as nn

    class CardiacCNN(nn.Module):
        def __init__(self, n_classes: int):
            super().__init__()
            self.features = nn.Sequential(
                nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(1),
            )
            self.classifier = nn.Sequential(
                nn.Flatten(),
                nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.5),
                nn.Linear(128, n_classes),
            )

        def forward(self, x):
            return self.classifier(self.features(x))

    return CardiacCNN(num_classes)


# ---------------------------------------------------------------------------
# Model loading (lazy, thread-safe)
# ---------------------------------------------------------------------------

def _download(repo_id: str, filename: str) -> str:
    from huggingface_hub import hf_hub_download
    return hf_hub_download(repo_id=repo_id, filename=filename)


def _load_model(name: str) -> Any:
    cfg = MODEL_REGISTRY[name]
    fw = cfg["framework"]

    # ── Cataract: architecture JSON + weights.h5 stored separately ────────────
    if fw == "keras_json_weights":
        import json

        arch_path = _download(cfg["repo_id"], cfg["arch_file"])
        weights_path = _download(cfg["repo_id"], cfg["weights_file"])

        with open(arch_path, "r") as f:
            arch_json = json.load(f)

        model = keras.models.model_from_json(
            arch_json if isinstance(arch_json, str) else json.dumps(arch_json)
        )
        model.load_weights(weights_path)
        return model

    # ── Skin: Keras 3 .keras bundle with custom MBConvBlock ──────────────────
    # MBConvBlock is registered above via @register_keras_serializable so
    # keras.saving.load_model can locate it during deserialization.
    if fw == "keras3":
        path = _download(cfg["repo_id"], cfg["filename"])
        return keras.saving.load_model(path, compile=False)

    # ── Plain .h5 full model ───────────────────────────────────────────────────
    if fw == "tf":
        import tensorflow as tf
        path = _download(cfg["repo_id"], cfg["filename"])
        return tf.keras.models.load_model(path, compile=False)

    # ── PyTorch EfficientNet (efficientnet-pytorch library) ───────────────────
    if fw == "pytorch_efficientnet":
        import torch
        from efficientnet_pytorch import EfficientNet

        path = _download(cfg["repo_id"], cfg["filename"])
        model = EfficientNet.from_name("efficientnet-b0", num_classes=len(cfg["classes"]))
        state = torch.load(path, map_location="cpu", weights_only=False)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state, strict=False)
        model.eval()
        return model

    # ── PyTorch cardiac CNN (weights-only .pt) ────────────────────────────────
    if fw == "pytorch_cardiac":
        import torch

        path = _download(cfg["repo_id"], cfg["filename"])
        state = torch.load(path, map_location="cpu", weights_only=False)

        if isinstance(state, dict):
            sd = state.get("model_state_dict", state)
            model = _build_cardiac_model(len(cfg["classes"]))
            model.load_state_dict(sd, strict=False)
        else:
            model = state

        model.eval()
        return model

    raise ValueError(f"Unknown framework: {fw}")


def get_model(name: str) -> Any:
    """Return a loaded model (lazy, cached, thread-safe)."""
    if name not in MODEL_REGISTRY:
        raise KeyError(f"Unknown model: {name}")
    if name not in _loaded_models:
        with _load_locks[name]:
            if name not in _loaded_models:
                logger.info("Loading model %s \u2026", name)
                _loaded_models[name] = _load_model(name)
                logger.info("Model %s loaded and cached.", name)
    return _loaded_models[name]


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def predict(name: str, image_bytes: bytes) -> dict[str, float]:
    cfg = MODEL_REGISTRY[name]
    model = get_model(name)
    fw = cfg["framework"]
    classes = cfg["classes"]
    size = cfg["input_size"]

    if fw in ("tf", "keras3", "keras_json_weights"):
        inp = _preprocess_image_tf(image_bytes, size)
        raw = model.predict(inp, verbose=0)
        probs = raw[0]

        if probs.shape[-1] == 1:
            p = float(probs[0])
            probs_list = [1.0 - p, p]
        else:
            probs_list = probs.tolist()
            total = sum(probs_list)
            if total > 0:
                probs_list = [x / total for x in probs_list]

        probs_list = probs_list[: len(classes)]
        while len(probs_list) < len(classes):
            probs_list.append(0.0)

        return {c: round(p, 6) for c, p in zip(classes, probs_list)}

    # PyTorch
    import torch

    inp = _preprocess_image_torch(image_bytes, size)
    with torch.no_grad():
        logits = model(inp)
        if logits.shape[-1] == 1:
            p = torch.sigmoid(logits).item()
            probs_list = [1.0 - p, p]
        else:
            probs_list = torch.softmax(logits, dim=-1).squeeze().tolist()

    if isinstance(probs_list, float):
        probs_list = [probs_list]

    probs_list = probs_list[: len(classes)]
    while len(probs_list) < len(classes):
        probs_list.append(0.0)

    return {c: round(p, 6) for c, p in zip(classes, probs_list)}
