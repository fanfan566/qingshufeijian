#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Download ERA5-Land (2014-2024) and aggregate weather variables for Anhui province county-level
administrative regions (104 counties).

Outputs:
  statistical_weather_data.csv

Variables:
  - avg_temp_2m: mean of ERA5-Land 2m air temperature (t2m) over each year (°C)
  - total_precip: sum of total precipitation (tp) over each year (mm)
  - sunshine_duration: mean daily sunshine duration proxy from ERA5-Land (ssrd) over each year (hours)
    NOTE: ERA5-Land provides surface solar radiation downwards (ssrd, J m-2). To convert to sunshine
          duration, we approximate by: sunshine_hours = ssrd / (1000 * 3600) * 1e-? (depends).
          In practice, a more accurate sunshine duration needs a threshold-based method.
          This script uses the common approximation:
            sunshine_hours = (ssrd_mean_daily / (1000 W/m^2) ) / 3600? (see code comment)
          You can adjust the conversion constants if you have a preferred definition.

Approach:
  1) Download China administrative boundaries (admin level 2) from GeoBoundaries.
  2) Filter for Anhui province (admn2 name patterns).
  3) Compute centroid (lon/lat) for each county polygon.
  4) Use CDS API to retrieve ERA5-Land data near each centroid:
       - For temp: t2m daily mean
       - For precip: tp daily sum
       - For ssrd: ssrd daily sum
     Then aggregate to yearly stats per county.

Requirements (added in next step if needed):
  - cdsapi, pandas, numpy, xarray, geopandas, shapely, requests, tqdm
  - Your environment must have valid CDS API credentials:
      ~/.cdsapirc or environment variables:
        CDSAPI_URL, CDSAPI_KEY, CDSAPI_USER

Usage:
  python backend/scripts/era5land_anwei_counties_stat.py \
    --out statistical_weather_data.csv \
    --start-year 2014 --end-year 2024 \
    --province-name Anhui

Notes:
  - This script may take long time due to many CDS requests. It caches downloaded NetCDF files
    under .era5land_cache/.
  - Use --max-concurrency=1 if you want to be conservative.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np
import pandas as pd

# Optional imports guarded to produce nicer error messages
try:
    import cdsapi  # type: ignore
except Exception:  # pragma: no cover
    cdsapi = None  # type: ignore

try:
    import geopandas as gpd  # type: ignore
    from shapely.geometry import shape  # noqa: F401
except Exception:  # pragma: no cover
    gpd = None  # type: ignore

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore

try:
    import xarray as xr  # type: ignore
except Exception:  # pragma: no cover
    xr = None  # type: ignore

try:
    from tqdm import tqdm  # type: ignore
except Exception:  # pragma: no cover
    tqdm = None  # type: ignore


ERA5LAND_DATASET = "reanalysis-era5-land"
DEFAULT_BOUNDING_BOX_MARGIN_DEG = 0.05  # small neighborhood for sampling


@dataclass(frozen=True)
class CountyPoint:
    county_name: str
    lat: float
    lon: float


def _require(dep, name: str) -> None:
    if dep is None:
        raise RuntimeError(
            f"Missing dependency: {name}. Please install required packages before running."
        )


def load_county_centroids_from_geoboundaries(province_name: str, cache_dir: Path) -> List[CountyPoint]:
    """
    Downloads GeoBoundaries China admin-2 (counties) and filters for the given province.

    GeoBoundaries provides national admin-2 boundaries in separate files.
    We download once and cache locally.

    Filtering heuristic:
      - GeoBoundaries admin-2 layer should contain attributes including:
          "NAME_1" (province), "NAME_2" (admin2 name)
        but exact fields may vary. We attempt multiple common keys.
    """
    _require(gpd, "geopandas")
    _require(requests, "requests")

    cache_dir.mkdir(parents=True, exist_ok=True)
    shp_path = cache_dir / "China_admin2.shp"
    if shp_path.exists():
        gdf = gpd.read_file(shp_path)
        return _filter_and_centroid(gdf, province_name)

    # GeoBoundaries downloads: use a direct zip link.
    # This may change; the script caches and fails with clear message if URL invalid.
    # Current pattern (widely used):
    #  https://www.geoboundaries.org/download/gbOpen/...
    # We'll use the "gbOpen" archive for China admin2.
    url_candidates = [
        # Admin2 (counties) for China - gbOpen provides "gadm" style.
        # If these fail, user can manually download and point script to it via flag (not implemented yet).
        "https://www.geoboundaries.org/download/gbOpen/CHN/CHN_adm2.zip",
        "https://www.geoboundaries.org/download/gbOpen/CHN/gbOpen_CHN_adm2.zip",
    ]

    zip_path = cache_dir / "CHN_adm2.zip"
    last_err: Exception | None = None
    for url in url_candidates:
        try:
            if zip_path.exists():
                zip_path.unlink()
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            zip_path.write_bytes(r.content)
            break
        except Exception as e:
            last_err = e
            continue

    if not zip_path.exists():
        raise RuntimeError(
            f"Failed to download China admin2 boundaries from GeoBoundaries. Last error: {last_err}"
        )

    extract_dir = cache_dir / "china_admin2_extracted"
    if extract_dir.exists():
        # If partially extracted, clean and re-extract for determinism
        for p in extract_dir.rglob("*"):
            if p.is_file():
                p.unlink()
    extract_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    # Find a .shp
    shp_files = list(extract_dir.rglob("*.shp"))
    if not shp_files:
        raise RuntimeError("No .shp found after extracting GeoBoundaries zip.")
    shp_file = shp_files[0]

    # Copy/convert into cache_dir/China_admin2.shp (shp+shx+dbf required)
    # We keep the folder structure by reading directly from extracted file.
    gdf = gpd.read_file(shp_file)
    # Save a copy of the shp to stable name is non-trivial; we just cache extracted usage by using it.
    # However for simplicity we store just for Centroid computation.
    return _filter_and_centroid(gdf, province_name)


