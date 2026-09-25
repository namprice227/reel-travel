# GeoNames city catalogue

The app's city suggestions use a snapshot of [GeoNames `cities500.zip`](https://download.geonames.org/export/dump/), joined to the region names in `admin1CodesASCII.txt`. GeoNames describes this file as populated places with more than 500 residents plus administrative seats down to PPLA4. It is a broad search index, not a complete list of every settlement or proof of a city's current name or boundary.

GeoNames data is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: **GeoNames**, https://www.geonames.org/. The data is supplied as is; GeoNames does not warrant its accuracy or completeness. The generated server snapshot contains the GeoNames ID, name, ASCII name, first-level region name, population, alternate names and coordinates, grouped by ISO two-letter country code. The original files are not committed. The app shows attribution in the city search results.

To refresh, download the two official files to `.local/geonames/` and run `python scripts/build-city-catalog.py`. Commit the generated `apps/web/src/server/data/geonames-cities500.json.gz` snapshot with its source date. Trip creation still checks a chosen city and timezone against Google before saving; the GeoNames list is for discovery only.
