"""CLI entry for the $0 website audit, spawned by Electron.

Usage:
    python3 audit_cli.py "<url>"

Prints exactly one {"type": "result"} line (see protocol.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from protocol import emit_result  # noqa: E402
from audit import run_zero_cost_audit  # noqa: E402


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        emit_result({"hasWebsite": False, "score": 0, "issues": ["No website present"], "checks": {}})
        return 1

    try:
        result = run_zero_cost_audit(sys.argv[1])
    except Exception as error:
        result = {"hasWebsite": True, "score": 0, "issues": [f"Audit failed: {error}"], "checks": {}}

    emit_result(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
