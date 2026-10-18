# BUG//DUNGEON — Frontend

## Files
- `templates/index.html` — Flask/Jinja page structure
- `static/style.css` — responsive cyberpunk styling
- `static/app.js` — interaction, state, XP, and API integration

## Expected Flask API contract

The JavaScript currently expects these JSON endpoints. If your backend teammate uses different route names or response fields, update the `API` object and/or response normalization in `static/app.js`.

### `POST /api/quests`
Request:
```json
{"repo_url":"https://github.com/owner/repository"}
```
Response:
```json
{
  "briefing":"Investigate the repository's open issues.",
  "issues":[
    {
      "number":42,
      "title":"Example bug",
      "body":"Describe the issue here.",
      "labels":["bug","good first issue"],
      "state":"open",
      "html_url":"https://github.com/owner/repository/issues/42"
    }
  ]
}
```

### `POST /api/explain`
Request:
```json
{"repo_url":"https://github.com/owner/repository","issue_number":42,"issue":{"number":42,"title":"Example bug"}}
```
Response:
```json
{"explanation":"This issue means ..."}
```

### `POST /api/hint`
Same request shape as `/api/explain`, response:
```json
{"hint":"Start by checking ..."}
```

Both companion endpoints may return `{"message":"..."}` instead of `explanation` or `hint`.

## Run with Flask
Place these folders in your Flask project root. Ensure your Flask app renders the template using:
```python
from flask import Flask, render_template

app = Flask(__name__)

@app.get("/")
def index():
    return render_template("index.html")
```
Then run your app and open its local URL. The API routes must be implemented by your backend team; this frontend does not fabricate API responses. Until those routes exist, the UI will show actionable connection errors.

## Integration notes
- The browser sends JSON with `Content-Type: application/json`.
- Flask routes should parse requests with `request.get_json()` and return JSON using `jsonify(...)`.
- If frontend and backend are served by the same Flask app, same-origin requests work without CORS configuration.
- XP and progress currently live in browser memory and reset on page reload; persist them in a backend/database if the project needs durable progress.
- Use only repositories your app is authorized to access. Do not put GitHub tokens or API secrets in browser JavaScript.
