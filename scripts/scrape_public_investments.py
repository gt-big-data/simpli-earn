from __future__ import annotations

import argparse
import csv
import html as html_lib
import re
import time
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

import certifi
import pdfplumber
import requests
import xml.etree.ElementTree as ET


USER_AGENT = "simpli-earn-public-disclosure-scraper/0.1 (publicly available filings; respectful rate limits)"


@dataclass(frozen=True)
class InvestmentRow:
    source: str
    filer_name: str
    filer_title: str
    agency_or_office: str
    report_type: str
    report_date: str
    pdf_url: str
    pdf_path: str
    investment_kind: str  # "asset" | "transaction" | "unknown"
    investment_line: str
    transaction_date: str
    transaction_type: str
    amount_range: str
    raw_excerpt: str


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def _sleep(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)


def _download(session: requests.Session, url: str, dest: Path, *, min_delay_s: float) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    tmp = dest.with_suffix(dest.suffix + ".part")
    with session.get(url, stream=True, timeout=120, verify=certifi.where()) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    tmp.replace(dest)
    _sleep(min_delay_s)
    return dest


def _pdf_text(path: Path, *, max_pages: int = 25) -> str:
    parts: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages[:max_pages]:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
    return "\n".join(parts)


def _extract_section(text: str, start_re: re.Pattern[str], end_re: re.Pattern[str]) -> str:
    m_start = start_re.search(text)
    if not m_start:
        return ""
    tail = text[m_start.end() :]
    m_end = end_re.search(tail)
    if not m_end:
        return tail.strip()
    return tail[: m_end.start()].strip()


_DATE_RE = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b")
_MONEY_RANGE_RE = re.compile(r"\$\s*\d[\d,]*\s*-\s*\$?\s*\d[\d,]*")

def _parse_mmddyyyy(s: str) -> Optional[date]:
    try:
        return datetime.strptime(s.strip(), "%m/%d/%Y").date()
    except Exception:
        return None


