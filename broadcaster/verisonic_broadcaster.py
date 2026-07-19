#!/usr/bin/env python3
import os
import sys
import time
import threading
import queue
import math
import json
import base64
import urllib.request
import urllib.error
import fractions
import asyncio

# Try importing aiortc & av for WebRTC low latency streaming
USE_WEBRTC = False
try:
    from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
    from av import AudioFrame
    USE_WEBRTC = True
except ImportError:
    pass

# Try importing websockets for async WebSocket ingest
try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

# Dependency tracking
MISSING_DEPS = []

# Try importing PyQt5
USE_PYQT = False
try:
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QLabel, QComboBox, QLineEdit, QPushButton, QCheckBox, QFrame, QProgressBar, QMessageBox, QStackedWidget
    )
    from PyQt5.QtCore import QTimer, Qt
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
try:
    import websocket
except ImportError:
    MISSING_DEPS.append("websocket-client")

if sys.platform == "darwin":
    try:
        from macos_audio_permission import (
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

# Define fixed server stream URL (with env override)
DEFAULT_SERVER_URL = os.environ.get("VERISONIC_SERVER_URL", "ws://54.66.243.141:3000/api/radio/stream/ws")


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

# AudioStreamTrack is only needed if we ever do full WebRTC ingest in future
if USE_WEBRTC:
    class AudioStreamTrack(MediaStreamTrack):
        kind = "audio"

        def __init__(self, webrtc_queue, channels=2, sample_rate=44100):
            super().__init__()
            self.webrtc_queue = webrtc_queue
            self.channels = channels
            self.sample_rate = sample_rate
            self.pts = 0

        async def recv(self):
            # Simply wait for a pre-processed chunk from the VU loop
            while True:
                try:
                    pcm_data = self.webrtc_queue.get_nowait()
                    break
                except queue.Empty:
                    await asyncio.sleep(0.005)

            frame = AudioFrame.from_ndarray(
                pcm_data.T,
                format='s16',
                layout='stereo' if self.channels == 2 else 'mono'
            )
            frame.sample_rate = self.sample_rate
            frame.time_base = fractions.Fraction(1, self.sample_rate)
            frame.pts = self.pts
            self.pts += frame.samples
            return frame


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
            command = "pip install PyQt5 sounddevice numpy lameenc websocket-client"
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
class PyQtBroadcasterApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("VeriSonic Live Broadcaster")
        self.setFixedSize(500, 560)
        
        icon = self.create_radio_icon()
        self.setWindowIcon(icon)
        QApplication.setWindowIcon(icon)
        
        # Audio & Streaming state variables
        self.is_broadcasting = False
        self.is_connected = False
        self.connection_status = "Stopped"
        self.stream_thread = None
        self.audio_queue = queue.Queue(maxsize=100)
        self.bytes_sent = 0
        self.start_time = 0
        self.current_volume_db = -60.0
        self.current_frequency_levels = [0] * 20
        self.broadcast_error = None
        self.active_device_id = None
        self._active_device_name = ""
        self.selected_station_id = None
        self.user_stations = []
        self.user_id = None
        
        # System Tray State
        self.quit_from_tray = False
        self._mac_audio_probe_done = False
        self._audio_silent_warned = False
        
        # Session parameters and settings
        self.load_config()
        
        # Style sheet definition
        self.setStyleSheet("""
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
        """)
        
        self.init_ui()
        
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
        if sys.platform == 'darwin' and not self._mac_audio_probe_done:
            self._mac_audio_probe_done = True
            QTimer.singleShot(800, self.request_macos_audio_access)

    def request_macos_audio_access(self):
        """Request microphone access via AVFoundation, then verify capture works."""
        if sys.platform != 'darwin':
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
            try:
                default_in = sd.default.device[0]
                if default_in is not None and int(default_in) >= 0:
                    device_id = int(default_in)
            except Exception:
                pass

            if device_id is None:
                devices = self.get_input_devices()
                if not devices:
                    QTimer.singleShot(0, self._show_mic_permission_dialog)
                    return
                device_id = devices[0]["id"]

            try:
                with sd.InputStream(
                    device=device_id,
                    channels=1,
                    samplerate=44100,
                    blocksize=1024,
                ):
                    sd.sleep(250)
            except Exception as exc:
                print("Microphone permission probe failed:", exc)
                QTimer.singleShot(0, self._show_mic_permission_dialog)

        threading.Thread(target=_probe, daemon=True).start()

    def _show_mic_permission_dialog(self):
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("Microphone Access Required")
        msg.setText(
            "VeriSonic Broadcaster needs access to your selected audio input "
            "(microphone, line-in, USB interface, or loopback).\n\n"
            "Open System Settings → Privacy & Security → Microphone, "
            "enable VeriSonic Broadcaster, then restart the app."
        )
        settings_btn = msg.addButton("Open System Settings", QMessageBox.ActionRole)
        msg.addButton(QMessageBox.Ok)
        msg.exec_()
        if msg.clickedButton() == settings_btn and HAS_MACOS_MIC_API:
            open_microphone_privacy_settings()

    def refresh_input_devices(self):
        """Reload PortAudio input devices into the connect-page dropdown."""
        self.devices = self.get_input_devices()
        if not hasattr(self, "device_combo"):
            return

        selected_id = None
        idx = self.device_combo.currentIndex()
        if 0 <= idx < len(self.devices):
            selected_id = self.devices[idx]["id"]

        self.device_combo.blockSignals(True)
        self.device_combo.clear()
        if self.devices:
            self.device_combo.addItems([dev["name"] for dev in self.devices])
            if selected_id is not None:
                for i, dev in enumerate(self.devices):
                    if dev["id"] == selected_id:
                        self.device_combo.setCurrentIndex(i)
                        break
        else:
            self.device_combo.addItems(["No Input Devices Found"])
        self.device_combo.blockSignals(False)

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
        
        # Device Selector
        dev_header_layout = QHBoxLayout()
        dev_lbl = QLabel("INITIAL AUDIO INPUT SOURCE")
        dev_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        dev_lbl.setStyleSheet("color: #94a3b8;")
        dev_header_layout.addWidget(dev_lbl)
        
        dev_help_btn = QPushButton("Guide")
        dev_help_btn.setFont(QFont("Helvetica Neue", 9))
        dev_help_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #38bdf8;
                border: none;
                text-decoration: underline;
                padding: 0;
            }
            QPushButton:hover {
                color: #7dd3fc;
            }
        """)
        dev_help_btn.setCursor(Qt.PointingHandCursor)
        dev_help_btn.clicked.connect(self.show_system_sound_help)
        dev_header_layout.addStretch()
        dev_header_layout.addWidget(dev_help_btn)
        card_layout.addLayout(dev_header_layout)
        
        self.devices = self.get_input_devices()
        device_names = [dev["name"] for dev in self.devices]
        self.device_combo = QComboBox()
        self.device_combo.addItems(device_names if device_names else ["No Input Devices Found"])
        card_layout.addWidget(self.device_combo)
        
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
        
        # Set default input selection
        try:
            default_input_id = sd.default.device[0]
            if default_input_id >= 0:
                for idx, dev in enumerate(self.devices):
                    if dev["id"] == default_input_id:
                        self.device_combo.setCurrentIndex(idx)
                        break
        except Exception:
            pass
            
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
        
        self.live_device_combo = QComboBox()
        self.live_device_combo.currentIndexChanged.connect(self.on_live_device_changed)
        card_layout.addWidget(self.live_device_combo)
        
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
        if index < 0 or index >= len(self.devices):
            return
        device_id = self.devices[index]["id"]
        device_name = self.devices[index]["name"]
        self.active_device_id = device_id
        self._active_device_name = device_name
        print("Dynamic hot-swap request: Input device ID ->", device_id, device_name)
        if "blackhole" in device_name.lower():
            self.connection_status = "Switching to BlackHole — reconnecting audio..."

    def handle_connect(self):
        selected_idx = self.device_combo.currentIndex()
        if selected_idx < 0 or not self.devices:
            QMessageBox.critical(self, "Error", "Please select a valid audio source.")
            return

        if sys.platform == "darwin" and HAS_MACOS_MIC_API:
            status = get_microphone_authorization_status()
            if status == "denied":
                self._show_mic_permission_dialog()
                return
            if status in ("not_determined", "unavailable"):
                request_microphone_access(
                    lambda granted: QTimer.singleShot(
                        0, lambda g=granted: self._continue_connect_after_mic(g, selected_idx)
                    )
                )
                return

        self._start_broadcast(selected_idx)

    def _continue_connect_after_mic(self, granted, selected_idx):
        if granted is False:
            self._show_mic_permission_dialog()
            return
        if granted is None and HAS_MACOS_MIC_API:
            status = get_microphone_authorization_status()
            if status == "denied":
                self._show_mic_permission_dialog()
                return
        self.refresh_input_devices()
        if not self.devices:
            self._show_mic_permission_dialog()
            return
        if selected_idx >= len(self.devices):
            selected_idx = 0
        self._start_broadcast(selected_idx)

    def _start_broadcast(self, selected_idx):
        device_id = self.devices[selected_idx]["id"]
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
        
        # Load and sync device selections to Page 2 active dropdown
        self.live_device_combo.blockSignals(True)
        self.live_device_combo.clear()
        self.live_device_combo.addItems([dev["name"] for dev in self.devices])
        self.live_device_combo.setCurrentIndex(selected_idx)
        self.live_device_combo.blockSignals(False)
        self._active_device_name = self.devices[selected_idx]["name"]
        self.active_device_id = device_id
        bitrate_index = self.bitrate_combo.currentIndex()
        bitrate_opts = [320, 256, 192, 128, 96]
        if bitrate_index >= 0 and bitrate_index < len(bitrate_opts):
            self.saved_bitrate = bitrate_opts[bitrate_index]
        self.save_config()

        self.is_broadcasting = True
        self.connection_status = "Connecting..."
        self.is_connected = False
        self._audio_silent_warned = False
        
        self.bytes_sent = 0
        self.start_time = time.time()
        self.audio_queue = queue.Queue(maxsize=100)
        self.broadcast_error = None
        
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
        self.active_device_id = device_id
        current_stream_device_id = None
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
                        try:
                            self.mp3_queue.put_nowait(mp3_data)
                        except queue.Full:
                            pass

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

                channels, samplerate = self.get_device_capture_params(self.active_device_id)
                print(
                    f"Opening audio input device {self.active_device_id} "
                    f"({getattr(self, '_active_device_name', '')}): "
                    f"{channels}ch @ {samplerate}Hz"
                )

                # Initialize audio input stream if not already done or device swapped
                if audio_stream is None or self.active_device_id != current_stream_device_id:
                    if audio_stream:
                        try:
                            audio_stream.stop()
                            audio_stream.close()
                        except Exception:
                            pass

                    self.audio_queue = queue.Queue(maxsize=100)
                    self.mp3_queue = queue.Queue(maxsize=200)
                    self._audio_silent_warned = False

                    encoder = lameenc.Encoder()
                    encoder.set_bit_rate(bitrate)
                    encoder.set_in_sample_rate(samplerate)
                    encoder.set_channels(channels)
                    encoder.set_quality(0)

                    def audio_callback(indata, frames, time_info, status):
                        if status:
                            print("Audio input status:", status)
                        try:
                            self.audio_queue.put_nowait(indata.copy())
                        except queue.Full:
                            pass

                    try:
                        audio_stream = sd.InputStream(
                            device=self.active_device_id,
                            channels=channels,
                            samplerate=samplerate,
                            blocksize=2048,
                            callback=audio_callback
                        )
                        audio_stream.start()
                    except Exception as ae:
                        print("Failed to open audio input stream:", ae)
                        device_hint = getattr(self, "_active_device_name", "the selected device")
                        if "blackhole" in device_hint.lower():
                            self.broadcast_error = (
                                f"Could not open {device_hint}.\n\n"
                                "For system audio via BlackHole:\n"
                                "1. Audio MIDI Setup → Create Multi-Output Device\n"
                                "2. Enable BlackHole 2ch + your speakers/headphones\n"
                                "3. System Settings → Sound → Output → Multi-Output Device\n"
                                "4. Play audio, then select BlackHole 2ch in this app"
                            )
                        else:
                            self.broadcast_error = (
                                "Could not open the selected audio input.\n\n"
                                "On macOS, open System Settings → Privacy & Security → Microphone "
                                "and enable VeriSonic Broadcaster, then try again."
                            )
                        self.is_broadcasting = False
                        raise
                    current_stream_device_id = self.active_device_id

                    # Start the VU + encode loop immediately when mic starts
                    if vu_task is None or vu_task.done():
                        vu_task = asyncio.ensure_future(vu_loop())

                # Open WebSocket connection
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

                    # Drain mp3_queue and send chunks over WebSocket
                    while self.is_broadcasting:
                        if self.active_device_id != current_stream_device_id:
                            print("Input device changed — reopening audio stream")
                            break

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

        # Cleanup audio stream
        if audio_stream:
            try:
                audio_stream.stop()
                audio_stream.close()
            except Exception:
                pass

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

        if hasattr(self, 'broadcast_error') and self.broadcast_error:
            err = self.broadcast_error
            self.broadcast_error = None
            self.show_and_activate()
            QMessageBox.critical(self, "Broadcast Error", err)
            self.handle_stop_broadcast()
            return

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

                if (
                    not self._audio_silent_warned
                    and elapsed_seconds >= 4
                    and self.current_volume_db <= -55.0
                    and all(level == 0 for level in self.current_frequency_levels)
                ):
                    self._audio_silent_warned = True
                    device_name = getattr(self, "_active_device_name", "")
                    if "blackhole" in device_name.lower():
                        self.broadcast_error = (
                            f"No audio detected on {device_name}.\n\n"
                            "BlackHole only receives audio routed TO it:\n"
                            "1. Open Audio MIDI Setup → Create Multi-Output Device\n"
                            "2. Check BlackHole 2ch AND your speakers/headphones\n"
                            "3. System Settings → Sound → Output → Multi-Output Device\n"
                            "4. Play music/audio, then watch the VU meter here"
                        )
                    else:
                        self.broadcast_error = (
                            "No audio is being captured from the selected input.\n\n"
                            "Check System Settings → Privacy & Security → Microphone, "
                            "confirm the correct input device is selected, and test the "
                            "level meter (speak into the mic or play audio into the device)."
                        )
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
    def create_radio_icon(self):
        from PyQt5.QtGui import QIcon, QPixmap, QPainter, QColor, QPen
        pixmap = QPixmap(32, 32)
        pixmap.fill(Qt.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # Center dot
        painter.setBrush(QColor("#f43f5e"))
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(13, 13, 6, 6)
        
        # Waves
        painter.setBrush(Qt.NoBrush)
        pen = QPen(QColor("#f43f5e"), 2)
        pen.setCapStyle(Qt.RoundCap)
        painter.setPen(pen)
        
        painter.drawArc(8, 8, 16, 16, -60 * 16, 120 * 16)
        painter.drawArc(8, 8, 16, 16, 120 * 16, 120 * 16)
        
        painter.drawArc(3, 3, 26, 26, -50 * 16, 100 * 16)
        painter.drawArc(3, 3, 26, 26, 130 * 16, 100 * 16)
        
        painter.end()
        return QIcon(pixmap)

    def setup_tray_icon(self):
        from PyQt5.QtWidgets import QSystemTrayIcon, QMenu, QAction
        self.tray_icon = QSystemTrayIcon(self)
        self.tray_icon.setIcon(self.windowIcon())
        
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
            self.tray_icon.showMessage(
                "VeriSonic Broadcaster",
                "Broadcaster is running in the system tray.",
                QSystemTrayIcon.Information,
                2000
            )
            event.ignore()
        else:
            event.accept()

    def get_device_capture_params(self, device_id):
        """Return (channels, samplerate) suited for the given PortAudio input device."""
        channels = 1
        samplerate = 44100
        try:
            info = sd.query_devices(device_id, "input")
            max_channels = info.get("max_input_channels", 1)
            channels = min(2, max(1, int(max_channels)))
            default_sr = info.get("default_samplerate") or info.get("default_sample_rate") or 44100
            samplerate = int(default_sr)
            if samplerate <= 0:
                samplerate = 44100
        except Exception as exc:
            print("Failed to query device capture params:", exc)
        return channels, samplerate

    def get_input_devices(self):
        devices = []
        try:
            device_list = sd.query_devices()
            for idx, dev in enumerate(device_list):
                if dev.get("max_input_channels", 0) > 0:
                    devices.append({
                        "id": idx,
                        "name": dev.get("name", "Unknown Device")
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
            "<h3>How to Stream System Sound / Music</h3>"
            "<p>To stream your computer's playing audio (music, browser audio, etc.) instead of just your microphone, select your system loopback device from the dropdown.</p>"
            "<hr/>"
            "<h4>🍏 macOS Setup (BlackHole)</h4>"
            "<ol>"
            "<li>Install <b>BlackHole 2ch</b> (free & open-source) via Homebrew:<br/>"
            "<code>brew install blackhole-2ch</code></li>"
            "<li>Open <b>Audio MIDI Setup</b> app on your Mac, click <b>+</b> (bottom-left) and choose <b>Create Multi-Output Device</b>.</li>"
            "<li>Check both <b>BlackHole 2ch</b> and your physical speaker/headphones (so you can hear the music while streaming).</li>"
            "<li>In Mac <b>System Settings > Sound</b>, change output to the new <b>Multi-Output Device</b>.</li>"
            "<li>In this broadcaster app, restart or choose <b>BlackHole 2ch</b> as the source.</li>"
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
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

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
                open_microphone_privacy_settings()

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
