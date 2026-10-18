# GitQuest — BUG//DUNGEON

A gamified developer quest platform that transforms GitHub issues into RPG dungeon boss fights.

## Project Structure
- `templates/index.html` — Flask/Jinja cyberpunk RPG UI layout (world map, mission briefing, investigation objectives, HUD)
- `static/style.css` — Responsive cyberpunk aesthetics, animations, and game cards
- `static/app.js` — Frontend game controller, NYX AI companion dialogue, XP progression, and badge engine
- `app.py` — Flask server and API endpoints

## Endpoints
- `POST /api/quests` — Scan GitHub repo and retrieve quests
- `POST /api/hint` — Request tactical hint from NYX
- `POST /api/explain` — Decrypt and explain the quest anomaly

## How to Run
```bash
python app.py
```
Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.
