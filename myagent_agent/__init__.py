'''Top‑level shim so that the test suite can import `myagent_agent`.
It simply re‑exports the real package located at `agent.myagent_agent`.
This avoids having to change every import statement in the existing tests.
''' 

import importlib
import sys
from pathlib import Path

# Resolve the real package location relative to this shim.
_repo_root = Path(__file__).resolve().parent.parent
_real_pkg_path = _repo_root / "agent" / "myagent_agent"
if str(_real_pkg_path) not in sys.path:
    sys.path.insert(0, str(_real_pkg_path))

# Load the actual package.
_real_pkg = importlib.import_module("myagent_agent")
real_pkg = _real_pkg

# Lazy attribute access for submodules (PEP 562).
def __getattr__(name: str):
    return getattr(_real_pkg, name)

# Export everything defined in the real package's __all__ if present.
__all__ = getattr(real_pkg, "__all__", [])
