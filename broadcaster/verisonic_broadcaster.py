#!/usr/bin/env python3
import os
import sys
import time
import threading
import queue
import math

# Dependency tracking
MISSING_DEPS = []

# Try importing PyQt5
USE_PYQT = False
try:
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QLabel, QComboBox, QLineEdit, QPushButton, QCheckBox, QFrame, QProgressBar, QMessageBox
    )
    from PyQt5.QtCore import QTimer, Qt
    from PyQt5.QtGui import QFont, QPalette, QColor
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
# PYQT5 PREMIUM BROADCASTER APPLICATION (Runs when dependencies exist)
# =====================================================================
class PyQtBroadcasterApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("VeriSonic Live Broadcaster")
        self.setFixedSize(500, 560)
        # Set Application-level and Window Icon (updates macOS Dock dynamically)
        icon = self.create_radio_icon()
        self.setWindowIcon(icon)
        QApplication.setWindowIcon(icon)
        
        # Audio & Streaming state
        self.is_broadcasting = False
        self.stream_thread = None
        self.audio_queue = queue.Queue(maxsize=100)
        self.bytes_sent = 0
        self.start_time = 0
        self.current_volume_db = -60.0
        self.broadcast_error = None
        
        # System Tray State
        self.quit_from_tray = False
        
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
            QProgressBar {
                background-color: #0d1321;
                border: 1px solid #1e293b;
                border-radius: 6px;
                text-align: center;
                height: 18px;
            }
            QProgressBar::chunk {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #10b981, stop:0.7 #f59e0b, stop:1 #ef4444);
                border-radius: 5px;
            }
        """)
        
        self.init_ui()
        
        # Start GUI Refresh Timer (100ms)
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_gui_loop)
        self.timer.start(100)
        
        # Initialize System Tray
        self.setup_tray_icon()

    def init_ui(self):
        # Main layout wrapper
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(15)
        
        # Header layout (Title + Live Indicator Dot)
        header_layout = QHBoxLayout()
        
        self.live_indicator = QLabel("●")
        self.live_indicator.setFont(QFont("Arial", 16, QFont.Bold))
        self.live_indicator.setStyleSheet("color: #475569;") # Default Gray
        header_layout.addWidget(self.live_indicator)
        
        title_lbl = QLabel("VeriSonic Live Link")
        title_lbl.setFont(QFont("Helvetica Neue", 18, QFont.Bold))
        header_layout.addWidget(title_lbl)
        header_layout.addStretch()
        
        main_layout.addLayout(header_layout)
        
        subtitle_lbl = QLabel("Stream native high-fidelity audio direct from your desktop.")
        subtitle_lbl.setStyleSheet("color: #94a3b8;")
        subtitle_lbl.setFont(QFont("Helvetica Neue", 11))
        main_layout.addWidget(subtitle_lbl)
        
        # Card settings frame
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 20, 20, 20)
        card_layout.setSpacing(16)
        
        # 1. Device Selection Dropdown
        dev_header_layout = QHBoxLayout()
        dev_lbl = QLabel("AUDIO INPUT SOURCE")
        dev_lbl.setFont(QFont("Helvetica Neue", 9, QFont.Bold))
        dev_lbl.setStyleSheet("color: #94a3b8;")
        dev_header_layout.addWidget(dev_lbl)
        
        dev_help_btn = QPushButton("How to stream system sound?")
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
        dev_header_layout.addWidget(dev_help_btn)
        dev_header_layout.addStretch()
        card_layout.addLayout(dev_header_layout)
        
        self.devices = self.get_input_devices()
        device_names = [dev["name"] for dev in self.devices]
        self.device_combo = QComboBox()
        self.device_combo.addItems(device_names if device_names else ["No Input Devices Found"])
        card_layout.addWidget(self.device_combo)
        
        # Set default input selection to system default device if available
        try:
            default_input_id = sd.default.device[0]
            if default_input_id >= 0:
                for idx, dev in enumerate(self.devices):
                    if dev["id"] == default_input_id:
                        self.device_combo.setCurrentIndex(idx)
                        break
        except Exception:
            pass


        # 3. Stream Key Field
        key_lbl = QLabel("STREAM KEY (CONNECTION ID)")
        key_lbl.setFont(QFont("Helvetica Neue", 9, QFont.Bold))
        key_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(key_lbl)
        
        self.key_entry = QLineEdit()
        self.key_entry.setEchoMode(QLineEdit.Password)
        self.key_entry.setPlaceholderText("Paste your stream key here...")
        card_layout.addWidget(self.key_entry)
        
        # Show stream key checkbox
        self.show_key_cb = QCheckBox("Show Stream Key")
        self.show_key_cb.stateChanged.connect(self.toggle_key_visibility)
        card_layout.addWidget(self.show_key_cb)
        
        # 4. Volume VU Audio Level progress bar
        vu_lbl = QLabel("INPUT AUDIO LEVEL (VU METER)")
        vu_lbl.setFont(QFont("Helvetica Neue", 9, QFont.Bold))
        vu_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(vu_lbl)
        
        self.vu_bar = QProgressBar()
        self.vu_bar.setRange(0, 100)
        self.vu_bar.setValue(0)
        self.vu_bar.setTextVisible(False)
        card_layout.addWidget(self.vu_bar)
        
        # 5. Stats Label
        self.stats_lbl = QLabel("Status: Ready  |  Sent: 0.00 MB  |  Time: 00:00:00")
        self.stats_lbl.setAlignment(Qt.AlignCenter)
        self.stats_lbl.setFont(QFont("Helvetica Neue", 10, QFont.Bold))
        self.stats_lbl.setStyleSheet("color: #94a3b8;")
        card_layout.addWidget(self.stats_lbl)
        
        # 6. Action Button
        self.action_btn = QPushButton("Start Broadcast")
        self.action_btn.setObjectName("actionBtn")
        self.action_btn.setCursor(Qt.PointingHandCursor)
        self.action_btn.clicked.connect(self.toggle_broadcasting)
        card_layout.addWidget(self.action_btn)
        
        main_layout.addWidget(card)

    def create_radio_icon(self):
        from PyQt5.QtGui import QIcon, QPixmap, QPainter, QColor, QPen
        # Create a programmatic radio signal waves icon
        pixmap = QPixmap(32, 32)
        pixmap.fill(Qt.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # 1. Central Emitter Dot
        painter.setBrush(QColor("#f43f5e"))
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(13, 13, 6, 6)
        
        # 2. Concentric Waves
        painter.setBrush(Qt.NoBrush)
        pen = QPen(QColor("#f43f5e"), 2)
        pen.setCapStyle(Qt.RoundCap)
        painter.setPen(pen)
        
        # Inner waves (16x16 bounding box centered at 16,16)
        painter.drawArc(8, 8, 16, 16, -60 * 16, 120 * 16)
        painter.drawArc(8, 8, 16, 16, 120 * 16, 120 * 16)
        
        # Outer waves (26x26 bounding box centered at 16,16)
        painter.drawArc(3, 3, 26, 26, -50 * 16, 100 * 16)
        painter.drawArc(3, 3, 26, 26, 130 * 16, 100 * 16)
        
        painter.end()
        return QIcon(pixmap)

    def setup_tray_icon(self):
        from PyQt5.QtWidgets import QSystemTrayIcon, QMenu, QAction
        
        self.tray_icon = QSystemTrayIcon(self)
        self.tray_icon.setIcon(self.windowIcon())
        
        # Create context menu
        tray_menu = QMenu()
        
        restore_action = QAction("Open Verisonic", self)
        restore_action.triggered.connect(self.show_and_activate)
        tray_menu.addAction(restore_action)
        
        self.tray_toggle_action = QAction("Start Broadcast", self)
        self.tray_toggle_action.triggered.connect(self.toggle_broadcasting)
        tray_menu.addAction(self.tray_toggle_action)
        
        tray_menu.addSeparator()
        
        quit_action = QAction("Quit", self)
        quit_action.triggered.connect(self.quit_application)
        tray_menu.addAction(quit_action)
        
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    def set_mac_dock_icon_visible(self, visible):
        import sys
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
                # Force macOS to activate the app and refresh the Dock icon
                objc_msgSend_bool = objc.objc_msgSend
                objc_msgSend_bool.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_bool]
                objc_msgSend_bool.restype = ctypes.c_void_p
                objc_msgSend_bool(shared_app, objc.sel_registerName(b'activateIgnoringOtherApps:'), True)
                
                # Re-apply the application icon to overwrite the default OS question mark
                QApplication.setWindowIcon(self.windowIcon())
        except Exception as e:
            print("Failed to change macOS Dock icon visibility:", e)

    def show_and_activate(self):
        self.show()
        self.raise_()
        self.activateWindow()
        # Delay Dock icon refresh by 100ms to let the macOS event loop settle
        QTimer.singleShot(100, lambda: self.set_mac_dock_icon_visible(True))

    def quit_application(self):
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
        """Query sound devices."""
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

    def toggle_broadcasting(self):
        if self.is_broadcasting:
            self.stop_broadcast()
        else:
            self.start_broadcast()

    def start_broadcast(self):
        selected_idx = self.device_combo.currentIndex()
        if selected_idx < 0 or not self.devices:
            self.show_and_activate()
            QMessageBox.critical(self, "Error", "Please select a valid audio source.")
            return
            
        device_id = self.devices[selected_idx]["id"]
        server_url = DEFAULT_SERVER_URL
        stream_key = self.key_entry.text().strip()
        
        if not stream_key:
            self.show_and_activate()
            QMessageBox.critical(self, "Error", "Please enter your stream key.")
            return
            
        self.is_broadcasting = True
        self.action_btn.setText("Connecting...")
        self.action_btn.setEnabled(False)
        self.action_btn.setStyleSheet("background-color: #475569;")
        self.live_indicator.setStyleSheet("color: #f59e0b;") # Orange/Yellow
        
        # Disable input controls during broadcast
        self.device_combo.setEnabled(False)
        self.key_entry.setEnabled(False)
        self.show_key_cb.setChecked(False)
        self.show_key_cb.setEnabled(False)
        self.key_entry.setEchoMode(QLineEdit.Password)
        
        if hasattr(self, 'tray_toggle_action'):
            self.tray_toggle_action.setText("Stop Broadcast")
            
        self.bytes_sent = 0
        self.start_time = time.time()
        self.audio_queue = queue.Queue(maxsize=100)
        self.broadcast_error = None
        
        # Start capture and stream thread
        self.stream_thread = threading.Thread(
            target=self.streaming_worker,
            args=(device_id, server_url, stream_key),
            daemon=True
        )
        self.stream_thread.start()

    def stop_broadcast(self):
        self.is_broadcasting = False
        self.live_indicator.setStyleSheet("color: #475569;") # Gray
        self.vu_bar.setValue(0)
        self.action_btn.setText("Start Broadcast")
        self.action_btn.setEnabled(True)
        self.action_btn.setStyleSheet("") # Revert to stylesheet default
        self.stats_lbl.setText(f"Status: Stopped  |  Total Sent: {self.bytes_sent / (1024*1024):.2f} MB")
        
        # Re-enable input controls
        self.device_combo.setEnabled(True)
        self.key_entry.setEnabled(True)
        self.show_key_cb.setEnabled(True)
        
        if hasattr(self, 'tray_toggle_action'):
            self.tray_toggle_action.setText("Start Broadcast")

    def streaming_worker(self, device_id, server_url, stream_key):
        """Streams captured audio chunks encoded in MP3 to WebSocket."""
        ws = None
        audio_stream = None
        encoder = None
        try:
            # 1. Connect WebSocket
            connection_url = f"{server_url}?stream_key={stream_key}"
            ws = websocket.create_connection(connection_url, timeout=20)
            
            # Connect success - set state
            # Query supported channels for the chosen device
            channels = 2
            try:
                device_info = sd.query_devices(device_id, 'input')
                max_channels = device_info.get("max_input_channels", 2)
                channels = min(2, max_channels)
            except Exception as ce:
                print("Failed to query device channels:", ce)

            self.bytes_sent = 0
            self.start_time = time.time()
            
            # Setup encoder (128kbps, 44100Hz, Stereo or Mono)
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(128)
            encoder.set_in_sample_rate(44100)
            encoder.set_channels(channels)
            encoder.set_quality(2)
            
            def audio_callback(indata, frames, time_info, status):
                try:
                    self.audio_queue.put_nowait(indata.copy())
                except queue.Full:
                    pass
            
            # Start stream capture
            audio_stream = sd.InputStream(
                device=device_id,
                channels=channels,
                samplerate=44100,
                blocksize=4096,
                callback=audio_callback
            )
            audio_stream.start()
            
            # 2. Main capture loop
            import select
            while self.is_broadcasting:
                try:
                    if ws and ws.sock:
                        ready_to_read, _, _ = select.select([ws.sock], [], [], 0.0)
                        if ready_to_read:
                            frame = ws.recv_frame()
                            if frame is None:
                                self.broadcast_error = "Connection closed by server."
                                break
                            
                            # Opcode 9 is Ping (RFC 6455)
                            if frame.opcode == 9:
                                ws.pong(frame.data)
                            # Opcode 8 is Close (RFC 6455)
                            elif frame.opcode == 8:
                                self.broadcast_error = "Connection closed by server."
                                break
                except Exception as se:
                    self.broadcast_error = f"Connection error: {se}"
                    break

                try:
                    data_chunk = self.audio_queue.get(timeout=0.1)
                except queue.Empty:
                    continue
                    
                # Compute volume db level
                rms = np.sqrt(np.mean(data_chunk**2)) if data_chunk.size > 0 else 0
                db = 20 * math.log10(rms) if rms > 1e-4 else -60.0
                self.current_volume_db = db
                
                # Encode to 16-bit PCM integer samples, then compress to MP3
                pcm_data = (data_chunk * 32767).astype(np.int16).tobytes()
                mp3_data = encoder.encode(pcm_data)
                
                if mp3_data:
                    ws.send_binary(mp3_data)
                    self.bytes_sent += len(mp3_data)
                    
            # Flush LAME
            final_mp3 = encoder.flush()
            if final_mp3:
                ws.send_binary(final_mp3)
                self.bytes_sent += len(final_mp3)
                
        except Exception as e:
            # We must use threading to throw warning back to main UI thread
            print("Streaming worker error:", e)
            err_msg = str(e)
            if "403" in err_msg or "Forbidden" in err_msg or "1008" in err_msg:
                self.broadcast_error = "Invalid Stream Key. Please verify your stream key and try again."
            else:
                self.broadcast_error = f"Connection failed: {err_msg}"
            # Stop broadcast safely
            self.is_broadcasting = False
        finally:
            self.is_broadcasting = False
            # Clean streams
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
        """Update widgets status and VU meter level from background state variables."""
        if hasattr(self, 'broadcast_error') and self.broadcast_error:
            err = self.broadcast_error
            self.broadcast_error = None
            self.show_and_activate()
            QMessageBox.critical(self, "Connection Error", err)

        if self.is_broadcasting:
            # Display stats
            elapsed_seconds = int(time.time() - self.start_time)
            hours, remainder = divmod(elapsed_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            
            mb_sent = self.bytes_sent / (1024 * 1024)
            self.stats_lbl.setText(f"Status: LIVE  |  Sent: {mb_sent:.2f} MB  |  Time: {time_str}")
            
            # Map dB to progress bar value (0 to 100)
            db = self.current_volume_db
            if db <= -60:
                val = 0
            elif db >= 0:
                val = 100
            else:
                val = int((db + 60.0) / 60.0 * 100)
            self.vu_bar.setValue(val)
            
            # Pulse the indicator (flashing red)
            color = "#ef4444" if (int(time.time() * 2) % 2 == 0) else "#7f1d1d"
            self.live_indicator.setStyleSheet(f"color: {color};")
            
            # Ensure start/stop button styling matches current state
            if self.action_btn.text() != "Stop Broadcast":
                self.action_btn.setText("Stop Broadcast")
                self.action_btn.setEnabled(True)
                self.action_btn.setStyleSheet("background-color: #dc2626;")
        else:
            self.vu_bar.setValue(0)
            self.live_indicator.setStyleSheet("color: #475569;")
            if self.action_btn.text() != "Start Broadcast":
                self.action_btn.setText("Start Broadcast")
                self.action_btn.setEnabled(True)
                self.action_btn.setStyleSheet("")
                # Ensure input controls are re-enabled if stopped unexpectedly
                self.device_combo.setEnabled(True)
                self.key_entry.setEnabled(True)
                self.show_key_cb.setEnabled(True)
                if hasattr(self, 'tray_toggle_action'):
                    self.tray_toggle_action.setText("Start Broadcast")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    window = PyQtBroadcasterApp()
    window.show()
    sys.exit(app.exec_())
