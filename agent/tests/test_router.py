import pytest

from myagent_agent.router import parse_minutes, route


@pytest.mark.parametrize("text,minutes", [
    ("25 minutes", 25), ("an hour", 60), ("half an hour", 30), ("90 seconds", 1.5),
    ("1 hour 30 minutes", 90), ("ten mins", 10), ("pizza", None),
])
def test_parse_minutes(text, minutes):
    assert parse_minutes(text) == minutes


@pytest.mark.parametrize("text,name,args", [
    ("Hey MyAgent, start a 25-minute Pomodoro.", "pomodoro.start", {"focus_min": 25}),
    ("Hey MIMO, start a 25-minute Pomodoro.", "pomodoro.start", {"focus_min": 25}),  # legacy wake word
    ("start a pomodoro", "pomodoro.start", {}),
    ("let's do 50 minutes of studying", "pomodoro.start", {"focus_min": 50}),
    ("set a timer for 10 minutes", "timer.start", {"minutes": 10}),
    ("give me a five-minute break", "timer.start", {"minutes": 5, "label": "Break"}),
    ("pause my timer", "timer.pause", {}),
    ("resume", "timer.resume", {}),
    ("cancel the timer", "timer.stop", {}),
    ("how much time do I have left?", "timer.query", {}),
])
def test_route(text, name, args):
    intent = route(text)
    assert intent is not None and intent.name == name and intent.args == args


@pytest.mark.parametrize("text,name,args", [
    ("Hey MyAgent!", "greet", {}),
    ("hey my agent", "greet", {}),
    ("Hey MIMO!", "greet", {}),  # legacy wake word
    ("hello", "greet", {}),
    ("let's play tic-tac-toe", "game.open", {"game": "tictactoe"}),
    ("play rock paper scissors with me", "game.open", {"game": "rps"}),
    ("can we play the memory game", "game.open", {"game": "memory"}),
    ("I'm bored", "game.open", {"game": "tictactoe"}),
    ("open Google", "website.open", {"url": "https://www.google.com"}),
    ("go to YouTube", "website.open", {"url": "https://www.youtube.com"}),
    ("visit github.com", "website.open", {"url": "https://github.com"}),
    ("open website chatgpt.com", "website.open", {"url": "https://chatgpt.com"}),
    ("navigate to www.example.com/docs", "website.open", {"url": "https://www.example.com/docs"}),
    ("open https://example.com/docs?tab=readme", "website.open", {"url": "https://example.com/docs?tab=readme"}),
    ("play Bohemian Rhapsody", "music.play", {"query": "bohemian rhapsody"}),
    ("myagent, play some lofi hip hop on youtube", "music.play", {"query": "lofi hip hop"}),
    ("mimo, play some lofi hip hop on youtube", "music.play", {"query": "lofi hip hop"}),  # legacy wake word
])
def test_fun_routes(text, name, args):
    intent = route(text)
    assert intent is not None and intent.name == name and intent.args == args


@pytest.mark.parametrize("text", ["open chrome", "tell me a joke", "what's on my screen?"])
def test_unknown_goes_to_llm(text):
    assert route(text) is None


@pytest.mark.parametrize("text,app", [
    ("open Excel app", "excel"),
    ("i want you to open Excel app", "excel"),
    ("please open Microsoft Excel", "excel"),
    ("launch Word", "word"),
    ("open the PowerPoint application", "powerpoint"),
    ("start Notepad", "notepad"),
    ("open Calculator", "calculator"),
    ("open File Explorer", "file_explorer"),
])
def test_open_desktop_app_routes_directly(text, app):
    intent = route(text)
    assert intent is not None
    assert intent.name == "app.open"
    assert intent.args == {"app": app}


@pytest.mark.parametrize("text,url", [
    ("open facbook", "https://www.facebook.com"),
    ("open facebook", "https://www.facebook.com"),
    ("go to instagarm", "https://www.instagram.com"),
])
def test_common_website_typos_route_to_known_sites(text, url):
    intent = route(text)
    assert intent is not None
    assert intent.name == "website.open"
    assert intent.args == {"url": url}


def test_unknown_app_name_is_not_guessed():
    assert route("open randomdesktopthing") is None