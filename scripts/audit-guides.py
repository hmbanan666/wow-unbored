#!/usr/bin/env python3
"""Read-only checks of public guide HTML, using curl and the Python standard library."""
import argparse
import json
import re
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
        self.tables = 0
        self.faq_sections = 0
        self.faq_depth = 0
        self.faq_field = None
        self.questions, self.answers = [], []
        self.tooltip_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tag = tag
        # Inline definitions have hidden span panels in SSR; only the label is visible.
        if tag == "span" and (self.tooltip_depth or attrs.get("role") == "tooltip"):
            self.tooltip_depth += 1
        if tag == "table":
            self.tables += 1
        if tag == "section":
            if self.faq_depth:
                self.faq_depth += 1
            elif "guide-faq" in attrs.get("class", "").split():
                self.faq_sections += 1
                self.faq_depth = 1
        if self.faq_depth and tag in ("dt", "dd"):
            self.faq_field = self.questions if tag == "dt" else self.answers
            self.faq_field.append("")
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
        if tag == "span" and self.tooltip_depth:
            self.tooltip_depth -= 1
        if tag in ("dt", "dd"):
            self.faq_field = None
        if tag == "section" and self.faq_depth:
            self.faq_depth -= 1
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
        if not self.skip and not self.tooltip_depth:
            self.visible.append(text)
            if self.faq_field is not None:
                self.faq_field[-1] += text


def nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child)


def has_type(node, name):
    value = node.get("@type", [])
    return name in (value if isinstance(value, list) else [value])


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
                assert any(has_type(n, "Article") and n.get("about", {}).get("name") == "World of Warcraft: Forever" for n in graph), f"{path}: Article game missing"
                assert any(has_type(n, "BreadcrumbList") and "/forever" in json.dumps(n) for n in graph), f"{path}: Forever breadcrumb missing"
                assert any(link.startswith("/guides/") and link != path for link in page.links), f"{path}: no next guide"
                document, _ = fetch("/api/catalog/guide/" + path.rsplit("/", 1)[-1])
                blocks = json.loads(document)["blocks"]
                expected_faq = [b for b in blocks if b["type"] == "faq"]
                assert len(expected_faq) <= 1, f"{path}: multiple authored FAQs"
                assert page.tables == sum(b["type"] == "table" for b in blocks), f"{path}: table missing from SSR"
                faq_graphs = [n for n in graph if has_type(n, "FAQPage")]
                assert len(faq_graphs) == page.faq_sections == len(expected_faq), f"{path}: FAQ presence mismatch"
                if expected_faq:
                    def plain(value):
                        return " ".join(re.sub(r"\{\{term:[^|]+\|([^}]+)\}\}", r"\1", value).split())
                    entries = expected_faq[0]["entries"]
                    expected = [(plain(e["q"]), plain(e["a"])) for e in entries]
                    visible = list(zip(map(plain, page.questions), map(plain, page.answers)))
                    assert len(page.questions) == len(page.answers) == len(entries), f"{path}: FAQ entry count mismatch"
                    assert visible == expected, f"{path}: visible FAQ differs from authored answers"
                    structured = [(plain(e["name"]), plain(e["acceptedAnswer"]["text"])) for e in faq_graphs[0]["mainEntity"]]
                    assert structured == expected, f"{path}: FAQPage differs from visible answers"
                    assert len(page.titles[0]) <= 60, f"{path}: title exceeds 60 characters"
                    assert len(page.descriptions[0]) <= 155, f"{path}: description exceeds 155 characters"
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
