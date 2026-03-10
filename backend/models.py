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
# Custom Keras layers
# Must be registered BEFORE any model is loaded.
# We register twice:
#   1. package="custom"  -> key "custom>MBConvBlock" (standard)
#   2. package=""        -> key "MBConvBlock"         (what the .keras bundle stores)
# The .keras file was saved with 'registered_name': 'MBConvBlock' and
# 'module': None, so Keras looks up the bare name first. Without the
# second registration the lookup fails even though the class exists.
# ---------------------------------------------------------------------------
import keras


@keras.saving.register_keras_serializable(package="custom")
class MBConvBlock(keras.layers.Layer):
    """Mobile Inverted Bottleneck Conv block with optional Squeeze-and-Excitation."""

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
        if self.expand_ratio != 1:
            self._expand_conv = keras.layers.Conv2D(
                self._expanded_filters, 1, padding="same", use_bias=False
            )
            self._expand_bn = keras.layers.BatchNormalization()

        self._dw_conv = keras.layers.DepthwiseConv2D(
            self.kernel_size,
            strides=self.strides,
            padding="same",
            use_bias=False,
        )
        self._dw_bn = keras.layers.BatchNormalization()

        if self.se_ratio > 0:
            self._se_reduce = keras.layers.Conv2D(
                self._se_filters, 1, padding="same", activation="swish"
            )
            self._se_expand = keras.layers.Conv2D(
                self._expanded_filters, 1, padding="same", activation="sigmoid"
            )

        self._project_conv = keras.layers.Conv2D(
            self.filters, 1, padding="same", use_bias=False
        )
        self._project_bn = keras.layers.BatchNormalization()

        if self.drop_connect_rate > 0 and self._use_residual:
            self._drop = keras.layers.Dropout(
                self.drop_connect_rate, noise_shape=(None, 1, 1, 1)
            )
        else:
            self._drop = None

        super().build(input_shape)

    def call(self, inputs, training=None):
        x = inputs

        if self.expand_ratio != 1:
            x = keras.activations.swish(
                self._expand_bn(self._expand_conv(x), training=training)
            )

        x = keras.activations.swish(
            self._dw_bn(self._dw_conv(x), training=training)
        )

        if self.se_ratio > 0:
            se = keras.layers.GlobalAveragePooling2D(keepdims=True)(x)
            se = self._se_expand(self._se_reduce(se))
            x = x * se

        x = self._project_bn(self._project_conv(x), training=training)

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


# Second registration with empty package so bare 'MBConvBlock' key resolves.
# This matches the 'registered_name': 'MBConvBlock' value stored in the bundle.
try:
    keras.saving.register_keras_serializable(package="")(MBConvBlock)
except Exception:
    pass  # Already registered is fine

# Build the explicit custom_objects dict used in every load_model call.
_SKIN_CUSTOM_OBJECTS: dict[str, Any] = {"MBConvBlock": MBConvBlock}


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
        "classes": ["Cataract", "Normal"],
    },
    "diabetic_retinopathy": {
        "repo_id": "Arko007/diabetic-retinopathy-v1",
        "filename": "best_model.h5",
        "framework": "tf",
        "input_size": (384, 384),
        "classes": [
            "Grade 0 - No DR",
            "Grade 1 - Mild DR",
            "Grade 2 - Moderate DR",
            "Grade 3 - Severe DR",
            "Grade 4 - Proliferative DR",
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
        "filename": "model.keras",
        "framework": "keras3",
        "input_size": (512, 512),
        # Exact class order from the HuggingFace README (CLASS_NAMES list)
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
    """Generic PIL-based preprocessing — returns (1, H, W, 3) float32 in [0,1]."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(target_size, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_dr(image_bytes: bytes) -> np.ndarray:
    """Exact IDRiD training pipeline replication (cv2 INTER_LINEAR via PIL BILINEAR)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((384, 384), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_skin(image_bytes: bytes) -> np.ndarray:
    """Skin model preprocessing matching the HuggingFace README exactly.

    README pipeline:
        img = Image.open(image_path).convert('RGB')
        img = img.resize((512, 512))
        img_array = np.array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = tf.cast(img_array, tf.float32) / 255.0

    PIL default resize is BICUBIC (Pillow >= 2.7). We match it exactly.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((512, 512))  # PIL default = BICUBIC, same as README
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


def _load_skin_model(repo_id: str, filename: str) -> Any:
    """Load the skin .keras model with multiple fallback strategies.

    Strategy 1: keras.saving.load_model with explicit custom_objects dict.
                This bypasses the registry lookup entirely.
    Strategy 2: from_pretrained_keras (as shown in the HuggingFace README)
                which handles custom_objects natively.
    Strategy 3: tf.keras.models.load_model with custom_objects (TF compat path).
    """
    path = _download(repo_id, filename)

    # Strategy 1 — explicit custom_objects, no registry lookup needed
    try:
        return keras.saving.load_model(
            path,
            custom_objects=_SKIN_CUSTOM_OBJECTS,
            compile=False,
        )
    except Exception as e1:
        logger.warning("keras.saving.load_model failed for skin: %s", e1)

    # Strategy 2 — from_pretrained_keras (as in the README)
    try:
        from huggingface_hub import from_pretrained_keras
        return from_pretrained_keras(
            repo_id,
            custom_objects=_SKIN_CUSTOM_OBJECTS,
        )
    except Exception as e2:
        logger.warning("from_pretrained_keras failed for skin: %s", e2)

    # Strategy 3 — TF compat path
    import tensorflow as tf
    return tf.keras.models.load_model(
        path,
        custom_objects=_SKIN_CUSTOM_OBJECTS,
        compile=False,
    )


def _load_model(name: str) -> Any:
    cfg = MODEL_REGISTRY[name]
    fw = cfg["framework"]

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

    # Skin model — dedicated loader with custom_objects fallback chain
    if fw == "keras3":
        return _load_skin_model(cfg["repo_id"], cfg["filename"])

    if fw == "tf":
        import tensorflow as tf
        path = _download(cfg["repo_id"], cfg["filename"])
        return tf.keras.models.load_model(path, compile=False)

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
                logger.info("Loading model %s …", name)
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
        if name == "diabetic_retinopathy":
            inp = _preprocess_dr(image_bytes)
        elif name == "skin":
            # Use README-matching preprocessing (PIL default resize, /255.0)
            inp = _preprocess_skin(image_bytes)
        else:
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

    # PyTorch path
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
