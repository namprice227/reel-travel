"""Build the reproducible country-keyed city search snapshot from GeoNames.

Download cities500.zip and admin1CodesASCII.txt from
https://download.geonames.org/export/dump/ before running this script.
The source and generated catalogue are CC BY 4.0; see data/geonames/README.md.
"""

import argparse
import gzip
import json
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path


def regions_from(source: Path) -> dict[str, str]:
    regions = {}
    for line in source.read_text(encoding="utf-8").splitlines():
        code, name, *_ = line.split("\t")
        regions[code] = name
    return regions


def aliases_from(raw: str, name: str, ascii_name: str) -> list[str]:
    seen = {name.casefold(), ascii_name.casefold()}
    aliases = []
    for alias in raw.split(","):
        alias = alias.strip()
        if not alias or len(alias) > 100 or alias.casefold() in seen:
            continue
        seen.add(alias.casefold())
        aliases.append(alias)
    return aliases


def build(source_zip: Path, source_regions: Path, output: Path) -> tuple[int, int]:
    regions = regions_from(source_regions)
    countries = defaultdict(list)
    with zipfile.ZipFile(source_zip) as archive:
        info = archive.getinfo("cities500.txt")
        snapshot_date = date(*info.date_time[:3]).isoformat()
        with archive.open(info) as source:
            for raw in source:
                fields = raw.decode("utf-8").rstrip("\n").split("\t")
                if len(fields) != 19:
                    raise ValueError("Unexpected GeoNames column count")
                country = fields[8]
                if len(country) != 2 or not country.isalpha():
                    continue
                city_id = int(fields[0])
                name, ascii_name = fields[1:3]
                region = regions.get(f"{country}.{fields[10]}", "")
                population = int(fields[14])
                aliases = aliases_from(fields[3], name, ascii_name)
                latitude, longitude = float(fields[4]), float(fields[5])
                countries[country].append([city_id, name, ascii_name, region, population, aliases, latitude, longitude])
    if sum(map(len, countries.values())) < 180_000:
        raise ValueError("GeoNames source looks incomplete")
    data = {
        "source": "GeoNames cities500",
        "snapshotDate": snapshot_date,
        "countries": {code: cities for code, cities in sorted(countries.items())},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    output.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
    return sum(map(len, countries.values())), len(countries)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, default=Path(".local/geonames/cities500.zip"))
    parser.add_argument("--regions", type=Path, default=Path(".local/geonames/admin1CodesASCII.txt"))
    parser.add_argument("--output", type=Path, default=Path("apps/web/src/server/data/geonames-cities500.json.gz"))
    args = parser.parse_args()
    cities, countries = build(args.zip, args.regions, args.output)
    print(f"Wrote {cities:,} populated places across {countries} country codes to {args.output}")
