"""Start the MIMO agent:  python run.py"""
import logging
import socket
import sys

import uvicorn

HOST, PORT = "127.0.0.1", 8765


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, PORT)) == 0


if __name__ == "__main__":
    if port_in_use():
        print(
            "\nMIMO's agent is already running (the app starts it for you).\n"
            "To restart it: quit MIMO (right-click the floating MIMO > Quit), or run\n"
            "  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8765).OwningProcess\n"
        )
        sys.exit(1)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    # 127.0.0.1 only: the agent must never be reachable from other machines.
    uvicorn.run("mimo_agent.server:app", host=HOST, port=PORT, log_level="info")
