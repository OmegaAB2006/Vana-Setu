/**
 * agent.js — Vana Sethu Global AI Assistant
 * Floating chat widget present on every panel.
 * Understands natural language, answers questions about the platform,
 * and navigates to the correct page when asked.
 */

(function () {
  "use strict";

  // ── Page navigation map ────────────────────────────────────────────────────
  const PAGE_ALIASES = {
    home:      ["home", "dashboard", "main", "start", "overview", "landing", "beginning"],
    map:       ["map", "green cover", "green map", "ward map", "coverage", "vegetation", "ndvi", "deficient wards", "green space"],
    inventory: ["inventory", "tree list", "tree registry", "trees", "all trees", "tree count", "species", "ward trees"],
    health:    ["health", "health scanner", "scan", "diagnose", "disease", "sick tree", "tree health", "analyse", "analyze", "upload image"],
    metrics:   ["metrics", "ai dashboard", "performance", "accuracy", "rag", "agentic", "guardrail", "llm", "cost", "multi-agent", "multiagent"],
    approvals: ["approval", "approvals", "pending", "pending approval", "officer approval", "review"],
  };

  // ── Quick answers the agent can give without hitting the backend ───────────
  const QUICK_ANSWERS = [
    {
      match: ["what is vana sethu", "about vana sethu", "what does this do", "explain this app", "what is this"],
      answer: "**Vana Sethu** (ವನ ಸೇತು) means *Bridge to the Forest* in Kannada. It's an AI-powered Smart Urban Tree Platform for Bengaluru that helps BBMP officers, NGOs and citizens monitor, protect and grow the city's urban tree canopy in real time using 4 specialised AI agents and 9 safety guardrail layers.",
    },
    {
      match: ["how many agents", "agents", "ai agents", "what agents"],
      answer: "Vana Sethu has **4 AI Agents**:\n1. **Health Agent** — diagnoses tree diseases from images\n2. **Inventory Agent** — manages the full tree registry\n3. **Mapping Agent** — calculates ward-level green cover %\n4. **Dashboard Agent** — orchestrates all agents and answers queries\n\nAll agents run through 9 guardrail layers for safety.",
    },
    {
      match: ["guardrail", "guardrails", "safety", "how safe"],
      answer: "Vana Sethu applies **9 guardrail layers** on every request:\n• Input validation & PII masking\n• Tool-call safety checks\n• Output content filtering\n• Data access controls (RBAC)\n• Human-in-the-Loop (HITL) for critical actions\n• Ethics & bias checks\n• Multi-agent loop detection\n• Operational rate limiting\n• Security injection prevention",
    },
    {
      match: ["login", "how to login", "credentials", "demo user", "password"],
      answer: "**Demo credentials:**\n\n👤 Citizen: `citizen@vanasethu.in` / `citizen123`\n🏛️ Officer: `officer@bbmp.gov.in` / `officer123`\n👑 Admin: `admin@bbmp.gov.in` / `admin123`\n\nOfficers and admins can approve health flagging actions.",
    },
    {
      match: ["weather", "temperature", "rain", "rainfall", "humidity"],
      answer: "Live weather data for Bengaluru is fetched from **OpenWeatherMap** every 30 minutes. It is used in the green cover calculation formula and displayed in the top navigation bar. You can also see it on the **Home** dashboard.",
    },
    {
      match: ["ward", "how many wards", "bengaluru wards", "bbmp wards"],
      answer: "Vana Sethu currently monitors **10 key BBMP wards** across Bengaluru, including Yelahanka, Hebbal, Cubbon Park, Electronic City, Jayanagar, Whitefield, Lalbagh, Marathahalli, Malleswaram and Koramangala. Each ward has a live green cover score updated every 30 minutes.",
    },
  ];

  // ── Detect navigation intent and return panel name or null ─────────────────
  function detectNavIntent(text) {
    const t = text.toLowerCase();
    // "go to X", "open X", "show me X", "navigate to X", "take me to X", "switch to X"
    const NAV_VERBS = ["go to", "open", "show me", "navigate to", "take me to", "switch to", "i want to see", "bring me to", "head to", "visit"];
    let hasVerb = NAV_VERBS.some(v => t.includes(v));

    for (const [panel, aliases] of Object.entries(PAGE_ALIASES)) {
      for (const alias of aliases) {
        if (t.includes(alias)) {
          // If user just says "trees" without nav verb, don't auto-navigate
          if (!hasVerb && ["trees", "species", "agents"].includes(alias)) continue;
          if (hasVerb || t.includes("page") || t.includes("panel") || t.includes("section")) {
            return panel;
          }
        }
      }
    }
    return null;
  }

  // ── Detect quick answer ────────────────────────────────────────────────────
  function detectQuickAnswer(text) {
    const t = text.toLowerCase();
    for (const qa of QUICK_ANSWERS) {
      if (qa.match.some(m => t.includes(m))) return qa.answer;
    }
    return null;
  }

  // ── Simple markdown to HTML (bold, italic, newlines, bullets) ─────────────
  function mdToHtml(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\n• /g, "\n<li>")
      .replace(/^• /g, "<li>")
      .replace(/\n(\d+)\. /g, (_, n) => `\n<li>${n}. `)
      .replace(/^(\d+)\. /g, (_, n) => `<li>${n}. `)
      .replace(/\n/g, "<br>");
  }

  // ── Build the widget DOM ───────────────────────────────────────────────────
  function buildWidget() {
    const wrap = document.createElement("div");
    wrap.id = "vs-agent-wrap";
    wrap.innerHTML = `
      <button id="vs-agent-fab" aria-label="Open AI Assistant" title="Ask the Vana Sethu AI">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a9 9 0 0 1 9 9c0 4.6-3.4 8.4-7.8 9.0L12 22l-1.2-2C6.4 19.4 3 15.6 3 11a9 9 0 0 1 9-9z"/>
          <circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none"/>
          <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>
        </svg>
        <span class="vs-fab-badge" id="vs-fab-badge" style="display:none">1</span>
      </button>

      <div id="vs-agent-panel" role="dialog" aria-label="Vana Sethu AI Assistant" style="display:none">
        <div id="vs-agent-header">
          <div class="vs-header-left">
            <div class="vs-avatar">🌳</div>
            <div>
              <div class="vs-agent-name">Vana Sethu AI</div>
              <div class="vs-agent-status" id="vs-status-dot">● Online</div>
            </div>
          </div>
          <div class="vs-header-actions">
            <button id="vs-clear-btn" title="Clear chat">🗑</button>
            <button id="vs-close-btn" title="Close">✕</button>
          </div>
        </div>

        <div id="vs-messages"></div>

        <div id="vs-suggestions">
          <button class="vs-chip" data-q="Take me to the Green Cover map">🗺 Green Cover Map</button>
          <button class="vs-chip" data-q="Show me the tree inventory">🌲 Tree Inventory</button>
          <button class="vs-chip" data-q="Open the health scanner">🩺 Health Scanner</button>
          <button class="vs-chip" data-q="What is Vana Sethu?">ℹ️ About</button>
          <button class="vs-chip" data-q="Show me the AI metrics dashboard">📊 AI Metrics</button>
          <button class="vs-chip" data-q="What are the demo login credentials?">🔑 Login Help</button>
        </div>

        <div id="vs-input-row">
          <input id="vs-input" type="text" placeholder="Ask anything about Vana Sethu…" autocomplete="off" maxlength="300"/>
          <button id="vs-send-btn" aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  // ── Append a message bubble ────────────────────────────────────────────────
  function appendMsg(role, html, navPanel) {
    const msgs = document.getElementById("vs-messages");
    const div = document.createElement("div");
    div.className = `vs-msg vs-msg-${role}`;

    const bubble = document.createElement("div");
    bubble.className = "vs-bubble";
    bubble.innerHTML = html;

    // Navigation button
    if (navPanel) {
      const btn = document.createElement("button");
      btn.className = "vs-nav-btn";
      const labels = { home: "Home", map: "Green Cover Map", inventory: "Tree Inventory", health: "Health Scanner", metrics: "AI Dashboard", approvals: "Approvals" };
      btn.textContent = `→ Go to ${labels[navPanel] || navPanel}`;
      btn.onclick = () => {
        window.switchPanel && window.switchPanel(navPanel);
        closePanel();
      };
      bubble.appendChild(btn);
    }

    div.appendChild(bubble);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendTyping() {
    const msgs = document.getElementById("vs-messages");
    const div = document.createElement("div");
    div.className = "vs-msg vs-msg-agent";
    div.id = "vs-typing-indicator";
    div.innerHTML = `<div class="vs-bubble vs-typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById("vs-typing-indicator");
    if (el) el.remove();
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  function openPanel() {
    const panel = document.getElementById("vs-agent-panel");
    panel.style.display = "flex";
    panel.classList.add("vs-panel-open");
    document.getElementById("vs-fab-badge").style.display = "none";
    document.getElementById("vs-input").focus();
  }

  function closePanel() {
    const panel = document.getElementById("vs-agent-panel");
    panel.style.display = "none";
    panel.classList.remove("vs-panel-open");
  }

  // ── Core send logic ───────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = text.trim();
    if (!text) return;

    document.getElementById("vs-input").value = "";
    document.getElementById("vs-suggestions").style.display = "none";
    appendMsg("user", text);
    appendTyping();

    // 1. Check for navigation intent first
    const navPanel = detectNavIntent(text);

    // 2. Check quick answers
    const quick = detectQuickAnswer(text);
    if (quick) {
      await new Promise(r => setTimeout(r, 600));
      removeTyping();
      appendMsg("agent", mdToHtml(quick), navPanel);
      return;
    }

    // 3. If pure navigation intent with no extra question
    if (navPanel && text.split(" ").length <= 8) {
      await new Promise(r => setTimeout(r, 400));
      removeTyping();
      const labels = { home: "Home", map: "Green Cover Map", inventory: "Tree Inventory", health: "Health Scanner", metrics: "AI Dashboard", approvals: "Approvals" };
      appendMsg("agent", `Taking you to the <strong>${labels[navPanel]}</strong> page!`, navPanel);
      return;
    }

    // 4. Hit the backend /api/assistant for everything else
    try {
      const res = await fetch(`${window.API || "http://127.0.0.1:5001/api"}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      removeTyping();

      const reply = data.reply || data.message || "I couldn't find an answer to that.";
      const detectedNav = data.navigate_to || navPanel;
      appendMsg("agent", mdToHtml(reply), detectedNav || null);
    } catch {
      removeTyping();
      appendMsg("agent", "Sorry, I couldn't reach the server right now. Try refreshing the page.", null);
    }
  }

  // ── Wire events after DOM is ready ────────────────────────────────────────
  function init() {
    buildWidget();

    // Welcome message
    appendMsg("agent", "Hello! 👋 I'm the <strong>Vana Sethu AI Assistant</strong>. I can answer questions about the platform, show you live tree data, and navigate you to any page. What would you like to know?");

    document.getElementById("vs-agent-fab").addEventListener("click", () => {
      const panel = document.getElementById("vs-agent-panel");
      panel.style.display === "none" ? openPanel() : closePanel();
    });

    document.getElementById("vs-close-btn").addEventListener("click", closePanel);

    document.getElementById("vs-clear-btn").addEventListener("click", () => {
      document.getElementById("vs-messages").innerHTML = "";
      document.getElementById("vs-suggestions").style.display = "flex";
      appendMsg("agent", "Chat cleared! How can I help you?");
    });

    // Send on button click
    document.getElementById("vs-send-btn").addEventListener("click", () => {
      sendMessage(document.getElementById("vs-input").value);
    });

    // Send on Enter
    document.getElementById("vs-input").addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(document.getElementById("vs-input").value);
      }
    });

    // Suggestion chips
    document.querySelectorAll(".vs-chip").forEach(chip => {
      chip.addEventListener("click", () => sendMessage(chip.dataset.q));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
