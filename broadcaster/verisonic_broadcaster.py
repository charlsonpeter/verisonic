#!/usr/bin/env python3
import os
import sys

_BROADCASTER_DIR = os.path.dirname(os.path.abspath(__file__))
if _BROADCASTER_DIR not in sys.path:
    sys.path.insert(0, _BROADCASTER_DIR)

import time
import threading
import queue
import math
import json
import base64
import urllib.request
import urllib.error
import asyncio

# Dependency tracking
MISSING_DEPS = []

# Try importing websockets for async WebSocket ingest
try:
    import websockets
except ImportError:
    MISSING_DEPS.append("websockets")

# Try importing PyQt5
USE_PYQT = False
try:
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QLabel, QComboBox, QLineEdit, QPushButton, QCheckBox, QFrame, QProgressBar, QMessageBox, QStackedWidget,
        QStyledItemDelegate,
    )
    from PyQt5.QtCore import QTimer, Qt, QEvent, QObject
    from PyQt5.QtGui import QFont, QPalette, QColor, QPainter, QBrush, QPen
    from PyQt5.QtNetwork import QLocalServer, QLocalSocket
    USE_PYQT = True
except ImportError:
    MISSING_DEPS.append("PyQt5")

# Check other dependencies
try:
    import sounddevice as sd
except ImportError:
    MISSING_DEPS.append("sounddevice")
try:
    import numpy as np
except ImportError:
    MISSING_DEPS.append("numpy")
try:
    import lameenc
except ImportError:
    MISSING_DEPS.append("lameenc")

if sys.platform == "darwin":
    try:
        from installer.macos.audio_permission import (
            ensure_microphone_access,
            get_microphone_authorization_status,
            open_microphone_privacy_settings,
            request_microphone_access,
        )
        HAS_MACOS_MIC_API = True
    except ImportError:
        HAS_MACOS_MIC_API = False
else:
    HAS_MACOS_MIC_API = False


def open_platform_audio_privacy_settings() -> None:
    """Open OS audio input / privacy settings (best-effort per platform)."""
    if sys.platform == "darwin" and HAS_MACOS_MIC_API:
        open_microphone_privacy_settings()
        return
    if sys.platform == "win32":
        try:
            from installer.windows.audio_permission import open_microphone_privacy_settings as open_settings
            open_settings()
        except ImportError:
            pass
        return
    if sys.platform == "linux":
        try:
            from installer.linux.audio_permission import open_microphone_privacy_settings as open_settings
            open_settings()
        except ImportError:
            pass

# Define fixed server stream URL (with env override)
DEFAULT_SERVER_URL = os.environ.get("VERISONIC_SERVER_URL", "ws://54.66.243.141:3000/api/radio/stream/ws")


def _packaged_app() -> bool:
    if getattr(sys, "frozen", False):
        return True
    if hasattr(sys, "_MEIPASS"):
        return True
    exe = getattr(sys, "executable", "") or ""
    return ".app/Contents/MacOS" in exe


def _log_boot_marker():
    """Write a line to disk before stdout redirection (packaged app debugging)."""
    try:
        log_dir = os.path.expanduser("~/Library/Logs/VeriSonic")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "broadcaster.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(
                f"\n--- boot {time.strftime('%Y-%m-%d %H:%M:%S')} pid={os.getpid()} "
                f"exe={sys.executable!r} frozen={getattr(sys, 'frozen', None)} "
                f"meipass={getattr(sys, '_MEIPASS', None)!r}\n"
            )
        return log_path
    except Exception as exc:
        try:
            with open("/tmp/verisonic-broadcaster-boot.log", "a", encoding="utf-8") as f:
                f.write(f"boot log failed: {exc}\n")
        except Exception:
            pass
        return None


def setup_app_logging():
    """Route stdout/stderr to a log file for PyInstaller builds (--noconsole hides Terminal output)."""
    if not _packaged_app():
        return None
    try:
        log_dir = os.path.expanduser("~/Library/Logs/VeriSonic")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "broadcaster.log")
        log_file = open(log_path, "a", encoding="utf-8", buffering=1)
        sys.stdout = log_file
        sys.stderr = log_file
        try:
            import faulthandler
            faulthandler.enable(log_file)
        except Exception:
            pass
        print(f"\n--- session start {time.strftime('%Y-%m-%d %H:%M:%S')} pid={os.getpid()} ---")
        print(f"executable={sys.executable}")
        return log_path
    except Exception as exc:
        try:
            fallback = f"/tmp/verisonic-broadcaster-{os.getpid()}.log"
            log_file = open(fallback, "a", encoding="utf-8", buffering=1)
            sys.stdout = log_file
            sys.stderr = log_file
            print(f"Primary log failed ({exc}); using {fallback}")
            return fallback
        except Exception:
            return None


def _config_cipher_key() -> bytes:
    import hashlib
    import platform
    seed = f"{platform.node()}:{platform.system()}:verisonic".encode()
    return hashlib.sha256(seed).digest()


def _encode_config_value(value: str) -> str:
    import base64
    if not value:
        return ""
    key = _config_cipher_key()
    raw = value.encode("utf-8")
    obfuscated = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return base64.urlsafe_b64encode(obfuscated).decode("ascii")


def _decode_config_value(value: str) -> str:
    import base64
    if not value:
        return ""
    try:
        key = _config_cipher_key()
        raw = base64.urlsafe_b64decode(value.encode("ascii"))
        plain = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
        return plain.decode("utf-8")
    except Exception:
        return ""


# =====================================================================
# FALLBACK TKINTER VIEW (Only shown if PyQt5 or dependencies are missing)
# =====================================================================
if not USE_PYQT or MISSING_DEPS:
    import tkinter as tk
    from tkinter import messagebox

    class InstallDependencyApp:
        def __init__(self, root):
            self.root = root
            self.root.title("VeriSonic Broadcaster - Setup")
            self.root.geometry("500x480")
            self.root.resizable(False, False)
            self.root.configure(bg="#0b0f19")
            
            # Label Info
            title = tk.Label(
                root, text="VeriSonic Broadcaster", 
                font=("Helvetica Neue", 18, "bold"), fg="#f43f5e", bg="#0b0f19"
            )
            title.pack(pady=(30, 15))
            
            card = tk.Frame(root, bg="#151d30", bd=1, relief="solid", highlightbackground="#1e293b", highlightthickness=0)
            card.pack(fill="both", expand=True, padx=20, pady=20)
            
            lbl = tk.Label(
                card, text="Setup Required", font=("Helvetica Neue", 14, "bold"), fg="#f59e0b", bg="#151d30"
            )
            lbl.pack(pady=(15, 10))
            
            inst = (
                "To capture audio input and stream to your live radio station, "
                "please install the following required modules in your terminal:\n"
            )
            inst_lbl = tk.Label(
                card, text=inst, font=("Helvetica Neue", 11), fg="#f8fafc", bg="#151d30",
                justify="left", wraplength=400
            )
            inst_lbl.pack(pady=5)
            
            # Command block
            command = "pip install PyQt5 sounddevice numpy lameenc websockets"
            cmd_box = tk.Text(card, height=3, font=("Courier New", 10), bg="#0d1321", fg="#10b981", bd=0, padx=10, pady=10)
            cmd_box.insert("1.0", command)
            cmd_box.configure(state="disabled")
            cmd_box.pack(fill="x", padx=15, pady=10)
            
            def copy_cmd():
                self.root.clipboard_clear()
                self.root.clipboard_append(command)
                messagebox.showinfo("Copied", "Command copied to clipboard!")
                
            btn = tk.Button(
                card, text="Copy Install Command", command=copy_cmd, font=("Helvetica Neue", 11, "bold"),
                highlightbackground="#151d30", height=2
            )
            btn.pack(pady=10)
            
            footer = tk.Label(
                card, text="Restart this application once installation is complete.",
                font=("Helvetica Neue", 10, "italic"), fg="#94a3b8", bg="#151d30"
            )
            footer.pack(pady=(15, 0))

    if __name__ == "__main__" and (not USE_PYQT or MISSING_DEPS):
        root = tk.Tk()
        app = InstallDependencyApp(root)
        root.mainloop()
        sys.exit(0)


# =====================================================================
# UTILITIES AND CORE COMPONENTS FOR PYQT5 APP
# =====================================================================
def get_api_base_url(server_url):
    """Converts WS URL to HTTP API URL base."""
    if server_url.startswith("wss://"):
        base = server_url.replace("wss://", "https://")
    elif server_url.startswith("ws://"):
        base = server_url.replace("ws://", "http://")
    else:
        base = server_url
    
    suffix = "/radio/stream/ws"
    if base.endswith(suffix):
        base = base[:-len(suffix)]
    return base

def api_request(path, method="GET", data=None, token=None):
    """Network utility to perform HTTP requests using python standard library."""
    api_base = get_api_base_url(DEFAULT_SERVER_URL)
    url = f"{api_base}{path}"
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as response:
            res_data = response.read().decode("utf-8")
            return json.loads(res_data), response.status
    except urllib.error.HTTPError as e:
        try:
            err_content = e.read().decode("utf-8")
            err_json = json.loads(err_content)
            detail = err_json.get("detail", str(e))
        except Exception:
            detail = str(e)
        raise Exception(detail)
    except Exception as e:
        raise Exception(f"Network error: {e}")


class RefreshOnOpenComboBox(QComboBox):
    """QComboBox that refreshes its items immediately before the popup opens."""

    def __init__(self, on_popup_open=None, parent=None):
        super().__init__(parent)
        self._on_popup_open = on_popup_open

    def showPopup(self):
        if callable(self._on_popup_open):
            try:
                self._on_popup_open()
            except Exception as exc:
                print("Input dropdown refresh failed:", exc)
        super().showPopup()


