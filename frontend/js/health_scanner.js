/**
 * health_scanner.js — Image upload + health assessment via Agent 1.
 * Handles HITL approval modal for critical health scores.
 */

const uploadZone  = document.getElementById("upload-zone");
const fileInput   = document.getElementById("file-input");
const assessBtn   = document.getElementById("assess-btn");
let selectedFile  = null;
let pendingActionId = null;

// ── Upload Zone ───────────────────────────────────────────────────────────────
uploadZone.addEventListener("click", () => fileInput.click());

uploadZone.addEventListener("dragover", e => {
  e.preventDefault();
  uploadZone.style.borderColor = "#2E7D32";
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.style.borderColor = "";
});
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.style.borderColor = "";
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setSelectedFile(fileInput.files[0]);
});

function setSelectedFile(file) {
  selectedFile = file;
  uploadZone.querySelector("p").textContent = `📎 ${file.name}`;
}

// ── Assess Button ─────────────────────────────────────────────────────────────
assessBtn.addEventListener("click", async () => {
  assessBtn.textContent  = "Analysing...";
  assessBtn.disabled     = true;

  const formData = new FormData();
  if (selectedFile) formData.append("image", selectedFile);

  const ward  = document.getElementById("param-ward").value;
  const temp  = document.getElementById("param-temp").value;
  const ph    = document.getElementById("param-ph").value;
  const rain  = document.getElementById("param-rain").value;

  if (ward)  formData.append("ward", ward);
  if (temp)  formData.append("temperature", temp);
  if (ph)    formData.append("soil_ph", ph);
  if (rain)  formData.append("rainfall", rain);

  try {
    const res  = await fetch(`${API}/health/assess`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.status === "blocked") {
      window.showGuardrailBlock(data.message || data.reason);
      return;
    }

    // HITL hold
    if (data.status === "pending_approval") {
      pendingActionId = data.action_id;
      document.getElementById("hitl-action-id").textContent = `Action ID: ${data.action_id}`;
      document.getElementById("hitl-modal").style.display = "flex";
      return;
    }

    renderHealthResult(data);
  } catch (err) {
    console.error("Health assessment failed:", err);
    window.showGuardrailBlock("Health assessment failed. Please try again.");
  } finally {
    assessBtn.textContent = "Analyse Tree";
    assessBtn.disabled    = false;
  }
});

// ── Render Result ─────────────────────────────────────────────────────────────
function renderHealthResult(data) {
  const resultCard = document.getElementById("health-result");
  resultCard.style.display = "flex";

  const score     = data.health_score ?? 0;
  const scoreRing = document.getElementById("health-score-ring");
  document.getElementById("health-score-num").textContent = score;

  // Color the score ring by health level
  scoreRing.style.borderColor = score >= 70 ? "#2E7D32"
                               : score >= 40 ? "#F57F17" : "#D32F2F";

  // Issues
  const issuesList = document.getElementById("health-issues");
  issuesList.innerHTML = "";
  (data.issues || []).forEach(issue => {
    const li = document.createElement("li");
    li.textContent = issue;
    issuesList.appendChild(li);
  });
  if (!data.issues?.length) issuesList.innerHTML = "<li>No issues detected</li>";

  // Maintenance actions
  const actionsList = document.getElementById("health-actions");
  actionsList.innerHTML = "";
  (data.maintenance_actions || []).forEach(action => {
    const li = document.createElement("li");
    li.textContent = action;
    actionsList.appendChild(li);
  });

  // Reasoning
  document.getElementById("health-reasoning").textContent =
    data.reasoning || "No reasoning provided.";

  // Confidence bar
  const conf = data.confidence ?? 0;
  document.getElementById("confidence-fill").style.width  = `${Math.round(conf * 100)}%`;
  document.getElementById("confidence-pct").textContent   = `${Math.round(conf * 100)}%`;
}

// ── HITL Modal ────────────────────────────────────────────────────────────────
document.getElementById("hitl-approve-btn").addEventListener("click", async () => {
  if (!pendingActionId) return;
  try {
    const res  = await fetch(`${API}/approve/${pendingActionId}`, {
      method: "POST",
      headers: window.authHeaders(),
    });
    const data = await res.json();
    document.getElementById("hitl-modal").style.display = "none";
    if (data.payload) renderHealthResult(data.payload);
  } catch {
    window.showGuardrailBlock("Approval failed. Please try again.");
  }
});

document.getElementById("hitl-reject-btn").addEventListener("click", async () => {
  if (!pendingActionId) return;
  try {
    await fetch(`${API}/reject/${pendingActionId}`, {
      method: "POST",
      headers: window.authHeaders(),
    });
  } finally {
    document.getElementById("hitl-modal").style.display = "none";
    pendingActionId = null;
  }
});