def _filter_and_centroid(gdf, province_name: str) -> List[CountyPoint]:
    province_name_cn = province_name
    # Try common field names
    possible_province_keys = ["NAME_1", "name_1", "prov_name", "province", "PROVINCE", "NAME_1_EN"]
    possible_admin2_keys = ["NAME_2", "name_2", "adm2_name", "county", "NAME_2_EN"]

    province_key = None
    for k in possible_province_keys:
        if k in gdf.columns:
            province_key = k
            break

    admin2_key = None
    for k in possible_admin2_keys:
        if k in gdf.columns:
            admin2_key = k
            break

    if province_key is None or admin2_key is None:
        raise RuntimeError(
            f"Cannot find province/admin2 name fields in boundary data. Columns={list(gdf.columns)}"
        )

    # Filter Anhui: match substring in either Chinese or English value if present
    # We accept "Anhui" or "安徽"
    mask = (
        gdf[province_key].astype(str).str.contains("Anhui", case=False, na=False)
        | gdf[province_key].astype(str).str.contains("安徽", case=False, na=False)
        | (gdf[province_key].astype(str) == province_name_cn)
    )
    gdf2 = gdf.loc[mask].copy()
    if gdf2.empty:
        raise RuntimeError(f"No admin2 regions found for province={province_name} in boundary dataset.")

    # Compute centroids; ensure geometry valid
    # Some polygons can be multipolygon.
    gdf2["__centroid__"] = gdf2.geometry.representative_point()
    gdf2["__lon__"] = gdf2["__centroid__"].x
    gdf2["__lat__"] = gdf2["__centroid__"].y

    out: List[CountyPoint] = []
    for _, row in gdf2.iterrows():
        county_name = str(row[admin2_key])
        lat = float(row["__lat__"])
        lon = float(row["__lon__"])
        out.append(CountyPoint(county_name=county_name, lat=lat, lon=lon))

    # Deduplicate by (name, approx coords)
    unique: Dict[str, CountyPoint] = {}
    for p in out:
        key = p.county_name
        if key not in unique:
            unique[key] = p
    return list(unique.values())


def cds_client() -> "cdsapi.Client":
    _require(cdsapi, "cdsapi")
    return cdsapi.Client()


