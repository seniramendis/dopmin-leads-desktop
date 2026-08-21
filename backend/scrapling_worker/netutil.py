"""Port of client/src/main/network.js + the URL helpers from auditEngine.js.

DNS preflight ("do we even have internet?"), a network-error classifier that
tells "Google rate-limited us" apart from "the user's wifi dropped", and a
per-run connection health tracker that aborts the pipeline when too many
network-level failures happen back-to-back.
"""

import asyncio
import re
import socket
import time

OFFLINE_ERROR_PATTERN = re.compile(
    r"ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|"
    r"ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|"
    r"ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|"
    r"ERR_TIMED_OUT|net::ERR_|Temporary failure in name resolution|"
    r"Name or service not known|getaddrinfo failed",
    re.IGNORECASE,
)

# Playwright/Scrapling's own navigation & wait_selector timeouts don't carry
# a net::ERR_ code — they read like "Timeout 30000ms exceeded" or "...waiting
# for selector \"h1\" to be visible". These do NOT mean the internet
# connection dropped: the far more common cause is Google Maps soft-blocking
# or slow-loading the page for an automated browser, or local CPU
# contention from concurrent tabs, while the actual TCP connection is fine.
# Tracked separately from OFFLINE_ERROR_PATTERN so NetworkHealth can report
# an accurate cause instead of always saying "your internet dropped."
STALL_ERROR_PATTERN = re.compile(
    r"Timeout \d+ms exceeded|Timeout exceeded while waiting|"
    r"waiting for (selector|navigation|event)",
    re.IGNORECASE,
)


def is_offline_error(message=""):
    """True only for errors that indicate an actual dropped/unreachable
    connection (DNS failure, connection refused/reset, etc.) — not a plain
    navigation timeout."""
    return bool(OFFLINE_ERROR_PATTERN.search(str(message)))


def is_stall_error(message=""):
    """True for Playwright navigation/selector timeouts with no net::ERR_
    code — usually Google soft-blocking/throttling an automated browser or
    local resource contention, not a dropped connection."""
    return bool(STALL_ERROR_PATTERN.search(str(message)))


def is_network_error(message=""):
    """True for either category — kept for callers (e.g. maps_pipeline.py's
    catch-all exception handler) that just need "was this network/timeout
    related at all", not which kind."""
    return is_offline_error(message) or is_stall_error(message)


async def check_internet_connection(timeout=5.0):
    """Resolves a well-known hostname to confirm the machine has a working
    connection. Much cheaper than letting a full page navigation time out.
    NOTE: this only proves DNS + basic connectivity work — it says nothing
    about latency. Use measure_connection_quality() for an actual number;
    this stays as the fast up-front go/no-go gate."""
    loop = asyncio.get_running_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, socket.getaddrinfo, "google.com", 443),
            timeout,
        )
        return True
    except Exception:
        return False


def _tcp_connect_ms(host, port, timeout):
    """Raw TCP handshake time to `host:port`, in milliseconds. A plain
    socket connect is the real lower bound on "can we talk to Google fast"
    — DNS alone can succeed off a cached/ISP resolver even when the actual
    path to Google is slow or congested, which is what made the old
    check_internet_connection() a poor stand-in for connection quality."""
    start = time.monotonic()
    with socket.create_connection((host, port), timeout=timeout):
        pass
    return (time.monotonic() - start) * 1000


