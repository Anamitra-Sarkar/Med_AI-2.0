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
# Model registry – each entry describes how to fetch, load and run a model
# ---------------------------------------------------------------------------

MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "cataract": {
        "repo_id": "Arko007/Cataract-Detection-CNN",
        "filename": "model_weights.weights.h5",
        "framework": "tf_weights",
        "input_size": (224, 224),
        "classes": ["Normal", "Cataract"],
    },
    "diabetic_retinopathy": {
        "repo_id": "Arko007/diabetic-retinopathy-v1",
        "filename": "best_model.h5",
        "framework": "tf",
        "input_size": (224, 224),
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
        "filename": "model.keras",
        "framework": "tf_keras",
        "input_size": (224, 224),
        "classes": [
            "Actinic Keratosis",
            "Basal Cell Carcinoma",
            "Dermatofibroma",
            "Melanoma",
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

# Loaded model objects (lazily populated)
_loaded_models: dict[str, Any] = {}
_load_locks: dict[str, threading.Lock] = {k: threading.Lock() for k in MODEL_REGISTRY}


# ---------------------------------------------------------------------------
# Helpers – image preprocessing
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
# Build architectures needed for weight-only checkpoints
# ---------------------------------------------------------------------------

def _build_cataract_model():
    """Reproduce the CNN architecture used for the cataract .weights.h5 file."""
    import tensorflow as tf

    model = tf.keras.Sequential([
        tf.keras.layers.InputLayer(shape=(224, 224, 3)),
        tf.keras.layers.Conv2D(32, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),
        tf.keras.layers.Conv2D(64, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),
        tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),
        tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),
        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(512, activation="relu"),
        tf.keras.layers.Dropout(0.5),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def _build_cardiac_model(num_classes: int = 2):
    """Simple CNN matching the cardiac MRI checkpoint."""
    import torch
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
    """Download from HF Hub and load into memory."""
    cfg = MODEL_REGISTRY[name]
    path = _download(cfg["repo_id"], cfg["filename"])
    fw = cfg["framework"]

    if fw == "tf_weights":
        model = _build_cataract_model()
        model.load_weights(path)
        return model

    if fw == "tf":
        import tensorflow as tf
        return tf.keras.models.load_model(path, compile=False)

    if fw == "tf_keras":
        import tensorflow as tf
        return tf.keras.models.load_model(path, compile=False)

    if fw == "pytorch_efficientnet":
        import torch
        from efficientnet_pytorch import EfficientNet

        model = EfficientNet.from_name("efficientnet-b0", num_classes=len(cfg["classes"]))
        state = torch.load(path, map_location="cpu", weights_only=False)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state, strict=False)
        model.eval()
        return model

    if fw == "pytorch_cardiac":
        import torch

        model = _build_cardiac_model(len(cfg["classes"]))
        state = torch.load(path, map_location="cpu", weights_only=False)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        if isinstance(state, dict):
            model.load_state_dict(state, strict=False)
        model.eval()
        return model

    raise ValueError(f"Unknown framework: {fw}")


def get_model(name: str) -> Any:
    """Return a loaded model, downloading on first call (thread-safe)."""
    if name not in MODEL_REGISTRY:
        raise KeyError(f"Unknown model: {name}")
    if name not in _loaded_models:
        with _load_locks[name]:
            if name not in _loaded_models:
                logger.info("Loading model %s …", name)
                _loaded_models[name] = _load_model(name)
                logger.info("Model %s loaded.", name)
    return _loaded_models[name]


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def predict(name: str, image_bytes: bytes) -> dict[str, float]:
    """Run inference and return {class_name: probability}."""
    cfg = MODEL_REGISTRY[name]
    model = get_model(name)
    fw = cfg["framework"]
    classes = cfg["classes"]
    size = cfg["input_size"]

    if fw in ("tf", "tf_keras", "tf_weights"):
        inp = _preprocess_image_tf(image_bytes, size)
        raw = model.predict(inp, verbose=0)
        probs = raw[0]

        # Binary sigmoid output → expand to 2-class
        if probs.shape[-1] == 1:
            p = float(probs[0])
            probs_list = [1.0 - p, p]
        else:
            # Softmax-style multi-class
            probs_list = probs.tolist()
            total = sum(probs_list)
            if total > 0:
                probs_list = [p / total for p in probs_list]

        # Align length to classes
        probs_list = probs_list[: len(classes)]
        while len(probs_list) < len(classes):
            probs_list.append(0.0)

        return {c: round(p, 6) for c, p in zip(classes, probs_list)}

    # PyTorch paths
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
