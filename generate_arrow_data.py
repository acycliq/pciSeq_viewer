#!/usr/bin/env python3
"""
Generate all Arrow data files for the transcriptomics viewer.

This script runs the three specialized converters to create:
- Spots data (from geneData.tsv)
- Cells data (from cellData.tsv) 
- Boundaries data (from plane*.tsv files)

All files are generated with uncompressed format for browser compatibility.
"""

import subprocess
import sys
from pathlib import Path

def run_converter(script_path, description):
    """Run a converter script with uncompressed format."""
    print(f"\n {description}...")
    try:
        result = subprocess.run([
            sys.executable, script_path, 
            "--compression", "uncompressed"
        ], check=True, capture_output=True, text=True)
        
        # Print the output
        if result.stdout:
            print(result.stdout)
        
        print(f" {description} completed successfully")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f" {description} failed:")
        print(f"Exit code: {e.returncode}")
        if e.stdout:
            print("STDOUT:", e.stdout)
        if e.stderr:
            print("STDERR:", e.stderr)
        return False
    except Exception as e:
        print(f" {description} failed with error: {e}")
        return False

def main():
    print(" Generating Arrow data files for transcriptomics viewer...")
    
    # Define the converters to run
    converters = [
        ("./python_converters/tsv_to_arrow_shards.py", "Generating spots data"),
        ("./python_converters/cell_tsv_to_arrow_shards.py", "Generating cells data"),
        ("./python_converters/boundaries_tsv_to_arrow_shards.py", "Generating boundaries data")
    ]
    
    success_count = 0
    
    for script_path, description in converters:
        if not Path(script_path).exists():
            print(f" Script not found: {script_path}")
            continue
            
        if run_converter(script_path, description):
            success_count += 1
    
    print(f"\n Summary:")
    print(f"   Converters run: {len(converters)}")
    print(f"   Successful: {success_count}")
    print(f"   Failed: {len(converters) - success_count}")
    
    if success_count == len(converters):
        print("\n All Arrow data files generated successfully!")
        print("   The viewer is ready to use.")
        return 0
    else:
        print(f"\n Some converters failed. Check the errors above.")
        return 1

if __name__ == "__main__":
    exit(main())
