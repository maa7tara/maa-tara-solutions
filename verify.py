"""Dependency-free verification pass for the Maa Tara Solutions site.

Checks structure, link targets, control wiring and accessibility basics.
Also reports any business details still left as placeholders — those are
warnings, so the site can be published while the details are confirmed.
"""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent
HTML = ROOT / "index.html"

PLACEHOLDERS = (
    "PHONE_TBC",
    "EMAIL_TBC",
    "COMPANY_NUMBER_TBC",
    "REGISTERED_ADDRESS_TBC",
    "GITHUB_USERNAME_TBC",
)


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.links: list[dict[str, str]] = []
        self.buttons: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.controls: list[tuple[str, str]] = []
        self.label_targets: list[str] = []
        self.tabs: list[dict[str, str]] = []
        self.fieldsets = 0
        self.legends = 0
        self.has_title = False
        self.has_description = False
        self.has_viewport = False
        self.has_lang = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}

        if "id" in values:
            self.ids.append(values["id"])
        if "aria-controls" in values:
            self.controls.append((tag, values["aria-controls"]))
        if values.get("role") == "tab":
            self.tabs.append(values)

        if tag == "html":
            self.has_lang = bool(values.get("lang"))
        elif tag == "a":
            self.links.append(values)
        elif tag == "button":
            self.buttons.append(values)
        elif tag == "img":
            self.images.append(values)
        elif tag == "label" and "for" in values:
            self.label_targets.append(values["for"])
        elif tag == "fieldset":
            self.fieldsets += 1
        elif tag == "legend":
            self.legends += 1
        elif tag == "title":
            self.has_title = True
        elif tag == "meta" and values.get("name") == "description":
            self.has_description = bool(values.get("content"))
        elif tag == "meta" and values.get("name") == "viewport":
            self.has_viewport = bool(values.get("content"))


def local_target(href: str) -> Path | None:
    parsed = urlparse(href)
    if parsed.scheme or href.startswith(("#", "mailto:", "tel:")):
        return None
    return ROOT / unquote(parsed.path)


def verify() -> tuple[list[str], list[str]]:
    text = HTML.read_text(encoding="utf-8")
    parser = SiteParser()
    parser.feed(text)

    errors: list[str] = []
    warnings: list[str] = []

    duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    if duplicates:
        errors.append(f"Duplicate IDs: {', '.join(duplicates)}")

    known_ids = set(parser.ids)

    for link in parser.links:
        href = link.get("href", "")
        if not href:
            errors.append("Anchor without href")
            continue
        if href.startswith("#") and href[1:] not in known_ids:
            errors.append(f"Missing fragment target: {href}")
        if href.startswith("tel:") and href == "tel:":
            errors.append("Empty tel: link")
        if href.startswith("mailto:") and href == "mailto:":
            errors.append("Empty mailto: link")
        target = local_target(href)
        if target and not target.exists():
            errors.append(f"Missing local file: {href}")
        if link.get("target") == "_blank":
            rel = set(link.get("rel", "").split())
            if not {"noreferrer", "noopener"} & rel:
                errors.append(f"Unsafe target=_blank link: {href}")

    for button in parser.buttons:
        if button.get("type") != "button":
            errors.append(f"Button missing type=button: {button}")

    for image in parser.images:
        if "alt" not in image:
            errors.append(f"Image missing alt text: {image.get('src', '(unknown)')}")

    for tag, controlled in parser.controls:
        if controlled not in known_ids:
            errors.append(f"<{tag}> aria-controls points at missing id: {controlled}")

    for label_for in parser.label_targets:
        if label_for not in known_ids:
            errors.append(f"<label for> points at missing id: {label_for}")

    selected = [tab for tab in parser.tabs if tab.get("aria-selected") == "true"]
    if parser.tabs and not selected:
        errors.append("Tab group has no aria-selected=true tab")

    if parser.fieldsets and parser.legends < parser.fieldsets:
        errors.append("A fieldset is missing its legend")

    if not parser.has_lang:
        errors.append("<html> missing lang attribute")
    if not parser.has_title:
        errors.append("Missing document title")
    if not parser.has_description:
        errors.append("Missing meta description")
    if not parser.has_viewport:
        errors.append("Missing viewport meta")

    for token in PLACEHOLDERS:
        count = text.count(token)
        if count:
            warnings.append(f"{token} still present {count}x - replace before sharing the URL")

    return errors, warnings


if __name__ == "__main__":
    found_errors, found_warnings = verify()
    for warning in found_warnings:
        print(f"WARN: {warning}")
    if found_errors:
        print("\n".join(f"FAIL: {error}" for error in found_errors))
        raise SystemExit(1)
    print("PASS: structure, links, control wiring, and metadata")
