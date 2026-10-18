import os
import re
import json
import urllib.request
import urllib.error
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)


# ============================================================
# PAGE ROUTE
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


# ============================================================
# GITHUB HELPERS
# ============================================================

def parse_github_url(repo_url):
    """
    Convert a GitHub repository URL or shorthand into owner and repository.

    Supports:
      - https://github.com/owner/repo
      - http://github.com/owner/repo
      - github.com/owner/repo
      - https://github.com/owner/repo.git
      - https://github.com/owner/repo/issues
      - owner/repo
    """
    if not repo_url or not isinstance(repo_url, str):
        return None, None

    clean = repo_url.strip()

    # Strip .git suffix
    if clean.endswith(".git"):
        clean = clean[:-4]

    # Strip trailing slashes
    clean = clean.rstrip("/")

    # Match standard GitHub URLs (with optional protocol, www, and subpaths)
    url_pattern = r"^(?:https?://)?(?:www\.)?github\.com/([^/]+)/([^/]+)(?:/(?:issues|pulls|tree|blob|commit)/?.*)?$"
    match = re.match(url_pattern, clean, re.IGNORECASE)
    if match:
        owner = match.group(1).strip()
        repo = match.group(2).strip()
        if owner and repo:
            return owner, repo

    # Match shorthand "owner/repo"
    shorthand_pattern = r"^([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)$"
    match_short = re.match(shorthand_pattern, clean)
    if match_short:
        return match_short.group(1).strip(), match_short.group(2).strip()

    return None, None


