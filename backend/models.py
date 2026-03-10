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
# Registered BEFORE any model is loaded.
# Dual registration:
#   package="custom" -> key "custom>MBConvBlock"  (Keras standard)
#   package=""       -> key "MBConvBlock"          (what .keras bundle stores)
# ---------------------------------------------------------------------------
import keras


@keras.saving.register_keras_serializable(package="custom")
class MBConvBlock(keras.layers.Layer):
    """Mobile Inverted Bottleneck Conv block with Squeeze-and-Excitation.

    mixed_bfloat16 dtype fix: the model was trained with
    keras.mixed_precision.Policy('mixed_bfloat16'), which means
    BatchNormalization outputs bfloat16 while the original `inputs`
    tensor is float32. We cast `inputs` to match `x` before the residual
    add so the dtypes always agree regardless of the active policy.
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
        import tensorflow as tf
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
            # Cast shortcut to match x dtype (handles mixed_bfloat16 training)
            shortcut = tf.cast(inputs, x.dtype)
            x = x + shortcut

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


# Second registration: bare 'MBConvBlock' key (what the .keras bundle stores)
try:
    keras.saving.register_keras_serializable(package="")(MBConvBlock)
except Exception:
    pass

_SKIN_CUSTOM_OBJECTS: dict[str, Any] = {"MBConvBlock": MBConvBlock}


# ---------------------------------------------------------------------------
# TFSMLayer shim
# Wraps keras.layers.TFSMLayer so it exposes a .predict() interface.
# ---------------------------------------------------------------------------

class _TFSMShim:
    """Thin wrapper around TFSMLayer that mimics model.predict()."""

    def __init__(self, layer: Any):
        self._layer = layer

    def predict(self, x, verbose=0):
        import tensorflow as tf
        tensor = tf.constant(x, dtype=tf.float32)
        out = self._layer(tensor, training=False)
        if isinstance(out, dict):
            out = list(out.values())[0]
        return out.numpy()


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
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(target_size, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_dr(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((384, 384), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_skin(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((512, 512))
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _preprocess_image_torch(image_bytes: bytes, target_size: tuple[int, int]):
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
# Cardiac CNN (PyTorch weights-only)
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
# h5py index-based weight loader
# ---------------------------------------------------------------------------

def _collect_h5_weights(h5_group) -> list:
    """DFS over an h5py group, collecting all leaf datasets in order.

    Keras 3 stores weights in model.weights.h5 as a nested group tree
    where each node is either a numbered group ("0", "1", ...) or a leaf
    dataset named "vars/0", "vars/1", etc.  A simple DFS that visits keys
    in sorted integer order yields exactly the same sequence as
    model.weights, so we can zip-assign without any name matching.
    """
    import h5py
    results = []

    def _dfs(node):
        if isinstance(node, h5py.Dataset):
            results.append(np.array(node))
            return
        # Sort keys numerically where possible so "2" < "10"
        def _key(k):
            try:
                return (0, int(k))
            except ValueError:
                return (1, k)
        for k in sorted(node.keys(), key=_key):
            _dfs(node[k])

    _dfs(h5_group)
    return results


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _download(repo_id: str, filename: str) -> str:
    from huggingface_hub import hf_hub_download
    return hf_hub_download(repo_id=repo_id, filename=filename)


def _load_skin_model(repo_id: str, filename: str) -> Any:
    """Four-strategy loader for the skin model.keras file.

    Strategy 1: keras.saving.load_model with safe_mode=False.
    Strategy 2: TFSMLayer on the HF snapshot (SavedModel path).
    Strategy 3: tf.keras.models.load_model with safe_mode=False.
    Strategy 4: Manual unzip + h5py index-based weight assignment.
                Reads model.weights.h5 from inside the .keras ZIP and
                assigns each tensor to model.weights[i] by DFS index
                order — bypasses ALL name/shape matching so every BN
                gamma/beta/moving_mean/moving_variance is loaded correctly.
    """
    import tensorflow as tf
    path = _download(repo_id, filename)

    # -----------------------------------------------------------------------
    # Strategy 1 — keras.saving.load_model with safe_mode=False
    # -----------------------------------------------------------------------
    try:
        model = keras.saving.load_model(
            path,
            custom_objects=_SKIN_CUSTOM_OBJECTS,
            compile=False,
            safe_mode=False,
        )
        logger.info("Skin model loaded via keras.saving.load_model (safe_mode=False).")
        return model
    except Exception as e1:
        logger.warning("keras.saving.load_model failed for skin: %s", e1)

    # -----------------------------------------------------------------------
    # Strategy 2 — TFSMLayer on the HF snapshot directory
    # -----------------------------------------------------------------------
    try:
        from huggingface_hub import snapshot_download
        snapshot_dir = snapshot_download(repo_id=repo_id)
        layer = keras.layers.TFSMLayer(
            snapshot_dir,
            call_endpoint="serving_default",
        )
        logger.info("Skin model loaded via TFSMLayer (SavedModel snapshot).")
        return _TFSMShim(layer)
    except Exception as e2:
        logger.warning("TFSMLayer failed for skin: %s", e2)

    # -----------------------------------------------------------------------
    # Strategy 3 — tf.keras legacy loader with safe_mode=False
    # -----------------------------------------------------------------------
    try:
        import inspect
        load_kwargs: dict[str, Any] = {"compile": False}
        if "safe_mode" in inspect.signature(tf.keras.models.load_model).parameters:
            load_kwargs["safe_mode"] = False
        model = tf.keras.models.load_model(
            path,
            custom_objects=_SKIN_CUSTOM_OBJECTS,
            **load_kwargs,
        )
        logger.info("Skin model loaded via tf.keras.models.load_model.")
        return model
    except Exception as e3:
        logger.warning("tf.keras.models.load_model failed for skin: %s", e3)

    # -----------------------------------------------------------------------
    # Strategy 4 — manual unzip + h5py index-based weight assignment
    #
    # Why this works when skip_mismatch doesn't:
    #   Keras 3 saves weights in model.weights.h5 using a numbered DFS tree
    #   (groups "0"/"1"/.../"vars"/"0" etc.), NOT by layer name.  When Keras
    #   calls load_weights() it tries to match variable *names*; because the
    #   running environment has a different Keras version the names differ and
    #   394 BN weights get skipped entirely -> near-uniform softmax output.
    #
    #   We bypass name matching completely: collect all leaf datasets from the
    #   HDF5 file in the same DFS order Keras uses, then zip-assign them to
    #   model.weights.  Shape mismatches are logged and skipped safely.
    # -----------------------------------------------------------------------
    import zipfile, tempfile, os, json, h5py
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(path, "r") as zf:
                zf.extractall(tmpdir)

            config_path = os.path.join(tmpdir, "config.json")
            weights_candidates = [
                os.path.join(tmpdir, "model.weights.h5"),
                os.path.join(tmpdir, "weights.h5"),
            ]
            weights_path = next(
                (p for p in weights_candidates if os.path.exists(p)), None
            )

            if not os.path.exists(config_path):
                raise FileNotFoundError("config.json not found inside .keras bundle")

            with open(config_path, "r") as f:
                config_data = json.load(f)

            # Rebuild architecture from config
            model = keras.models.model_from_json(
                json.dumps(config_data),
                custom_objects=_SKIN_CUSTOM_OBJECTS,
            )
            # Force all layers to create their variables
            model.build((None, 512, 512, 3))
            # Run one dummy forward pass so sub-layers inside MBConvBlock
            # (like the inline GlobalAveragePooling2D) also build
            dummy = np.zeros((1, 512, 512, 3), dtype=np.float32)
            try:
                model(dummy, training=False)
            except Exception:
                pass

            if weights_path:
                with h5py.File(weights_path, "r") as hf:
                    saved_weights = _collect_h5_weights(hf)

                model_weights = model.weights
                assigned = 0
                skipped = 0
                for i, (var, arr) in enumerate(zip(model_weights, saved_weights)):
                    try:
                        var.assign(arr.astype(var.dtype.as_numpy_dtype))
                        assigned += 1
                    except Exception as assign_err:
                        logger.debug(
                            "Weight[%d] shape mismatch (var=%s saved=%s): %s",
                            i, var.shape, arr.shape, assign_err,
                        )
                        skipped += 1

                logger.info(
                    "Skin model loaded via h5py index-based assignment: "
                    "%d assigned, %d skipped.",
                    assigned, skipped,
                )
                if skipped > 0:
                    logger.warning(
                        "%d weights could not be assigned (shape mismatch). "
                        "Predictions may be partially degraded.",
                        skipped,
                    )
            else:
                logger.warning(
                    "Skin model architecture rebuilt but no weights file found "
                    "— predictions will be random."
                )

            return model

    except Exception as e4:
        logger.error("All skin model loading strategies failed. Last error: %s", e4)
        raise RuntimeError(
            "Could not load skin model after 4 strategies. "
            f"[S1] {e1} | [S2] {e2} | [S3] {e3} | [S4] {e4}"
        ) from e4


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
        if name == "diabetic_retinopathy":
            inp = _preprocess_dr(image_bytes)
        elif name == "skin":
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