class VUMeterWidget(QWidget):
    """Custom spectrum analyzer widget displaying 20 frequency bands with peak decay (JetAudio style)."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.num_bands = 20
        self.levels = [0] * self.num_bands
        self.peaks = [0] * self.num_bands
        self.decay_timers = [0] * self.num_bands
        self.setMinimumHeight(100)
        
    def set_levels(self, levels):
        """Update active frequency levels (list of 20 values, 0-100)."""
        if len(levels) < self.num_bands:
            levels = levels + [0] * (self.num_bands - len(levels))
        
        self.levels = levels[:self.num_bands]
        
        for i in range(self.num_bands):
            lvl = self.levels[i]
            if lvl > self.peaks[i]:
                self.peaks[i] = lvl
                self.decay_timers[i] = 15  # Peak hold frames
            else:
                if self.decay_timers[i] > 0:
                    self.decay_timers[i] -= 1
                else:
                    self.peaks[i] = max(0, self.peaks[i] - 2.0)
                    
        self.update()
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        
        width = self.width()
        height = self.height()
        
        # Draw background card
        painter.setBrush(QColor("#0d1321"))
        painter.setPen(QPen(QColor("#1e293b"), 1))
        painter.drawRoundedRect(0, 0, width, height, 8, 8)
        
        # Grid parameters
        gap_x = 3
        gap_y = 2
        
        col_width = (width - (self.num_bands + 1) * gap_x) / self.num_bands
        num_segments = 12
        seg_height = (height - 16 - (num_segments + 1) * gap_y) / num_segments
        
        for col in range(self.num_bands):
            level = self.levels[col]
            peak = self.peaks[col]
            
            x = gap_x + col * (col_width + gap_x)
            
            for seg in range(num_segments):
                seg_threshold = (seg / num_segments) * 100
                
                # Colors: bottom 8 green, next 2 yellow/orange, top 2 red
                if seg < 8:
                    color = QColor("#10b981")  # Green
                elif seg < 10:
                    color = QColor("#f59e0b")  # Orange/Yellow
                else:
                    color = QColor("#ef4444")  # Red
                
                is_active = level >= seg_threshold
                is_peak = (peak >= seg_threshold) and (peak < seg_threshold + (100 / num_segments))
                
                # Draw the segment block
                y = height - 8 - (seg + 1) * (seg_height + gap_y)
                
                if is_active:
                    painter.setBrush(QBrush(color))
                elif is_peak:
                    peak_color = QColor(color)
                    peak_color.setAlpha(200)
                    painter.setBrush(QBrush(peak_color))
                else:
                    dim_color = QColor(color)
                    dim_color.setAlpha(25)  # Dim background grid segment
                    painter.setBrush(QBrush(dim_color))
                    
                painter.setPen(Qt.NoPen)
                painter.drawRoundedRect(int(x), int(y), int(col_width), int(seg_height), 1, 1)


# =====================================================================
# PYQT5 REDESIGNED BROADCASTER APPLICATION
# =====================================================================
_LOOPBACK_DEVICE_KEYWORDS = (
    "blackhole",
    "stereo mix",
    "what u hear",
    "wave out mix",
    "cable output",
    "vb-audio",
    "virtual cable",
    "loopback",
    "monitor of",
)

# Sentinel entry for the live input dropdown (stay connected with no capture).
_NO_INPUT_DEVICE = {
    "id": None,
    "name": "No input",
    "raw_name": "No input",
    "is_no_input": True,
}

# ALSA plugin / virtual nodes that clutter PortAudio device lists on Ubuntu.
_LINUX_SKIP_INPUT_EXACT = frozenset({
    "dmix",
    "dsnoop",
    "null",
    "jack",
    "oss",
    "sysdefault",
})
_LINUX_SKIP_INPUT_PREFIXES = (
    "dmix:",
    "dsnoop:",
    "null:",
    "hw:",
    "plughw:",
    "sysdefault:",
    "front:",
    "rear:",
    "center_lfe:",
    "side:",
    "surround",
    "usbstream:",
    "samplerate",
    "speex",
    "upmix",
    "vdownmix",
    "lavrate",
    "a52:",
    "hdmi:",
)
_LINUX_SOUND_SERVER_NAMES = frozenset({"default", "pulse", "pipewire"})


class PyQtBroadcasterApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("VeriSonic Live Broadcaster")
        self.setFixedSize(500, 560)
        
        icon = self.load_app_icon()
        self.setWindowIcon(icon)
        QApplication.setWindowIcon(icon)
        
        # Audio & Streaming state variables
        self.is_broadcasting = False
        self.is_connected = False
        self.connection_status = "Stopped"
        self.stream_thread = None
        self.audio_queue = queue.Queue(maxsize=16)
        self.bytes_sent = 0
        self.start_time = 0
        self.current_volume_db = -60.0
        self.current_frequency_levels = [0] * 20
        self.broadcast_error = None
        self.broadcast_warning = None
        self.active_device_id = None
        self.active_pulse_source = None
        self.active_wp_id = None
        self._active_device_name = ""
        self.devices = []
        self._mic_selection = {"id": None, "pulse_source": None, "wp_id": None}
        self._capture_mic = None
        self._capture_sys = None
        self._capture_sig = None
        self._input_devices_fp = None
        self._output_route_fp = None
        self._last_input_device_poll = 0.0
        self.selected_station_id = None
        self.user_stations = []
        self.user_id = None
        
        # System Tray State
        self.quit_from_tray = False
        self._mac_audio_probe_done = False
        self._audio_io_lock = threading.Lock()
        
        # Session parameters and settings
        self.load_config()
        
        # Style sheet definition
        stylesheet = """
            QMainWindow {
                background-color: #0b0f19;
            }
            QLabel {
                color: #f8fafc;
                font-family: 'Helvetica Neue', Arial;
            }
            QFrame#card {
                background-color: #151d30;
                border: 1px solid #1e293b;
                border-radius: 16px;
            }
            QComboBox {
                background-color: #0d1321;
                color: #f8fafc;
                border: 1px solid #1e293b;
                border-radius: 8px;
                padding: 6px 12px;
                font-size: 13px;
            }
            QLineEdit {
                background-color: #0d1321;
                color: #f8fafc;
                border: 1px solid #1e293b;
                border-radius: 8px;
                padding: 8px 12px;
                font-family: 'Courier New';
                font-size: 13px;
            }
            QLineEdit:focus {
                border: 1px solid #f43f5e;
            }
            QCheckBox {
                color: #94a3b8;
                font-size: 12px;
            }
            QPushButton#actionBtn {
                background-color: #f43f5e;
                color: #ffffff;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: bold;
                padding: 12px;
            }
            QPushButton#actionBtn:hover {
                background-color: #e11d48;
            }
            QPushButton#actionBtn:disabled {
                background-color: #334155;
                color: #64748b;
            }
        """
        # Linux/Windows: system light palettes clash with inherited light text (dialogs + combo popups).
        # macOS keeps native styling — leave it alone.
        if sys.platform in ("linux", "win32"):
            arrow_path = self._linux_combo_arrow_path().replace("\\", "/")
            stylesheet += f"""
                QMessageBox {{
                    background-color: #151d30;
                    color: #f8fafc;
                }}
                QMessageBox QLabel {{
                    color: #f8fafc;
                }}
                QMessageBox QPushButton {{
                    background-color: #1e293b;
                    color: #f8fafc;
                    border: 1px solid #334155;
                    border-radius: 6px;
                    padding: 6px 14px;
                    min-width: 80px;
                }}
                QMessageBox QPushButton:hover {{
                    background-color: #334155;
                }}
                QComboBox {{
                    background-color: #0d1321;
                    color: #f8fafc;
                    border: 1px solid #1e293b;
                    border-radius: 8px;
                    padding: 8px 36px 8px 12px;
                    font-size: 13px;
                    min-height: 20px;
                }}
                QComboBox:hover {{
                    border: 1px solid #475569;
                }}
                QComboBox:focus {{
                    border: 1px solid #f43f5e;
                }}
                QComboBox:on {{
                    border: 1px solid #f43f5e;
                }}
                QComboBox::drop-down {{
                    subcontrol-origin: padding;
                    subcontrol-position: top right;
                    width: 32px;
                    border: none;
                    background: transparent;
                }}
                QComboBox::drop-down:hover {{
                    background-color: #1e293b;
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                }}
                QComboBox::down-arrow {{
                    image: url({arrow_path});
                    width: 12px;
                    height: 12px;
                }}
                QComboBox QAbstractItemView {{
                    background-color: #0d1321;
                    color: #f8fafc;
                    selection-background-color: #be123c;
                    selection-color: #ffffff;
                    border: 1px solid #1e293b;
                    border-radius: 0px;
                    padding: 0px;
                    outline: 0;
                    margin: 0px;
                }}
                QComboBox QAbstractItemView::item {{
                    min-height: 30px;
                    padding: 6px 12px;
                    margin: 0px;
                    border: none;
                    color: #f8fafc;
                    background-color: #0d1321;
                }}
                QComboBox QAbstractItemView::item:hover {{
                    background-color: #334155;
                    color: #f8fafc;
                }}
                QComboBox QAbstractItemView::item:selected {{
                    background-color: #be123c;
                    color: #ffffff;
                }}
                QComboBox QListView {{
                    background-color: #0d1321;
                    color: #f8fafc;
                    border: 1px solid #1e293b;
                    outline: 0;
                    padding: 0px;
                }}
                QComboBox QListView::item:hover {{
                    background-color: #334155;
                    color: #f8fafc;
                }}
                QComboBox QListView::item:selected {{
                    background-color: #be123c;
                    color: #ffffff;
                }}
                QComboBox QScrollBar:vertical {{
                    background: #0d1321;
                    width: 10px;
                    margin: 0px;
                    border: none;
                }}
                QComboBox QScrollBar::handle:vertical {{
                    background: #334155;
                    min-height: 20px;
                    border-radius: 4px;
                }}
                QComboBox QScrollBar::add-line:vertical,
                QComboBox QScrollBar::sub-line:vertical {{
                    height: 0px;
                }}
                QComboBox QScrollBar::add-page:vertical,
                QComboBox QScrollBar::sub-page:vertical {{
                    background: #0d1321;
                }}
            """
        self.setStyleSheet(stylesheet)
        
        self.init_ui()
        self._apply_combo_popup_palette()
        
        # Start GUI Refresh Timer (50ms)
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_gui_loop)
        self.timer.start(50)
        
        # Initialize System Tray
        self.setup_tray_icon()
        
        # Verify saved session token
        if self.auth_token:
            QTimer.singleShot(100, self.verify_saved_token)

    def showEvent(self, event):
        super().showEvent(event)
        if sys.platform == "darwin" and not self._mac_audio_probe_done:
            self._mac_audio_probe_done = True
            QTimer.singleShot(800, self.request_macos_audio_access)

    def request_macos_audio_access(self):
        """Request microphone permission (macOS)."""
        if sys.platform != "darwin":
            return

        def on_permission_result(granted):
            if granted is True:
                self.refresh_input_devices()
                self._probe_audio_capture()
                return
            if granted is False:
                self._show_mic_permission_dialog()
                return
            self._probe_audio_capture()

        if HAS_MACOS_MIC_API:
            request_microphone_access(
                lambda granted: QTimer.singleShot(0, lambda g=granted: on_permission_result(g))
            )
        else:
            self._probe_audio_capture()

    def _probe_audio_capture(self):
        """Open a brief input stream to verify capture after permission is granted."""
        if sys.platform != 'darwin':
            return

        def _probe():
            device_id = None
            idx = self._resolve_connect_input_index()
            if idx >= 0:
                device_id = self.devices[idx]["id"]
            elif getattr(self, "devices", None):
                device_id = self.devices[0]["id"]
            else:
                devices = self.get_input_devices()
                if not devices:
                    QTimer.singleShot(0, self._show_mic_permission_dialog)
                    return
                device_id = devices[0]["id"]

            channels, samplerate = self.get_device_capture_params(device_id)
            stream_kwargs = {
                "device": device_id,
                "channels": channels,
                "samplerate": samplerate,
                "blocksize": 1024,
            }
            if sys.platform == "darwin":
                stream_kwargs["latency"] = "high"

            try:
                stream = self._open_input_stream(stream_kwargs)
                time.sleep(0.25)
                self._close_input_stream(stream)
            except Exception as exc:
                print("Microphone permission probe failed:", exc)
                QTimer.singleShot(0, self._show_mic_permission_dialog)

        threading.Thread(target=_probe, daemon=True).start()

    def _show_mic_permission_dialog(self):
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("Microphone Access Required")
        if sys.platform == "win32":
            text = (
                "VeriSonic Broadcaster needs access to your selected audio input "
                "(microphone, line-in, USB interface, or loopback).\n\n"
                "Open Settings → Privacy & security → Microphone and allow desktop apps, "
                "then check Settings → System → Sound → Input."
            )
        elif sys.platform == "linux":
            text = (
                "VeriSonic Broadcaster needs access to your selected audio input "
                "(microphone, line-in, USB interface, or loopback).\n\n"
                "Add your user to the audio group (sudo usermod -aG audio $USER, then re-login) "
                "and allow capture when PipeWire/PulseAudio prompts."
            )
        else:
            text = (
                "VeriSonic Broadcaster needs access to your selected audio input "
                "(microphone, line-in, USB interface, or loopback).\n\n"
                "Open System Settings → Privacy & Security → Microphone, "
                "enable VeriSonic Broadcaster, then restart the app."
            )
        msg.setText(text)
        settings_btn = msg.addButton("Open Audio Settings", QMessageBox.ActionRole)
        msg.addButton(QMessageBox.Ok)
        msg.exec_()
        if msg.clickedButton() == settings_btn:
            open_platform_audio_privacy_settings()

    def _apply_combo_popup_palette(self):
        """Dark popup + painted hover highlight (CSS :hover is unreliable on Linux)."""
        if sys.platform not in ("linux", "win32") or not USE_PYQT:
            return

        class _ComboHoverDelegate(QStyledItemDelegate):
            def __init__(self, parent=None):
                super().__init__(parent)
                self.hover_row = -1

            def set_hover_row(self, row, view):
                if self.hover_row == row:
                    return
                old = self.hover_row
                self.hover_row = row
                model = view.model()
                if model is None:
                    return
                if 0 <= old < model.rowCount():
                    view.update(model.index(old, 0))
                if 0 <= row < model.rowCount():
                    view.update(model.index(row, 0))

            def paint(self, painter, option, index):
                painter.save()
                rect = option.rect
                hovered = index.row() == self.hover_row
                painter.fillRect(rect, QColor("#334155" if hovered else "#0d1321"))
                painter.setPen(QColor("#f8fafc"))
                text = index.data(Qt.DisplayRole)
                painter.drawText(
                    rect.adjusted(12, 0, -12, 0),
                    Qt.AlignVCenter | Qt.AlignLeft,
                    "" if text is None else str(text),
                )
                painter.restore()

            def sizeHint(self, option, index):
                size = super().sizeHint(option, index)
                if size.height() < 32:
                    size.setHeight(32)
                return size

        class _ComboHoverFilter(QObject):
            def __init__(self, view, delegate):
                super().__init__(view)
                self._view = view
                self._delegate = delegate

            def eventFilter(self, obj, event):
                if self._view is None or self._delegate is None:
                    return False
                if event.type() == QEvent.MouseMove:
                    index = self._view.indexAt(event.pos())
                    row = index.row() if index.isValid() else -1
                    self._delegate.set_hover_row(row, self._view)
                elif event.type() in (QEvent.Leave, QEvent.HoverLeave):
                    self._delegate.set_hover_row(-1, self._view)
                return False

        if not hasattr(self, "_combo_hover_filters"):
            self._combo_hover_filters = []

        base = QColor("#0d1321")
        text = QColor("#f8fafc")
        hover = QColor("#334155")

        for combo in self.findChildren(QComboBox):
            if combo.property("_verisonic_hover_styled"):
                continue
            combo.setProperty("_verisonic_hover_styled", True)

            pal = combo.palette()
            pal.setColor(QPalette.Base, base)
            pal.setColor(QPalette.Text, text)
            pal.setColor(QPalette.Button, base)
            pal.setColor(QPalette.ButtonText, text)
            pal.setColor(QPalette.Highlight, hover)
            pal.setColor(QPalette.HighlightedText, text)
            pal.setColor(QPalette.Window, base)
            pal.setColor(QPalette.WindowText, text)
            combo.setPalette(pal)

            view = combo.view()
            if view is None:
                continue
            view.setPalette(pal)
            view.setAutoFillBackground(True)
            view.setMouseTracking(True)
            view.viewport().setMouseTracking(True)
            view.viewport().setAttribute(Qt.WA_Hover, True)
            view.setStyleSheet(
                "background-color: #0d1321; color: #f8fafc; border: 1px solid #1e293b; "
                "outline: 0; padding: 0px;"
            )
            delegate = _ComboHoverDelegate(view)
            view.setItemDelegate(delegate)
            hover_filter = _ComboHoverFilter(view, delegate)
            view.viewport().installEventFilter(hover_filter)
            self._combo_hover_filters.append(hover_filter)
            frame = view.parentWidget()
            if frame is not None:
                frame.setStyleSheet("background-color: #0d1321; border: 1px solid #1e293b;")
                frame.setAutoFillBackground(True)

    @staticmethod
    def _linux_combo_arrow_path():
        """Cache a small chevron SVG for QComboBox::down-arrow (Qt stylesheet)."""
        import tempfile

        path = os.path.join(tempfile.gettempdir(), "verisonic_combo_arrow.svg")
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">'
            '<path fill="none" stroke="#94a3b8" stroke-width="1.4" '
            'stroke-linecap="round" stroke-linejoin="round" d="M2.5 4.5L6 8l3.5-3.5"/>'
            "</svg>"
        )
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(svg)
        except Exception:
            pass
        return path

    @staticmethod
    def _is_loopback_device_name(name):
        n = (name or "").lower()
        return any(kw in n for kw in _LOOPBACK_DEVICE_KEYWORDS)

    @staticmethod
    def _is_system_audio_device(device):
        """True for loopback/monitor sources used to capture desktop/system audio."""
        if not device or device.get("is_no_input"):
            return False
        if device.get("is_monitor"):
            return True
        return (
            PyQtBroadcasterApp._is_loopback_device_name(device.get("name"))
            or PyQtBroadcasterApp._is_loopback_device_name(device.get("raw_name"))
        )

    @staticmethod
    def _system_audio_display_name(device):
        name = (device.get("name") or "").strip()
        prefix = "System Audio (loopback) — "
        if name.startswith(prefix):
            return name[len(prefix):].strip() or name
        return name or "System Audio"

    def _capture_system_audio_enabled(self):
        cb = getattr(self, "capture_system_audio_cb", None)
        return bool(cb is not None and cb.isChecked())

    @staticmethod
    def _linux_default_sink_name():
        proc = PyQtBroadcasterApp._linux_run_cmd(["pactl", "get-default-sink"], timeout=2)
        if proc is not None and proc.returncode == 0:
            return (proc.stdout or "").strip()
        return ""

    def _current_output_route_fingerprint(self):
        """Track the active playback route so default-output capture can hot-swap."""
        if sys.platform == "linux":
            return self._linux_default_sink_name()
        return self._normalize_device_name(self._system_default_output_name())

    def _resolve_default_system_audio_device(self, devices=None):
        """Pick the monitor/loopback for the current system default output (what you hear)."""
        devices = list(devices) if devices is not None else self.get_input_devices()
        monitors = [dev for dev in devices if self._is_system_audio_device(dev)]
        if not monitors:
            return None

        if sys.platform == "linux":
            for dev in monitors:
                if dev.get("is_default"):
                    return dev
            sink = self._linux_default_sink_name()
            if sink:
                mon_name = sink if sink.endswith(".monitor") else f"{sink}.monitor"
                for dev in monitors:
                    if dev.get("pulse_source") == mon_name:
                        return dev
                for dev in monitors:
                    pulse = dev.get("pulse_source") or ""
                    if pulse == sink or pulse.startswith(f"{sink}."):
                        return dev
            try:
                for item in self._linux_list_wpctl_section("Sinks"):
                    if not item.get("is_default"):
                        continue
                    for dev in monitors:
                        if dev.get("wp_id") == item.get("wp_id"):
                            return dev
            except Exception:
                pass

        out_name = self._normalize_device_name(self._system_default_output_name())
        if out_name:
            for dev in monitors:
                label = self._normalize_device_name(
                    f"{dev.get('name') or ''} {dev.get('raw_name') or ''}"
                )
                if out_name in label or label in out_name:
                    return dev
        return monitors[0]

    @staticmethod
    def _selection_from_device(device):
        return {
            "id": device.get("id"),
            "pulse_source": device.get("pulse_source"),
            "wp_id": device.get("wp_id"),
        }

    @staticmethod
    def _linux_is_sound_server_device(name):
        n = (name or "").strip().lower()
        return n in _LINUX_SOUND_SERVER_NAMES or n.startswith("pipewire")

    @staticmethod
    def _linux_should_skip_input_device(name):
        n = (name or "").strip().lower()
        if not n:
            return True
        if PyQtBroadcasterApp._linux_is_sound_server_device(n):
            return False
        if "(hw:" in n:
            return True
        if n in _LINUX_SKIP_INPUT_EXACT:
            return True
        return any(n.startswith(prefix) for prefix in _LINUX_SKIP_INPUT_PREFIXES)

    @staticmethod
    def _linux_run_cmd(args, timeout=4):
        import subprocess

        try:
            return subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            return None

    @staticmethod
    def _linux_list_wpctl_section(section_title):
        """Parse a wpctl status Audio subsection (e.g. Sources / Sinks)."""
        import re

        proc = PyQtBroadcasterApp._linux_run_cmd(["wpctl", "status"], timeout=4)
        if proc is None or proc.returncode != 0 or not (proc.stdout or "").strip():
            return []

        results = []
        in_section = False
        header_re = re.compile(rf"{re.escape(section_title)}:\s*$")
        # Next top-level Audio subsection ends the current one.
        next_section_re = re.compile(r"[├└]─\s+\S+:\s*$")
        item_re = re.compile(r"(\d+)\.\s+(.+?)(?:\s+\[vol:[^\]]*\])?\s*$")
        for line in (proc.stdout or "").splitlines():
            if header_re.search(line):
                in_section = True
                continue
            if not in_section:
                continue
            if next_section_re.search(line) and section_title + ":" not in line:
                break
            match = item_re.search(line)
            if not match:
                continue
            wp_id = int(match.group(1))
            label = match.group(2).strip()
            if not label:
                continue
            lower = label.lower()
            if any(tok in lower for tok in ("auto_null", "dummy", "midi", "virmidi")):
                continue
            results.append({
                "wp_id": wp_id,
                "name": label,
                "is_default": "*" in line[: match.start()],
            })
        return results

    @staticmethod
    def _linux_list_wpctl_sources():
        """Parse `wpctl status` Sources section (works without pulseaudio-utils)."""
        results = []
        for item in PyQtBroadcasterApp._linux_list_wpctl_section("Sources"):
            label = item["name"]
            lower = label.lower()
            is_monitor = "monitor" in lower
            if is_monitor and not lower.startswith("system audio"):
                label = f"System Audio (loopback) — {label}"
            results.append({
                "wp_id": item["wp_id"],
                "pulse_source": None,
                "name": label,
                "is_monitor": is_monitor,
                "is_default": bool(item.get("is_default")),
            })
        results.sort(key=lambda item: (1 if item["is_monitor"] else 0, item["name"].lower()))
        return results

    @staticmethod
    def _linux_list_wpctl_sink_monitors():
        """
        Build system-audio entries from wpctl Sinks.

        PipeWire often omits sink monitors under Sources; the sink id still works
        for loopback capture (pw-cat/parec via matching *.monitor pulse name).
        """
        results = []
        for item in PyQtBroadcasterApp._linux_list_wpctl_section("Sinks"):
            label = item["name"]
            results.append({
                "wp_id": item["wp_id"],
                "pulse_source": None,
                "name": f"System Audio (loopback) — {label}",
                "is_monitor": True,
                "is_default": bool(item.get("is_default")),
            })
        results.sort(key=lambda item: (0 if item.get("is_default") else 1, item["name"].lower()))
        return results

    @staticmethod
    def _linux_list_pw_dump_sources():
        """List Audio/Source nodes via pw-dump JSON (includes *.monitor when present)."""
        proc = PyQtBroadcasterApp._linux_run_cmd(["pw-dump"], timeout=6)
        if proc is None or proc.returncode != 0 or not (proc.stdout or "").strip():
            return []
        try:
            objects = json.loads(proc.stdout)
        except Exception:
            return []

        results = []
        for obj in objects:
            if not isinstance(obj, dict):
                continue
            info = obj.get("info") or {}
            props = info.get("props") or {}
            media_class = props.get("media.class") or ""
            node_name = str(props.get("node.name") or "")
            node_id = obj.get("id")
            if node_id is None:
                continue

            # Normal capture sources.
            if media_class == "Audio/Source":
                label = (
                    props.get("node.description")
                    or props.get("node.nick")
                    or props.get("device.description")
                    or node_name
                    or f"Input {node_id}"
                )
                lower = f"{label} {node_name}".lower()
                if any(tok in lower for tok in ("auto_null", "dummy", "midi", "virmidi")):
                    continue
                is_monitor = node_name.endswith(".monitor") or "monitor" in lower
                if is_monitor:
                    clean = label
                    if clean.lower().startswith("monitor of "):
                        clean = clean[11:].strip()
                    label = f"System Audio (loopback) — {clean}"
                results.append({
                    "wp_id": int(node_id),
                    "pulse_source": node_name or None,
                    "name": label,
                    "is_monitor": is_monitor,
                    "is_default": False,
                })
                continue

            # Sink nodes → synthetic system-audio (what you hear) entries.
            if media_class == "Audio/Sink":
                label = (
                    props.get("node.description")
                    or props.get("node.nick")
                    or props.get("device.description")
                    or node_name
                    or f"Output {node_id}"
                )
                lower = f"{label} {node_name}".lower()
                if any(tok in lower for tok in ("auto_null", "dummy", "midi", "virmidi")):
                    continue
                pulse_monitor = None
                if node_name:
                    pulse_monitor = (
                        node_name
                        if node_name.endswith(".monitor")
                        else f"{node_name}.monitor"
                    )
                results.append({
                    "wp_id": int(node_id),
                    "pulse_source": pulse_monitor,
                    "name": f"System Audio (loopback) — {label}",
                    "is_monitor": True,
                    "is_default": False,
                })

        results.sort(key=lambda item: (1 if item["is_monitor"] else 0, item["name"].lower()))
        return results
    @staticmethod
    def _linux_port_is_available(port_detail):
        """Interpret pactl/PipeWire port availability text. None = unknown."""
        lower = (port_detail or "").lower().strip()
        if "not available" in lower or "availability: no" in lower:
            return False
        if "availability unknown" in lower or "availability: unknown" in lower:
            # Built-in mics often report unknown; treat as present.
            return True
        if "availability: yes" in lower:
            return True
        trimmed = lower.rstrip(")").rstrip()
        if trimmed.endswith("available"):
            return True
        return None

    @staticmethod
    def _linux_pactl_source_availability():
        """Map Pulse/PipeWire sources to jack availability via `pactl list sources`."""
        detail = PyQtBroadcasterApp._linux_run_cmd(["pactl", "list", "sources"], timeout=4)
        if detail is None or detail.returncode != 0 or not (detail.stdout or "").strip():
            return {"by_name": {}, "by_desc": {}}

        by_name = {}
        by_desc = {}
        current = None

        def finalize(cur):
            if not cur or not cur.get("name"):
                return
            ports = cur.get("ports") or {}
            active = cur.get("active_port")
            if active and active in ports:
                available = ports[active]
            elif ports:
                vals = list(ports.values())
                if vals and all(v is False for v in vals):
                    available = False
                else:
                    available = True
            else:
                available = True
            by_name[cur["name"]] = available
            desc = (cur.get("description") or "").strip()
            if desc:
                by_desc[desc.lower()] = available

        for line in (detail.stdout or "").splitlines():
            if line.startswith("Source #"):
                finalize(current)
                current = {
                    "name": "",
                    "description": "",
                    "ports": {},
                    "active_port": None,
                    "in_ports": False,
                }
                continue
            if current is None:
                continue
            stripped = line.strip()
            if stripped.startswith("Name:"):
                current["name"] = stripped.split(":", 1)[-1].strip()
                current["in_ports"] = False
            elif stripped.startswith("Description:"):
                current["description"] = stripped.split(":", 1)[-1].strip()
                current["in_ports"] = False
            elif stripped.startswith("Ports:"):
                current["in_ports"] = True
            elif stripped.startswith("Active Port:"):
                current["in_ports"] = False
                current["active_port"] = stripped.split(":", 1)[-1].strip()
            elif current.get("in_ports") and stripped.startswith("["):
                if ":" not in stripped:
                    continue
                port_key, rest = stripped.split(":", 1)
                parsed = PyQtBroadcasterApp._linux_port_is_available(rest)
                current["ports"][port_key.strip()] = True if parsed is None else parsed
        finalize(current)
        return {"by_name": by_name, "by_desc": by_desc}

    @staticmethod
    def _linux_source_availability_lookup(src, availability):
        """Return True/False/None for whether a listed capture source is plugged in."""
        by_name = availability.get("by_name") or {}
        by_desc = availability.get("by_desc") or {}
        if not by_name and not by_desc:
            return None

        pulse = src.get("pulse_source")
        if pulse and pulse in by_name:
            return by_name[pulse]

        label = (src.get("name") or "").strip()
        candidates = []
        if label:
            candidates.append(label.lower())
        if label.startswith("System Audio (loopback) — "):
            rest = label.split("—", 1)[-1].strip()
            if rest:
                candidates.append(rest.lower())
                candidates.append(f"monitor of {rest}".lower())

        for key in candidates:
            if key in by_desc:
                return by_desc[key]

        for key in candidates:
            for desc, available in by_desc.items():
                if key == desc or key.endswith(desc) or desc.endswith(key):
                    return available
        return None

    @staticmethod
    def _linux_filter_unavailable_sources(sources):
        """Drop sources whose active pactl port is unplugged / not available."""
        if not sources:
            return sources
        availability = PyQtBroadcasterApp._linux_pactl_source_availability()
        if not availability.get("by_name") and not availability.get("by_desc"):
            return sources

        filtered = []
        for src in sources:
            available = PyQtBroadcasterApp._linux_source_availability_lookup(src, availability)
            if available is False:
                continue
            filtered.append(src)
        return filtered

    @staticmethod
    def _linux_list_pactl_sources():
        """Optional pactl listing when pulseaudio-utils is installed."""
        proc = PyQtBroadcasterApp._linux_run_cmd(["pactl", "list", "short", "sources"], timeout=3)
        if proc is None or proc.returncode != 0:
            return []

        short_entries = []
        for line in (proc.stdout or "").splitlines():
            parts = line.split("\t") if "\t" in line else line.split()
            if len(parts) >= 2:
                try:
                    src_id = int(parts[0].strip())
                except ValueError:
                    src_id = None
                short_entries.append((src_id, parts[1].strip()))

        detail = PyQtBroadcasterApp._linux_run_cmd(["pactl", "list", "sources"], timeout=4)
        descriptions = {}
        if detail is not None and detail.returncode == 0:
            current_name = ""
            for line in (detail.stdout or "").splitlines():
                stripped = line.strip()
                if stripped.startswith("Name:"):
                    current_name = stripped.split(":", 1)[-1].strip()
                elif stripped.startswith("Description:") and current_name:
                    descriptions[current_name] = stripped.split(":", 1)[-1].strip()

        results = []
        for src_id, pulse_name in short_entries:
            if not pulse_name:
                continue
            desc = descriptions.get(pulse_name) or pulse_name
            lower = f"{pulse_name} {desc}".lower()
            if any(tok in lower for tok in ("auto_null", "dummy", "midi", "virmidi")):
                continue
            is_monitor = pulse_name.endswith(".monitor") or desc.lower().startswith("monitor of ")
            if is_monitor:
                rest = desc[11:].strip() if desc.lower().startswith("monitor of ") else desc
                label = f"System Audio (loopback) — {rest}"
            else:
                label = desc
            results.append({
                "wp_id": src_id,
                "pulse_source": pulse_name,
                "name": label,
                "is_monitor": is_monitor,
                "is_default": False,
            })
        results.sort(key=lambda item: (1 if item["is_monitor"] else 0, item["name"].lower()))
        return results

    @staticmethod
    def _linux_merge_capture_sources(*groups):
        """Merge source lists, enriching duplicates (pulse name / wp id / monitor flag)."""
        merged = []
        index_by_key = {}

        def keys_for(src):
            out = []
            pulse = src.get("pulse_source")
            wp_id = src.get("wp_id")
            if pulse:
                out.append(("pulse", pulse))
            if wp_id is not None:
                out.append(
                    ("wp_mon", wp_id) if src.get("is_monitor") else ("wp", wp_id)
                )
            if not out:
                out.append(("name", (src.get("name") or "").lower()))
            return out

        for group in groups:
            for src in group or []:
                keys = keys_for(src)
                existing_idx = None
                for key in keys:
                    if key in index_by_key:
                        existing_idx = index_by_key[key]
                        break
                if existing_idx is None:
                    merged.append(dict(src))
                    idx = len(merged) - 1
                    for key in keys_for(merged[idx]):
                        index_by_key[key] = idx
                    continue

                existing = merged[existing_idx]
                if not existing.get("pulse_source") and src.get("pulse_source"):
                    existing["pulse_source"] = src.get("pulse_source")
                if existing.get("wp_id") is None and src.get("wp_id") is not None:
                    existing["wp_id"] = src.get("wp_id")
                if src.get("is_monitor"):
                    existing["is_monitor"] = True
                    name = src.get("name") or ""
                    if name.startswith("System Audio (loopback)"):
                        existing["name"] = name
                if src.get("is_default"):
                    existing["is_default"] = True
                for key in keys_for(existing):
                    index_by_key[key] = existing_idx

        return merged

    @staticmethod
    def _linux_list_capture_sources():
        """Discover mics + sink-monitor (system output) sources from all backends."""
        groups = []
        for lister in (
            PyQtBroadcasterApp._linux_list_wpctl_sources,
            PyQtBroadcasterApp._linux_list_wpctl_sink_monitors,
            PyQtBroadcasterApp._linux_list_pw_dump_sources,
            PyQtBroadcasterApp._linux_list_pactl_sources,
        ):
            try:
                groups.append(lister())
            except Exception as exc:
                print("Capture source lister failed:", lister.__name__, exc)
                groups.append([])

        merged = PyQtBroadcasterApp._linux_merge_capture_sources(*groups)
        filtered = PyQtBroadcasterApp._linux_filter_unavailable_sources(merged)

        # Keep at least the default sink monitor even if port availability is odd.
        if not any(src.get("is_monitor") for src in filtered):
            monitors = [src for src in merged if src.get("is_monitor")]
            if monitors:
                preferred = next((m for m in monitors if m.get("is_default")), monitors[0])
                filtered.append(preferred)

        filtered.sort(
            key=lambda item: (
                0 if item.get("is_default") and item.get("is_monitor") else
                1 if item.get("is_monitor") else 2,
                item.get("name") or "",
            )
        )
        return filtered

    @staticmethod
    def _linux_default_capture_keys():
        """Return (wp_id, pulse_source) for the current default input, if known."""
        for src in PyQtBroadcasterApp._linux_list_wpctl_sources():
            if src.get("is_default"):
                return src.get("wp_id"), src.get("pulse_source")

        proc = PyQtBroadcasterApp._linux_run_cmd(["pactl", "get-default-source"], timeout=2)
        if proc is not None and proc.returncode == 0:
            name = (proc.stdout or "").strip()
            if name:
                return None, name
        return None, None

    @staticmethod
    def _linux_apply_capture_source(pulse_source=None, wp_id=None):
        """Route PipeWire/Pulse capture to the selected source."""
        if wp_id is not None:
            PyQtBroadcasterApp._linux_run_cmd(["wpctl", "set-default", str(wp_id)], timeout=2)
        if pulse_source:
            os.environ["PULSE_SOURCE"] = pulse_source
            PyQtBroadcasterApp._linux_run_cmd(
                ["pactl", "set-default-source", pulse_source],
                timeout=2,
            )

    @staticmethod
    def _friendly_linux_input_name(name):
        raw = (name or "").strip() or "Unknown Device"
        lower = raw.lower()
        if lower == "default":
            return "System Default Input"
        if lower == "pulse":
            return "System Default Input (PulseAudio)"
        if lower == "pipewire" or lower.startswith("pipewire"):
            return "System Default Input (PipeWire)"
        if lower.startswith("monitor of "):
            rest = raw[11:].strip()
            return f"System Audio (loopback) — {rest}"
        if lower.startswith("alsa_input."):
            tail = raw.rsplit(".", 1)[-1].replace("-", " ").replace("_", " ").strip()
            return tail.title() if tail else raw
        if lower.startswith("alsa_output."):
            tail = raw.rsplit(".", 1)[-1].replace("-", " ").replace("_", " ").strip()
            label = tail.title() if tail else raw
            return f"System Audio (loopback) — {label}"
        if "(hw:" in lower:
            card = raw.split(":", 1)[0].strip() or "Audio Device"
            return f"{card} (direct)"
        return raw

    @staticmethod
    def _linux_pick_sound_server_device(candidates):
        """Prefer PipeWire, then PulseAudio, then PortAudio 'default'."""
        ranked = []
        for item in candidates:
            n = (item.get("raw_name") or "").strip().lower()
            if n == "pipewire" or n.startswith("pipewire"):
                ranked.append((0, item))
            elif n == "pulse":
                ranked.append((1, item))
            elif n == "default":
                ranked.append((2, item))
        if not ranked:
            return None
        ranked.sort(key=lambda pair: pair[0])
        return ranked[0][1]

    def _get_linux_input_devices(self, device_list):
        """List connected PipeWire sources with clear names; hide ALSA hw clutter."""
        sound_server = []
        fallback = []
        for idx, dev in enumerate(device_list):
            if dev.get("max_input_channels", 0) <= 0:
                continue
            raw_name = dev.get("name", "Unknown Device") or "Unknown Device"
            entry = {"id": idx, "raw_name": raw_name}
            if self._linux_is_sound_server_device(raw_name):
                sound_server.append(entry)
            elif not self._linux_should_skip_input_device(raw_name):
                fallback.append(entry)

        chosen = self._linux_pick_sound_server_device(sound_server)
        capture_sources = self._linux_list_capture_sources()
        if chosen is not None and capture_sources:
            return [{
                "id": chosen["id"],
                "name": src["name"],
                "raw_name": chosen["raw_name"],
                "pulse_source": src.get("pulse_source"),
                "wp_id": src.get("wp_id"),
                "is_default": bool(src.get("is_default")),
                "is_monitor": bool(src.get("is_monitor")),
            } for src in capture_sources]

        if chosen is not None:
            return [{
                "id": chosen["id"],
                "name": self._friendly_linux_input_name(chosen["raw_name"]),
                "raw_name": chosen["raw_name"],
                "pulse_source": None,
                "wp_id": None,
            }]

        try:
            default_input_id = sd.default.device[0]
            if default_input_id is not None and int(default_input_id) >= 0:
                info = sd.query_devices(int(default_input_id), "input")
                raw_name = info.get("name", "Unknown Device") or "Unknown Device"
                return [{
                    "id": int(default_input_id),
                    "name": self._friendly_linux_input_name(raw_name),
                    "raw_name": raw_name,
                    "pulse_source": None,
                    "wp_id": None,
                }]
        except Exception:
            pass

        return [{
            "id": entry["id"],
            "name": self._friendly_linux_input_name(entry["raw_name"]),
            "raw_name": entry["raw_name"],
            "pulse_source": None,
            "wp_id": None,
        } for entry in fallback]

    @staticmethod
    def _normalize_device_name(name):
        return (name or "").lower().strip()

    def _system_default_output_name(self):
        try:
            out_id = sd.default.device[1]
            if out_id is None or int(out_id) < 0:
                return ""
            info = sd.query_devices(int(out_id), "output")
            return str(info.get("name", ""))
        except Exception:
            return ""

    def _find_default_microphone_input_index(self):
        """Prefer the system default input, otherwise the first non-loopback mic."""
        if not self.devices:
            return -1
        if sys.platform == "linux":
            default_wp_id, default_src = self._linux_default_capture_keys()
            if default_wp_id is not None:
                for i, dev in enumerate(self.devices):
                    if dev.get("wp_id") == default_wp_id:
                        return i
            if default_src:
                for i, dev in enumerate(self.devices):
                    if dev.get("pulse_source") == default_src:
                        return i
            for i, dev in enumerate(self.devices):
                if dev.get("is_default"):
                    return i
        try:
            default_input_id = sd.default.device[0]
            if default_input_id is not None and int(default_input_id) >= 0:
                for i, dev in enumerate(self.devices):
                    if dev["id"] == int(default_input_id):
                        label = dev.get("raw_name") or dev["name"]
                        if not self._is_loopback_device_name(label) and not self._is_loopback_device_name(dev["name"]):
                            return i
        except Exception:
            pass
        for i, dev in enumerate(self.devices):
            label = dev.get("raw_name") or dev["name"]
            if not self._is_loopback_device_name(label) and not self._is_loopback_device_name(dev["name"]):
                return i
        return -1

    def _default_input_device_index(self):
        mic_idx = self._find_default_microphone_input_index()
        if mic_idx >= 0:
            return mic_idx
        return 0 if self.devices else -1

    def _resolve_connect_input_index(self):
        """Pick the default microphone (or first available input) for Connect Live."""
        self.devices = self.get_input_devices()
        if not self.devices:
            return -1
        return self._default_input_device_index()

    @staticmethod
    def _fingerprint_input_devices(devices):
        return tuple(
            (dev.get("wp_id"), dev.get("pulse_source"), dev.get("name"))
            for dev in devices
        )

    def _device_capture_key(self, device):
        if not device:
            return None
        return (
            device.get("id"),
            device.get("pulse_source"),
            device.get("wp_id"),
            device.get("name"),
        )

    def _lookup_device_in_list(self, devices, selection):
        if not devices or not selection:
            return None
        wp_id = selection.get("wp_id")
        pulse_source = selection.get("pulse_source")
        selected_id = selection.get("id")
        if wp_id is not None:
            for dev in devices:
                if dev.get("wp_id") == wp_id:
                    return dev
        if pulse_source:
            for dev in devices:
                if dev.get("pulse_source") == pulse_source:
                    return dev
        if selected_id is not None and wp_id is None and not pulse_source:
            matches = [dev for dev in devices if dev.get("id") == selected_id]
            if len(matches) == 1:
                return matches[0]
        return None

    def _resolve_capture_devices_from_ui(self):
        """Return (mic_device_or_None, system_device_or_None) from Live controls."""
        mic = None
        sys_dev = None

        mic_devices = getattr(self, "devices", None) or []
        mic_combo = getattr(self, "live_device_combo", None)
        if mic_combo is not None and mic_devices:
            idx = mic_combo.currentIndex()
            if 0 <= idx < len(mic_devices):
                candidate = mic_devices[idx]
                if not candidate.get("is_no_input"):
                    mic = candidate
        elif self._mic_selection:
            candidate = self._lookup_device_in_list(mic_devices, self._mic_selection)
            if candidate is not None and not candidate.get("is_no_input"):
                mic = candidate

        if self._capture_system_audio_enabled():
            # Always follow the current default output (what you hear).
            sys_dev = self._resolve_default_system_audio_device()

        return mic, sys_dev

    def _apply_capture_selection_from_ui(self):
        """Sync capture plan from mic dropdown and system-audio checkbox."""
        mic, sys_dev = self._resolve_capture_devices_from_ui()
        sig = (self._device_capture_key(mic), self._device_capture_key(sys_dev))
        changed = sig != getattr(self, "_capture_sig", None)
        self._capture_mic = mic
        self._capture_sys = sys_dev
        self._capture_sig = sig

        primary = mic or sys_dev
        if mic and sys_dev:
            self.active_device_id = mic.get("id")
            self.active_pulse_source = mic.get("pulse_source")
            self.active_wp_id = mic.get("wp_id")
            self._active_device_name = (
                f"{mic.get('name') or 'Input'} + "
                f"{self._system_audio_display_name(sys_dev)}"
            )
        elif primary:
            self.active_device_id = primary.get("id")
            self.active_pulse_source = primary.get("pulse_source")
            self.active_wp_id = primary.get("wp_id")
            self._active_device_name = primary.get("name") or ""
        else:
            self.active_device_id = None
            self.active_pulse_source = None
            self.active_wp_id = None
            self._active_device_name = "No input"

        if not changed:
            return

        print(
            "Capture plan synced:",
            "mic=", (mic or {}).get("name"),
            "sys=", (sys_dev or {}).get("name"),
        )
        if self.is_broadcasting:
            self.connection_status = (
                "Input muted..." if primary is None else "Switching input..."
            )

    def _sync_active_input_from_combo_selection(self):
        """Apply combo selection to active_* when refresh changed it without signals."""
        self._apply_capture_selection_from_ui()

    @staticmethod
    def _reshape_audio_channels(indata, target_channels):
        x = np.asarray(indata, dtype=np.float32)
        if x.ndim == 1:
            x = x.reshape(-1, 1)
        if x.shape[1] == target_channels:
            return x
        if x.shape[1] == 1 and target_channels > 1:
            return np.repeat(x, target_channels, axis=1)
        if x.shape[1] > 1 and target_channels == 1:
            return np.mean(x, axis=1, keepdims=True).astype(np.float32)
        if x.shape[1] > target_channels:
            return x[:, :target_channels]
        pad = np.zeros((x.shape[0], target_channels - x.shape[1]), dtype=np.float32)
        return np.concatenate([x, pad], axis=1)

    @staticmethod
    def _queue_put_latest(q, item):
        """Enqueue item; if full, drop oldest so live latency stays low."""
        for _ in range(8):
            try:
                q.put_nowait(item)
                return
            except queue.Full:
                try:
                    q.get_nowait()
                except queue.Empty:
                    return

    @staticmethod
    def _queue_put_realtime(q, item):
        """
        Prefer continuous audio over hard drops.
        Block briefly for space; only then drop one oldest chunk (catch-up).
        """
        try:
            q.put(item, timeout=0.05)
            return
        except queue.Full:
            pass
        try:
            q.get_nowait()
        except queue.Empty:
            pass
        try:
            q.put_nowait(item)
        except queue.Full:
            pass

    @staticmethod
    def _pipe_read_exact(pipe, nbytes, stop_event):
        """Read exactly nbytes from a pipe (no silence padding)."""
        buf = bytearray()
        while len(buf) < nbytes:
            if stop_event.is_set():
                return None
            try:
                chunk = pipe.read(nbytes - len(buf))
            except Exception:
                return None
            if not chunk:
                return None
            buf.extend(chunk)
        return bytes(buf)

    def _linux_pulse_source_format(self, pulse_source):
        """Return (channels, samplerate) from `pactl list short sources` when possible."""
        proc = self._linux_run_cmd(["pactl", "list", "short", "sources"], timeout=3)
        if proc is None or proc.returncode != 0:
            return None
        for line in (proc.stdout or "").splitlines():
            parts = line.split("\t") if "\t" in line else line.split()
            if len(parts) < 4:
                continue
            if parts[1].strip() != pulse_source:
                continue
            # e.g. s32le 2ch 48000Hz
            spec = parts[3].strip().lower()
            channels = 2
            rate = 48000
            try:
                if "ch" in spec:
                    for tok in spec.replace("-", " ").split():
                        if tok.endswith("ch") and tok[:-2].isdigit():
                            channels = max(1, min(2, int(tok[:-2])))
                        if tok.endswith("hz") and tok[:-2].isdigit():
                            rate = int(tok[:-2])
            except Exception:
                pass
            return channels, rate
        return None

    def _capture_format_for_device(self, device):
        """Channels/rate for capture; Linux monitors prefer native Pulse format (usually 48k)."""
        channels, samplerate = self.get_device_capture_params(device.get("id"))
        if sys.platform == "linux":
            pulse = device.get("pulse_source")
            if pulse:
                fmt = self._linux_pulse_source_format(pulse)
                if fmt:
                    return fmt
            if device.get("is_monitor") or self._is_system_audio_device(device):
                return max(channels, 2), 48000
        return channels, samplerate

    def _mix_capture_loop(self, mic_q, sys_q, out_q, stop_event, channels):
        """
        Combine mic + system-audio PCM.

        System audio is the timing clock when present so playback stays continuous.
        Mic is mixed when a chunk is ready; missing mic does not stall the stream.
        """
        while not stop_event.is_set():
            sys_chunk = None
            mic = None
            try:
                sys_chunk = sys_q.get(timeout=0.05)
            except queue.Empty:
                pass
            try:
                mic = mic_q.get_nowait()
            except queue.Empty:
                pass

            if sys_chunk is None and mic is None:
                continue

            if sys_chunk is None:
                mixed = self._reshape_audio_channels(mic, channels)
            elif mic is None:
                mixed = self._reshape_audio_channels(sys_chunk, channels)
            else:
                a = self._reshape_audio_channels(mic, channels)
                b = self._reshape_audio_channels(sys_chunk, channels)
                n = min(a.shape[0], b.shape[0])
                if n <= 0:
                    continue
                mixed = np.clip(a[:n] + b[:n], -1.0, 1.0)
            self._queue_put_realtime(out_q, mixed)

    def _open_parec_to_queue(self, pulse_source, channels, samplerate, out_q, blocksize=1024):
        """Capture a Pulse/PipeWire source via parec into out_q (Linux mix path)."""
        import subprocess

        cmd = [
            "parec",
            f"--device={pulse_source}",
            f"--channels={int(channels)}",
            f"--rate={int(samplerate)}",
            "--format=float32le",
            "--latency-msec=25",
            "--process-time-msec=15",
        ]
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        stop = threading.Event()

        def reader():
            nbytes = blocksize * channels * 4
            while not stop.is_set():
                data = self._pipe_read_exact(proc.stdout, nbytes, stop)
                if data is None:
                    break
                arr = np.frombuffer(data, dtype=np.float32).reshape(-1, channels).copy()
                self._queue_put_realtime(out_q, arr)

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        return {"type": "parec", "proc": proc, "stop": stop, "thread": thread}

    def _open_pw_record_to_queue(self, wp_id, channels, samplerate, out_q, blocksize=1024):
        """Capture a PipeWire node via pw-cat into out_q."""
        import subprocess

        cmd = [
            "pw-cat",
            "--record",
            f"--target={int(wp_id)}",
            f"--channels={int(channels)}",
            f"--rate={int(samplerate)}",
            "--format=f32",
            "--latency=25ms",
            "-",
        ]
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        stop = threading.Event()

        def reader():
            nbytes = blocksize * channels * 4
            while not stop.is_set():
                data = self._pipe_read_exact(proc.stdout, nbytes, stop)
                if data is None:
                    break
                arr = np.frombuffer(data, dtype=np.float32).reshape(-1, channels).copy()
                self._queue_put_realtime(out_q, arr)

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        return {"type": "parec", "proc": proc, "stop": stop, "thread": thread}

    def _open_portaudio_to_queue(self, device, channels, samplerate, out_q, apply_linux_route=False):
        device_id = device.get("id")
        pulse_source = device.get("pulse_source") if apply_linux_route else None
        wp_id = device.get("wp_id") if apply_linux_route else None

        def audio_callback(indata, frames, time_info, status):
            if status:
                print("Audio input status:", status)
            self._queue_put_realtime(
                out_q,
                self._reshape_audio_channels(indata.copy(), channels),
            )

        stream_kwargs = {
            "device": device_id,
            "channels": channels,
            "samplerate": samplerate,
            "blocksize": 1024,
            "callback": audio_callback,
        }
        if sys.platform == "darwin":
            stream_kwargs["latency"] = "low"
        stream = self._open_input_stream(
            stream_kwargs,
            pulse_source=pulse_source,
            wp_id=wp_id,
        )
        return {"type": "portaudio", "stream": stream}

    def _open_source_to_queue(self, device, channels, samplerate, out_q, for_mix=False):
        """Open one capture source that writes PCM float chunks into out_q."""
        if sys.platform == "linux" and (for_mix or device.get("is_monitor")):
            pulse = device.get("pulse_source")
            if pulse:
                return self._open_parec_to_queue(pulse, channels, samplerate, out_q)
            if device.get("wp_id") is not None:
                return self._open_pw_record_to_queue(
                    device["wp_id"], channels, samplerate, out_q
                )
        return self._open_portaudio_to_queue(
            device,
            channels,
            samplerate,
            out_q,
            apply_linux_route=(sys.platform == "linux" and not for_mix),
        )

    def _open_capture_bundle(self, mic, sys_dev, out_q):
        """
        Open mic and/or system-audio capture.
        When both are set, mix them into out_q. Returns a closeable handle dict.
        """
        if mic and sys_dev:
            ch_m, sr_m = self._capture_format_for_device(mic)
            ch_s, sr_s = self._capture_format_for_device(sys_dev)
            channels = 2 if max(ch_m, ch_s) >= 2 else 1
            # Prefer 48k on Linux so mic+monitor stay aligned with PipeWire.
            if sys.platform == "linux":
                samplerate = 48000
            elif sr_m == sr_s:
                samplerate = sr_m
            elif 48000 in (sr_m, sr_s):
                samplerate = 48000
            else:
                samplerate = sr_m

            mic_q = queue.Queue(maxsize=8)
            sys_q = queue.Queue(maxsize=8)
            stop = threading.Event()
            print(
                f"Opening mixed capture: mic={mic.get('name')!r} + "
                f"sys={sys_dev.get('name')!r} ({channels}ch @ {samplerate}Hz)"
            )
            stream_mic = self._open_source_to_queue(
                mic, channels, samplerate, mic_q, for_mix=True
            )
            try:
                stream_sys = self._open_source_to_queue(
                    sys_dev, channels, samplerate, sys_q, for_mix=True
                )
            except Exception:
                self._close_capture_handle(stream_mic)
                raise
            mixer = threading.Thread(
                target=self._mix_capture_loop,
                args=(mic_q, sys_q, out_q, stop, channels),
                daemon=True,
            )
            mixer.start()
            return {
                "type": "mix",
                "streams": [stream_mic, stream_sys],
                "stop": stop,
                "mixer": mixer,
                "channels": channels,
                "samplerate": samplerate,
            }

        primary = mic or sys_dev
        channels, samplerate = self._capture_format_for_device(primary)
        label = primary.get("name") or ""
        print(
            f"Opening audio input device {primary.get('id')} "
            f"({label}, pulse={primary.get('pulse_source')}, wp={primary.get('wp_id')}): "
            f"{channels}ch @ {samplerate}Hz"
        )
        # Linux monitors / pulse sources: parec at native rate (avoids PortAudio routing fights).
        if sys.platform == "linux" and (
            primary.get("pulse_source") or primary.get("wp_id") is not None
        ):
            handle = self._open_source_to_queue(
                primary, channels, samplerate, out_q, for_mix=True
            )
            handle["channels"] = channels
            handle["samplerate"] = samplerate
            return handle

        stream = self._open_portaudio_input_callback(
            primary["id"],
            channels,
            samplerate,
            pulse_source=primary.get("pulse_source"),
            wp_id=primary.get("wp_id"),
        )
        return {
            "type": "single",
            "stream": stream,
            "channels": channels,
            "samplerate": samplerate,
        }

    def _close_capture_handle(self, handle):
        if handle is None:
            return
        if not isinstance(handle, dict):
            self._close_input_stream(handle)
            return
        kind = handle.get("type")
        if kind == "mix":
            stop = handle.get("stop")
            if stop is not None:
                stop.set()
            for stream in handle.get("streams") or []:
                self._close_capture_handle(stream)
            mixer = handle.get("mixer")
            if mixer is not None and mixer.is_alive():
                mixer.join(timeout=1.0)
            return
        if kind == "parec":
            stop = handle.get("stop")
            if stop is not None:
                stop.set()
            proc = handle.get("proc")
            if proc is not None:
                try:
                    proc.terminate()
                    proc.wait(timeout=1.0)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            return
        if kind == "portaudio":
            self._close_input_stream(handle.get("stream"))
            return
        if kind == "single":
            self._close_input_stream(handle.get("stream"))
            return
        self._close_input_stream(handle.get("stream"))

    def _combo_select_device(self, combo, devices, selection):
        """Select a device in combo from a {id, pulse_source, wp_id} selection dict."""
        if combo is None or not devices:
            return False
        selection = selection or {}
        wp_id = selection.get("wp_id")
        pulse_source = selection.get("pulse_source")
        selected_id = selection.get("id")
        if wp_id is not None:
            for i, dev in enumerate(devices):
                if dev.get("wp_id") == wp_id:
                    combo.setCurrentIndex(i)
                    return True
        if pulse_source:
            for i, dev in enumerate(devices):
                if dev.get("pulse_source") == pulse_source:
                    combo.setCurrentIndex(i)
                    return True
        # id-only match is safe when pulse/wp are absent (typical on macOS/Windows).
        if selected_id is not None and wp_id is None and not pulse_source:
            for i, dev in enumerate(devices):
                if (
                    dev.get("id") == selected_id
                    and dev.get("wp_id") is None
                    and not dev.get("pulse_source")
                ):
                    combo.setCurrentIndex(i)
                    return True
                if dev.get("id") == selected_id and len(devices) == 1:
                    combo.setCurrentIndex(i)
                    return True
            # Last resort: unique id among this list.
            matches = [i for i, dev in enumerate(devices) if dev.get("id") == selected_id]
            if len(matches) == 1:
                combo.setCurrentIndex(matches[0])
                return True
        combo.setCurrentIndex(0)
        return False

    def _effective_capture_device(self):
        """Legacy helper: first available capture device (mic preferred, else system)."""
        mic, sys_dev = self._resolve_capture_devices_from_ui()
        return mic or sys_dev or _NO_INPUT_DEVICE

    def _populate_input_device_combos(self, selected_id=None, selected_pulse_source=None, selected_wp_id=None):
        all_devices = self.get_input_devices()
        self._input_devices_fp = self._fingerprint_input_devices(all_devices)
        self._output_route_fp = self._current_output_route_fingerprint()

        mic_devices = [dev for dev in all_devices if not self._is_system_audio_device(dev)]
        self.devices = [_NO_INPUT_DEVICE] + mic_devices

        mic_combo = getattr(self, "live_device_combo", None)

        if selected_id is not None or selected_pulse_source is not None or selected_wp_id is not None:
            # Connect Live restores a mic selection (system audio is checkbox-driven).
            matched_sys = None
            for dev in all_devices:
                if not self._is_system_audio_device(dev):
                    continue
                if selected_wp_id is not None and dev.get("wp_id") == selected_wp_id:
                    matched_sys = dev
                    break
                if selected_pulse_source and dev.get("pulse_source") == selected_pulse_source:
                    matched_sys = dev
                    break
            if matched_sys is not None:
                cb = getattr(self, "capture_system_audio_cb", None)
                if cb is not None:
                    cb.blockSignals(True)
                    cb.setChecked(True)
                    cb.blockSignals(False)
                self._mic_selection = {"id": None, "pulse_source": None, "wp_id": None}
            else:
                self._mic_selection = {
                    "id": selected_id,
                    "pulse_source": selected_pulse_source,
                    "wp_id": selected_wp_id,
                }

        if mic_combo is not None:
            mic_combo.blockSignals(True)
            mic_combo.clear()
            mic_combo.addItems([dev["name"] for dev in self.devices])
            self._combo_select_device(mic_combo, self.devices, self._mic_selection)
            idx = mic_combo.currentIndex()
            if 0 <= idx < len(self.devices):
                self._mic_selection = self._selection_from_device(self.devices[idx])
            mic_combo.blockSignals(False)

        self._apply_capture_selection_from_ui()

    def refresh_input_devices(self):
        """Reload input devices for the Live screen dropdown."""
        self._populate_input_device_combos()

    def _poll_input_device_changes(self):
        """Reload when inputs change or the default output route changes."""
        try:
            devices = self.get_input_devices()
        except Exception as exc:
            print("Input device poll failed:", exc)
            return
        fingerprint = self._fingerprint_input_devices(devices)
        route_fp = self._current_output_route_fingerprint()
        if (
            fingerprint == getattr(self, "_input_devices_fp", None)
            and route_fp == getattr(self, "_output_route_fp", None)
        ):
            return
        print("Input/output route changed — refreshing capture plan")
        self._input_devices_fp = fingerprint
        self._output_route_fp = route_fp
        self.refresh_input_devices()

    def _open_input_stream(self, stream_kwargs, pulse_source=None, wp_id=None):
        with self._audio_io_lock:
            if sys.platform == "linux" and (pulse_source or wp_id is not None):
                self._linux_apply_capture_source(pulse_source=pulse_source, wp_id=wp_id)
            stream = sd.InputStream(**stream_kwargs)
            stream.start()
            return stream

    def _close_input_stream(self, stream):
        if stream is None:
            return
        with self._audio_io_lock:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass

    def _close_capture_source(self, capture_source):
        if capture_source is None:
            return
        self._close_capture_handle(capture_source)

    def load_config(self):
        self.config_path = os.path.expanduser("~/.verisonic_broadcaster.json")
        self.auth_token = None
        self.refresh_token = None
        self.last_token_check_time = 0
        self._refresh_in_progress = False
        self.saved_email = ""
        self.saved_bitrate = 320  # Default to 320 kbps (Audiophile / Ultra High)
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    config = json.load(f)
                    self.saved_email = config.get("email", "")
                    self.saved_bitrate = config.get("bitrate", 320)
                    enc_access = config.get("access_token_enc", "")
                    enc_refresh = config.get("refresh_token_enc", "")
                    if enc_access:
                        self.auth_token = _decode_config_value(enc_access)
                    if enc_refresh:
                        self.refresh_token = _decode_config_value(enc_refresh)
            except Exception as e:
                print("Failed to load config:", e)

    def save_config(self):
        try:
            payload = {
                "email": self.saved_email,
                "bitrate": self.saved_bitrate,
            }
            if self.auth_token:
                payload["access_token_enc"] = _encode_config_value(self.auth_token)
            if self.refresh_token:
                payload["refresh_token_enc"] = _encode_config_value(self.refresh_token)
            with open(self.config_path, "w") as f:
                json.dump(payload, f)
        except Exception as e:
            print("Failed to save config:", e)

    def clear_config(self):
        self.auth_token = None
        self.refresh_token = None
        self.saved_email = ""
        self.user_id = None
        if os.path.exists(self.config_path):
            try:
                os.remove(self.config_path)
            except Exception:
                pass

    def _access_token_exp(self):
        """Return JWT exp (unix seconds) for the current access token, or 0."""
        if not self.auth_token:
            return 0
        try:
            parts = self.auth_token.split('.')
            if len(parts) != 3:
                return 0
            payload_b64 = parts[1] + '=' * (-len(parts[1]) % 4)
            payload = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
            return int(payload.get('exp') or 0)
        except Exception:
            return 0

    def perform_token_refresh(self):
        """Refresh access+refresh tokens and persist. Returns True on success."""
        if not self.refresh_token:
            return False
        if getattr(self, '_refresh_in_progress', False):
            return bool(self.auth_token)
        self._refresh_in_progress = True
        try:
            res, _ = api_request(
                "/auth/refresh",
                method="POST",
                data={"refresh_token": self.refresh_token},
            )
            new_access = res.get("access_token")
            new_refresh = res.get("refresh_token")
            if not new_access or not new_refresh:
                return False
            self.auth_token = new_access
            self.refresh_token = new_refresh
            self.save_config()
            print("Token refreshed successfully.")
            return True
        except Exception as e:
            print("Token refresh failed:", e)
            return False
        finally:
            self._refresh_in_progress = False

    def ensure_auth_token_fresh(self, min_ttl_sec=300):
        """Keep session alive: refresh if access token is missing/expired/expiring soon."""
        if not self.refresh_token and not self.auth_token:
            return False
        exp = self._access_token_exp()
        now = time.time()
        if self.auth_token and exp > 0 and (exp - now) >= min_ttl_sec:
            return True
        if not self.refresh_token:
            return bool(self.auth_token and exp > now)
        return self.perform_token_refresh()

    def verify_saved_token(self):
        try:
            # Prefer refresh when access is stale so cold starts / overnight reopen still work
            self.ensure_auth_token_fresh(min_ttl_sec=60)
            if not self.auth_token:
                raise Exception("No saved session")

            user_info, _ = api_request("/auth/me", method="GET", token=self.auth_token)
            role = user_info.get("role")
            if role != "radio_admin":
                raise Exception("Access Denied: Only Radio Admins are allowed.")
            self.user_id = user_info.get("id")
            self.saved_email = user_info.get("email", "")
            self.on_login_success()
        except Exception as e:
            print("Saved token verification failed:", e)
            # One more refresh + retry (covers expired access on disk)
            if self.refresh_token and self.perform_token_refresh():
                try:
                    user_info, _ = api_request("/auth/me", method="GET", token=self.auth_token)
                    role = user_info.get("role")
                    if role != "radio_admin":
                        raise Exception("Access Denied: Only Radio Admins are allowed.")
                    self.user_id = user_info.get("id")
                    self.saved_email = user_info.get("email", self.saved_email)
                    self.on_login_success()
                    return
                except Exception as e2:
                    print("Session restore after refresh failed:", e2)

            # Only wipe credentials when refresh is clearly unusable — keep tokens on
            # transient network errors so a 24/7 install survives backend blips.
            detail = str(e).lower()
            if "network error" in detail:
                print("Keeping saved session despite network error; open login to retry.")
            else:
                self.clear_config()
            self.stacked_widget.setCurrentIndex(0)

    def init_ui(self):
        self.stacked_widget = QStackedWidget(self)
        self.setCentralWidget(self.stacked_widget)
        
        # Screen configurations
        self.create_login_page()
        self.create_connection_page()
        self.create_broadcasting_page()
        
        self.stacked_widget.setCurrentIndex(0) # Login page first

    # =====================================================================
    # SCREEN 1: LOGIN SCREEN
    # =====================================================================
    def create_login_page(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(35, 45, 35, 45)
        layout.setSpacing(20)
        
        # Header
        header_layout = QHBoxLayout()
        logo_label = QLabel("📻")
        logo_label.setStyleSheet("font-size: 32px;")
        header_layout.addWidget(logo_label)
        
        title = QLabel("VeriSonic Link")
        title.setFont(QFont("Helvetica Neue", 22, QFont.Bold))
        title.setStyleSheet("color: #f43f5e;")
        header_layout.addWidget(title)
        header_layout.addStretch()
        layout.addLayout(header_layout)
        
        desc = QLabel("Secure RJ & Administrator Broadcaster Login")
        desc.setFont(QFont("Helvetica Neue", 11))
        desc.setStyleSheet("color: #94a3b8;")
        layout.addWidget(desc)
        
        # Form Card
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 20, 20, 20)
        card_layout.setSpacing(15)
        
        email_lbl = QLabel("EMAIL ADDRESS")
        email_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        email_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(email_lbl)
        
        self.login_email = QLineEdit()
        self.login_email.setPlaceholderText("your-email@verisonic.com")
        self.login_email.setText(self.saved_email)
        self.login_email.returnPressed.connect(self.handle_login)
        card_layout.addWidget(self.login_email)
        
        pass_lbl = QLabel("PASSWORD")
        pass_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        pass_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(pass_lbl)
        
        self.login_password = QLineEdit()
        self.login_password.setPlaceholderText("••••••••")
        self.login_password.setEchoMode(QLineEdit.Password)
        self.login_password.returnPressed.connect(self.handle_login)
        card_layout.addWidget(self.login_password)
        
        # Error text
        self.login_error_lbl = QLabel("")
        self.login_error_lbl.setStyleSheet("color: #f43f5e; font-size: 11px;")
        self.login_error_lbl.setWordWrap(True)
        self.login_error_lbl.hide()
        card_layout.addWidget(self.login_error_lbl)
        
        # Submit Action
        self.login_btn = QPushButton("Sign In")
        self.login_btn.setObjectName("actionBtn")
        self.login_btn.setCursor(Qt.PointingHandCursor)
        self.login_btn.clicked.connect(self.handle_login)
        card_layout.addWidget(self.login_btn)
        
        layout.addWidget(card)
        layout.addStretch()
        
        self.stacked_widget.addWidget(widget)

    def handle_login(self):
        email = self.login_email.text().strip()
        password = self.login_password.text().strip()
        
        if not email or not password:
            self.login_error_lbl.setText("Please fill in all fields.")
            self.login_error_lbl.show()
            return
            
        self.login_btn.setText("Signing In...")
        self.login_btn.setEnabled(False)
        self.login_error_lbl.hide()
        QApplication.processEvents()
        
        try:
            res, _ = api_request("/auth/login", method="POST", data={"email": email, "password": password})
            self.auth_token = res.get("access_token")
            self.refresh_token = res.get("refresh_token")
            self.saved_email = email
            
            # Verify admin credentials
            user_info, _ = api_request("/auth/me", method="GET", token=self.auth_token)
            role = user_info.get("role")
            if role != "radio_admin":
                self.auth_token = None
                raise Exception("Access Denied: Only Radio Admins are allowed.")
                
            self.user_id = user_info.get("id")
            self.save_config()
            self.on_login_success()
        except Exception as e:
            self.login_error_lbl.setText(str(e))
            self.login_error_lbl.show()
            self.login_btn.setText("Sign In")
            self.login_btn.setEnabled(True)

    def on_login_success(self):
        self.login_password.clear()
        self.login_btn.setText("Sign In")
        self.login_btn.setEnabled(True)
        self.login_error_lbl.hide()
        
        # Fetch station configurations
        self.populate_stations()
        self.refresh_input_devices()
        self.stacked_widget.setCurrentIndex(1)

    # =====================================================================
    # SCREEN 2: CONNECTION PARAMETERS SETUP
    # =====================================================================
    def create_connection_page(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(15)
        
        # Header block
        header_layout = QHBoxLayout()
        title = QLabel("VeriSonic Live Station")
        title.setFont(QFont("Helvetica Neue", 16, QFont.Bold))
        header_layout.addWidget(title)
        
        header_layout.addStretch()
        logout_btn = QPushButton("Logout")
        logout_btn.setCursor(Qt.PointingHandCursor)
        logout_btn.setStyleSheet("""
            QPushButton {
                background-color: #1e293b;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 4px 10px;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #334155;
            }
        """)
        logout_btn.clicked.connect(self.handle_logout)
        header_layout.addWidget(logout_btn)
        layout.addLayout(header_layout)
        
        desc = QLabel("Configure station stream parameters before going live.")
        desc.setStyleSheet("color: #94a3b8;")
        desc.setFont(QFont("Helvetica Neue", 11))
        layout.addWidget(desc)
        
        # Settings Card
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 20, 20, 20)
        card_layout.setSpacing(14)
        
        # Station Selector
        station_lbl = QLabel("RADIO STATION")
        station_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        station_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(station_lbl)
        
        self.station_combo = QComboBox()
        self.station_combo.currentIndexChanged.connect(self.on_station_selected)
        card_layout.addWidget(self.station_combo)
        
        # Key / Connection input
        key_lbl = QLabel("CONNECTION KEY")
        key_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        key_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(key_lbl)
        
        self.key_entry = QLineEdit()
        self.key_entry.setPlaceholderText("Paste connection key from web UI...")
        self.key_entry.setEchoMode(QLineEdit.Password)
        card_layout.addWidget(self.key_entry)
        
        # Toggle key visibility controls
        cb_layout = QHBoxLayout()
        self.show_key_cb = QCheckBox("Show Connection Key")
        self.show_key_cb.stateChanged.connect(self.toggle_key_visibility)
        cb_layout.addWidget(self.show_key_cb)
        cb_layout.addStretch()
        card_layout.addLayout(cb_layout)
        
        # Stream Quality / Bitrate Selector
        quality_lbl = QLabel("STREAM QUALITY / BITRATE")
        quality_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        quality_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(quality_lbl)
        
        self.bitrate_combo = QComboBox()
        self.bitrate_combo.addItems([
            "320 kbps (Audiophile / Ultra High)",
            "256 kbps (Very High)",
            "192 kbps (High)",
            "128 kbps (Standard)",
            "96 kbps (Mobile / Low Bandwidth)"
        ])
        
        # Select the saved bitrate
        bitrate_map = {320: 0, 256: 1, 192: 2, 128: 3, 96: 4}
        default_index = bitrate_map.get(self.saved_bitrate, 0)
        self.bitrate_combo.setCurrentIndex(default_index)
        
        card_layout.addWidget(self.bitrate_combo)

        # Connect Action
        self.connect_btn = QPushButton("Connect Live")
        self.connect_btn.setObjectName("actionBtn")
        self.connect_btn.setCursor(Qt.PointingHandCursor)
        self.connect_btn.clicked.connect(self.handle_connect)
        card_layout.addWidget(self.connect_btn)
        
        layout.addWidget(card)
        layout.addStretch()
        
        self.stacked_widget.addWidget(widget)

    def populate_stations(self):
        self.station_combo.clear()
        self.user_stations = []
        try:
            stations, _ = api_request("/radio", method="GET", token=self.auth_token)
            if self.user_id:
                stations = [st for st in stations if st.get("owner_id") == self.user_id]
            self.user_stations = stations
            
            if not stations:
                self.station_combo.addItem("No active stations found")
                self.station_combo.setEnabled(False)
                self.connect_btn.setEnabled(False)
            else:
                for st in stations:
                    self.station_combo.addItem(st.get('name', 'Unknown Station'))
                self.station_combo.setEnabled(True)
                self.connect_btn.setEnabled(True)
                self.on_station_selected(0)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to fetch stations: {e}")

    def on_station_selected(self, index):
        if index < 0 or index >= len(self.user_stations):
            return
        station = self.user_stations[index]
        self.selected_station_id = station.get("id")
        self.key_entry.setText("") # Do not auto-populate, wait for user paste

    def handle_logout(self):
        self.clear_config()
        self.stacked_widget.setCurrentIndex(0)

    # =====================================================================
    # SCREEN 3: BROADCASTING & VISUALIZATION SCREEN
    # =====================================================================
    def create_broadcasting_page(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(15)
        
        # Title and dynamic visual indicator dot
        header_layout = QHBoxLayout()
        self.live_indicator = QLabel("●")
        self.live_indicator.setFont(QFont("Arial", 16, QFont.Bold))
        self.live_indicator.setStyleSheet("color: #475569;")
        header_layout.addWidget(self.live_indicator)
        
        self.live_station_title = QLabel("VeriSonic Station")
        self.live_station_title.setFont(QFont("Helvetica Neue", 16, QFont.Bold))
        header_layout.addWidget(self.live_station_title)
        header_layout.addStretch()
        layout.addLayout(header_layout)
        
        # Main Visualizer Card
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 20, 20, 20)
        card_layout.setSpacing(14)
        
        # Audio custom visualizer
        vu_lbl = QLabel("LIVE AUDIO OUTPUT LEVEL")
        vu_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        vu_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(vu_lbl)
        
        self.custom_vu = VUMeterWidget()
        card_layout.addWidget(self.custom_vu)
        
        # Dynamic active device switcher
        dev_lbl = QLabel("ACTIVE AUDIO INPUT SOURCE")
        dev_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        dev_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(dev_lbl)
        
        self.live_device_combo = RefreshOnOpenComboBox(on_popup_open=self.refresh_input_devices)
        self.live_device_combo.currentIndexChanged.connect(self.on_live_device_changed)
        card_layout.addWidget(self.live_device_combo)

        self.capture_system_audio_cb = QCheckBox("Capture system audio (what you hear)")
        self.capture_system_audio_cb.setChecked(False)
        self.capture_system_audio_cb.setCursor(Qt.PointingHandCursor)
        self.capture_system_audio_cb.stateChanged.connect(self.on_capture_system_audio_toggled)
        card_layout.addWidget(self.capture_system_audio_cb)
        
        # Stats display label
        self.stats_lbl = QLabel("Status: Connecting...  |  Sent: 0.00 MB  |  Time: 00:00:00")
        self.stats_lbl.setAlignment(Qt.AlignCenter)
        self.stats_lbl.setFont(QFont("Helvetica Neue", 10, QFont.Bold))
        self.stats_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(self.stats_lbl)
        
        # Disconnect/Stop Action
        self.stop_btn = QPushButton("Stop Broadcast")
        self.stop_btn.setObjectName("actionBtn")
        self.stop_btn.setStyleSheet("background-color: #dc2626;")
        self.stop_btn.setCursor(Qt.PointingHandCursor)
        self.stop_btn.clicked.connect(self.handle_stop_broadcast)
        card_layout.addWidget(self.stop_btn)
        
        layout.addWidget(card)
        layout.addStretch()
        
        self.stacked_widget.addWidget(widget)

    def on_live_device_changed(self, index):
        devices = getattr(self, "devices", None) or []
        if index < 0 or index >= len(devices):
            return
        self._mic_selection = self._selection_from_device(devices[index])
        print(
            "Mic input selection ->",
            self._mic_selection.get("id"),
            devices[index].get("name"),
        )
        self._apply_capture_selection_from_ui()

    def on_capture_system_audio_toggled(self, _state):
        """Enable/disable capture of the current default system output."""
        enabled = self._capture_system_audio_enabled()
        print("Capture system audio ->", enabled)
        if enabled:
            sys_dev = self._resolve_default_system_audio_device()
            if sys_dev is None:
                QMessageBox.warning(
                    self,
                    "System Audio Unavailable",
                    "Could not find a loopback for the current system output.\n\n"
                    "On Linux this uses the default sink monitor. "
                    "On macOS/Windows, install/enable a loopback device "
                    "(BlackHole, Stereo Mix, etc.).",
                )
                cb = getattr(self, "capture_system_audio_cb", None)
                if cb is not None:
                    cb.blockSignals(True)
                    cb.setChecked(False)
                    cb.blockSignals(False)
                return
        self._apply_capture_selection_from_ui()

    def _open_portaudio_input_callback(self, device_id, channels, samplerate, pulse_source=None, wp_id=None):
        def audio_callback(indata, frames, time_info, status):
            if status:
                print("Audio input status:", status)
            self._queue_put_realtime(self.audio_queue, indata.copy())

        stream_kwargs = {
            "device": device_id,
            "channels": channels,
            "samplerate": samplerate,
            "blocksize": 1024,
            "callback": audio_callback,
        }
        if sys.platform == "darwin":
            stream_kwargs["latency"] = "low"
        return self._open_input_stream(
            stream_kwargs,
            pulse_source=pulse_source,
            wp_id=wp_id,
        )

    def _system_audio_fallback_warning_message(self, sys_dev):
        name = self._system_audio_display_name(sys_dev) if sys_dev else "system audio"
        return (
            f"Could not open {name}.\n\n"
            "Continuing with your microphone only.\n\n"
            "For system audio via BlackHole:\n"
            "1. Audio MIDI Setup → Create Multi-Output Device\n"
            "2. Enable BlackHole 2ch + your speakers/headphones\n"
            "3. System Settings → Sound → Output → Multi-Output Device\n"
            "4. Re-enable Capture system audio when ready"
        )

    def _sync_mic_only_fallback_state(self):
        """Disable system-audio capture in UI/state after a mixed-capture fallback."""
        mic = getattr(self, "_capture_mic", None)
        self._capture_sys = None
        self._capture_sig = (self._device_capture_key(mic), None)
        if mic:
            self.active_device_id = mic.get("id")
            self.active_pulse_source = mic.get("pulse_source")
            self.active_wp_id = mic.get("wp_id")
            self._active_device_name = mic.get("name") or ""
        self.connection_status = "LIVE"

        def _uncheck_system_audio_cb():
            cb = getattr(self, "capture_system_audio_cb", None)
            if cb is not None:
                cb.blockSignals(True)
                cb.setChecked(False)
                cb.blockSignals(False)

        QTimer.singleShot(0, _uncheck_system_audio_cb)

    def _loopback_capture_error_message(self, device_name):
        if sys.platform == "darwin":
            return (
                f"Could not open {device_name}.\n\n"
                "For system audio via BlackHole:\n"
                "1. Audio MIDI Setup → Create Multi-Output Device\n"
                "2. Enable BlackHole 2ch + your speakers/headphones\n"
                "3. System Settings → Sound → Output → Multi-Output Device\n"
                "4. Play audio — input is matched from your sound output automatically"
            )
        if sys.platform == "win32":
            return (
                f"Could not open {device_name}.\n\n"
                "For system audio on Windows:\n"
                "1. Sound Settings → Recording → enable Stereo Mix (or install VB-Audio Cable)\n"
                "2. Set your playback output as usual\n"
                "3. Play audio — loopback input is matched automatically when possible"
            )
        return (
            f"Could not open {device_name}.\n\n"
            "For system audio on Linux, select a monitor/loopback capture device "
            "(PulseAudio/PipeWire) or check your sound server loopback module."
        )

    def _microphone_capture_error_message(self):
        if sys.platform == "darwin":
            return (
                "Could not open the selected audio input.\n\n"
                "Open System Settings → Privacy & Security → Microphone "
                "and enable VeriSonic Broadcaster, then try again."
            )
        if sys.platform == "win32":
            return (
                "Could not open the selected audio input.\n\n"
                "Open Settings → Privacy & security → Microphone and allow desktop apps, "
                "then check Settings → System → Sound → Input."
            )
        return (
            "Could not open the selected audio input.\n\n"
            "Check your system sound/privacy settings and confirm the input device is available."
        )

    def handle_connect(self):
        selected_idx = self._resolve_connect_input_index()
        if selected_idx < 0:
            QMessageBox.critical(self, "Error", "No audio input devices found.")
            return

        input_name = self.devices[selected_idx]["name"]
        output_name = self._system_default_output_name()
        print(
            "Connect Live audio routing:",
            f"system output={output_name!r} -> input={input_name!r}",
        )

        if sys.platform == "darwin" and HAS_MACOS_MIC_API:
            status = get_microphone_authorization_status()
            if status == "denied":
                self._show_mic_permission_dialog()
                return
            if status in ("not_determined", "unavailable"):
                request_microphone_access(
                    lambda granted: QTimer.singleShot(
                        0, lambda g=granted: self._continue_connect_after_mic(g)
                    )
                )
                return

        self._start_broadcast(selected_idx)

    def _continue_connect_after_mic(self, granted):
        if granted is False:
            self._show_mic_permission_dialog()
            return
        if granted is None and HAS_MACOS_MIC_API:
            status = get_microphone_authorization_status()
            if status == "denied":
                self._show_mic_permission_dialog()
                return
        selected_idx = self._resolve_connect_input_index()
        if selected_idx < 0:
            self._show_mic_permission_dialog()
            return

        self._start_broadcast(selected_idx)

    def _start_broadcast(self, selected_idx):
        selected_device = self.devices[selected_idx]
        device_id = selected_device["id"]
        server_url = DEFAULT_SERVER_URL
        stream_key = self.key_entry.text().strip()
        
        if not stream_key:
            QMessageBox.critical(self, "Error", "Please enter/refresh your connection key.")
            return
            
        # Validate connection key format
        try:
            parts = stream_key.split("_")
            if len(parts) < 4 or not stream_key.startswith("rs_key_"):
                raise ValueError("Format mismatch")
            timestamp = int(parts[-1])
        except Exception:
            self.key_entry.clear()
            QMessageBox.critical(self, "Invalid Key Format", "The connection key format is invalid. Please copy it directly from your radio station dashboard.")
            return

        # Verify the key belongs to the selected station (keys are no longer in list responses)
        matched = False
        if self.selected_station_id and self.auth_token:
            try:
                result, _ = api_request(
                    f"/radio/{self.selected_station_id}/verify-broadcast-key",
                    method="POST",
                    data={"stream_key": stream_key},
                    token=self.auth_token,
                )
                matched = result.get("valid", False)
            except Exception as e:
                print("Failed to verify broadcast key:", e)

        if not matched:
            self.key_entry.clear()
            if time.time() - timestamp > 330:
                QMessageBox.critical(
                    self, "Connection Key Expired",
                    "This connection key has expired. Please regenerate a new key in your web dashboard, copy it, and paste it here."
                )
            else:
                QMessageBox.critical(
                    self, "Invalid Key",
                    "The connection key does not match the selected radio station. "
                    "Please ensure you have selected the correct station and pasted the key accurately."
                )
            return

        try:
            stations, _ = api_request("/radio", method="GET", token=self.auth_token)
            self.user_stations = stations
        except Exception as e:
            print("Failed to sync stations:", e)
            
        station_name = "VeriSonic Radio"
        if self.selected_station_id:
            for st in self.user_stations:
                if st.get("id") == self.selected_station_id:
                    station_name = st.get("name")
                    
        self.live_station_title.setText(station_name)
        
        # Mic dropdown gets the Connect Live device; system audio stays checkbox-controlled.
        self._mic_selection = self._selection_from_device(selected_device)
        self.active_pulse_source = selected_device.get("pulse_source")
        self.active_wp_id = selected_device.get("wp_id")
        self._active_device_name = selected_device["name"]
        self.active_device_id = device_id
        self._populate_input_device_combos(
            selected_id=device_id,
            selected_pulse_source=self.active_pulse_source,
            selected_wp_id=self.active_wp_id,
        )
        bitrate_index = self.bitrate_combo.currentIndex()
        bitrate_opts = [320, 256, 192, 128, 96]
        if bitrate_index >= 0 and bitrate_index < len(bitrate_opts):
            self.saved_bitrate = bitrate_opts[bitrate_index]
        self.save_config()

        self.is_broadcasting = True
        self.connection_status = "Connecting..."
        self.is_connected = False
        
        self.bytes_sent = 0
        self.start_time = time.time()
        self.audio_queue = queue.Queue(maxsize=16)
        self.mp3_queue = queue.Queue(maxsize=32)
        self.broadcast_error = None
        self.broadcast_warning = None
        
        self.stacked_widget.setCurrentIndex(2)
        
        if hasattr(self, 'tray_toggle_action'):
            self.tray_toggle_action.setText("Stop Broadcast")
        
        # Run live broker
        self.stream_thread = threading.Thread(
            target=self.streaming_worker,
            args=(device_id, server_url, stream_key, self.saved_bitrate),
            daemon=True
        )
        self.stream_thread.start()

    def handle_stop_broadcast(self):
        self.is_broadcasting = False
        self.stacked_widget.setCurrentIndex(1)
        self.live_indicator.setStyleSheet("color: #475569;")
        self.custom_vu.set_levels([0] * 20)
        self.key_entry.clear()
        
        if hasattr(self, 'tray_toggle_action'):
            self.tray_toggle_action.setText("Start Broadcast")

    # =====================================================================
    # STREAMING WORKER THREAD & RECONNECTION  (WebSocket ingest)
    # =====================================================================
    def streaming_worker(self, device_id, server_url, stream_key, bitrate):
        """Worker thread that encodes captured PCM chunks to MP3 and streams via WebSocket."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                self._async_ws_worker(device_id, server_url, stream_key, bitrate)
            )
        except Exception as e:
            self.broadcast_error = str(e)
            self.is_connected = False
            self.is_broadcasting = False
        finally:
            loop.close()

    async def _async_ws_worker(self, device_id, server_url, stream_key, bitrate):
        """Async WebSocket ingest worker with concurrent VU meter loop."""
        attempts = 0
        max_attempts = 100
        # Prefer the dual-capture plan already set from the Live dropdowns.
        if getattr(self, "_capture_sig", None) is None:
            self.active_device_id = device_id
            self._apply_capture_selection_from_ui()
        current_capture_sig = None
        audio_stream = None
        encoder = None
        vu_task = None

        async def vu_loop():
            """Continuously reads mic chunks, computes VU bands, encodes MP3,
            and puts encoded data in self.mp3_queue for the WebSocket sender."""
            nonlocal encoder
            while self.is_broadcasting:
                try:
                    data_chunk = self.audio_queue.get_nowait()
                except queue.Empty:
                    await asyncio.sleep(0.005)
                    continue

                if data_chunk.size > 0:
                    mono_chunk = np.mean(data_chunk, axis=1) if data_chunk.ndim > 1 else data_chunk

                    fft_data = np.abs(np.fft.rfft(mono_chunk)) / len(mono_chunk)
                    fft_data = fft_data[1:]

                    num_bands = 20
                    max_bin = min(400, len(fft_data))
                    log_indices = np.logspace(0, np.log10(max_bin), num_bands + 1, dtype=int)

                    new_levels = []
                    for i in range(num_bands):
                        start_idx = log_indices[i]
                        end_idx = max(start_idx + 1, log_indices[i + 1])
                        amp = np.mean(fft_data[start_idx:end_idx])
                        boost = 1.0 + (i / num_bands) * 5.0
                        amp = amp * boost
                        db_val = 20 * math.log10(amp) if amp > 1e-5 else -80.0
                        val = int((db_val + 50.0) / 45.0 * 100)
                        new_levels.append(max(0, min(100, val)))

                    self.current_frequency_levels = new_levels
                    rms = np.sqrt(np.mean(mono_chunk ** 2))
                    self.current_volume_db = 20 * math.log10(rms) if rms > 1e-4 else -60.0
                else:
                    self.current_volume_db = -60.0
                    self.current_frequency_levels = [0] * 20

                # Encode to MP3 and queue for WebSocket send
                if encoder is not None:
                    clipped = np.clip(data_chunk, -1.0, 1.0)
                    pcm_int16 = (clipped * 32767).astype(np.int16)
                    # Ensure C-contiguous layout for lameenc (interleaved stereo or mono)
                    pcm_int16 = np.ascontiguousarray(pcm_int16)
                    pcm_bytes = pcm_int16.tobytes()
                    mp3_data = encoder.encode(pcm_bytes)
                    if mp3_data:
                        self._queue_put_realtime(self.mp3_queue, mp3_data)

        def open_capture_for_active_device():
            """Open/replace capture for the current mic and/or system-audio plan."""
            nonlocal audio_stream, encoder, current_capture_sig, vu_task

            mic = getattr(self, "_capture_mic", None)
            sys_dev = getattr(self, "_capture_sys", None)
            sig = getattr(self, "_capture_sig", None)

            # Both empty: stay LIVE on the WebSocket but stop capturing/sending audio.
            if mic is None and sys_dev is None:
                if current_capture_sig == sig and audio_stream is None:
                    return True
                print("Disabling audio input (No input / no system audio)")
                if audio_stream:
                    self._close_capture_source(audio_stream)
                    audio_stream = None
                encoder = None
                self.audio_queue = queue.Queue(maxsize=16)
                self.mp3_queue = queue.Queue(maxsize=32)
                self.current_volume_db = -60.0
                self.current_frequency_levels = [0] * 20
                current_capture_sig = sig
                return True

            if sig == current_capture_sig and audio_stream is not None:
                return True

            if audio_stream:
                self._close_capture_source(audio_stream)
                audio_stream = None

            self.audio_queue = queue.Queue(maxsize=16)
            self.mp3_queue = queue.Queue(maxsize=32)

            try:
                bundle = self._open_capture_bundle(mic, sys_dev, self.audio_queue)
            except Exception as ae:
                print("Failed to open audio capture:", ae)
                if mic is not None and sys_dev is not None:
                    print("Mixed capture failed — falling back to microphone only")
                    try:
                        bundle = self._open_capture_bundle(mic, None, self.audio_queue)
                    except Exception as mic_ae:
                        print("Microphone fallback also failed:", mic_ae)
                        self.broadcast_error = self._microphone_capture_error_message()
                        return False
                    self.broadcast_warning = self._system_audio_fallback_warning_message(sys_dev)
                    self._sync_mic_only_fallback_state()
                    sig = getattr(self, "_capture_sig", None)
                else:
                    device_hint = getattr(self, "_active_device_name", "the selected device")
                    if sys_dev is not None and mic is None:
                        self.broadcast_error = self._loopback_capture_error_message(device_hint)
                    elif self._is_loopback_device_name(device_hint):
                        self.broadcast_error = self._loopback_capture_error_message(device_hint)
                    else:
                        self.broadcast_error = self._microphone_capture_error_message()
                    return False

            channels = bundle.get("channels", 2)
            samplerate = bundle.get("samplerate", 48000)
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(bitrate)
            encoder.set_in_sample_rate(int(samplerate))
            encoder.set_channels(int(channels))
            encoder.set_quality(0)

            audio_stream = bundle
            current_capture_sig = sig

            if vu_task is None or vu_task.done():
                vu_task = asyncio.ensure_future(vu_loop())
            return True

        while self.is_broadcasting:
            ws = None
            try:
                if attempts > 0:
                    self.connection_status = f"Reconnecting (Attempt {attempts}/{max_attempts})..."
                    self.is_connected = False
                    await asyncio.sleep(min(10, 2 + (attempts - 1) * 2))

                # Keep JWT fresh for 24/7 reconnects (access token ~30 min)
                try:
                    await asyncio.get_event_loop().run_in_executor(
                        None, lambda: self.ensure_auth_token_fresh(min_ttl_sec=120)
                    )
                except Exception as te:
                    print("Pre-connect token refresh failed:", te)

                # Build WebSocket URL
                if self.auth_token and self.selected_station_id:
                    ws_url = f"{server_url}?token={self.auth_token}&station_id={self.selected_station_id}"
                else:
                    ws_url = f"{server_url}?stream_key={stream_key}"

                self.connection_status = "Connecting to server..."

                # Open WebSocket first so the UI can reach LIVE even if audio is slow to start.
                ssl_ctx = None
                if ws_url.startswith("wss://"):
                    import ssl
                    ssl_ctx = ssl.create_default_context()
                    ssl_ctx.check_hostname = False
                    ssl_ctx.verify_mode = ssl.CERT_NONE

                print("Broadcaster attempting to connect to URL:", ws_url)
                async with websockets.connect(
                    ws_url,
                    ssl=ssl_ctx,
                    open_timeout=15,
                    ping_interval=20,
                    ping_timeout=20,
                ) as ws:
                    attempts = 0
                    self.is_connected = True
                    self.connection_status = "LIVE"
                    self.bytes_sent = 0

                    if not open_capture_for_active_device():
                        self.is_broadcasting = False
                        break

                    while self.is_broadcasting:
                        if getattr(self, "_capture_sig", None) != current_capture_sig:
                            print("Input device changed — swapping capture source (WebSocket stays open)")
                            if not open_capture_for_active_device():
                                self.is_broadcasting = False
                                break
                            self.connection_status = "LIVE"
                            continue

                        try:
                            mp3_chunk = self.mp3_queue.get_nowait()
                        except queue.Empty:
                            await asyncio.sleep(0.005)
                            continue

                        await ws.send(mp3_chunk)
                        self.bytes_sent += len(mp3_chunk)

            except Exception as e:
                print(f"WebSocket connection attempt failed or dropped: {e}")
                self.is_connected = False
                self.current_volume_db = -60.0

                err_msg = str(e)
                is_auth_error = any(kw in err_msg for kw in ["403", "Forbidden", "1008", "Expired", "Policy Violation"])
                if attempts == 0 and is_auth_error:
                    self.broadcast_error = "Invalid or expired connection key. Please verify your key and try again."
                    self.is_broadcasting = False
                    break

                attempts += 1
                if attempts > max_attempts:
                    self.broadcast_error = "Failed to reconnect after maximum attempts."
                    self.is_broadcasting = False
                    break

        # Cancel VU loop
        if vu_task and not vu_task.done():
            vu_task.cancel()
            try:
                await vu_task
            except asyncio.CancelledError:
                pass

        # Flush encoder
        if encoder:
            try:
                final_mp3 = encoder.flush()
                if final_mp3 and hasattr(self, 'mp3_queue'):
                    self.mp3_queue.put_nowait(final_mp3)
            except Exception:
                pass

        # Cleanup audio capture
        if audio_stream:
            self._close_capture_source(audio_stream)

    def update_gui_loop(self):
        """Monitors stats and updates volume visuals on the main thread loop."""
        # Check and refresh token if needed (every ~60s — access tokens last ~30 min)
        now = time.time()
        if getattr(self, 'last_token_check_time', 0) == 0:
            self.last_token_check_time = now
        if now - self.last_token_check_time > 60:
            self.last_token_check_time = now
            if self.refresh_token:
                threading.Thread(
                    target=lambda: self.ensure_auth_token_fresh(min_ttl_sec=300),
                    daemon=True,
                ).start()

        if hasattr(self, 'broadcast_warning') and self.broadcast_warning:
            warn = self.broadcast_warning
            self.broadcast_warning = None
            self.show_and_activate()
            QMessageBox.warning(self, "System Audio Unavailable", warn)

        if hasattr(self, 'broadcast_error') and self.broadcast_error:
            err = self.broadcast_error
            self.broadcast_error = None
            self.show_and_activate()
            QMessageBox.critical(self, "Broadcast Error", err)
            self.handle_stop_broadcast()
            return

        # Hotplug: refresh inputs when devices appear/disappear (e.g. unplug headphones).
        live_page = (
            hasattr(self, "stacked_widget")
            and self.stacked_widget.currentIndex() == 2
        )
        if self.is_broadcasting or live_page:
            if now - getattr(self, "_last_input_device_poll", 0) >= 1.5:
                self._last_input_device_poll = now
                self._poll_input_device_changes()

        if self.is_broadcasting:
            # Pass 20 bands levels list to the custom visualizer
            self.custom_vu.set_levels(self.current_frequency_levels)
            
            # Status colors: red flashing for live, orange for reconnecting
            if self.connection_status == "LIVE":
                color = "#ef4444" if (int(time.time() * 2) % 2 == 0) else "#7f1d1d"
                self.live_indicator.setStyleSheet(f"color: {color};")
                
                elapsed_seconds = int(time.time() - self.start_time)
                hours, remainder = divmod(elapsed_seconds, 3600)
                minutes, seconds = divmod(remainder, 60)
                time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                mb_sent = getattr(self, 'bytes_sent', 0) / (1024 * 1024)
                self.stats_lbl.setText(f"Status: LIVE ({self.saved_bitrate} kbps)  |  Sent: {mb_sent:.2f} MB  |  Time: {time_str}")
            else:
                color = "#f59e0b" if (int(time.time() * 2) % 2 == 0) else "#78350f"
                self.live_indicator.setStyleSheet(f"color: {color};")
                self.stats_lbl.setText(f"Status: {self.connection_status}")
                self.custom_vu.set_levels([0] * 20)
        else:
            self.custom_vu.set_levels([0] * 20)
            self.live_indicator.setStyleSheet("color: #475569;")

    # =====================================================================
    # COMPONENT HELPERS & UTILITIES
    # =====================================================================
    def _app_icon_paths(self):
        """Candidate PNG paths for window/tray/desktop icon."""
        paths = []
        if getattr(sys, "frozen", False):
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                paths.append(os.path.join(meipass, "assets", "icon.png"))
            exe_dir = os.path.dirname(os.path.abspath(sys.executable))
            paths.append(os.path.join(exe_dir, "assets", "icon.png"))
        paths.append(os.path.join(_BROADCASTER_DIR, "assets", "icon.png"))
        paths.extend([
            "/usr/share/icons/hicolor/256x256/apps/verisonic-broadcaster.png",
            "/usr/share/icons/hicolor/128x128/apps/verisonic-broadcaster.png",
            "/usr/share/icons/hicolor/512x512/apps/verisonic-broadcaster.png",
            "/usr/share/pixmaps/verisonic-broadcaster.png",
        ])
        return paths

    def load_app_icon(self):
        """Load branded icon from assets/install paths; fall back to painted radio mark."""
        from PyQt5.QtGui import QIcon, QPixmap

        icon = QIcon()
        for path in self._app_icon_paths():
            if path and os.path.isfile(path):
                pixmap = QPixmap(path)
                if not pixmap.isNull():
                    icon.addPixmap(pixmap)
                    for size in (16, 24, 32, 48, 64, 128, 256):
                        icon.addPixmap(pixmap.scaled(size, size, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                    return icon
        return self.create_radio_icon()

    def create_radio_icon(self):
        from PyQt5.QtGui import QIcon, QPixmap, QPainter, QColor, QPen

        icon = QIcon()
        for size in (16, 24, 32, 48, 64, 128):
            pixmap = QPixmap(size, size)
            pixmap.fill(Qt.transparent)
            painter = QPainter(pixmap)
            painter.setRenderHint(QPainter.Antialiasing)

            scale = size / 32.0
            painter.scale(scale, scale)

            painter.setBrush(QColor("#f43f5e"))
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(13, 13, 6, 6)

            painter.setBrush(Qt.NoBrush)
            pen = QPen(QColor("#f43f5e"), 2)
            pen.setCapStyle(Qt.RoundCap)
            painter.setPen(pen)

            painter.drawArc(8, 8, 16, 16, -60 * 16, 120 * 16)
            painter.drawArc(8, 8, 16, 16, 120 * 16, 120 * 16)
            painter.drawArc(3, 3, 26, 26, -50 * 16, 100 * 16)
            painter.drawArc(3, 3, 26, 26, 130 * 16, 100 * 16)

            painter.end()
            icon.addPixmap(pixmap)
        return icon

    def setup_tray_icon(self):
        from PyQt5.QtWidgets import QSystemTrayIcon, QMenu, QAction
        self.tray_icon = QSystemTrayIcon(self)
        self.tray_icon.setIcon(self.windowIcon() if not self.windowIcon().isNull() else self.load_app_icon())
        
        tray_menu = QMenu()
        
        restore_action = QAction("Open VeriSonic", self)
        restore_action.triggered.connect(self.show_and_activate)
        tray_menu.addAction(restore_action)
        
        self.tray_toggle_action = QAction("Start Broadcast", self)
        self.tray_toggle_action.triggered.connect(self.toggle_broadcasting_from_tray)
        tray_menu.addAction(self.tray_toggle_action)
        
        tray_menu.addSeparator()
        
        quit_action = QAction("Quit", self)
        quit_action.triggered.connect(self.quit_application)
        tray_menu.addAction(quit_action)
        
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    def toggle_broadcasting_from_tray(self):
        if self.is_broadcasting:
            self.handle_stop_broadcast()
            # Reset tray menu text to "Start Broadcast"
            self.tray_toggle_action.setText("Start Broadcast")
        else:
            if self.stacked_widget.currentIndex() == 1:
                # Ensure a connection key is provided before attempting to connect
                if not self.key_entry.text().strip():
                    QMessageBox.warning(self, "Missing Connection Key", "Please enter a connection key before starting the broadcast.")
                    self.show_and_activate()
                    return
                self.handle_connect()
                # Change tray menu text to "Stop Broadcast" after starting
                self.tray_toggle_action.setText("Stop Broadcast")
            else:
                self.show_and_activate()

    def set_mac_dock_icon_visible(self, visible):
        if sys.platform != 'darwin':
            return
        try:
            import ctypes
            objc = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/AppKit.framework/AppKit')
            objc.objc_getClass.restype = ctypes.c_void_p
            objc.objc_getClass.argtypes = [ctypes.c_char_p]
            objc.sel_registerName.restype = ctypes.c_void_p
            objc.sel_registerName.argtypes = [ctypes.c_char_p]
            
            ns_app = objc.objc_getClass(b'NSApplication')
            
            objc_msgSend_no_args = objc.objc_msgSend
            objc_msgSend_no_args.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
            objc_msgSend_no_args.restype = ctypes.c_void_p
            shared_app = objc_msgSend_no_args(ns_app, objc.sel_registerName(b'sharedApplication'))
            
            policy = 0 if visible else 1
            objc_msgSend_int = objc.objc_msgSend
            objc_msgSend_int.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_long]
            objc_msgSend_int.restype = ctypes.c_void_p
            objc_msgSend_int(shared_app, objc.sel_registerName(b'setActivationPolicy:'), policy)
            
            if visible:
                objc_msgSend_bool = objc.objc_msgSend
                objc_msgSend_bool.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_bool]
                objc_msgSend_bool.restype = ctypes.c_void_p
                objc_msgSend_bool(shared_app, objc.sel_registerName(b'activateIgnoringOtherApps:'), True)
                QApplication.setWindowIcon(self.windowIcon())
        except Exception as e:
            print("Failed to change macOS Dock icon visibility:", e)

    def show_and_activate(self):
        self.show()
        self.raise_()
        self.activateWindow()
        QTimer.singleShot(100, lambda: self.set_mac_dock_icon_visible(True))

    def quit_application(self):
        self.clear_config()
        self.quit_from_tray = True
        QApplication.quit()

    def closeEvent(self, event):
        from PyQt5.QtWidgets import QSystemTrayIcon
        if not self.quit_from_tray:
            self.hide()
            self.set_mac_dock_icon_visible(False)
            # NoIcon: Information/Warning temporarily replaces the tray icon (blue "i" on Ubuntu).
            self.tray_icon.showMessage(
                "VeriSonic Broadcaster",
                "Broadcaster is running in the system tray.",
                QSystemTrayIcon.NoIcon,
                2000
            )
            event.ignore()
        else:
            event.accept()

    def get_device_capture_params(self, device_id):
        """Return (channels, samplerate) suited for the given capture source."""
        channels = 1
        preferred_sr = 44100
        try:
            info = sd.query_devices(device_id, "input")
            max_channels = info.get("max_input_channels", 1)
            channels = min(2, max(1, int(max_channels)))
            default_sr = info.get("default_samplerate") or info.get("default_sample_rate") or 44100
            preferred_sr = int(default_sr)
            if preferred_sr <= 0:
                preferred_sr = 44100
        except Exception as exc:
            print("Failed to query device capture params:", exc)
            return channels, preferred_sr

        candidates = []
        for sr in (preferred_sr, 48000, 44100, 96000):
            if sr not in candidates:
                candidates.append(sr)

        for sr in candidates:
            try:
                sd.check_input_settings(device=device_id, channels=channels, samplerate=sr)
                return channels, sr
            except Exception:
                continue
        return channels, preferred_sr

    def get_input_devices(self):
        devices = []
        try:
            device_list = sd.query_devices()
            if sys.platform == "linux":
                return self._get_linux_input_devices(device_list)
            for idx, dev in enumerate(device_list):
                if dev.get("max_input_channels", 0) <= 0:
                    continue
                raw_name = dev.get("name", "Unknown Device") or "Unknown Device"
                devices.append({
                    "id": idx,
                    "name": raw_name,
                    "raw_name": raw_name,
                })
        except Exception as e:
            print("Error querying devices:", e)
        return devices

    def toggle_key_visibility(self, state):
        if state == Qt.Checked:
            self.key_entry.setEchoMode(QLineEdit.Normal)
        else:
            self.key_entry.setEchoMode(QLineEdit.Password)

    def show_system_sound_help(self):
        help_text = (
            "<h3>How to Stream System Audio</h3>"
            "<p>Select your <b>microphone</b> for voice, or a <b>loopback device</b> "
            "(BlackHole, Stereo Mix, etc.) to broadcast what is playing on your computer.</p>"
            "<hr/>"
            "<h4>🍏 macOS Setup (microphone)</h4>"
            "<ol>"
            "<li>Select your microphone from the audio input dropdown.</li>"
            "<li>Allow <b>Microphone</b> access when prompted.</li>"
            "</ol>"
            "<hr/>"
            "<h4>🍏 macOS Setup (BlackHole loopback)</h4>"
            "<ol>"
            "<li>Install BlackHole if needed — it appears in the input list automatically.</li>"
            "<li>Use Audio MIDI Setup → <b>Multi-Output Device</b> so you hear audio while streaming.</li>"
            "<li>Select <b>BlackHole 2ch</b> from the dropdown.</li>"
            "</ol>"
            "<hr/>"
            "<h4>🪟 Windows Setup (Stereo Mix)</h4>"
            "<ol>"
            "<li>Right-click the speaker icon in your taskbar, open <b>Sound Settings > Control Panel</b>.</li>"
            "<li>Go to the <b>Recording</b> tab, right-click, and check <b>Show Disabled Devices</b>.</li>"
            "<li>Enable <b>Stereo Mix</b> (or <i>What U Hear</i>) and set it as default.</li>"
            "<li>Select <b>Stereo Mix</b> from the dropdown in this app.</li>"
            "</ol>"
        )
        msg = QMessageBox(self)
        msg.setWindowTitle("System Sound Setup Guide")
        msg.setIcon(QMessageBox.Information)
        msg.setText(help_text)
        msg.setTextFormat(Qt.RichText)
        msg.exec_()


