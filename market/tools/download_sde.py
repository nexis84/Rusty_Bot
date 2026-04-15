#!/usr/bin/env python3
"""
Download EVE Online Static Data Export (SDE) from CCP
Extracts to ../../SDE/ folder (gitignored)
"""

import os
import sys
import zipfile
import requests
from pathlib import Path

# SDE URL from CCP
SDE_URL = "https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/sde.zip"

# Paths
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent.resolve()
SDE_DIR = PROJECT_ROOT / "SDE"
ZIP_FILE = SDE_DIR / "sde.zip"

def download_file(url, dest_path, chunk_size=8192):
    """Download file with progress"""
    print(f"Downloading SDE from {url}...")
    print(f"This may take a few minutes (file is ~500MB)...")
    
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0
    
    with open(dest_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    if downloaded % (chunk_size * 100) == 0:  # Update every ~800KB
                        print(f"  Progress: {percent:.1f}% ({downloaded/1024/1024:.1f} MB / {total_size/1024/1024:.1f} MB)", end='\r')
    
    print(f"\nDownloaded to: {dest_path}")
    return True

def extract_sde(zip_path, extract_dir):
    """Extract SDE zip file"""
    print(f"\nExtracting {zip_path.name}...")
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)
    
    print(f"Extracted to: {extract_dir}")
    
    # List contents
    print("\nSDE Contents:")
    for item in sorted(extract_dir.iterdir()):
        if item.is_dir():
            print(f"  📁 {item.name}/")
        else:
            size_mb = item.stat().st_size / 1024 / 1024
            print(f"  📄 {item.name} ({size_mb:.1f} MB)")

def main():
    # Ensure SDE directory exists
    SDE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Check if already downloaded
    if ZIP_FILE.exists():
        print(f"SDE zip already exists: {ZIP_FILE}")
        response = input("Re-download? (y/N): ").strip().lower()
        if response != 'y':
            print("Skipping download.")
        else:
            ZIP_FILE.unlink()
            if download_file(SDE_URL, ZIP_FILE):
                extract_sde(ZIP_FILE, SDE_DIR)
            return
    else:
        if download_file(SDE_URL, ZIP_FILE):
            extract_sde(ZIP_FILE, SDE_DIR)
    
    # Check if already extracted
    fsd_dir = SDE_DIR / "fsd"
    if fsd_dir.exists():
        print(f"\nSDE already extracted to: {fsd_dir}")
        print(f"\nKey files:")
        types_file = fsd_dir / "types.yaml"
        if types_file.exists():
            size_mb = types_file.stat().st_size / 1024 / 1024
            print(f"  - types.yaml ({size_mb:.1f} MB) - Contains all item definitions")
        groups_file = fsd_dir / "groups.yaml"
        if groups_file.exists():
            size_mb = groups_file.stat().st_size / 1024 / 1024
            print(f"  - groups.yaml ({size_mb:.1f} MB) - Contains group definitions")
        market_groups_file = fsd_dir / "marketGroups.yaml"
        if market_groups_file.exists():
            size_mb = market_groups_file.stat().st_size / 1024 / 1024
            print(f"  - marketGroups.yaml ({size_mb:.1f} MB) - Contains market categories")
    else:
        # Extract if not already done
        if ZIP_FILE.exists():
            extract_sde(ZIP_FILE, SDE_DIR)
    
    print(f"\n{'='*60}")
    print("SDE ready for use!")
    print(f"Location: {SDE_DIR}")
    print("\nNext steps:")
    print("  1. Run find_missing_items.py to compare against your database")
    print("  2. Review and approve new items")
    print("  3. Add approved items to items_database.js")

if __name__ == "__main__":
    main()
