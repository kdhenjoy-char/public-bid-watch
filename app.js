const state = {
  data: null,
  scenarioId: null, // null = 전체
  statusFilters: new Set(["urgent", "ongoing"]),
  sourceFilters: new Set(["나라장터", "기업마당", "IRIS", "NRF", "IITP"]),
};

function getStatus(deadlineStr) {
  if (!deadlineStr) return "ongoing";
  // 다양한 포맷 방어: "2026-06-30", "20260630", "2026-06-30 18:00" 등
  const cleaned = deadlineStr.replace(/[^0-9]/g, "").slice(0, 8);
  if (cleaned.length < 8) return "ongoing";
  const y = cleaned.slice(0, 4), m = cleaned.slice(4, 6), d = cleaned.slice(6, 8);
  const deadline = new Date(`${y}-${m}-${d}T23:59:59`);
  const now = new Date();
  const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "closed";
  if (diffDays <= 7) return "urgent";
  return "ongoing";
}

function formatDate(s) {
  if (!s) return "-";
  const cleaned = s.replace(/[^0-9]/g, "").slice(0, 8);
  if (cleaned.length < 8) return s;
  return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`;
}

function getScenarioFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("scenario");
}

async function loadData() {
  const res = await fetch("data/announcements.json", { cache: "no-store" });
  if (!res.ok) throw new Error("데이터 로드 실패");
  return res.json();
}

function renderScenarioTabs() {
  const tabsEl = document.getElementById("scenario-tabs");
  tabsEl.innerHTML = "";

  const allTab = document.createElement("button");
  allTab.className = "scenario-tab" + (state.scenarioId === null ? " active" : "");
  allTab.textContent = "전체 시나리오";
  allTab.onclick = () => { state.scenarioId = null; syncQuery(); render(); };
  tabsEl.appendChild(allTab);

  for (const sc of state.data.scenarios) {
    const tab = document.createElement("button");
    tab.className = "scenario-tab" + (state.scenarioId === sc.id ? " active" : "");
    tab.textContent = sc.label;
    tab.onclick = () => { state.scenarioId = sc.id; syncQuery(); render(); };
    tabsEl.appendChild(tab);
  }
}

function syncQuery() {
  const url = new URL(window.location);
  if (state.scenarioId) url.searchParams.set("scenario", state.scenarioId);
  else url.searchParams.delete("scenario");
  window.history.replaceState({}, "", url);
}

function getFilteredItems() {
  return state.data.items.filter((it) => {
    if (state.scenarioId && !it.scenario_ids.includes(state.scenarioId)) return false;
    if (!state.sourceFilters.has(it.source) && !["IRIS","NRF","IITP"].every(s => it.source !== s) ) {
      // 출처 매칭 (나라장터/기업마당/IRIS/NRF/IITP 문자열 그대로 비교)
    }
    if (!state.sourceFilters.has(it.source)) return false;
    const status = getStatus(it.deadline);
    if (!state.statusFilters.has(status)) return false;
    return true;
  });
}

function renderSummary() {
  const all = state.data.items.filter((it) => {
    if (state.scenarioId && !it.scenario_ids.includes(state.scenarioId)) return false;
    if (!state.sourceFilters.has(it.source)) return false;
    return true;
  });
  const counts = { urgent: 0, ongoing: 0, closed: 0 };
  for (const it of all) counts[getStatus(it.deadline)]++;
  document.getElementById("count-urgent").textContent = counts.urgent;
  document.getElementById("count-ongoing").textContent = counts.ongoing;
  document.getElementById("count-closed").textContent = counts.closed;
  document.getElementById("count-all").textContent = all.length;
}

function renderTable() {
  const items = getFilteredItems();
  const tbody = document.getElementById("bid-table-body");
  const table = document.getElementById("bid-table");
  const empty = document.getElementById("empty-state");
  tbody.innerHTML = "";

  if (items.length === 0) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  const statusLabel = { urgent: "마감임박", ongoing: "진행중", closed: "마감" };

  for (const it of items) {
    const status = getStatus(it.deadline);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="status-pill ${status}">${statusLabel[status]}</span></td>
      <td><span class="source-tag">${it.source}</span></td>
      <td>${it.title || "-"}</td>
      <td>${it.org || "-"}</td>
      <td>${formatDate(it.notice_date)}</td>
      <td>${formatDate(it.deadline)}</td>
      <td>${it.url ? `<a href="${it.url}" target="_blank" rel="noopener">원문</a>` : "-"}</td>
    `;
    tr.addEventListener("click", () => openPlanModal(it));
    tbody.appendChild(tr);
  }
}

function openPlanModal(item) {
  document.getElementById("plan-modal-title").textContent = "사업계획서 초안 생성";
  document.getElementById("plan-modal-body").innerHTML = `
    <p><strong>${item.title}</strong></p>
    <p style="color:var(--text-muted); font-size:13px;">${item.org || ""} · ${item.source}</p>
    <p style="color:var(--text-muted); font-size:13px;">이 공고를 기반으로 한 사업계획서 초안 생성 기능은 다음 단계(Step 6)에서 연결될 예정입니다.</p>
  `;
  document.getElementById("plan-modal").classList.remove("hidden");
}

function setupFilterButtons() {
  document.querySelectorAll("#status-filters .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const status = btn.dataset.status;
      if (state.statusFilters.has(status)) {
        state.statusFilters.delete(status);
        btn.classList.remove("active");
      } else {
        state.statusFilters.add(status);
        btn.classList.add("active");
      }
      render();
    });
  });
  document.querySelector('#status-filters [data-action="all"]').addEventListener("click", () => {
    state.statusFilters = new Set(["urgent", "ongoing", "closed"]);
    document.querySelectorAll("#status-filters .filter-btn").forEach(b => b.classList.add("active"));
    render();
  });

  document.querySelectorAll("#source-filters .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const source = btn.dataset.source;
      if (state.sourceFilters.has(source)) {
        state.sourceFilters.delete(source);
        btn.classList.remove("active");
      } else {
        state.sourceFilters.add(source);
        btn.classList.add("active");
      }
      render();
    });
  });
  document.querySelector('#source-filters [data-action="all-source"]').addEventListener("click", () => {
    state.sourceFilters = new Set(["나라장터", "기업마당", "IRIS", "NRF", "IITP"]);
    document.querySelectorAll("#source-filters .filter-btn").forEach(b => b.classList.add("active"));
    render();
  });

  document.getElementById("modal-close").addEventListener("click", () => {
    document.getElementById("plan-modal").classList.add("hidden");
  });
}

function render() {
  renderScenarioTabs();
  renderSummary();
  renderTable();

  const scenario = state.scenarioId
    ? state.data.scenarios.find((s) => s.id === state.scenarioId)
    : null;
  document.getElementById("scenario-label").textContent = scenario
    ? `시나리오: ${scenario.label}`
    : "시나리오: 전체";
  document.getElementById("keyword-label").textContent = scenario
    ? `키워드: ${scenario.keywords.join(", ")}`
    : "키워드: -";
  document.getElementById("updated-at").textContent = `갱신: ${state.data.generated_at}`;
}

async function init() {
  setupFilterButtons();
  try {
    state.data = await loadData();
  } catch (e) {
    document.getElementById("loading").textContent = "데이터를 불러오지 못했습니다. (아직 수집 전이거나 GitHub Actions가 실행되지 않았을 수 있습니다)";
    return;
  }
  state.scenarioId = getScenarioFromQuery();
  document.getElementById("loading").classList.add("hidden");
  render();
}

init();
