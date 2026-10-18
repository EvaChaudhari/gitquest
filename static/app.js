/* =========================================================
   BUG DUNGEON — FRONTEND CONTROLLER
   static/app.js
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */

  const state = {
    repositoryUrl: "",
    repository: null,
    quests: [],
    selectedQuest: null,
    currentStep: 0,
    xp: 0,
    completed: 0,
    badges: [],
    scanned: false,
    loading: false
  };

  /* ---------------------------------------------------------
     DOM HELPERS
     --------------------------------------------------------- */

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getRepositoryUrl() {
    const input =
      $("#repository-url") ||
      $("#repo-url") ||
      $('input[type="url"]') ||
      $('input[placeholder*="github" i]');

    return input ? input.value.trim() : "";
  }

  function setRepositoryUrl(value) {
    const input =
      $("#repository-url") ||
      $("#repo-url") ||
      $('input[type="url"]') ||
      $('input[placeholder*="github" i]');

    if (input) {
      input.value = value || "";
    }
  }

  /* ---------------------------------------------------------
     NOTIFICATIONS
     --------------------------------------------------------- */

  function showMessage(message, type = "info") {
    let container = $("#toast-container");

    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style.position = "fixed";
      container.style.right = "24px";
      container.style.bottom = "24px";
      container.style.zIndex = "9999";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "10px";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toast.style.padding = "12px 16px";
    toast.style.border = "1px solid rgba(255,255,255,.15)";
    toast.style.borderRadius = "10px";
    toast.style.background = "rgba(18, 12, 31, .96)";
    toast.style.color = "#fff";
    toast.style.boxShadow = "0 10px 35px rgba(0,0,0,.35)";
    toast.style.maxWidth = "380px";
    toast.style.fontSize = "14px";

    if (type === "error") {
      toast.style.borderColor = "rgba(255, 100, 130, .55)";
    }

    if (type === "success") {
      toast.style.borderColor = "rgba(100, 255, 180, .55)";
    }

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all .25s ease";

      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /* ---------------------------------------------------------
     LOADING
     --------------------------------------------------------- */

  function setLoading(isLoading) {
    state.loading = isLoading;

    const buttons = $$(
      'button[type="submit"], button[data-action="scan"], #scan-repository, #scan-btn'
    );

    buttons.forEach((button) => {
      button.disabled = isLoading;

      if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = "Scanning...";
      } else if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    });
  }

  /* ---------------------------------------------------------
     API
     --------------------------------------------------------- */

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = {
        message: text
      };
    }

    if (!response.ok) {
      const errorMessage =
        data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`;

      throw new Error(errorMessage);
    }

    return data;
  }

  /* ---------------------------------------------------------
     REPOSITORY SCAN
     --------------------------------------------------------- */

  async function scanRepository(url) {
    const repositoryUrl = (url || getRepositoryUrl()).trim();

    if (!repositoryUrl) {
      showMessage("Please enter a GitHub repository URL.", "error");
      return;
    }

    if (
      !repositoryUrl.startsWith("https://github.com/") &&
      !repositoryUrl.startsWith("http://github.com/")
    ) {
      showMessage("Please enter a valid GitHub repository URL.", "error");
      return;
    }

    state.repositoryUrl = repositoryUrl;

    setLoading(true);

    try {
      /*
       * Backend contract:
       *
       * POST /api/quests
       *
       * {
       *   "repository_url": "https://github.com/user/repo"
       * }
       *
       * The backend should return an object containing an
       * issues/quests array.
       */

      const data = await apiRequest("/api/quests", {
        method: "POST",
        body: JSON.stringify({
          repository_url: repositoryUrl,
          repo_url: repositoryUrl,
          url: repositoryUrl
        })
      });

      const quests =
        data?.quests ||
        data?.issues ||
        data?.data?.quests ||
        data?.data?.issues ||
        [];

      state.quests = normalizeQuests(quests);

      state.repository =
        data?.repository ||
        data?.repo ||
        parseRepositoryUrl(repositoryUrl);

      state.scanned = true;

      if (state.quests.length === 0) {
        showMessage(
          "Repository scanned, but no quests/issues were found.",
          "info"
        );
      } else {
        showMessage(
          `${state.quests.length} quest${state.quests.length === 1 ? "" : "s"} discovered!`,
          "success"
        );
      }

      renderAll();
    } catch (error) {
      console.error("Repository scan failed:", error);

      showMessage(
        error.message ||
        "Repository scan failed. Check that the repository is public and the backend is running.",
        "error"
      );

      showScanError(error.message);
    } finally {
      setLoading(false);
    }
  }

  function parseRepositoryUrl(url) {
    try {
      const parsed = new URL(url);

      const parts = parsed.pathname
        .split("/")
        .filter(Boolean);

      return {
        owner: parts[0] || "",
        name: (parts[1] || "").replace(/\.git$/, ""),
        url
      };
    } catch {
      return {
        owner: "",
        name: "",
        url
      };
    }
  }

  /* ---------------------------------------------------------
     QUEST NORMALIZATION
     --------------------------------------------------------- */

  function normalizeQuests(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item, index) => {
      const labels = Array.isArray(item.labels)
        ? item.labels.map((label) => {
          if (typeof label === "string") return label;
          return label?.name || "";
        })
        : [];

      const title =
        item.title ||
        item.name ||
        `Unknown Quest ${index + 1}`;

      const body =
        item.body ||
        item.description ||
        item.content ||
        "No description provided.";

      const number =
        item.number ??
        item.issue_number ??
        item.id ??
        index + 1;

      const difficulty =
        item.difficulty ||
        inferDifficulty(item, labels);

      return {
        ...item,

        id: item.id ?? `quest-${index}`,
        number,
        title,
        body,
        description: body,
        labels,
        difficulty,

        status:
          item.status ||
          "available",

        xp:
          Number(item.xp) ||
          calculateXp(difficulty),

        hints:
          Array.isArray(item.hints)
            ? item.hints
            : [],

        steps:
          Array.isArray(item.steps)
            ? item.steps
            : createDefaultSteps(item, title),

        url:
          item.html_url ||
          item.url ||
          ""
      };
    });
  }

  function inferDifficulty(item, labels = []) {
    const text = [
      item.title,
      item.body,
      ...labels
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (
      text.includes("critical") ||
      text.includes("security") ||
      text.includes("complex") ||
      text.includes("architecture")
    ) {
      return "hard";
    }

    if (
      text.includes("medium") ||
      text.includes("feature") ||
      text.includes("refactor")
    ) {
      return "medium";
    }

    return "easy";
  }

  function calculateXp(difficulty) {
    switch (String(difficulty).toLowerCase()) {
      case "hard":
      case "legendary":
        return 300;

      case "medium":
        return 200;

      default:
        return 100;
    }
  }

  function createDefaultSteps(issue, title) {
    return [
      {
        title: "Read the quest",
        description:
          issue.body ||
          `Study the issue "${title}" and understand what is being requested.`
      },
      {
        title: "Locate the source",
        description:
          "Find the relevant file, function, component, or module responsible for the behavior."
      },
      {
        title: "Investigate the cause",
        description:
          "Trace the existing behavior and determine why the issue occurs."
      },
      {
        title: "Plan the fix",
        description:
          "Choose a small, focused change that addresses the root cause."
      },
      {
        title: "Verify the solution",
        description:
          "Run the appropriate tests or manually verify that the expected behavior works."
      }
    ];
  }

  /* ---------------------------------------------------------
     RENDERING
     --------------------------------------------------------- */

  function renderAll() {
    renderQuestList();
    renderSelectedQuest();
    updateStats();
    updateWorldState();
  }

  function findQuestContainer() {
    return (
      $("#quest-list") ||
      $("#quests") ||
      $(".quest-list") ||
      $('[data-region="quests"]')
    );
  }

  function renderQuestList() {
    const container = findQuestContainer();

    if (!container) return;

    if (!state.scanned) {
      container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⌘</div>
                    <h3>Dungeon unexplored</h3>
                    <p>Scan a GitHub repository to discover your quests.</p>
                </div>
            `;
      return;
    }

    if (state.quests.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">◇</div>
                    <h3>No quests found</h3>
                    <p>This repository did not return any open issues.</p>
                </div>
            `;
      return;
    }

    container.innerHTML = state.quests
      .map((quest, index) => {
        const selected =
          state.selectedQuest?.id === quest.id;

        const completed =
          quest.status === "completed";

        return `
                    <article
                        class="quest-card ${selected ? "selected" : ""} ${completed ? "completed" : ""
          }"
                        data-quest-index="${index}"
                        tabindex="0"
                        role="button"
                    >
                        <div class="quest-card-top">
                            <span class="quest-number">
                                #${escapeHtml(quest.number)}
                            </span>

                            <span class="quest-difficulty difficulty-${escapeHtml(
            String(quest.difficulty).toLowerCase()
          )}">
                                ${escapeHtml(quest.difficulty)}
                            </span>
                        </div>

                        <h3>${escapeHtml(quest.title)}</h3>

                        <p>
                            ${escapeHtml(
            truncate(stripMarkdown(quest.body), 150)
          )}
                        </p>

                        <div class="quest-card-bottom">
                            <span>${quest.xp} XP</span>

                            ${quest.labels.length
            ? `<span>${escapeHtml(
              quest.labels
                .slice(0, 2)
                .join(" · ")
            )}</span>`
            : ""
          }

                            ${completed
            ? `<span>✓ Completed</span>`
            : ""
          }
                        </div>
                    </article>
                `;
      })
      .join("");

    $$(".quest-card").forEach((card) => {
      const index = Number(card.dataset.questIndex);

      card.addEventListener("click", () => {
        selectQuest(index);
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectQuest(index);
        }
      });
    });
  }

  function renderSelectedQuest() {
    const container =
      $("#quest-detail") ||
      $("#quest-panel") ||
      $(".quest-detail") ||
      $('[data-region="quest-detail"]');

    if (!container) return;

    if (!state.selectedQuest) {
      container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚔</div>
                    <h3>Select a quest</h3>
                    <p>Choose an issue from the dungeon map to begin your investigation.</p>
                </div>
            `;

      return;
    }

    const quest = state.selectedQuest;

    const steps = quest.steps || [];

    container.innerHTML = `
            <div class="quest-detail-header">
                <div>
                    <span class="eyebrow">ACTIVE QUEST</span>
                    <h2>${escapeHtml(quest.title)}</h2>
                </div>

                <div class="quest-xp">
                    +${quest.xp} XP
                </div>
            </div>

            <div class="quest-description">
                ${formatMarkdownLite(quest.body)}
            </div>

            ${quest.url
        ? `
                        <a
                            class="github-link"
                            href="${escapeHtml(quest.url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open GitHub issue ↗
                        </a>
                    `
        : ""
      }

            <div class="investigation-section">
                <div class="section-heading">
                    <span>INVESTIGATION</span>
                    <span>
                        ${Math.min(
        state.currentStep + 1,
        steps.length
      )}/${steps.length}
                    </span>
                </div>

                <div class="investigation-steps">
                    ${steps
        .map((step, index) => {
          const isCurrent =
            index === state.currentStep;

          const isComplete =
            index < state.currentStep ||
            quest.status === "completed";

          return `
                                <button
                                    type="button"
                                    class="investigation-step ${isCurrent ? "current" : ""
            } ${isComplete ? "complete" : ""}"
                                    data-step-index="${index}"
                                >
                                    <span class="step-number">
                                        ${isComplete
              ? "✓"
              : index + 1
            }
                                    </span>

                                    <span class="step-content">
                                        <strong>
                                            ${escapeHtml(
              step.title ||
              `Step ${index + 1}`
            )}
                                        </strong>

                                        <small>
                                            ${escapeHtml(
              step.description ||
              ""
            )}
                                        </small>
                                    </span>
                                </button>
                            `;
        })
        .join("")}
                </div>
            </div>

            <div class="quest-actions">
                ${state.currentStep > 0
        ? `
                            <button
                                type="button"
                                class="secondary-button"
                                id="previous-step"
                            >
                                ← Previous
                            </button>
                        `
        : ""
      }

                ${state.currentStep < steps.length - 1
        ? `
                            <button
                                type="button"
                                class="primary-button"
                                id="next-step"
                            >
                                Continue →
                            </button>
                        `
        : `
                            <button
                                type="button"
                                class="primary-button"
                                id="complete-quest"
                            >
                                Complete quest ✓
                            </button>
                        `
      }

                <button
                    type="button"
                    class="secondary-button"
                    id="request-hint"
                >
                    Ask NYX for a hint
                </button>
            </div>

            <div id="nyx-response" class="nyx-response" hidden></div>
        `;

    $$(".investigation-step").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentStep = Number(
          button.dataset.stepIndex
        );

        renderSelectedQuest();
        renderQuestList();
      });
    });

    const previousButton = $("#previous-step");

    if (previousButton) {
      previousButton.addEventListener("click", () => {
        if (state.currentStep > 0) {
          state.currentStep -= 1;
          renderSelectedQuest();
          renderQuestList();
        }
      });
    }

    const nextButton = $("#next-step");

    if (nextButton) {
      nextButton.addEventListener("click", () => {
        if (state.currentStep < steps.length - 1) {
          state.currentStep += 1;
          renderSelectedQuest();
          renderQuestList();
        }
      });
    }

    const completeButton = $("#complete-quest");

    if (completeButton) {
      completeButton.addEventListener("click", () => {
        completeQuest();
      });
    }

    const hintButton = $("#request-hint");

    if (hintButton) {
      hintButton.addEventListener("click", () => {
        requestHint();
      });
    }
  }

  /* ---------------------------------------------------------
     QUEST ACTIONS
     --------------------------------------------------------- */

  function selectQuest(index) {
    const quest = state.quests[index];

    if (!quest) return;

    state.selectedQuest = quest;

    state.currentStep = 0;

    renderAll();

    const detail =
      $("#quest-detail") ||
      $("#quest-panel") ||
      $(".quest-detail");

    if (detail) {
      detail.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }
  }

  function completeQuest() {
    if (!state.selectedQuest) return;

    const quest = state.selectedQuest;

    if (quest.status === "completed") {
      return;
    }

    quest.status = "completed";

    state.completed += 1;
    state.xp += Number(quest.xp) || 0;

    unlockBadges();

    showMessage(
      `Quest complete! +${quest.xp} XP`,
      "success"
    );

    renderAll();
  }

  /* ---------------------------------------------------------
     BADGES
     --------------------------------------------------------- */

  function unlockBadges() {
    const badgesToUnlock = [];

    if (
      state.completed >= 1 &&
      !state.badges.includes("FIRST_BLOOD")
    ) {
      badgesToUnlock.push("FIRST_BLOOD");
    }

    if (
      state.completed >= 3 &&
      !state.badges.includes("DUNGEON_CRAWLER")
    ) {
      badgesToUnlock.push("DUNGEON_CRAWLER");
    }

    if (
      state.completed >= 5 &&
      !state.badges.includes("BUG_HUNTER")
    ) {
      badgesToUnlock.push("BUG_HUNTER");
    }

    badgesToUnlock.forEach((badge) => {
      state.badges.push(badge);

      const names = {
        FIRST_BLOOD: "First Blood",
        DUNGEON_CRAWLER: "Dungeon Crawler",
        BUG_HUNTER: "Bug Hunter"
      };

      showMessage(
        `Badge unlocked: ${names[badge]}`,
        "success"
      );
    });
  }

  /* ---------------------------------------------------------
     NYX HINTS
     --------------------------------------------------------- */

  async function requestHint() {
    if (!state.selectedQuest) {
      showMessage(
        "Select a quest before asking NYX for help.",
        "info"
      );
      return;
    }

    const quest = state.selectedQuest;

    const responseContainer = $("#nyx-response");

    if (responseContainer) {
      responseContainer.hidden = false;
      responseContainer.innerHTML = `
                <div class="nyx-loading">
                    NYX is analyzing the dungeon...
                </div>
            `;
    }

    try {
      /*
       * Backend contract:
       *
       * POST /api/hint
       *
       * {
       *   "quest": {...},
       *   "step": {...},
       *   "repository_url": "..."
       * }
       */

      const currentStep =
        quest.steps?.[state.currentStep] || null;

      const data = await apiRequest("/api/hint", {
        method: "POST",
        body: JSON.stringify({
          repository_url: state.repositoryUrl,
          quest,
          issue: quest,
          step: currentStep,
          step_index: state.currentStep
        })
      });

      const hint =
        data?.hint ||
        data?.message ||
        data?.response ||
        "NYX has no additional hint right now.";

      if (responseContainer) {
        responseContainer.hidden = false;

        responseContainer.innerHTML = `
                    <div class="nyx-header">
                        <span class="nyx-avatar">N</span>
                        <strong>NYX</strong>
                    </div>

                    <div class="nyx-message">
                        ${formatMarkdownLite(hint)}
                    </div>
                `;
      }
    } catch (error) {
      console.error("Hint request failed:", error);

      /*
       * If the backend does not yet provide /api/hint,
       * give the player a useful local hint instead of
       * leaving the interface broken.
       */

      const localHint = getLocalHint(
        quest,
        state.currentStep
      );

      if (responseContainer) {
        responseContainer.hidden = false;

        responseContainer.innerHTML = `
                    <div class="nyx-header">
                        <span class="nyx-avatar">N</span>
                        <strong>NYX</strong>
                    </div>

                    <div class="nyx-message">
                        ${formatMarkdownLite(localHint)}
                    </div>
                `;
      }
    }
  }

  function getLocalHint(quest, stepIndex) {
    if (Array.isArray(quest.hints) && quest.hints.length) {
      return (
        quest.hints[stepIndex] ||
        quest.hints[0]
      );
    }

    const step = quest.steps?.[stepIndex];

    if (!step) {
      return "Inspect the issue carefully and trace the behavior back to its source.";
    }

    const hints = [
      "Start with the issue description. Identify the expected behavior and compare it with what the application currently does.",
      "Search the repository for the function, route, component, or error message mentioned by the issue.",
      "Trace the relevant code path instead of changing the first suspicious line you find.",
      "Keep the fix focused. Change the smallest piece of code that addresses the root cause.",
      "Verify the behavior with a test or a manual reproduction before considering the quest complete."
    ];

    return hints[
      Math.min(stepIndex, hints.length - 1)
    ];
  }

  /* ---------------------------------------------------------
     NYX EXPLANATION
     --------------------------------------------------------- */

  async function requestExplanation() {
    if (!state.selectedQuest) {
      showMessage(
        "Select a quest first.",
        "info"
      );
      return;
    }

    const quest = state.selectedQuest;

    try {
      const data = await apiRequest("/api/explain", {
        method: "POST",
        body: JSON.stringify({
          repository_url: state.repositoryUrl,
          quest,
          issue: quest
        })
      });

      const explanation =
        data?.explanation ||
        data?.message ||
        data?.response;

      if (explanation) {
        showMessage(
          "NYX has prepared an explanation.",
          "success"
        );

        displayNyxMessage(explanation);
      }
    } catch (error) {
      console.error("Explanation request failed:", error);

      displayNyxMessage(
        `This quest asks you to investigate **${quest.title}**.\n\n` +
        `${stripMarkdown(quest.body)}`
      );
    }
  }

  function displayNyxMessage(message) {
    const container = $("#nyx-response");

    if (!container) return;

    container.hidden = false;

    container.innerHTML = `
            <div class="nyx-header">
                <span class="nyx-avatar">N</span>
                <strong>NYX</strong>
            </div>

            <div class="nyx-message">
                ${formatMarkdownLite(message)}
            </div>
        `;
  }

  /* ---------------------------------------------------------
     ERROR DISPLAY
     --------------------------------------------------------- */

  function showScanError(message) {
    const container = findQuestContainer();

    if (!container) return;

    container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">!</div>

                <h3>Repository scan failed</h3>

                <p>
                    ${escapeHtml(
      message ||
      "The server could not retrieve the repository."
    )}
                </p>

                <p class="error-help">
                    Make sure your Flask backend is running and that
                    <code>/api/quests</code> is available.
                </p>
            </div>
        `;
  }

  /* ---------------------------------------------------------
     STATS / HUD
     --------------------------------------------------------- */

  function updateStats() {
    const xpElements = [
      $("#xp"),
      $("#xp-value"),
      $('[data-stat="xp"]')
    ];

    xpElements.forEach((element) => {
      if (element) {
        element.textContent = state.xp;
      }
    });

    const completedElements = [
      $("#completed"),
      $("#completed-value"),
      $('[data-stat="completed"]')
    ];

    completedElements.forEach((element) => {
      if (element) {
        element.textContent = state.completed;
      }
    });

    const questCountElements = [
      $("#quest-count"),
      $('[data-stat="quests"]')
    ];

    questCountElements.forEach((element) => {
      if (element) {
        element.textContent = state.quests.length;
      }
    });

    const badgeCountElements = [
      $("#badge-count"),
      $('[data-stat="badges"]')
    ];

    badgeCountElements.forEach((element) => {
      if (element) {
        element.textContent = state.badges.length;
      }
    });

    const level =
      Math.floor(state.xp / 500) + 1;

    const levelElements = [
      $("#level"),
      $("#level-value"),
      $('[data-stat="level"]')
    ];

    levelElements.forEach((element) => {
      if (element) {
        element.textContent = level;
      }
    });

    const progress =
      ((state.xp % 500) / 500) * 100;

    $$(".xp-progress, .xp-bar-fill").forEach(
      (element) => {
        element.style.width = `${progress}%`;
      }
    );
  }

  function updateWorldState() {
    const world =
      $("#world-map") ||
      $(".world-map") ||
      $('[data-region="world"]');

    if (!world) return;

    if (!state.scanned) {
      world.classList.add("locked");
    } else {
      world.classList.remove("locked");
    }

    $$(".dungeon-node").forEach((node, index) => {
      if (state.quests[index]) {
        node.classList.add("discovered");
      }
    });
  }

  /* ---------------------------------------------------------
     SEARCH / FILTER
     --------------------------------------------------------- */

  function filterQuests(searchTerm) {
    const term = String(searchTerm || "")
      .trim()
      .toLowerCase();

    $$(".quest-card").forEach((card) => {
      if (!term) {
        card.style.display = "";
        return;
      }

      const text = card.textContent.toLowerCase();

      card.style.display =
        text.includes(term)
          ? ""
          : "none";
    });
  }

  /* ---------------------------------------------------------
     MARKDOWN-LITE
     --------------------------------------------------------- */

  function stripMarkdown(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .trim();
  }

  function formatMarkdownLite(text) {
    let html = escapeHtml(String(text || ""));

    html = html.replace(
      /```([\s\S]*?)```/g,
      "<pre><code>$1</code></pre>"
    );

    html = html.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

    html = html.replace(
      /\*\*([^*]+)\*\*/g,
      "<strong>$1</strong>"
    );

    html = html.replace(
      /\*([^*]+)\*/g,
      "<em>$1</em>"
    );

    html = html.replace(
      /^### (.+)$/gm,
      "<h4>$1</h4>"
    );

    html = html.replace(
      /^## (.+)$/gm,
      "<h3>$1</h3>"
    );

    html = html.replace(
      /^# (.+)$/gm,
      "<h2>$1</h2>"
    );

    html = html.replace(
      /\n/g,
      "<br>"
    );

    return html;
  }

  function truncate(text, length) {
    const value = String(text || "");

    if (value.length <= length) {
      return value;
    }

    return value.slice(0, length).trimEnd() + "…";
  }

  /* ---------------------------------------------------------
     EVENT BINDING
     --------------------------------------------------------- */

  function bindScanButtons() {
    const selectors = [
      "#scan-repository",
      "#scan-btn",
      '[data-action="scan"]'
    ];

    selectors.forEach((selector) => {
      $$(selector).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          scanRepository();
        });
      });
    });

    $$("form").forEach((form) => {
      const hasRepositoryInput =
        form.querySelector(
          'input[type="url"], input[name*="repo" i], input[placeholder*="github" i]'
        );

      if (!hasRepositoryInput) return;

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        scanRepository(
          hasRepositoryInput.value
        );
      });
    });
  }

  function bindSearch() {
    const searchInputs = $$(
      '#quest-search, [data-action="search"], input[placeholder*="search" i]'
    );

    searchInputs.forEach((input) => {
      input.addEventListener("input", () => {
        filterQuests(input.value);
      });
    });
  }

  function bindExplanationButtons() {
    $$(
      '#explain-quest, [data-action="explain"]'
    ).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        requestExplanation();
      });
    });
  }

  /* ---------------------------------------------------------
     INITIALIZATION
     --------------------------------------------------------- */

  function init() {
    bindScanButtons();
    bindSearch();
    bindExplanationButtons();

    renderAll();

    /*
     * Allow the page to receive a repository URL through
     * ?repo=https://github.com/user/repository
     */

    try {
      const params =
        new URLSearchParams(
          window.location.search
        );

      const repo = params.get("repo");

      if (repo) {
        setRepositoryUrl(repo);
      }
    } catch {
      // Ignore malformed URL parameters.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

  /* ---------------------------------------------------------
     PUBLIC API
     --------------------------------------------------------- */

  window.BugDungeon = {
    state,
    scanRepository,
    selectQuest,
    completeQuest,
    requestHint,
    requestExplanation,
    filterQuests
  };
})();