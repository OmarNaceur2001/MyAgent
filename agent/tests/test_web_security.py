from myagent_agent.web_security import (
    AGENT_SUBPROTOCOL,
    AUTH_SUBPROTOCOL_PREFIX,
    is_valid_agent_session,
)


TOKEN = "a" * 64


def test_valid_app_protocol_and_matching_token_are_accepted():
    assert is_valid_agent_session(
        [AGENT_SUBPROTOCOL, f"{AUTH_SUBPROTOCOL_PREFIX}{TOKEN}"],
        TOKEN,
    )


def test_missing_token_is_rejected():
    assert not is_valid_agent_session([AGENT_SUBPROTOCOL], TOKEN)


def test_wrong_token_is_rejected():
    assert not is_valid_agent_session(
        [AGENT_SUBPROTOCOL, f"{AUTH_SUBPROTOCOL_PREFIX}{'b' * 64}"],
        TOKEN,
    )


def test_missing_app_protocol_is_rejected():
    assert not is_valid_agent_session([f"{AUTH_SUBPROTOCOL_PREFIX}{TOKEN}"], TOKEN)


def test_missing_or_weak_expected_token_fails_closed():
    assert not is_valid_agent_session([AGENT_SUBPROTOCOL, f"{AUTH_SUBPROTOCOL_PREFIX}{TOKEN}"], "")
    assert not is_valid_agent_session([AGENT_SUBPROTOCOL, f"{AUTH_SUBPROTOCOL_PREFIX}{TOKEN}"], "short")


def test_ambiguous_duplicate_auth_tokens_are_rejected():
    assert not is_valid_agent_session(
        [
            AGENT_SUBPROTOCOL,
            f"{AUTH_SUBPROTOCOL_PREFIX}{TOKEN}",
            f"{AUTH_SUBPROTOCOL_PREFIX}{'b' * 64}",
        ],
        TOKEN,
    )


def test_malformed_supplied_token_is_rejected():
    assert not is_valid_agent_session(
        [AGENT_SUBPROTOCOL, f"{AUTH_SUBPROTOCOL_PREFIX}not-a-valid-token!"],
        TOKEN,
    )
