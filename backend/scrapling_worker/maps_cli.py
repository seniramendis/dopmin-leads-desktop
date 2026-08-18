"""CLI entry for the Google Maps lead pipeline, spawned by Electron per job.

Usage:
    python3 maps_cli.py "<query>" [max_results] [mode]

Streams {"type": "progress"} lines during the run and prints exactly one
{"type": "result"} line at the end (see protocol.py). Always exits 0 for
handled failures (they arrive as {"success": false, ...} results); exits 1
only when the result line itself couldn't be produced.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from protocol import emit_progress, emit_result  # noqa: E402
from maps_pipeline import scrape_leads  # noqa: E402


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        emit_result({"success": False, "error": "No search query provided."})
        return 1

    query = sys.argv[1]
    try:
        max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    except ValueError:
        max_results = 20
    mode = sys.argv[3] if len(sys.argv) > 3 else ""

    try:
        result = asyncio.run(scrape_leads(query, max_results, {"mode": mode}, emit_progress))
    except Exception as error:
        result = {"success": False, "error": f"Scraper crashed: {error}"}

    emit_result(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