SINGLE_INSTANCE_KEY = "com.verisonic.broadcaster"


def _resolve_app_icon_file():
    """Absolute path to the best available PNG icon, or empty string."""
    candidates = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(os.path.join(meipass, "assets", "icon.png"))
        candidates.append(os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "assets", "icon.png"))
    candidates.append(os.path.join(_BROADCASTER_DIR, "assets", "icon.png"))
    candidates.extend([
        os.path.expanduser("~/.local/share/icons/hicolor/256x256/apps/verisonic-broadcaster.png"),
        "/usr/share/icons/hicolor/256x256/apps/verisonic-broadcaster.png",
        "/usr/share/icons/hicolor/128x128/apps/verisonic-broadcaster.png",
        "/usr/share/icons/hicolor/512x512/apps/verisonic-broadcaster.png",
        "/usr/share/pixmaps/verisonic-broadcaster.png",
    ])
    for path in candidates:
        if path and os.path.isfile(path):
            return os.path.abspath(path)
    return ""


def _install_linux_user_icon(source_png):
    """Install icon into the user hicolor theme so Icon=verisonic-broadcaster resolves."""
    if not source_png or not os.path.isfile(source_png):
        return False
    import shutil

    base = os.path.expanduser("~/.local/share/icons/hicolor")
    wrote = False
    for size in (48, 128, 256, 512):
        out_dir = os.path.join(base, f"{size}x{size}", "apps")
        try:
            os.makedirs(out_dir, exist_ok=True)
            out_path = os.path.join(out_dir, "verisonic-broadcaster.png")
            shutil.copy2(source_png, out_path)
            wrote = True
        except Exception:
            continue

    if wrote:
        try:
            import subprocess
            subprocess.run(
                ["gtk-update-icon-cache", "-f", "-t", base],
                capture_output=True,
                timeout=3,
                check=False,
            )
        except Exception:
            pass
    return wrote