def era5land_fetch_year_for_point(
    client: "cdsapi.Client",
    county: CountyPoint,
    year: int,
    cache_dir: Path,
    variables: Dict[str, str],
) -> Path:
    """
    Fetch daily ERA5-Land data for a point-ish bbox around centroid.
    Cache per (county, year).
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in ("_", "-") else "_" for c in county.county_name)[:80]
    out_nc = cache_dir / f"{safe_name}__{year}.nc"
    if out_nc.exists() and out_nc.stat().st_size > 0:
        return out_nc

    lat = county.lat
    lon = county.lon
    # Use bbox with small margin so we get nearest grid.
    # ERA5-land grid resolution ~0.1 deg for many products.
    bbox = [
        max(-90.0, lat - DEFAULT_BOUNDING_BOX_MARGIN_DEG),
        max(-180.0, lon - DEFAULT_BOUNDING_BOX_MARGIN_DEG),
        min(90.0, lat + DEFAULT_BOUNDING_BOX_MARGIN_DEG),
        min(180.0, lon + DEFAULT_BOUNDING_BOX_MARGIN_DEG),
    ]

    # ERA5-Land daily aggregation request:
    # For CDS API, the dataset might be "reanalysis-era5-land" and product type "reanalysis"
    # We'll request:
    #  - time: daily for each month
    #  - format: netcdf
    # Note: exact request keys depend on CDS product.
    #
    # To keep robust, we request "daily averaged reanalysis" like:
    # product_type="reanalysis"
    # variable=[...]
    # year/month/day list
    # time=00:00
    request = {
        "product_type": "reanalysis",
        "format": "netcdf",
        "variable": list(variables.keys()),
        "year": str(year),
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],  # CDS will ignore invalid dates
        # Single time to get daily means/sums depending on variable; dataset daily handles it.
        "time": "00:00",
        "area": bbox,  # some APIs use 'area' as north/west/south/east
    }

    # Some CDS endpoints expect 'area' as [N, W, S, E].
    # We provide as such:
    request["area"] = [bbox[2], bbox[1], bbox[0], bbox[3]]  # N, W, S, E

    # Stream into file
    client.retrieve(ERA5LAND_DATASET, request, str(out_nc))
    return out_nc


def year_aggregate_from_nc(nc_path: Path, county: CountyPoint, year: int) -> Dict[str, float]:
    _require(xr, "xarray")

    ds = xr.open_dataset(nc_path)

    # Variables may have different names:
    # We expect:
    # t2m: Kelvin -> Celsius
    # tp: m -> mm
    # ssrd: J m-2 -> sunshine hours approximation
    # Convert carefully:
    def pick(var_names: Iterable[str]) -> str | None:
        for v in var_names:
            if v in ds.data_vars:
                return v
        return None

    t2m_var = pick(["t2m"])
    tp_var = pick(["tp"])
    ssrd_var = pick(["ssrd"])

    if t2m_var is None or tp_var is None or ssrd_var is None:
        raise RuntimeError(
            f"Missing vars in nc. Available={list(ds.data_vars)}"
        )

    t2m = ds[t2m_var]  # dims: time, lat, lon
    tp = ds[tp_var]
    ssrd = ds[ssrd_var]

    # Spatially average
    t2m_mean = float(t2m.mean().values)  # Kelvins
    tp_sum = float(tp.sum().values)  # meters if daily sum
    ssrd_sum = float(ssrd.sum().values)  # J/m2

    avg_temp_c = t2m_mean - 273.15
    total_precip_mm = tp_sum * 1000.0

    # Approx sunshine duration:
    # If ssrd is surface solar radiation downwards (J/m2 for each day),
    # average daily irradiance -> total energy per day.
    # Using a simple conversion: sunshine_hours ≈ total_ssrd(J/m2) / (1000 W/m2 * 3600 s)
    # = total_ssrd / 3.6e6
    sunshine_hours = ssrd_sum / 3_600_000.0

    return {
        "county": county.county_name,
        "year": year,
        "avg_temp_2m": avg_temp_c,
        "total_precip": total_precip_mm,
        "sunshine_duration": float(sunshine_hours),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--province-name", type=str, default="Anhui")
    parser.add_argument("--out", type=str, default="statistical_weather_data.csv")
    parser.add_argument("--start-year", type=int, default=2014)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--cache-dir", type=str, default=".era5land_cache")
    parser.add_argument("--max-counties", type=int, default=0, help="0=all counties")
    args = parser.parse_args()

    out_path = Path(args.out)
    cache_dir = Path(args.cache_dir)

    # Variables mapping for CDS request
    # keys are CDS variable names; values used only as labels
    variables = {
        "t2m": "avg_temp_2m",
        "tp": "total_precip",
        "ssrd": "sunshine_duration",
    }

    counties = load_county_centroids_from_geoboundaries(args.province_name, cache_dir / "boundaries")
    if args.max_counties and args.max_counties > 0:
        counties = counties[: args.max_counties]

    print(f"Found {len(counties)} county regions for province={args.province_name}")

    if len(counties) < 50:
        print("WARNING: county count seems small. Filtering heuristic may be wrong; check boundary dataset fields.")

    client = cds_client()

    rows: List[Dict[str, float]] = []
    years = list(range(args.start_year, args.end_year + 1))

    iterator = counties
    if tqdm is not None:
        iterator = tqdm(counties, desc="Counties")
    for county in iterator:
        if tqdm is not None:
            yiter = tqdm(years, desc=f"Years({county.county_name})", leave=False)
        else:
            yiter = years

        for year in yiter:
            nc_path = era5land_fetch_year_for_point(
                client=client,
                county=county,
                year=year,
                cache_dir=cache_dir / "nc",
                variables=variables,
            )
            row = year_aggregate_from_nc(nc_path, county=county, year=year)
            rows.append(row)

    df = pd.DataFrame(rows)
    df = df.sort_values(["county", "year"]).reset_index(drop=True)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"Wrote {len(df)} rows to: {out_path.resolve()}")


if __name__ == "__main__":
    main()