def _parse_docdate_iso(s: str) -> Optional[date]:
    # Example: "2026-01-21T04:31:18"
    try:
        return datetime.strptime(s.strip()[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _parse_yyyy_mm_dd(s: str) -> Optional[date]:
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d").date()
    except Exception:
        return None


def _within_since(d: Optional[date], since: Optional[date]) -> bool:
    if since is None or d is None:
        return True
    return d >= since


def _transaction_rows_from_section(section: str) -> list[dict]:
    rows: list[dict] = []
    for line in (ln.strip() for ln in section.splitlines()):
        if not line:
            continue
        m_date = _DATE_RE.search(line)
        if not m_date:
            continue
        ll = line.lower()
        if not any(k in ll for k in ("purchase", "sale", "sold", "exchange", "redeem")):
            continue

        tx_type = ""
        for k in ("purchase", "sale", "sold", "exchange", "redeem"):
            if k in ll:
                tx_type = k
                break

        amount = ""
        # Prefer the $ amount range (not the leading row number).
        amts = re.findall(r"\$\s*\d[\d,]*(?:\s*-\s*\$?\s*\d[\d,]*)?", line)
        if amts:
            amount = amts[-1].strip()

        rows.append(
            {
                "transaction_date": m_date.group(1),
                "transaction_type": tx_type,
                "amount_range": amount,
                "investment_line": line,
            }
        )
    return rows


def _house_ptr_rows(text: str, *, since: Optional[date]) -> list[dict]:
    """
    Parse House Periodic Transaction Report (PTR) text.

    House PTRs often encode transaction type as a single letter (e.g., P/S) and include
    transaction date, notification date, and an amount range.
    """
    cleaned = (text or "").replace("\x00", "")
    out: list[dict] = []

    # Example extracted line (spacing varies):
    # "... [GS] S 12/18/2025 01/02/2026 $15,001 - $50,000"
    tx_re = re.compile(
        r"\b(?P<tx_code>P|S|E|X)\b\s+"
        r"(?P<tx_date>\d{1,2}/\d{1,2}/\d{4})\s+"
        r"(?P<notif_date>\d{1,2}/\d{1,2}/\d{4})\s+"
        r"(?P<amt>\$\s*\d[\d,]*\s*-\s*\$?\s*\d[\d,]*)",
        re.I,
    )

    code_map = {"P": "purchase", "S": "sale", "E": "exchange", "X": "other"}

    for raw_line in (ln.strip() for ln in cleaned.splitlines()):
        if not raw_line:
            continue
        m = tx_re.search(raw_line)
        if not m:
            continue

        tx_date = _parse_mmddyyyy(m.group("tx_date"))
        if not _within_since(tx_date, since):
            continue

        tx_code = m.group("tx_code").upper()
        out.append(
            {
                "transaction_date": m.group("tx_date"),
                "notification_date": m.group("notif_date"),
                "transaction_type": code_map.get(tx_code, tx_code),
                "amount_range": m.group("amt").strip(),
                "investment_line": raw_line,
            }
        )

    return out


def _asset_lines_from_section(section: str) -> list[str]:
    lines: list[str] = []
    for line in (ln.strip() for ln in section.splitlines()):
        if not line:
            continue
        if len(line) < 4:
            continue
        if line.lower() in ("assets", "uneared income", "unearned income"):
            continue
        lines.append(line)
    return lines


def _write_csv(rows: Iterable[InvestmentRow], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    def clean(v: object) -> str:
        s = "" if v is None else str(v)
        # Avoid NUL bytes (some PDFs extract with \x00), which makes CSV appear binary.
        return s.replace("\x00", "")

    rows_list = [{k: clean(v) for k, v in r.__dict__.items()} for r in rows]
    if not rows_list:
        out_path.write_text("", encoding="utf-8")
        return

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows_list[0].keys()))
        w.writeheader()
        w.writerows(rows_list)


def scrape_house_financial_disclosures(
    *,
    year: int,
    data_dir: Path,
    max_pdfs: int,
    min_delay_s: float,
    since: Optional[date],
) -> list[InvestmentRow]:
    """
    Scrapes House Clerk annual financial disclosure PDFs for a given year (bulk ZIP),
    extracts the "Assets and Unearned Income" section text, and emits one CSV row per line.
    """
    session = _make_session()

    zip_url = f"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
    zip_path = data_dir / "house_clerk" / str(year) / f"{year}FD.zip"
    _download(session, zip_url, zip_path, min_delay_s=min_delay_s)

    extract_dir = data_dir / "house_clerk" / str(year) / "pdfs"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(extract_dir)

    start_re = re.compile(r"\bassets\b.*\bunearned\b", re.I)
    end_re = re.compile(r"\bliabilit(?:y|ies)\b", re.I)

    out: list[InvestmentRow] = []
    # House Clerk ZIPs vary by year. Some years include PDFs directly; some include an XML index of DocIDs.
    pdf_paths = sorted([p for p in extract_dir.rglob("*.pdf")])
    if pdf_paths:
        if max_pdfs > 0:
            pdf_paths = pdf_paths[:max_pdfs]

        for pdf_path in pdf_paths:
            text = _pdf_text(pdf_path)
            section = _extract_section(text, start_re, end_re)
            asset_lines = _asset_lines_from_section(section) if section else []

            filer = ""
            m_name = re.search(r"Filer(?:'s)?\s+Name[:\s]+(.+)", text, re.I)
            if m_name:
                filer = m_name.group(1).strip()

            for line in asset_lines:
                out.append(
                    InvestmentRow(
                        source="house_clerk",
                        filer_name=filer,
                        filer_title="",
                        agency_or_office="U.S. House of Representatives",
                        report_type="House Financial Disclosure",
                        report_date=str(year),
                        pdf_url=zip_url,
                        pdf_path=str(pdf_path),
                        investment_kind="asset",
                        investment_line=line,
                        transaction_date="",
                        transaction_type="",
                        amount_range="",
                        raw_excerpt=(section or "")[:500],
                    )
                )
        return out

    # Fallback: parse XML index to download individual PDFs by DocID.
    xml_path = extract_dir / f"{year}FD.xml"
    if not xml_path.exists():
        return out

    try:
        root = ET.parse(xml_path).getroot()
    except ET.ParseError:
        return out

    downloaded = 0
    for member in root.findall("./Member"):
        if max_pdfs > 0 and downloaded >= max_pdfs:
            break

        prefix = (member.findtext("Prefix") or "").strip()
        first = (member.findtext("First") or "").strip()
        last = (member.findtext("Last") or "").strip()
        suffix = (member.findtext("Suffix") or "").strip()
        filing_type = (member.findtext("FilingType") or "").strip()
        state_dst = (member.findtext("StateDst") or "").strip()
        filing_date = (member.findtext("FilingDate") or "").strip()
        doc_id = (member.findtext("DocID") or "").strip()

        filing_date_d = _parse_mmddyyyy(filing_date)
        if not _within_since(filing_date_d, since):
            continue

        filer = " ".join([p for p in [prefix, first, last, suffix] if p]).strip()
        subdir = "ptr-pdfs" if filing_type.upper() == "P" else "financial-pdfs"
        pdf_url = f"https://disclosures-clerk.house.gov/public_disc/{subdir}/{year}/{doc_id}.pdf"

        pdf_dest = data_dir / "house_clerk" / str(year) / "pdfs_by_docid" / f"{doc_id}.pdf"
        try:
            _download(session, pdf_url, pdf_dest, min_delay_s=min_delay_s)
        except requests.HTTPError:
            continue

        downloaded += 1
        text = _pdf_text(pdf_dest)
        if filing_type.upper() == "P":
            # House PTRs: capture transaction rows (trades).
            tx_rows = _house_ptr_rows(text, since=since)
            for tx in tx_rows:
                out.append(
                    InvestmentRow(
                        source="house_clerk",
                        filer_name=filer,
                        filer_title="Member of Congress",
                        agency_or_office=state_dst or "U.S. House of Representatives",
                        report_type="House Periodic Transaction Report (PTR)",
                        report_date=filing_date or str(year),
                        pdf_url=pdf_url,
                        pdf_path=str(pdf_dest),
                        investment_kind="transaction",
                        investment_line=tx["investment_line"],
                        transaction_date=tx.get("transaction_date", ""),
                        transaction_type=tx.get("transaction_type", ""),
                        amount_range=tx.get("amount_range", ""),
                        raw_excerpt=(text or "")[:500],
                    )
                )
        else:
            section = _extract_section(text, start_re, end_re)
            asset_lines = _asset_lines_from_section(section) if section else []

            for line in asset_lines:
                out.append(
                    InvestmentRow(
                        source="house_clerk",
                        filer_name=filer,
                        filer_title="Member of Congress",
                        agency_or_office=state_dst or "U.S. House of Representatives",
                        report_type=f"House Financial Disclosure ({filing_type})" if filing_type else "House Financial Disclosure",
                        report_date=filing_date or str(year),
                        pdf_url=pdf_url,
                        pdf_path=str(pdf_dest),
                        investment_kind="asset",
                        investment_line=line,
                        transaction_date="",
                        transaction_type="",
                        amount_range="",
                        raw_excerpt=(section or "")[:500],
                    )
                )
    return out


def _oge_api_page(session: requests.Session, *, start: int, length: int, draw: int = 1) -> dict:
    url = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"
    params = {"draw": draw, "start": start, "length": length}
    r = session.get(url, params=params, timeout=120, verify=certifi.where())
    r.raise_for_status()
    return r.json()


def _first_href_from_html_anchor(html: str) -> str:
    html = html_lib.unescape(html or "")
    m = re.search(r"href=['\"]([^'\"]+)['\"]", html, flags=re.I)
    return m.group(1) if m else ""


def scrape_oge_department_head_disclosures(
    *,
    data_dir: Path,
    max_docs: int,
    min_delay_s: float,
    title_contains: str,
    agency_contains: str,
    since: Optional[date],
) -> list[InvestmentRow]:
    """
    Scrapes OGE's PAS disclosure index (includes 278e and 278-T PDFs), filters for department-head-ish roles,
    downloads PDFs, and emits rows from either the Assets section (278e) or transaction lines (278-T).
    """
    session = _make_session()
    page_size = 100
    start = 0
    collected: list[InvestmentRow] = []
    docs_downloaded = 0

    # Heuristics for sections commonly present in OGE 278e / 278-T PDFs.
    assets_start_re = re.compile(r"\bassets\b.*\bunearned\b", re.I)
    assets_end_re = re.compile(r"\bliabilit(?:y|ies)\b", re.I)

    # IMPORTANT: 278-T appears in the form header; don't use it as a start marker.
    # Anchor to the section heading to avoid truncating before the actual table.
    tx_start_re = re.compile(r"^\\s*transactions\\s*$", re.I | re.M)
    tx_end_re = re.compile(r"^\\s*(endnotes|summary of contents)\\s*$", re.I | re.M)

    title_contains_l = title_contains.lower().strip()
    agency_contains_l = agency_contains.lower().strip()

    stop_because_old = False
    while docs_downloaded < max_docs and not stop_because_old:
        payload = _oge_api_page(session, start=start, length=page_size, draw=1)
        data = payload.get("data") or []
        if not data:
            break

        page_min_date: Optional[date] = None
        for rec in data:
            if docs_downloaded >= max_docs:
                break

            name = (rec.get("name") or "").strip()
            agency = (rec.get("agency") or "").strip()
            title = (rec.get("title") or "").strip()
            doc_date = (rec.get("docDate") or "").strip()
            type_html = rec.get("type") or ""

            doc_date_d = _parse_docdate_iso(doc_date)
            if doc_date_d is not None:
                page_min_date = doc_date_d if page_min_date is None else min(page_min_date, doc_date_d)

            if title_contains_l and title_contains_l not in title.lower():
                continue
            if agency_contains_l and agency_contains_l not in agency.lower():
                continue
            # Default heuristic: if you're filtering on "Secretary", avoid matching subordinate roles.
            title_l = title.lower()
            if title_contains_l == "secretary" and any(
                bad in title_l for bad in ("assistant secretary", "deputy secretary", "under secretary")
            ):
                continue

            if not _within_since(doc_date_d, since):
                continue

            pdf_url = _first_href_from_html_anchor(type_html)
            if not pdf_url.lower().endswith(".pdf"):
                continue

            report_type = html_lib.unescape(type_html)
            report_type = re.sub(r"<[^>]+>", "", report_type).strip() or "OGE Disclosure"

            safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)[:80] or "unknown"
            safe_title = re.sub(r"[^a-zA-Z0-9._-]+", "_", title)[:80] or "unknown"
            out_dir = data_dir / "oge_pas"
            pdf_path = out_dir / f"{doc_date[:10]}__{safe_name}__{safe_title}.pdf"
            _download(session, pdf_url, pdf_path, min_delay_s=min_delay_s)
            docs_downloaded += 1

            text = _pdf_text(pdf_path)

            if "278" in report_type and ("transaction" in report_type.lower() or "278-t" in report_type.lower()):
                section = _extract_section(text, tx_start_re, tx_end_re) or text
                tx_rows = _transaction_rows_from_section(section)
                for tx in tx_rows:
                    tx_date_d = _parse_mmddyyyy(tx.get("transaction_date", ""))
                    if not _within_since(tx_date_d, since):
                        continue
                    collected.append(
                        InvestmentRow(
                            source="oge",
                            filer_name=name,
                            filer_title=title,
                            agency_or_office=agency,
                            report_type=report_type,
                            report_date=doc_date,
                            pdf_url=pdf_url,
                            pdf_path=str(pdf_path),
                            investment_kind="transaction",
                            investment_line=tx["investment_line"],
                            transaction_date=tx.get("transaction_date", ""),
                            transaction_type=tx.get("transaction_type", ""),
                            amount_range=tx.get("amount_range", ""),
                            raw_excerpt=(section or "")[:500],
                        )
                    )
            else:
                section = _extract_section(text, assets_start_re, assets_end_re)
                asset_lines = _asset_lines_from_section(section) if section else []
                for line in asset_lines:
                    collected.append(
                        InvestmentRow(
                            source="oge",
                            filer_name=name,
                            filer_title=title,
                            agency_or_office=agency,
                            report_type=report_type,
                            report_date=doc_date,
                            pdf_url=pdf_url,
                            pdf_path=str(pdf_path),
                            investment_kind="asset",
                            investment_line=line,
                            transaction_date="",
                            transaction_type="",
                            amount_range="",
                            raw_excerpt=(section or "")[:500],
                        )
                    )

        start += page_size
        # The API appears ordered by most recent docDate first; once we've paged into
        # filings older than our cutoff, stop scanning deeper.
        if since is not None and page_min_date is not None and page_min_date < since:
            stop_because_old = True

    return collected