def _ensure_linux_desktop_entry():
    """
    Register a user .desktop entry so GNOME/Ubuntu Dock can show the real icon.
    Needed when running from source (or before a system .deb install); Wayland
    matches windows to Icon= via desktop file name + StartupWMClass / app_id.
    """
    if sys.platform != "linux":
        return
    try:
        import subprocess

        apps_dir = os.path.expanduser("~/.local/share/applications")
        os.makedirs(apps_dir, exist_ok=True)
        desktop_path = os.path.join(apps_dir, "verisonic-broadcaster.desktop")

        source_icon = _resolve_app_icon_file()
        _install_linux_user_icon(source_icon)
        icon_name = "verisonic-broadcaster"

        if getattr(sys, "frozen", False):
            exec_cmd = f'"{os.path.abspath(sys.executable)}"'
        else:
            script = os.path.abspath(os.path.join(_BROADCASTER_DIR, "verisonic_broadcaster.py"))
            exec_cmd = f'"{os.path.abspath(sys.executable)}" "{script}"'

        contents = (
            "[Desktop Entry]\n"
            "Type=Application\n"
            "Version=1.0\n"
            "Name=VeriSonic Broadcaster\n"
            "GenericName=Live Audio Broadcaster\n"
            "Comment=Secure RJ & Administrator live audio broadcaster for VeriSonic\n"
            f"Exec={exec_cmd}\n"
            f"Icon={icon_name}\n"
            "Terminal=false\n"
            "Categories=AudioVideo;Audio;Network;\n"
            "StartupNotify=true\n"
            "StartupWMClass=verisonic-broadcaster\n"
            "Keywords=radio;broadcast;microphone;stream;\n"
            "X-GNOME-UsesNotifications=true\n"
        )
        write = True
        if os.path.isfile(desktop_path):
            try:
                with open(desktop_path, "r", encoding="utf-8") as f:
                    write = f.read() != contents
            except Exception:
                write = True
        if write:
            with open(desktop_path, "w", encoding="utf-8") as f:
                f.write(contents)
        # GNOME requires desktop files to be executable / trusted to associate icons.
        try:
            os.chmod(desktop_path, 0o755)
        except Exception:
            pass
        try:
            subprocess.run(
                ["gio", "set", desktop_path, "metadata::trusted", "true"],
                capture_output=True,
                timeout=3,
                check=False,
            )
        except Exception:
            pass
        try:
            subprocess.run(
                ["update-desktop-database", apps_dir],
                capture_output=True,
                timeout=3,
                check=False,
            )
        except Exception:
            pass
    except Exception as exc:
        print("Failed to install Linux desktop entry:", exc)


