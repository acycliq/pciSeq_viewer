#!/usr/bin/env python3
"""
Convert cellData.tsv to Apache Arrow (Feather v2) shards + manifest

Input (default): ./data/newSpots_newSegmentation/cellData.tsv
Output directory: ./data/arrow_cells/

Columns expected (subset OK):
  Cell_Num (int), X (float), Y (float), Z (float), ClassName (str), Prob (float/str), gaussian_contour (str)

We dictionary-encode ClassName to class_id, and write both class_id (numeric) and ClassName (string)
into the shards. Default shard size ~100k rows, compression uncompressed for web decoding.
"""
import argparse
import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather


def build_argparser():
    p = argparse.ArgumentParser(description="cellData.tsv -> Arrow shards (Feather v2)")
    p.add_argument("--input", default="./data/newSpots_newSegmentation/cellData.tsv")
    p.add_argument("--outdir", default="./data/arrow_cells")
    p.add_argument("--rows-per-shard", type=int, default=100_000)
    p.add_argument(
        "--compression",
        default="uncompressed",
        choices=["uncompressed", "none", "zstd", "lz4"],
        help="Record batch compression for Feather v2. Use uncompressed/none for browser Arrow JS."
    )
    return p


def ensure_outdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def parse_list_column(series, parse_as='string'):
    """Parse string representations of lists or native lists into actual Python lists"""
    def parse_cell(cell_value):
        if pd.isna(cell_value):
            return []

        # Handle case where it's already a list or tuple
        if isinstance(cell_value, (list, tuple)):
            if parse_as == 'float':
                return [float(x) for x in cell_value]
            else:
                return [str(x) for x in cell_value]

        # Handle string representation of lists
        if isinstance(cell_value, str):
            try:
                # Handle both single quotes and double quotes in list strings
                parsed = json.loads(cell_value.replace("'", '"'))
                if isinstance(parsed, list):
                    if parse_as == 'float':
                        return [float(x) for x in parsed]
                    else:
                        return [str(x) for x in parsed]
                else:
                    return []
            except (json.JSONDecodeError, ValueError, TypeError):
                return []

        return []

    return series.apply(parse_cell)


def select_cast_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {}
    # Required / common
    if "Cell_Num" in df.columns:
        cols["cell_id"] = pd.to_numeric(df["Cell_Num"], errors="coerce").fillna(-1).astype("int32")
    if "X" in df.columns: cols["X"] = pd.to_numeric(df["X"], errors="coerce").astype("float32")
    if "Y" in df.columns: cols["Y"] = pd.to_numeric(df["Y"], errors="coerce").astype("float32")
    if "Z" in df.columns: cols["Z"] = pd.to_numeric(df["Z"], errors="coerce").astype("float32")

    # Parse ClassName as list of strings
    if "ClassName" in df.columns:
        cols["class_name"] = parse_list_column(df["ClassName"], parse_as='string')

    # Parse Prob as list of floats
    if "Prob" in df.columns:
        cols["prob"] = parse_list_column(df["Prob"], parse_as='float')

    if "gaussian_contour" in df.columns:
        cols["gaussian_contour"] = df["gaussian_contour"].astype("string")
    # Optional passthroughs (keep as string)
    for optional in ("sphere_scale", "sphere_rotation"):
        if optional in df.columns:
            cols[optional] = df[optional].astype("string")
    return pd.DataFrame(cols)


def main():
    args = build_argparser().parse_args()
    inp = Path(args.input)
    outdir = Path(args.outdir)
    ensure_outdir(outdir)

    comp = args.compression
    if comp == "none":
        comp = None

    shards = []
    total_rows = 0
    shard_index = 0

    reader = pd.read_csv(inp, sep="\t", dtype="string", chunksize=args.rows_per_shard)

    for chunk in reader:
        df = select_cast_columns(chunk)

        arrays = {}
        for col in df.columns:
            if col in ('class_name', 'prob'):
                # Handle list columns properly
                if col == 'class_name':
                    arrays[col] = pa.array(df[col].tolist(), type=pa.list_(pa.string()))
                else:  # prob
                    arrays[col] = pa.array(df[col].tolist(), type=pa.list_(pa.float32()))
            elif pd.api.types.is_string_dtype(df[col]):
                arrays[col] = pa.array(df[col].astype("string"))
            elif pd.api.types.is_float_dtype(df[col]):
                arrays[col] = pa.array(df[col].astype("float32"))
            elif pd.api.types.is_integer_dtype(df[col]):
                # choose smallest reasonable integer type
                if str(df[col].dtype).startswith("int32"):
                    arrays[col] = pa.array(df[col].astype("int32"))
                else:
                    arrays[col] = pa.array(df[col].astype("int64"))
            else:
                arrays[col] = pa.array(df[col])

        table = pa.table(arrays)
        shard_name = f"cells_shard_{shard_index:03d}.feather"
        feather.write_feather(table, (outdir / shard_name).as_posix(), compression=comp)
        n = len(df)
        shards.append({"url": shard_name, "rows": int(n)})
        total_rows += n
        shard_index += 1
        print(f"Wrote {shard_name} with {n} rows")

    # Manifest only - no class dict needed since class names are in the Arrow files
    manifest = {"format": "arrow-feather", "total_rows": int(total_rows), "shards": shards}
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(f"Done. Total rows: {total_rows}. Shards: {len(shards)}. Output dir: {outdir}")


if __name__ == "__main__":
    main()

