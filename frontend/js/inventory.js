/**
 * inventory.js — Tree inventory table with filter + NL query support.
 */

async function loadInventory(params = {}) {
  const tbody  = document.getElementById("inventory-tbody");
  const status = document.getElementById("inventory-status");
  const count  = document.getElementById("inventory-count");

  status.textContent = "Loading...";
  tbody.innerHTML = "";

  const qs = new URLSearchParams();
  if (params.ward)    qs.set("ward", params.ward);
  if (params.species) qs.set("species", params.species);
  if (params.status)  qs.set("status", params.status);

  try {
    const res  = await fetch(`${API}/inventory?${qs.toString()}`);
    const data = await res.json();
    const trees = data.trees || [];

    status.textContent = "";
    count.textContent  = `${trees.length} record${trees.length !== 1 ? "s" : ""} found`;

    if (!trees.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#757575">No trees found</td></tr>`;
      return;
    }

    trees.forEach(t => {
      const badge = `<span class="badge badge-${t.status}">${t.status}</span>`;
      const scoreColor = t.health_score >= 70 ? "#2E7D32"
                       : t.health_score >= 40 ? "#F57F17" : "#D32F2F";
      tbody.innerHTML += `
        <tr>
          <td>${t.id}</td>
          <td>${t.species}</td>
          <td>${t.ward}</td>
          <td>${t.age_years}y</td>
          <td><strong style="color:${scoreColor}">${t.health_score}</strong></td>
          <td>${badge}</td>
          <td>${t.last_checked || "—"}</td>
        </tr>`;
    });
  } catch (err) {
    status.textContent = "Failed to load inventory.";
    console.error(err);
  }
}

// ── Filter button ─────────────────────────────────────────────────────────────
document.getElementById("filter-btn").addEventListener("click", () => {
  loadInventory({
    ward:    document.getElementById("filter-ward").value || undefined,
    species: document.getElementById("filter-species").value || undefined,
    status:  document.getElementById("filter-status").value || undefined,
  });
});

// ── NL Query ──────────────────────────────────────────────────────────────────
document.getElementById("nl-query-btn").addEventListener("click", async () => {
  const queryText = document.getElementById("nl-query-input").value.trim();
  if (!queryText) return;

  const tbody  = document.getElementById("inventory-tbody");
  const status = document.getElementById("inventory-status");
  const count  = document.getElementById("inventory-count");

  status.textContent = "Analysing query with AI...";
  tbody.innerHTML = "";

  try {
    const res  = await fetch(`${API}/inventory/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryText }),
    });
    const data = await res.json();

    // Guardrail block handling
    if (data.status === "blocked") {
      window.showGuardrailBlock(data.message || data.reason);
      status.textContent = "";
      return;
    }

    const trees = data.trees || [];
    const filters = data.filters_applied || {};

    status.textContent = Object.keys(filters).length
      ? `Filters: ${JSON.stringify(filters)}` : "";
    count.textContent = `${trees.length} record${trees.length !== 1 ? "s" : ""} found`;

    if (!trees.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#757575">No trees found</td></tr>`;
      return;
    }

    trees.forEach(t => {
      const badge = `<span class="badge badge-${t.status}">${t.status}</span>`;
      const scoreColor = t.health_score >= 70 ? "#2E7D32"
                       : t.health_score >= 40 ? "#F57F17" : "#D32F2F";
      tbody.innerHTML += `
        <tr>
          <td>${t.id}</td>
          <td>${t.species}</td>
          <td>${t.ward}</td>
          <td>${t.age_years}y</td>
          <td><strong style="color:${scoreColor}">${t.health_score}</strong></td>
          <td>${badge}</td>
          <td>${t.last_checked || "—"}</td>
        </tr>`;
    });
  } catch (err) {
    status.textContent = "Query failed.";
    console.error(err);
  }
});

// Enter key on NL query input
document.getElementById("nl-query-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("nl-query-btn").click();
});

window.loadInventory = loadInventory;
