"""Compare the recipe paths in two sitemap XML files, including duplicate detection."""

import sys
from collections import Counter
from urllib.parse import urlsplit
from xml.etree import ElementTree


def recipes(filename):
    locations = ElementTree.parse(filename).iterfind(".//{*}loc")
    return Counter(
        path for entry in locations
        if (path := urlsplit(entry.text or "").path).startswith("/forever/recipes/")
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python3 scripts/check-recipe-sitemap.py before.xml after.xml")
    before, after = map(recipes, sys.argv[1:])
    if not before or before != after or any(count != 1 for count in after.values()):
        sys.exit(f"Recipe sitemap mismatch. Removed {before - after}. Added {after - before}.")
    print(f"Both sitemaps contain the same {len(after):,} unique recipe paths.")
