"""Windows audio input privacy and sound settings."""
from __future__ import annotations

import subprocess
import sys


def open_microphone_privacy_settings() -> None:
    if sys.platform != "win32":
        return
    for target in ("ms-settings:privacy-microphone", "ms-settings:sound"):
        try:
            subprocess.Popen(["explorer.exe", target], close_fds=True)
        except Exception:
            continue
