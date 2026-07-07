#!/usr/bin/env python3
import os
import sys
import time
import threading
import queue
import math
import json
import urllib.request
import urllib.error

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

# Define fixed server stream URL (with env override)
DEFAULT_SERVER_URL = os.environ.get("VERISONIC_SERVER_URL", "ws://54.66.243.141:3000/api/radio/stream/ws")


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
        self.selected_station_id = None
        self.user_stations = []
        
        # System Tray State
        self.quit_from_tray = False
        
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

    def load_config(self):
        self.config_path = os.path.expanduser("~/.verisonic_broadcaster.json")
        self.auth_token = None
        self.refresh_token = None
        self.last_token_check_time = 0
        self.saved_email = ""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    config = json.load(f)
                    self.saved_email = config.get("email", "")
            except Exception as e:
                print("Failed to load config:", e)

    def save_config(self):
        try:
            with open(self.config_path, "w") as f:
                json.dump({
                    "email": self.saved_email
                }, f)
        except Exception as e:
            print("Failed to save config:", e)

    def clear_config(self):
        self.auth_token = None
        self.refresh_token = None
        self.saved_email = ""
        if os.path.exists(self.config_path):
            try:
                os.remove(self.config_path)
            except Exception:
                pass

    def verify_saved_token(self):
        try:
            user_info, _ = api_request("/auth/me", method="GET", token=self.auth_token)
            role = user_info.get("role")
            if role not in ["admin", "radio_admin"]:
                raise Exception("Access Denied: Only Radio Admins are allowed.")
            self.saved_email = user_info.get("email", "")
            self.on_login_success()
        except Exception as e:
            print("Saved token verification failed:", e)
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
        card_layout.addWidget(self.login_email)
        
        pass_lbl = QLabel("PASSWORD")
        pass_lbl.setFont(QFont("Helvetica Neue", 8, QFont.Bold))
        pass_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(pass_lbl)
        
        self.login_password = QLineEdit()
        self.login_password.setPlaceholderText("••••••••")
        self.login_password.setEchoMode(QLineEdit.Password)
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
            if role not in ["admin", "radio_admin"]:
                self.auth_token = None
                raise Exception("Access Denied: Only Radio Admins and Administrators are allowed.")
                
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
        # Hot-swaps the device ID inside the streaming loop
        self.active_device_id = device_id
        print("Dynamic hot-swap request: Input device ID ->", device_id)

    def handle_connect(self):
        selected_idx = self.device_combo.currentIndex()
        if selected_idx < 0 or not self.devices:
            QMessageBox.critical(self, "Error", "Please select a valid audio source.")
            return
            
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

        # Fetch the latest stations from server to ensure key is synchronized
        try:
            stations, _ = api_request("/radio", method="GET", token=self.auth_token)
            self.user_stations = stations
        except Exception as e:
            print("Failed to sync stations during key validation:", e)

        # Verify the key belongs to the selected station
        matched = False
        if self.selected_station_id:
            for st in self.user_stations:
                if st.get("id") == self.selected_station_id:
                    if st.get("stream_key") == stream_key:
                        matched = True
                        break
                        
        if not matched:
            self.key_entry.clear()
            QMessageBox.critical(
                self, "Invalid Key", 
                "The connection key does not match the selected radio station. "
                "Please ensure you have selected the correct station and pasted the key accurately."
            )
            return

        # Check key expiration (validity is 5 minutes from generation, with 30s clock skew tolerance)
        if time.time() - timestamp > 330:
            self.key_entry.clear()
            QMessageBox.critical(
                self, "Connection Key Expired", 
                "This connection key has expired. Please regenerate a new key in your web dashboard, copy it, and paste it here."
            )
            return
            
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
        
        self.is_broadcasting = True
        self.connection_status = "Connecting..."
        self.is_connected = False
        
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
            args=(device_id, server_url, stream_key),
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
    # STREAMING WORKER THREAD & RECONNECTION
    # =====================================================================
    def streaming_worker(self, device_id, server_url, stream_key):
        """Worker thread that encodes captured PCM chunks to MP3 and streams to WebSocket."""
        attempts = 0
        max_attempts = 100
        current_stream_key = stream_key
        
        while self.is_broadcasting:
            ws = None
            audio_stream = None
            try:
                # Triggers auto-reconnection loop on socket drop/failure
                if attempts > 0:
                    self.connection_status = f"Reconnecting (Attempt {attempts}/{max_attempts})..."
                    self.is_connected = False
                    
                    backoff = min(10, 2 + (attempts - 1) * 2)
                    for _ in range(int(backoff * 10)):
                        if not self.is_broadcasting:
                            return
                        time.sleep(0.1)
                        
                if attempts > 0 and self.auth_token:
                    connection_url = f"{server_url}?token={self.auth_token}"
                    if self.selected_station_id:
                        connection_url += f"&station_id={self.selected_station_id}"
                else:
                    connection_url = f"{server_url}?stream_key={current_stream_key}"
                self.connection_status = "Connecting to server..."
                
                ws = websocket.create_connection(connection_url, timeout=15)
                
                attempts = 0
                self.is_connected = True
                self.connection_status = "LIVE"
                
                self.active_device_id = device_id
                current_stream_device_id = None
                
                import select
                while self.is_broadcasting:
                    # Handles dynamic hot-swapping of active input device
                    if audio_stream is None or self.active_device_id != current_stream_device_id:
                        if audio_stream:
                            try:
                                audio_stream.stop()
                                audio_stream.close()
                            except Exception:
                                pass
                        
                        current_stream_device_id = self.active_device_id
                        channels = 2
                        try:
                            device_info = sd.query_devices(current_stream_device_id, 'input')
                            max_channels = device_info.get("max_input_channels", 2)
                            channels = min(2, max_channels)
                        except Exception as ce:
                            print("Failed to query device channels:", ce)
                            
                        encoder = lameenc.Encoder()
                        encoder.set_bit_rate(128)
                        encoder.set_in_sample_rate(44100)
                        encoder.set_channels(channels)
                        encoder.set_quality(2)
                        
                        self.audio_queue = queue.Queue(maxsize=100)
                        
                        def audio_callback(indata, frames, time_info, status):
                            try:
                                self.audio_queue.put_nowait(indata.copy())
                            except queue.Full:
                                pass
                                
                        audio_stream = sd.InputStream(
                            device=current_stream_device_id,
                            channels=channels,
                            samplerate=44100,
                            blocksize=4096,
                            callback=audio_callback
                        )
                        audio_stream.start()
                        
                    # Monitor server status frames
                    try:
                        if ws and ws.sock:
                            ready_to_read, _, _ = select.select([ws.sock], [], [], 0.0)
                            if ready_to_read:
                                frame = ws.recv_frame()
                                if frame is None:
                                    raise Exception("Connection closed by server.")
                                    
                                if frame.opcode == 9:
                                    ws.pong(frame.data)
                                elif frame.opcode == 8:
                                    raise Exception("Connection closed by server.")
                    except Exception as se:
                        raise se
                        
                    # Ingest and encode queue chunks
                    try:
                        data_chunk = self.audio_queue.get(timeout=0.05)
                    except queue.Empty:
                        continue
                        
                    if data_chunk.size > 0:
                        # Convert stereo to mono for visualizer
                        if data_chunk.ndim > 1:
                            mono_chunk = np.mean(data_chunk, axis=1)
                        else:
                            mono_chunk = data_chunk
                            
                        # FFT
                        fft_data = np.abs(np.fft.rfft(mono_chunk)) / len(mono_chunk)
                        fft_data = fft_data[1:]  # Skip DC offset
                        
                        num_bands = 20
                        max_bin = min(400, len(fft_data))  # limit to musical frequencies
                        log_indices = np.logspace(0, np.log10(max_bin), num_bands + 1, dtype=int)
                        
                        # Generate levels
                        new_levels = []
                        for i in range(num_bands):
                            start_idx = log_indices[i]
                            end_idx = max(start_idx + 1, log_indices[i+1])
                            amp = np.mean(fft_data[start_idx:end_idx])
                            
                            # Equalize levels (boost higher frequencies log-proportionally)
                            boost = 1.0 + (i / num_bands) * 5.0
                            amp = amp * boost
                            
                            db_val = 20 * math.log10(amp) if amp > 1e-5 else -80.0
                            val = int((db_val + 50.0) / 45.0 * 100)  # map -50dB..-5dB to 0..100
                            val = max(0, min(100, val))
                            new_levels.append(val)
                            
                        self.current_frequency_levels = new_levels
                        
                        # Set current_volume_db
                        rms = np.sqrt(np.mean(mono_chunk**2))
                        self.current_volume_db = 20 * math.log10(rms) if rms > 1e-4 else -60.0
                    else:
                        self.current_volume_db = -60.0
                        self.current_frequency_levels = [0] * 20
                    
                    pcm_data = (data_chunk * 32767).astype(np.int16).tobytes()
                    mp3_data = encoder.encode(pcm_data)
                    
                    if mp3_data:
                        ws.send_binary(mp3_data)
                        self.bytes_sent += len(mp3_data)
                        
                if encoder:
                    try:
                        final_mp3 = encoder.flush()
                        if final_mp3:
                            ws.send_binary(final_mp3)
                            self.bytes_sent += len(final_mp3)
                    except Exception:
                        pass
                        
            except Exception as e:
                print(f"Connection attempt failed or dropped: {e}")
                self.is_connected = False
                self.current_volume_db = -60.0
                
                if audio_stream:
                    try:
                        audio_stream.stop()
                        audio_stream.close()
                    except Exception:
                        pass
                    audio_stream = None
                if ws:
                    try:
                        ws.close()
                    except Exception:
                        pass
                
                # If the first connection attempt fails due to an auth/expiration error,
                # do not retry. Stop and show the error message.
                err_msg = str(e)
                is_auth_error = any(kw in err_msg for kw in ["403", "Forbidden", "1008", "Expired"])
                if attempts == 0 and is_auth_error:
                    self.broadcast_error = "Invalid or expired connection key. Please verify your key and try again."
                    self.is_broadcasting = False
                    break
                        
                attempts += 1
                if attempts > max_attempts:
                    self.broadcast_error = "Failed to reconnect after maximum attempts."
                    self.is_broadcasting = False
                    break
            finally:
                if audio_stream:
                    try:
                        audio_stream.stop()
                        audio_stream.close()
                    except Exception:
                        pass
                if ws:
                    try:
                        ws.close()
                    except Exception:
                        pass

    def update_gui_loop(self):
        """Monitors stats and updates volume visuals on the main thread loop."""
        # Check and refresh token if needed
        now = time.time()
        if hasattr(self, 'last_token_check_time') and (now - self.last_token_check_time > 3600):
            self.last_token_check_time = now
            self.check_and_refresh_token()

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
                mb_sent = self.bytes_sent / (1024 * 1024)
                self.stats_lbl.setText(f"Status: LIVE  |  Sent: {mb_sent:.2f} MB  |  Time: {time_str}")
            else:
                color = "#f59e0b" if (int(time.time() * 2) % 2 == 0) else "#78350f"
                self.live_indicator.setStyleSheet(f"color: {color};")
                self.stats_lbl.setText(f"Status: {self.connection_status}")
                self.custom_vu.set_levels([0] * 20)
        else:
            self.custom_vu.set_levels([0] * 20)
            self.live_indicator.setStyleSheet("color: #475569;")

    def check_and_refresh_token(self):
        if not self.auth_token or not self.refresh_token:
            return
        try:
            parts = self.auth_token.split('.')
            if len(parts) != 3:
                return
            payload_b64 = parts[1]
            payload_b64 += '=' * (-len(payload_b64) % 4)
            import base64
            payload = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
            exp = payload.get('exp', 0)
            if exp > 0 and (exp - time.time() < 86400):
                print("Access token is expiring soon, refreshing...")
                threading.Thread(target=self.perform_token_refresh, daemon=True).start()
        except Exception as e:
            print("Failed to check token expiration:", e)

    def perform_token_refresh(self):
        try:
            res, _ = api_request(
                "/auth/refresh", 
                method="POST", 
                data={"refresh_token": self.refresh_token}
            )
            new_access_token = res.get("access_token")
            new_refresh_token = res.get("refresh_token")
            if new_access_token and new_refresh_token:
                self.auth_token = new_access_token
                self.refresh_token = new_refresh_token
                print("Token refreshed successfully.")
        except Exception as e:
            print("Token refresh failed:", e)

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


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    window = PyQtBroadcasterApp()
    window.show()
    sys.exit(app.exec_())