def acquire_single_instance(app):
    """Return a QLocalServer for the primary instance, or None if another copy is running."""
    socket = QLocalSocket()
    socket.connectToServer(SINGLE_INSTANCE_KEY)
    if socket.waitForConnected(300):
        socket.write(b"activate")
        socket.flush()
        socket.waitForBytesWritten(1000)
        socket.disconnectFromServer()
        return None

    server = QLocalServer(app)
    QLocalServer.removeServer(SINGLE_INSTANCE_KEY)
    if not server.listen(SINGLE_INSTANCE_KEY):
        QLocalServer.removeServer(SINGLE_INSTANCE_KEY)
        server.listen(SINGLE_INSTANCE_KEY)
    return server


if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()
    _log_boot_marker()
    setup_app_logging()
    if sys.platform == "linux":
        # Force WM_CLASS / Wayland app_id away from "python3" so Dock can match .desktop.
        sys.argv[0] = "verisonic-broadcaster"
        _ensure_linux_desktop_entry()
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    # Keep ApplicationName identical to desktop file / StartupWMClass for GNOME Dock.
    app.setApplicationName("verisonic-broadcaster")
    app.setApplicationDisplayName("VeriSonic Broadcaster")
    app.setOrganizationName("VeriSonic")
    try:
        app.setDesktopFileName("verisonic-broadcaster")
    except Exception:
        pass

    instance_server = acquire_single_instance(app)
    if instance_server is None:
        sys.exit(0)

    if sys.platform == "darwin" and HAS_MACOS_MIC_API:
        mic_granted = ensure_microphone_access(app)
        if mic_granted is False:
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Warning)
            msg.setWindowTitle("Microphone Access Required")
            msg.setText(
                "VeriSonic Broadcaster needs microphone access to capture audio.\n\n"
                "Enable it under System Settings → Privacy & Security → Microphone."
            )
            settings_btn = msg.addButton("Open System Settings", QMessageBox.ActionRole)
            msg.addButton("Continue Anyway", QMessageBox.RejectRole)
            msg.exec_()
            if msg.clickedButton() == settings_btn:
                open_platform_audio_privacy_settings()

    window = PyQtBroadcasterApp()

    def _on_second_instance_launch():
        conn = instance_server.nextPendingConnection()
        if conn is not None:
            conn.waitForReadyRead(200)
            conn.readAll()
            conn.disconnectFromServer()
        window.show_and_activate()

    instance_server.newConnection.connect(_on_second_instance_launch)

    window.show()
    sys.exit(app.exec_())
