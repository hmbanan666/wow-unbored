#!/usr/bin/env python3
"""Read-only checks of public guide HTML, using curl and the Python standard library."""
import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.titles, self.descriptions, self.canonicals, self.robots = [], [], [], []
        self.links, self.ids, self.schemas, self.visible = [], set(), [], []
        self.h1 = 0
        self.tag = ""
        self.skip = 0
        self.schema = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tag = tag
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "h1":
            self.h1 += 1
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name") in ("description", "robots"):
            getattr(self, "descriptions" if attrs["name"] == "description" else "robots").append(attrs.get("content", ""))
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.schema = ""

    def handle_endtag(self, tag):
        if tag == "script" and self.schema is not None:
            self.schemas.append(json.loads(self.schema))
            self.schema = None
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        self.tag = ""

    def handle_data(self, text):
        if self.schema is not None:
            self.schema += text
        if self.tag == "title":
            self.titles.append(text.strip())
        if not self.skip:
            self.visible.append(text)


def nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child)


def audit(base, canonical, expect_terms):
    Path(".scratch").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=".scratch", prefix="guide-audit-") as folder:
        def fetch(path):
            body, headers = Path(folder) / "body", Path(folder) / "headers"
            result = subprocess.run([
                "curl", "--compressed", "--silent", "--show-error", "--location", "--max-time", "30",
                "--dump-header", str(headers), "--output", str(body),
                "--write-out", "%{http_code}\n%{url_effective}", urljoin(base, path),
            ], capture_output=True, text=True, check=True)
            status, final = result.stdout.splitlines()
            assert status == "200", f"{path}: HTTP {status}"
            assert urlparse(final).path == urlparse(path).path, f"{path}: unexpected redirect to {final}"
            return body.read_text(), headers.read_text().lower()

        robots, _ = fetch("/robots.txt")
        assert f"Sitemap: {canonical}/sitemap.xml" in robots, "robots sitemap origin mismatch"
        # These public pages must not be disallowed. The application currently emits one wildcard group.
        disallowed = [line.split(":", 1)[1].strip() for line in robots.splitlines() if line.lower().startswith("disallow:")]
        sitemap, _ = fetch("/sitemap.xml")
        urls = {node.text for node in ET.fromstring(sitemap).iter() if node.tag.endswith("}loc")}
        index, _ = fetch("/api/catalog?kind=guide&game=forever")
        entries = json.loads(index)["pages"]
        assert entries, "no published Forever guides"
        titles, descriptions = set(), set()
        paths = ["/forever", *(entry["href"] for entry in entries)]
        for path in paths:
            assert not any(rule and (rule == "/" or path.startswith(rule.rstrip("*"))) for rule in disallowed), f"robots disallows {path}"
            assert canonical + path in urls, f"sitemap omits {path}"
            html, headers = fetch(path)
            page = Page()
            page.feed(html)
            assert page.h1 == 1, f"{path}: expected one H1"
            assert len(page.titles) == 1 and page.titles[0], f"{path}: missing/duplicate title"
            assert len(page.descriptions) == 1 and page.descriptions[0], f"{path}: missing/duplicate description"
            assert page.titles[0] not in titles, f"{path}: repeated title"
            assert page.descriptions[0] not in descriptions, f"{path}: repeated description"
            titles.add(page.titles[0]); descriptions.add(page.descriptions[0])
            assert page.canonicals == [canonical + path], f"{path}: canonical mismatch {page.canonicals}"
            assert not any("noindex" in r.lower() or "none" == r.lower().strip() for r in page.robots), f"{path}: noindex"
            assert not any(line.startswith("x-robots-tag:") and ("noindex" in line or "none" in line) for line in headers.splitlines()), f"{path}: HTTP noindex"
            text = " ".join(page.visible)
            assert "@context" not in text and '"@type"' not in text, f"{path}: visible JSON-LD"
            assert "{{term:" not in text, f"{path}: unrendered term syntax"
            if path.startswith("/guides/"):
                assert len(text.split()) > 250, f"{path}: useful body missing from SSR"
                graph = list(nodes(page.schemas))
                assert any(n.get("@type") == "Article" and n.get("about", {}).get("name") == "World of Warcraft: Forever" for n in graph), f"{path}: Article game missing"
                assert any(n.get("@type") == "BreadcrumbList" and "/forever" in json.dumps(n) for n in graph), f"{path}: Forever breadcrumb missing"
                assert any(link.startswith("/guides/") and link != path for link in page.links), f"{path}: no next guide"
                if expect_terms:
                    assert any(i.startswith("guide-term-") for i in page.ids), f"{path}: no SSR definitions"
                    for link in page.links:
                        if link.startswith("#guide-term-"):
                            assert link[1:] in page.ids, f"{path}: broken definition link"
            print(f"PASS {path}: 200, SSR, title, description, canonical, indexable, sitemap, structured data")
        assert not any(url and (urlparse(url).path == "/my" or urlparse(url).path.startswith("/enter/")) for url in urls), "private route in sitemap"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Public origin or a local preview; never an owner API")
    parser.add_argument("--canonical-origin", default="https://playunbored.com")
    parser.add_argument("--expect-terms", action="store_true")
    args = parser.parse_args()
    audit(args.base_url.rstrip("/") + "/", args.canonical_origin.rstrip("/"), args.expect_terms)
