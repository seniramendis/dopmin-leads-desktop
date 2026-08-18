"""Port of client/src/main/network.js + the URL helpers from auditEngine.js.

DNS preflight ("do we even have internet?"), a network-error classifier that
tells "Google rate-limited us" apart from "the user's wifi dropped", and a
per-run connection health tracker that aborts the pipeline when too many
network-level failures happen back-to-back.
"""

import asyncio
import re
import socket

NETWORK_ERROR_PATTERN = re.compile(
    r"ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|"
    r"ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|"
    r"ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|"
    r"ERR_TIMED_OUT|net::ERR_|Temporary failure in name resolution|"
    r"Name or service not known|getaddrinfo failed",
    re.IGNORECASE,
)


def is_network_error(message=""):
    return bool(NETWORK_ERROR_PATTERN.search(str(message)))


async def check_internet_connection(timeout=5.0):
    """Resolves a well-known hostname to confirm the machine has a working
    connection. Much cheaper than letting a full page navigation time out."""
    loop = asyncio.get_running_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, socket.getaddrinfo, "google.com", 443),
            timeout,
        )
        return True
    except Exception:
        return False


def domain_is_alive(hostname):
    """Cheapest possible "is this domain even alive?" check — no HTTP round
    trip needed."""
    if not hostname:
        return False
    try:
        socket.getaddrinfo(hostname, None)
        return True
    except Exception:
        return False


def normalize_url(url):
    trimmed = (url or "").strip()
    if not trimmed:
        return ""
    return trimmed if re.match(r"^https?://", trimmed, re.I) else f"https://{trimmed}"


def hostname_of(url):
    try:
        from urllib.parse import urlparse

        return urlparse(url).hostname or ""
    except Exception:
        return ""


class ConnectionLostError(Exception):
    def __init__(self):
        super().__init__(
            "Your internet connection dropped mid-search. Please check your connection and try again."
        )
        self.name = "ConnectionLostError"


class NetworkHealth:
    """Tracks connection quality across a single scrape run. Every navigation
    reports in via record_success/record_failure; once too many *network*
    failures happen back-to-back, `aborted` flips True and every loop stops
    launching new work rather than grinding through a dead connection."""

    def __init__(self, on_progress=None, slow_threshold_ms=12_000, max_consecutive_failures=4):
        self.on_progress = on_progress
        self.slow_threshold_ms = slow_threshold_ms
        self.max_consecutive_failures = max_consecutive_failures
        self.consecutive_failures = 0
        self.aborted = False
        self._warned_slow = False

    def record_success(self, nav_ms):
        self.consecutive_failures = 0
        if nav_ms > self.slow_threshold_ms and not self._warned_slow:
            self._warned_slow = True
            if self.on_progress:
                self.on_progress(
                    {
                        "phase": "connection-slow",
                        "message": "Your internet connection looks slow — this search may take longer than usual.",
                    }
                )
        if nav_ms <= self.slow_threshold_ms:
            self._warned_slow = False

    def record_failure(self, message):
        if not is_network_error(message):
            return
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.max_consecutive_failures and not self.aborted:
            self.aborted = True
            if self.on_progress:
                self.on_progress(
                    {
                        "phase": "connection-lost",
                        "message": "Lost the internet connection. Stopping the search — please try again.",
                    }
                )
