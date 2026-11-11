"""Start the MyAgent agent with a private local-session token."""
import logging
import os
import re
import socket
import sys

import uvicorn

HOST, PORT = "127.0.0.1", 8765


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, PORT)) == 0


if __name__ == "__main__":
    token = os.environ.get("MYAGENT_LOCAL_TOKEN", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        print(
            "MyAgent requires a private local-session token. Start it from the Electron app, "
            "or set MYAGENT_LOCAL_TOKEN to a random value of at least 32 characters."
        )
        sys.exit(2)
    if port_in_use():
        print(
            "\nMyAgent's agent is already running (the app starts it for you).\n"
            "To restart it: quit MyAgent (right-click the floating MyAgent > Quit), or run\n"
            "  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8765).OwningProcess\n"
        )
        sys.exit(1)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    # 127.0.0.1 only: the agent must never be reachable from other machines.
    uvicorn.run("myagent_agent.server:app", host=HOST, port=PORT, log_level="info")
