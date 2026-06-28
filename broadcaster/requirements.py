#!/usr/bin/env python3
import os
import sys
import subprocess

def install_dependencies():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    req_file = os.path.join(current_dir, "requirements.txt")
    
    if not os.path.exists(req_file):
        print(f"Error: requirements.txt not found at {req_file}")
        sys.exit(1)
        
    print(f"Reading requirements from {req_file}...")
    try:
        # Programmatically execute pip install -r requirements.txt
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_file])
        print("\n[+] Broadcaster dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"\n[-] Installation failed with exit code: {e.returncode}")
        sys.exit(e.returncode)

if __name__ == "__main__":
    install_dependencies()