def github_request(url):
    """
    Make a request to the GitHub REST API with rate-limit and error handling.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "BUG-DUNGEON/1.0 (Developer Quest Platform)"
    }

    # Optional GitHub Personal Access Token to prevent 60 req/hr rate limits
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"

    request_obj = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(request_obj, timeout=15) as response:
            raw_data = response.read().decode("utf-8")
            return json.loads(raw_data)

    except urllib.error.HTTPError as error:
        error_message = ""
        try:
            error_body = error.read().decode("utf-8")
            error_json = json.loads(error_body)
            error_message = error_json.get("message", "")
        except Exception:
            pass

        if error.code == 404:
            raise Exception(
                f"GitHub could not find the requested repository. "
                f"{error_message or 'Repository not found or may be private.'}"
            )

        if error.code == 403:
            raise Exception(
                "GitHub rejected the request (HTTP 403). "
                "The GitHub API rate limit may have been reached. "
                "Try again later or configure a GITHUB_TOKEN."
            )

        raise Exception(
            f"GitHub returned HTTP {error.code}: {error_message or error.reason}"
        )

    except urllib.error.URLError as error:
        raise Exception(
            f"Could not connect to GitHub: {error.reason}"
        )

    except json.JSONDecodeError:
        raise Exception(
            "GitHub returned an invalid JSON response."
        )


# ============================================================
# RPG / QUEST SYSTEM ENGINE
# ============================================================

DUNGEON_REGIONS = [
    {"id": "forest", "name": "Glitch Forest", "node": "♧"},
    {"id": "swamp", "name": "Stack Swamp", "node": "◈"},
    {"id": "citadel", "name": "Commit Citadel", "node": "◇"},
    {"id": "wastes", "name": "Null Wastes", "node": "△"},
    {"id": "core", "name": "World Tree", "node": "✦"}
]

INVESTIGATION_STEPS = [
    {
        "id": 1,
        "title": "Decipher the Quest",
        "description": "Analyze the reported symptoms, error details, and clarify expected vs actual behavior."
    },
    {
        "id": 2,
        "title": "Scout the Territory",
        "description": "Locate relevant files, functions, routes, and modules mentioned in the repository."
    },
    {
        "id": 3,
        "title": "Expose the Root Cause",
        "description": "Trace execution paths, replicate conditions, and find why the unexpected state occurs."
    },
    {
        "id": 4,
        "title": "Forge the Solution",
        "description": "Design a clean, minimal code patch that resolves the issue without regressions."
    },
    {
        "id": 5,
        "title": "Purify & Verify",
        "description": "Verify the solution with reproduction checks, tests, or assertions to complete the quest."
    }
]


def assess_quest(issue_data, index=0):
    """
    Analyze issue properties to determine difficulty, XP reward, region, and investigation data.
    """
    labels = []
    for label in issue_data.get("labels", []):
        if isinstance(label, dict):
            name = label.get("name", "")
            if name:
                labels.append(name.strip())
        elif isinstance(label, str):
            labels.append(label.strip())

    title = (issue_data.get("title") or "").strip()
    body = (issue_data.get("body") or "").strip()
    labels_lower = [l.lower() for l in labels]
    title_lower = title.lower()

    # Difficulty calculation
    easy_signals = ["good first issue", "beginner", "documentation", "typo", "docs", "easy", "minor", "starter", "help wanted"]
    hard_signals = ["performance", "memory leak", "crash", "security", "vulnerability", "concurrency", "deadlock", "critical", "breaking", "segfault", "async"]

    if any(sig in labels_lower or sig in title_lower for sig in easy_signals):
        difficulty = "Easy"
        xp = 100
    elif any(sig in labels_lower or sig in title_lower for sig in hard_signals) or len(body) > 900:
        difficulty = "Hard"
        xp = 300
    else:
        difficulty = "Medium"
        xp = 200

    # Assign region
    region = DUNGEON_REGIONS[index % len(DUNGEON_REGIONS)]

    # Generate customized hints for this issue
    hints = [
        f"Read through the issue report carefully. Identify what the user observed versus what was intended.",
        f"Search the codebase for keywords or error messages mentioned in the report: '{title[:45]}'.",
        f"Trace the logic leading to the failure. Look for missing validation, unexpected nulls, or edge cases.",
        f"Focus the patch tightly on the root cause. Avoid broad rewrites when a targeted fix does the job.",
        f"Confirm the fix resolves the reported condition and doesn't break surrounding behavior."
    ]

    return {
        "difficulty": difficulty,
        "xp": xp,
        "labels": labels,
        "region": region["id"],
        "region_name": region["name"],
        "steps": INVESTIGATION_STEPS,
        "hints": hints
    }


# ============================================================
# QUEST API
# ============================================================

@app.route("/api/quests", methods=["POST"])
def get_quests():
    data = request.get_json(silent=True) or {}

    # Accept multiple possible parameter names for maximum flexibility
    repo_url = (
        data.get("repo_url") or
        data.get("repository_url") or
        data.get("url") or
        request.args.get("repo_url") or
        ""
    ).strip()

    # --------------------------------------------------------
    # Validate repository URL
    # --------------------------------------------------------
    if not repo_url:
        return jsonify({
            "error": "Repository URL is required."
        }), 400

    owner, repo = parse_github_url(repo_url)

    if not owner or not repo:
        return jsonify({
            "error": (
                "Invalid GitHub repository URL. "
                "Use https://github.com/owner/repository or owner/repository"
            )
        }), 400

    # --------------------------------------------------------
    # Request open GitHub issues
    # --------------------------------------------------------
    github_url = (
        f"https://api.github.com/repos/{owner}/{repo}/issues"
        "?state=open&per_page=30"
    )

    try:
        github_data = github_request(github_url)
    except Exception as error:
        return jsonify({
            "error": str(error)
        }), 502

    # --------------------------------------------------------
    # Convert GitHub issues into RPG Quests
    # --------------------------------------------------------
    quests = []

    for idx, item in enumerate(github_data):
        # Filter out pull requests
        if "pull_request" in item:
            continue

        assessment = assess_quest(item, index=len(quests))

        issue_number = item.get("number")
        title = item.get("title") or "Untitled quest"
        body = item.get("body") or "No description was provided for this issue."
        html_url = item.get("html_url") or f"https://github.com/{owner}/{repo}/issues/{issue_number}"

        quest_obj = {
            "id": f"issue-{issue_number}",
            "number": issue_number,
            "title": title,
            "body": body,
            "labels": assessment["labels"],
            "difficulty": assessment["difficulty"],
            "xp": assessment["xp"],
            "region": assessment["region"],
            "region_name": assessment["region_name"],
            "steps": assessment["steps"],
            "hints": assessment["hints"],
            "state": item.get("state", "open"),
            "url": html_url,
            "html_url": html_url,
            "author": item.get("user", {}).get("login", "Unknown adventurer"),
            "comments": item.get("comments", 0)
        }

        quests.append(quest_obj)

    # --------------------------------------------------------
    # Quest briefing from NYX
    # --------------------------------------------------------
    quest_count = len(quests)

    if quest_count == 0:
        briefing = (
            f"The dungeon entrance is quiet. "
            f"No open issues were found in {owner}/{repo}."
        )
    elif quest_count == 1:
        briefing = (
            f"The dungeon gates have opened! "
            f"I found 1 active quest in {owner}/{repo}. "
            f"Select it to begin your investigation."
        )
    else:
        briefing = (
            f"The dungeon gates have opened! "
            f"I detected {quest_count} active quests in {owner}/{repo}. "
            f"Select a quest and consult NYX to begin."
        )

    # Return both "issues" and "quests" keys to support any frontend convention
    return jsonify({
        "quests": quests,
        "issues": quests,
        "briefing": briefing,
        "repository": {
            "owner": owner,
            "name": repo,
            "full_name": f"{owner}/{repo}",
            "url": f"https://github.com/{owner}/{repo}"
        }
    })


# ============================================================
# NYX — EXPLAIN QUEST
# ============================================================

@app.route("/api/explain", methods=["POST"])
def explain_quest():
    data = request.get_json(silent=True) or {}

    quest = data.get("quest") or data.get("issue") or {}
    title = quest.get("title") or "this issue"
    body = (quest.get("body") or "").strip()
    number = quest.get("number") or "?"
    difficulty = quest.get("difficulty") or "Medium"
    labels = quest.get("labels") or []

    if not title:
        return jsonify({
            "error": "Quest information is required."
        }), 400

    # Detect enemy archetype from title and labels
    text_sample = f"{title} {' '.join(labels)}".lower()
    if any(k in text_sample for k in ["null", "undefined", "none", "nil"]):
        archetype = "NULL POINTER SPECTER"
    elif any(k in text_sample for k in ["async", "promise", "timeout", "race", "await"]):
        archetype = "ASYNC CHRONO-WRAITH"
    elif any(k in text_sample for k in ["syntax", "parse", "indent", "format"]):
        archetype = "PARSER GREMLIN"
    elif any(k in text_sample for k in ["memory", "leak", "overflow", "oom"]):
        archetype = "HEAP LEVIATHAN"
    elif any(k in text_sample for k in ["security", "auth", "token", "permission"]):
        archetype = "CIPHER PHANTOM"
    elif any(k in text_sample for k in ["css", "style", "ui", "render", "layout"]):
        archetype = "PIXEL SHAPESHIFTER"
    else:
        archetype = "ANOMALY GOLEM"

    # Build RPG Dungeon dossier
    summary = body[:650] if body else "No detailed description was recorded by the quest poster."

    explanation = (
        f"**NYX ARCHIVE REPORT // QUEST #{number}: {title}**\n\n"
        f"⚔ **Entity Classification:** `{archetype}` (Threat Level: `{difficulty.upper()}`)\n\n"
        f"📜 **Report Summary:**\n"
        f"{summary}\n\n"
        f"🎯 **Investigation Directive:**\n"
        f"1. Pinpoint the reproduction steps or trigger condition.\n"
        f"2. Inspect the relevant module and verify state assumptions.\n"
        f"3. Apply a surgical fix and verify with tests before claiming victory."
    )

    return jsonify({
        "explanation": explanation,
        "companion": "NYX",
        "archetype": archetype
    })


# ============================================================
# NYX — HINT ENGINE
# ============================================================

@app.route("/api/hint", methods=["POST"])
def give_hint():
    data = request.get_json(silent=True) or {}

    quest = data.get("quest") or data.get("issue") or {}
    title = quest.get("title") or "this quest"
    body = (quest.get("body") or "").strip()
    step_index = data.get("step_index", 0)

    try:
        step_index = int(step_index)
    except (ValueError, TypeError):
        step_index = 0

    # Step-specific guidance tailored to the developer's journey
    step_tactics = [
        # Step 0: Understand
        f"**Step 1 / Decode the Quest:** Focus on isolating the observed error. What input or environment triggered it? Compare actual results against expected behavior.",
        # Step 1: Scout
        f"**Step 2 / Scout the Territory:** Grep the repository for terms from '{title[:40]}'. Search for relevant filenames, function signatures, or route handlers.",
        # Step 2: Root cause
        f"**Step 3 / Expose the Root Cause:** Trace execution right before the anomaly occurs. Check for unexpected null/undefined variables, off-by-one bounds, or unhandled exceptions.",
        # Step 3: Forge fix
        f"**Step 4 / Forge the Solution:** Implement the smallest clean patch that addresses the defect. Avoid scope creep — keep your changes laser-focused on the root cause.",
        # Step 4: Verify
        f"**Step 5 / Purify & Verify:** Re-run reproduction steps or write an automated unit test to ensure the bug is vanquished and no regressions were introduced."
    ]

    selected_tactic = step_tactics[min(max(step_index, 0), len(step_tactics) - 1)]

    # Check for extractable clues (e.g. file paths, code mentions)
    clues = []
    file_matches = re.findall(r"[\w./-]+\.(?:py|js|ts|jsx|tsx|html|css|json|go|rs|java|c|cpp|rb)", body)
    if file_matches:
        clues.append(f"Mentioned files: `{', '.join(set(file_matches[:3]))}`")

    error_matches = re.findall(r"(\w*(?:Error|Exception|Failed|Crash|Panic)\w*)", body)
    if error_matches:
        clues.append(f"Detected error tokens: `{', '.join(set(error_matches[:3]))}`")

    hint = f"🤖 **NYX Tactical Transmission:**\n\n{selected_tactic}"
    if clues:
        hint += f"\n\n🔍 **Scouted Clues from Dungeon Log:**\n- " + "\n- ".join(clues)

    return jsonify({
        "hint": hint,
        "step_index": step_index,
        "companion": "NYX"
    })


# ============================================================
# START FLASK
# ============================================================

if __name__ == "__main__":
    app.run(
        debug=True,
        port=5000
    )