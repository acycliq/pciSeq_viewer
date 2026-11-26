"""Unpack a background .mbtiles file into loose jpg tiles for the web viewer.

The desktop app reads the background tiles straight from the .mbtiles file of a
run (one SQLite file per channel, e.g. dapi.mbtiles). A website cannot do that:
it fetches every tile as a file of its own. This script writes those files, in
the layout the web viewer expects (src/web/webDataset.js):

    <out_dir>/<channel>/<plane>/<zoom>/<row>/<column>.jpg

The channel is the file name without its extension, so dapi.mbtiles goes to
<out_dir>/dapi/. The tiles are copied as they are, with no re-encoding.

Usage:
    python scripts/unpack_mbtiles.py <run>/viewer_data/dapi.mbtiles <out_dir>

Then upload <out_dir> as the tiles/ folder next to the arrow_* folders:
    gcloud storage cp -r <out_dir>/dapi gs://<bucket>/<run>/tiles/

Uses the Python standard library only.
"""

import sqlite3
import sys
from pathlib import Path


def unpack(mbtiles_path, out_dir):
    channel = mbtiles_path.stem.lower()
    channel_dir = out_dir / channel

    # Open read-only, so the run's file cannot be changed by mistake
    db = sqlite3.connect(f"file:{mbtiles_path}?mode=ro", uri=True)
    tiles = db.execute(
        "SELECT plane_id, zoom_level, tile_row, tile_column, tile_data FROM tiles"
    )

    made_dirs = set()
    count = 0
    for plane, zoom, row, column, data in tiles:
        row_dir = channel_dir / str(plane) / str(zoom) / str(row)
        if row_dir not in made_dirs:
            row_dir.mkdir(parents=True, exist_ok=True)
            made_dirs.add(row_dir)
        (row_dir / f"{column}.jpg").write_bytes(data)
        count += 1
        if count % 20000 == 0:
            print(f"{count} tiles written")

    db.close()
    print(f"Done: {count} tiles in {channel_dir}")


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    unpack(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()
