"""Agent settings. Override any of them with environment variables.

Model choice for an RTX 3050:
  4 GB VRAM → qwen2.5:3b   (default, ~2 GB)
  8 GB VRAM → qwen2.5:7b   (smarter, ~5 GB)
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Settings:
    ollama_url: str = os.environ.get("MIMO_OLLAMA_URL", "http://127.0.0.1:11434")
    user_name: str = os.environ.get("MIMO_USER_NAME", "Aya")
    model: str = os.environ.get("MIMO_MODEL", "qwen2.5:3b")
    # Unload the model from the GPU after this much idle time (keeps the PC cool).
    keep_alive: str = os.environ.get("MIMO_KEEP_ALIVE", "2m")
    max_steps: int = int(os.environ.get("MIMO_MAX_STEPS", "8"))
    confirm_timeout_s: int = int(os.environ.get("MIMO_CONFIRM_TIMEOUT", "60"))


settings = Settings()