async def measure_connection_quality(timeout=5.0):
    """Real preflight connection-quality read: 3 quick TCP handshakes to
    Google (median taken, so one slow first-connect doesn't skew it),
    classified into good/fair/poor. This is what the "slow internet"
    message is now backed by, instead of firing off a single slow page
    render with no actual measurement behind it.

    Returns {"reachable": bool, "latency_ms": float | None,
    "quality": "good" | "fair" | "poor" | "unreachable"}.
    """
    loop = asyncio.get_running_loop()
    samples = []
    for _ in range(3):
        try:
            ms = await asyncio.wait_for(
                loop.run_in_executor(None, _tcp_connect_ms, "www.google.com", 443, timeout),
                timeout,
            )
            samples.append(ms)
        except Exception:
            continue

    if not samples:
        return {"reachable": False, "latency_ms": None, "quality": "unreachable"}

    samples.sort()
    latency_ms = samples[len(samples) // 2]

    if latency_ms < 250:
        quality = "good"
    elif latency_ms < 700:
        quality = "fair"
    else:
        quality = "poor"

    return {"reachable": True, "latency_ms": round(latency_ms, 1), "quality": quality}


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
    launching new work rather than grinding through a dead connection.

    The "slow connection" warning used to fire off a single navigation over
    the threshold — one slow page load (very possible if the browser's own
    concurrency is contending for local CPU) was enough to tell the user
    their *internet* was slow. It now requires several slow navigations in
    a row, and reports the actual measured milliseconds instead of a vague
    phrase, so the message reflects something real."""

    def __init__(
        self,
        on_progress=None,
        slow_threshold_ms=12_000,
        max_consecutive_failures=4,
        slow_streak_threshold=3,
        max_stall_cooldowns=0,
        cooldown_seconds=25,
    ):
        self.on_progress = on_progress
        self.slow_threshold_ms = slow_threshold_ms
        self.max_consecutive_failures = max_consecutive_failures
        self.slow_streak_threshold = slow_streak_threshold
        # How many times a "stalled" (Google throttling) failure streak gets
        # a pause-and-retry before NetworkHealth gives up and aborts for
        # real. A "offline" (actually dropped connection) streak still
        # aborts immediately — pausing wouldn't fix a dead connection.
        self.max_stall_cooldowns = max_stall_cooldowns
        self.cooldown_seconds = cooldown_seconds
        self.cooldowns_used = 0
        self.consecutive_failures = 0
        self.consecutive_slow = 0
        self.aborted = False
        self._warned_slow = False
        # Set when aborted=True — the real reason, for both the UI message
        # and the raw last exception (useful in stderr/logs even though the
        # UI doesn't currently surface it) so "aborted" always comes with an
        # accurate, specific explanation instead of a single hardcoded
        # string that assumed every abort was a dropped connection.
        self.abort_reason = None  # "offline" | "stalled"
        self.abort_message = None
        self.last_error_detail = None

    async def try_cooldown(self, reason_message):
        """Like the stall-cooldown branch of record_failure(), but callable
        directly for a hard "unusual traffic" block page instead of only for
        bare navigation timeouts. Returns True if a cooldown was spent (the
        caller should pause then retry the same sub-query), False if the
        cooldown budget is exhausted (the caller should give up for real).
        Cooldowns get longer each time — Google's soft-blocks don't reliably
        clear in a flat 25s, and hammering right back at the same interval
        just re-triggers the same block."""
        if self.cooldowns_used >= self.max_stall_cooldowns or self.aborted:
            return False

        self.cooldowns_used += 1
        wait_s = self.cooldown_seconds * self.cooldowns_used  # 25s, 50s, 75s...
        if self.on_progress:
            self.on_progress(
                {
                    "phase": "connection-slow",
                    "message": f"{reason_message} — pausing {wait_s}s before retrying…",
                }
            )
        await asyncio.sleep(wait_s)
        self.consecutive_failures = 0
        return True

    def record_success(self, nav_ms):
        self.consecutive_failures = 0

        if nav_ms > self.slow_threshold_ms:
            self.consecutive_slow += 1
        else:
            self.consecutive_slow = 0
            self._warned_slow = False

        if self.consecutive_slow >= self.slow_streak_threshold and not self._warned_slow:
            self._warned_slow = True
            if self.on_progress:
                self.on_progress(
                    {
                        "phase": "connection-slow",
                        "message": (
                            f"The last few pages took {int(nav_ms / 1000)}s+ to load — "
                            "this search may take longer than usual."
                        ),
                    }
                )

    async def record_failure(self, message):
        offline = is_offline_error(message)
        stalled = is_stall_error(message)
        if not offline and not stalled:
            return

        self.last_error_detail = str(message)
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.max_consecutive_failures and not self.aborted:
            # A stall streak (no net::ERR_ code) usually means Google is
            # temporarily throttling the automated browser rather than the
            # connection being dead — so back off for a bit and let the
            # caller keep going instead of aborting the whole search on the
            # first burst of throttling. Only offered a limited number of
            # times per run so a genuinely persistent block still gives up
            # instead of looping forever.
            if stalled and await self.try_cooldown("Google Maps looks like it's throttling this search"):
                return

            self.aborted = True

            if offline:
                self.abort_reason = "offline"
                self.abort_message = "Lost the internet connection. Stopping the search — please try again."
            else:
                # Repeated bare navigation/selector timeouts with no actual
                # net::ERR_ code almost always mean Google is throttling or
                # soft-blocking the automated browser (or the machine is
                # too loaded to keep up), not that the internet dropped —
                # so say that instead of blaming the connection.
                self.abort_reason = "stalled"
                self.abort_message = (
                    "Google Maps stopped responding to repeated page loads. This usually means Google is "
                    "temporarily rate-limiting or slowing down automated searches, not a dropped connection "
                    "— wait a few minutes and try again, or try a smaller result count."
                )

            if self.on_progress:
                self.on_progress(
                    {
                        "phase": "connection-lost",
                        "message": self.abort_message,
                        "reason": self.abort_reason,
                    }
                )
