"""macOS microphone permission via AVFoundation (triggers the system TCC dialog)."""
from __future__ import annotations

import subprocess
import sys

_STATUS_MAP = {
    0: "not_determined",
    1: "restricted",
    2: "denied",
    3: "authorized",
}


def avfoundation_available() -> bool:
    if sys.platform != "darwin":
        return False
    try:
        import AVFoundation  # noqa: F401
        return True
    except ImportError:
        return False


def get_microphone_authorization_status() -> str:
    """Return authorized | denied | restricted | not_determined | unavailable."""
    if sys.platform != "darwin":
        return "unavailable"
    if not avfoundation_available():
        return "unavailable"
    import AVFoundation

    status = AVFoundation.AVCaptureDevice.authorizationStatusForMediaType_(
        AVFoundation.AVMediaTypeAudio
    )
    return _STATUS_MAP.get(int(status), "unavailable")


def open_microphone_privacy_settings() -> None:
    if sys.platform != "darwin":
        return
    for url in (
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    ):
        try:
            subprocess.run(["open", url], check=False, timeout=5)
            return
        except Exception:
            continue


def _probe_capture_session() -> bool:
    """Briefly start AVCaptureSession so macOS registers this app under Microphone privacy."""
    if getattr(sys, "frozen", False) or hasattr(sys, "_MEIPASS"):
        # Packaged apps use PortAudio for capture; AVFoundation probe can crash CoreAudio on connect.
        return False
    import time

    if not avfoundation_available():
        return False

    import AVFoundation

    device = AVFoundation.AVCaptureDevice.defaultDeviceWithMediaType_(
        AVFoundation.AVMediaTypeAudio
    )
    if device is None:
        return False

    session = AVFoundation.AVCaptureSession.alloc().init()
    capture_input, _error = AVFoundation.AVCaptureDeviceInput.deviceInputWithDevice_error_(
        device, None
    )
    if capture_input is None:
        return False
    if session.canAddInput_(capture_input):
        session.addInput_(capture_input)
    session.startRunning()
    time.sleep(0.3)
    session.stopRunning()
    return True


def ensure_microphone_access(app=None, timeout_sec=120):
    """
    Block until the user responds to the system microphone prompt.
    Returns True (granted), False (denied), or None (unavailable/timeout).
    """
    import time
    import threading

    if sys.platform != "darwin":
        return True

    status = get_microphone_authorization_status()
    if status == "authorized":
        _probe_capture_session()
        return True
    if status in ("denied", "restricted"):
        return False
    if not avfoundation_available():
        return None

    import AVFoundation

    done = threading.Event()
    result = {"granted": False}

    def completion_handler(granted):
        result["granted"] = bool(granted)
        done.set()

    AVFoundation.AVCaptureDevice.requestAccessForMediaType_completionHandler_(
        AVFoundation.AVMediaTypeAudio,
        completion_handler,
    )

    deadline = time.time() + timeout_sec
    while not done.is_set() and time.time() < deadline:
        if app is not None:
            try:
                app.processEvents()
            except Exception:
                pass
        time.sleep(0.05)

    if done.is_set() and result["granted"]:
        _probe_capture_session()
        return True
    if done.is_set():
        return False
    return None


def request_microphone_access(on_complete) -> None:
    """Async microphone request. on_complete(granted) may run on a background thread."""
    if sys.platform != "darwin":
        on_complete(True)
        return

    status = get_microphone_authorization_status()
    if status == "authorized":
        _probe_capture_session()
        on_complete(True)
        return
    if status in ("denied", "restricted"):
        on_complete(False)
        return
    if not avfoundation_available():
        on_complete(None)
        return

    import AVFoundation

    def completion_handler(granted):
        if granted:
            _probe_capture_session()
        on_complete(bool(granted))

    AVFoundation.AVCaptureDevice.requestAccessForMediaType_completionHandler_(
        AVFoundation.AVMediaTypeAudio,
        completion_handler,
    )
