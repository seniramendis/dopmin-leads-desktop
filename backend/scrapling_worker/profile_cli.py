"""CLI entry for the single-business deep profiler, spawned by Electron.

Usage:
    python3 profile_cli.py "<url>" ['["https://competitor1.com", ...]']

Same stdout protocol as maps_cli.py (see protocol.py).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from protocol import emit_progress, emit_result  # noqa: E402
from profiler import scrape_business_profile  # noqa: E402


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        emit_result({"success": False, "error": "Please provide a business website URL."})
        return 1

    url = sys.argv[1]
    competitor_urls = []
    if len(sys.argv) > 2:
        try:
            parsed = json.loads(sys.argv[2])
            if isinstance(parsed, list):
                competitor_urls = [str(u) for u in parsed if u]
        except (ValueError, TypeError):
            pass

    try:
        result = scrape_business_profile(url, {"competitorUrls": competitor_urls}, emit_progress)
    except Exception as error:
        result = {"success": False, "error": f"Profiler crashed: {error}"}

    emit_result(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