def main() -> None:
    p = argparse.ArgumentParser(
        description="Scrape publicly available investment-related disclosures and write to CSV.",
    )
    p.add_argument("--out", default="data/public_disclosures/investments.csv", help="Output CSV path")
    p.add_argument("--data-dir", default="data/public_disclosures", help="Where to store downloaded PDFs/zips")
    p.add_argument("--min-delay-s", type=float, default=0.5, help="Delay between downloads (seconds)")
    p.add_argument(
        "--since",
        default="",
        help='Only include documents/transactions on/after this date (YYYY-MM-DD). Example: "2025-01-01".',
    )
    p.add_argument(
        "--since-days",
        type=int,
        default=730,
        help="If --since is not set, use (today - since_days). Default 730 (~2 years).",
    )

    p.add_argument("--house", action="store_true", help="Include House Clerk annual financial disclosures")
    p.add_argument("--house-year", type=int, default=2026, help="House Clerk ZIP year")
    p.add_argument("--house-max-pdfs", type=int, default=10, help="Max PDFs to parse from House ZIP (0=all)")

    p.add_argument("--oge", action="store_true", help="Include OGE PAS disclosures (executive branch)")
    p.add_argument("--oge-max-docs", type=int, default=25, help="Max OGE documents to download/parse")
    p.add_argument(
        "--oge-title-contains",
        default="Secretary",
        help='Filter OGE records where Title contains this (case-insensitive). Use "" for no filter.',
    )
    p.add_argument(
        "--oge-agency-contains",
        default="Department of",
        help='Filter OGE records where Agency contains this (case-insensitive). Use "" for no filter.',
    )

    args = p.parse_args()

    out_path = Path(args.out)
    data_dir = Path(args.data_dir)

    since: Optional[date]
    if str(args.since).strip():
        since = _parse_yyyy_mm_dd(str(args.since).strip())
    else:
        since = date.today() - timedelta(days=int(args.since_days))

    do_house = bool(args.house) or (not args.house and not args.oge)
    do_oge = bool(args.oge) or (not args.house and not args.oge)

    rows: list[InvestmentRow] = []

    if do_house:
        rows.extend(
            scrape_house_financial_disclosures(
                year=args.house_year,
                data_dir=data_dir,
                max_pdfs=args.house_max_pdfs,
                min_delay_s=args.min_delay_s,
                since=since,
            )
        )

    if do_oge:
        rows.extend(
            scrape_oge_department_head_disclosures(
                data_dir=data_dir,
                max_docs=args.oge_max_docs,
                min_delay_s=args.min_delay_s,
                title_contains=args.oge_title_contains,
                agency_contains=args.oge_agency_contains,
                since=since,
            )
        )

    _write_csv(rows, out_path)
    print(f"Wrote {len(rows)} rows to {out_path}")


if __name__ == "__main__":
    main()

