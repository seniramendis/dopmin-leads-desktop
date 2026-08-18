"""JSON-lines stdout protocol between the Python Scrapling workers and the
Electron main process.

Every worker prints a stream of newline-delimited JSON messages:

    {"type": "progress", "payload": {...}}   — zero or more, live progress
    {"type": "result",   "payload": {...}}   — exactly one, always last

The Node bridge (client/src/main/pythonBridge.js) parses each line:
progress payloads are forwarded to the renderer unchanged (same shape the
old JS scraper produced), and the result payload resolves the IPC call.

Anything that isn't valid JSON (library logs, warnings) is ignored by the
bridge, so workers never have to silence third-party output on stdout.
"""

import json
import sys


def _emit(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


def emit_progress(payload):
    _emit({"type": "progress", "payload": payload})


def emit_result(payload):
    _emit({"type": "result", "payload": payload})
