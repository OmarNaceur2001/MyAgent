import asyncio

from myagent_agent.store import Store
from myagent_agent.timer import PomodoroConfig, TimerService


def test_pomodoro_cycle(tmp_path):
    async def scenario():
        sent = []
        fourth_phase_done = asyncio.Event()

        async def emit(e):
            sent.append(e)
            if e["type"] == "timer.done":
                completed = sum(1 for item in sent if item["type"] == "timer.done")
                if completed >= 4:
                    fourth_phase_done.set()

        store = Store(tmp_path / "t.db")
        svc = TimerService(emit, store)
        # tiny durations (rounded up to 1s each), long break after 2 focus sessions
        await svc.start_pomodoro(PomodoroConfig(focus_min=0.01, short_min=0.005, long_min=0.005, cycles_before_long=2))
        # Wait for the actual fourth transition instead of assuming Windows
        # scheduling will finish four one-second phases within a fixed sleep.
        await asyncio.wait_for(fourth_phase_done.wait(), timeout=12)
        await asyncio.sleep(0.05)  # let the phase transition finish bookkeeping
        await svc.stop()
        kinds = [e["payload"]["kind"] for e in sent if e["type"] == "timer.done"]
        assert kinds[:4] == ["focus", "short_break", "focus", "long_break"]
        assert store.stats()["sessions_today"] >= 2
        assert store.stats()["coins"] >= 20

    asyncio.run(scenario())


def test_pause_resume(tmp_path):
    async def scenario():
        async def emit(_):
            pass

        svc = TimerService(emit, Store(tmp_path / "t.db"))
        await svc.start_timer(1)
        await svc.pause()
        assert svc.current.status == "paused" and svc.current.ends_at is None
        left = svc.remaining()
        await asyncio.sleep(1.1)
        assert svc.remaining() == left  # paused time doesn't count
        await svc.resume()
        assert svc.current.status == "running"
        await svc.stop()
        assert svc.current is None

    asyncio.run(scenario())
