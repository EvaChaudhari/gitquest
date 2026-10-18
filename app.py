from flask import Flask, render_template, request, jsonify
import urllib.request
import urllib.error
import json
import re

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
    Convert a GitHub repository URL into owner and repository.

    Example:
        https://github.com/kelvi-baraiya/gitquest

    Returns:
        ("kelvi-baraiya", "gitquest")
    """

    pattern = r"^https://github\.com/([^/]+)/([^/]+)/?$"
    match = re.match(pattern, repo_url.strip())

    if not match:
        return None, None

    owner = match.group(1)
    repo = match.group(2)

    return owner, repo


def github_request(url):
    """
    Make a request to the GitHub REST API.
    """

    request_obj = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "BUG-DUNGEON/1.0"
        }
    )

    try:
        with urllib.request.urlopen(
            request_obj,
            timeout=15
        ) as response:

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
                f"{error_message or 'Repository not found.'}"
            )

        if error.code == 403:
            raise Exception(
                "GitHub rejected the request. "
                "The API rate limit may have been reached."
            )

        raise Exception(
            f"GitHub returned HTTP {error.code}. "
            f"{error_message}"
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
# QUEST API
# ============================================================

@app.route("/api/quests", methods=["POST"])
def get_quests():

    data = request.get_json(silent=True) or {}

    repo_url = data.get("repo_url", "").strip()

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
                "Use https://github.com/owner/repository"
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
    # Convert GitHub issues into BUG//DUNGEON quests
    # --------------------------------------------------------

    issues = []

    for issue in github_data:

        # GitHub's /issues endpoint also returns pull requests.
        # Pull requests contain a "pull_request" property.
        # We only want actual issues for the quest board.

        if "pull_request" in issue:
            continue

        # ----------------------------------------------------
        # Extract labels
        # ----------------------------------------------------

        labels = []

        for label in issue.get("labels", []):

            if isinstance(label, dict):

                name = label.get("name")

                if name:
                    labels.append(name)

            elif isinstance(label, str):

                labels.append(label)

        # ----------------------------------------------------
        # Create frontend-friendly issue object
        # ----------------------------------------------------

        issues.append({

            "number": issue.get("number"),

            "title": issue.get(
                "title",
                "Untitled quest"
            ),

            "body": issue.get("body") or (
                "No description was provided for this issue."
            ),

            "labels": labels,

            "state": issue.get(
                "state",
                "open"
            ),

            "url": issue.get(
                "html_url",
                ""
            )

        })

    # --------------------------------------------------------
    # Quest briefing
    # --------------------------------------------------------

    quest_count = len(issues)

    if quest_count == 0:

        briefing = (
            f"The dungeon entrance is quiet. "
            f"No open issues were found in {owner}/{repo}."
        )

    elif quest_count == 1:

        briefing = (
            f"The dungeon entrance is open. "
            f"I found 1 active quest in {owner}/{repo}. "
            f"Choose it and begin your investigation."
        )

    else:

        briefing = (
            f"The dungeon entrance is open. "
            f"I found {quest_count} active quests in "
            f"{owner}/{repo}. Choose a quest and begin "
            f"your investigation."
        )

    # --------------------------------------------------------
    # Return JSON to app.js
    # --------------------------------------------------------

    return jsonify({

        "issues": issues,

        "briefing": briefing

    })


# ============================================================
# NYX — EXPLAIN ISSUE
# ============================================================

@app.route("/api/explain", methods=["POST"])
def explain_issue():

    data = request.get_json(silent=True) or {}

    issue = data.get("issue") or {}

    title = issue.get(
        "title",
        "this issue"
    )

    body = issue.get(
        "body",
        ""
    )

    # --------------------------------------------------------
    # Validate issue
    # --------------------------------------------------------

    if not title:

        return jsonify({
            "error": "Issue information is required."
        }), 400

    # --------------------------------------------------------
    # Temporary explanation
    #
    # This is intentionally simple for now.
    # Later we can connect this endpoint to the project's
    # actual AI service.
    # --------------------------------------------------------

    description = body.strip()

    if description:

        shortened_description = description[:700]

        explanation = (
            f"NYX has analyzed '{title}'. "
            f"The issue report describes the following problem: "
            f"{shortened_description}"
        )

    else:

        explanation = (
            f"NYX has analyzed '{title}', but the issue does "
            f"not contain a detailed description. "
            f"Start by examining the affected code and reproducing "
            f"the reported behavior."
        )

    return jsonify({

        "explanation": explanation

    })


# ============================================================
# NYX — GIVE HINT
# ============================================================

@app.route("/api/hint", methods=["POST"])
def hint_issue():

    data = request.get_json(silent=True) or {}

    issue = data.get("issue") or {}

    title = issue.get(
        "title",
        "this issue"
    )

    if not title:

        return jsonify({
            "error": "Issue information is required."
        }), 400

    # --------------------------------------------------------
    # Temporary investigation hint
    #
    # Later this can be replaced by an actual AI-generated
    # hint without changing the frontend API contract.
    # --------------------------------------------------------

    hint = (
        f"Start investigating '{title}'. "
        f"First identify the symptoms and expected behavior. "
        f"Then trace the problem toward its likely root cause "
        f"before deciding how to fix it."
    )

    return jsonify({

        "hint": hint

    })


# ============================================================
# START FLASK
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True
    ) 