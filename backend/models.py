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


class _SEBlock(keras.layers.Layer):
    """Squeeze-and-Excitation block using Dense layers.

    Matches the original saved model structure:
      se_block/global_pool  (GlobalAveragePooling2D, keepdims=True)
      se_block/squeeze      (Dense, swish)
      se_block/excite       (Dense, sigmoid)
    """

    def __init__(self, se_filters: int, expanded_filters: int, **kwargs):
        super().__init__(**kwargs)
        self.se_filters = se_filters
        self.expanded_filters = expanded_filters

    def build(self, input_shape):
        self.global_pool = keras.layers.GlobalAveragePooling2D(
            keepdims=True, name="global_pool"
        )
        self.squeeze = keras.layers.Dense(
            self.se_filters, activation="swish", name="squeeze"
        )
        self.excite = keras.layers.Dense(
            self.expanded_filters, activation="sigmoid", name="excite"
        )
        super().build(input_shape)

    def call(self, x):
        se = self.global_pool(x)
        se = self.squeeze(se)
        se = self.excite(se)
        return x * se

    def get_config(self):
        base = super().get_config()
        base.update(
            dict(se_filters=self.se_filters, expanded_filters=self.expanded_filters)
        )
        return base


@keras.saving.register_keras_serializable(package="custom")
class MBConvBlock(keras.layers.Layer):
    """Mobile Inverted Bottleneck Conv block with Squeeze-and-Excitation.

    mixed_bfloat16 dtype fix: the model was trained with
    keras.mixed_precision.Policy('mixed_bfloat16'), which means
    BatchNormalization outputs bfloat16 while the original `inputs`
    tensor is float32. We cast `inputs` to match `x` before the residual
    add so the dtypes always agree regardless of the active policy.

    Sub-layers use explicit names that match the original saved model's
    HDF5 weight structure (depthwise_conv, depthwise_bn, expand_conv,
    expand_bn, project_conv, project_bn, se_block).
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
        self._se_filters = max(1, int(self._expanded_filters * se_ratio))
        self._use_residual = (strides == 1 and input_filters == filters)

    def build(self, input_shape):
        if self.expand_ratio != 1:
            self._expand_conv = keras.layers.Conv2D(
                self._expanded_filters, 1, padding="same", use_bias=False,
                name="expand_conv",
            )
            self._expand_bn = keras.layers.BatchNormalization(name="expand_bn")

        self._dw_conv = keras.layers.DepthwiseConv2D(
            self.kernel_size,
            strides=self.strides,
            padding="same",
            use_bias=False,
            name="depthwise_conv",
        )
        self._dw_bn = keras.layers.BatchNormalization(name="depthwise_bn")

        if self.se_ratio > 0:
            self._se_block = _SEBlock(
                self._se_filters, self._expanded_filters, name="se_block"
            )

        self._project_conv = keras.layers.Conv2D(
            self.filters, 1, padding="same", use_bias=False,
            name="project_conv",
        )
        self._project_bn = keras.layers.BatchNormalization(name="project_bn")

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
            x = self._se_block(x)

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


# Second registration: bare keys (what the .keras bundle stores)
try:
    keras.saving.register_keras_serializable(package="")(MBConvBlock)
except Exception:
    pass
try:
    keras.saving.register_keras_serializable(package="custom")(_SEBlock)
except Exception:
    pass
try:
    keras.saving.register_keras_serializable(package="")(_SEBlock)
except Exception:
    pass

_SKIN_CUSTOM_OBJECTS: dict[str, Any] = {
    "MBConvBlock": MBConvBlock,
    "_SEBlock": _SEBlock,
}


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
# h5py path-based weight helpers
# ---------------------------------------------------------------------------

# Keras auto-naming: class_name → snake_case base used as HDF5 key.
_CLASS_TO_H5_BASE: dict[str, str] = {
    "InputLayer": "input_layer",
    "Conv2D": "conv2d",
    "BatchNormalization": "batch_normalization",
    "Activation": "activation",
    "MBConvBlock": "mb_conv_block",
    "GlobalAveragePooling2D": "global_average_pooling2d",
    "Dropout": "dropout",
    "Dense": "dense",
}

# Variable name → positional index inside an HDF5 ``vars/`` group.
_VAR_NAME_TO_INDEX: dict[str, int] = {
    "kernel": 0,
    "bias": 1,
    "gamma": 0,
    "beta": 1,
    "moving_mean": 2,
    "moving_variance": 3,
}


def _build_outer_name_map(config: dict) -> dict[str, str]:
    """Map config layer names → HDF5 layer keys.

    The .keras bundle may store HDF5 layer keys using Keras auto-generated
    names (e.g. ``conv2d``, ``mb_conv_block_1``) while config.json uses
    user-specified names (e.g. ``stem_conv``, ``block_1a``).  This function
    re-derives the auto-name by counting class occurrences in config order.
    """
    class_counter: dict[str, int] = {}
    outer_map: dict[str, str] = {}
    for layer_cfg in config["config"]["layers"]:
        class_name = layer_cfg["class_name"]
        layer_name = layer_cfg["name"]
        base = _CLASS_TO_H5_BASE.get(class_name, class_name.lower())
        count = class_counter.get(base, 0)
        h5_key = base if count == 0 else f"{base}_{count}"
        outer_map[layer_name] = h5_key
        class_counter[base] = count + 1
    return outer_map


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
    # Strategy 4 — manual unzip + h5py path-based weight assignment
    #
    # The .keras bundle contains config.json (architecture) and
    # model.weights.h5 (weights keyed by auto-generated layer names).
    # The config uses user-specified names (e.g. "block_1a") while the
    # HDF5 uses Keras auto-names (e.g. "mb_conv_block").  We bridge
    # the two by building an explicit outer-name mapping and then
    # translating each model variable path to its HDF5 dataset path.
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
            # Run one dummy forward pass so all sub-layers build
            dummy = np.zeros((1, 512, 512, 3), dtype=np.float32)
            try:
                model(dummy, training=False)
            except Exception:
                pass

            if not weights_path:
                logger.warning(
                    "Skin model architecture rebuilt but no weights file found "
                    "— predictions will be random."
                )
                return model

            # Build flat dict of all HDF5 layer datasets
            h5_data: dict[str, np.ndarray] = {}
            with h5py.File(weights_path, "r") as hf:
                def _visit(name, obj):
                    if isinstance(obj, h5py.Dataset) and name.startswith("layers/"):
                        h5_data[name] = np.array(obj)
                hf.visititems(_visit)

            # Build outer-name mapping (config name → HDF5 key)
            outer_map = _build_outer_name_map(config_data)

            # Debug: log first 5 H5 keys and first 5 model var paths
            h5_keys_sample = sorted(h5_data.keys())[:5]
            var_paths_sample = [v.path for v in model.weights[:5]]
            logger.info(
                "H5 keys sample: %s | var paths sample: %s",
                h5_keys_sample, var_paths_sample,
            )

            # Assign weights by translating each model var path → HDF5 path
            assigned = 0
            skipped = 0
            for var in model.weights:
                parts = var.path.split("/")
                outer_name = parts[0]
                var_name = parts[-1]
                h5_outer = outer_map.get(outer_name)
                if h5_outer is None:
                    logger.debug("No outer mapping for %s", var.path)
                    skipped += 1
                    continue

                var_idx = _VAR_NAME_TO_INDEX.get(var_name, 0)

                if len(parts) == 2:
                    # Simple layer: outer/var_name
                    h5_path = f"layers/{h5_outer}/vars/{var_idx}"
                elif len(parts) == 3:
                    # Sub-layer: outer/inner/var_name
                    h5_path = f"layers/{h5_outer}/{parts[1]}/vars/{var_idx}"
                elif len(parts) == 4:
                    # Nested sub-layer: outer/inner/sub_inner/var_name
                    h5_path = f"layers/{h5_outer}/{parts[1]}/{parts[2]}/vars/{var_idx}"
                else:
                    logger.debug("Unexpected path depth for %s", var.path)
                    skipped += 1
                    continue

                arr = h5_data.get(h5_path)
                if arr is not None and arr.shape == tuple(var.shape):
                    target_dtype = (
                        var.dtype.as_numpy_dtype
                        if hasattr(var.dtype, "as_numpy_dtype")
                        else np.float32
                    )
                    var.assign(arr.astype(target_dtype))
                    assigned += 1
                else:
                    if arr is not None:
                        logger.debug(
                            "Shape mismatch for %s: model=%s h5=%s (h5_path=%s)",
                            var.path, var.shape, arr.shape, h5_path,
                        )
                    else:
                        logger.debug(
                            "H5 path not found for %s → %s", var.path, h5_path,
                        )
                    skipped += 1

            logger.info(
                "Skin model loaded via h5py path-based assignment: "
                "%d assigned, %d skipped.",
                assigned, skipped,
            )
            if skipped > 0:
                logger.warning(
                    "%d weights could not be assigned. "
                    "Predictions may be partially degraded.",
                    skipped,
                )

            # ---- Self-test at load time ----
            # Min confidence for any single class on the expected test image.
            # A correctly-loaded 8-class model should exceed random chance
            # (1/8 = 12.5%) by a wide margin; 35% is a conservative floor.
            _SELFTEST_MIN_CONFIDENCE = 0.35

            test_image_path = os.environ.get("SKIN_TEST_IMAGE", "")
            if test_image_path and os.path.exists(test_image_path):
                try:
                    with open(test_image_path, "rb") as f:
                        test_bytes = f.read()
                    test_input = _preprocess_skin(test_bytes)
                    test_raw = model.predict(test_input, verbose=0)
                    test_probs = test_raw[0].tolist()
                    max_conf = max(test_probs)
                    max_class = test_probs.index(max_conf)
                    logger.info(
                        "Skin model self-test: max_confidence=%.4f class_index=%d",
                        max_conf, max_class,
                    )
                    if max_conf < _SELFTEST_MIN_CONFIDENCE:
                        logger.error(
                            "SKIN MODEL WEIGHT LOADING FAILURE: max confidence "
                            "%.4f < %.2f. Weights are not loaded correctly. "
                            "All predictions will be unreliable.",
                            max_conf, _SELFTEST_MIN_CONFIDENCE,
                        )
                except Exception as selftest_err:
                    logger.warning(
                        "Skin model self-test failed: %s", selftest_err
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
