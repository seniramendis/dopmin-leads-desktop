"""Scrapling-based scraping workers for the Dopmin Leads desktop app.

Electron spawns one of the CLI entry points per job (maps_cli.py,
profile_cli.py, audit_cli.py) and talks to it over newline-delimited JSON
on stdout — see protocol.py.
"""
