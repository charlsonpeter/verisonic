"""Linux audio input / sound settings."""
from __future__ import annotations

import shutil
import subprocess
import sys


def open_microphone_privacy_settings() -> None:
    if sys.platform != "linux":
        return
    candidates = (
        ["xdg-open", "settings://sound"],
        ["gnome-control-center", "sound"],
        ["pavucontrol"],
    )
    for cmd in candidates:
        if not shutil.which(cmd[0]):
            continue
        try:
            subprocess.Popen(cmd, close_fds=True)
            return
        except Exception:
            continue
