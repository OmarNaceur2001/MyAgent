"""Authentication helpers for MyAgent's loopback WebSocket session."""

from __future__ import annotations

import hmac
import re

AGENT_SUBPROTOCOL = "myagent.v1"
AUTH_SUBPROTOCOL_PREFIX = "myagent-auth."
_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def is_valid_agent_session(offered_protocols: list[str], expected_token: str) -> bool:
    """Validate the app protocol and exactly one sufficiently strong session token."""
    if not isinstance(expected_token, str) or not _TOKEN_PATTERN.fullmatch(expected_token):
        return False
    if AGENT_SUBPROTOCOL not in offered_protocols:
        return False

    supplied = [
        item[len(AUTH_SUBPROTOCOL_PREFIX):]
        for item in offered_protocols
        if isinstance(item, str) and item.startswith(AUTH_SUBPROTOCOL_PREFIX)
    ]
    if len(supplied) != 1 or not _TOKEN_PATTERN.fullmatch(supplied[0]):
        return False
    return hmac.compare_digest(supplied[0], expected_token)
