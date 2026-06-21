const state = {
  data: null,
  scenarioId: null, // null = 전체
  statusFilters: new Set(["urgent", "ongoing"]),
  sourceFilters: new Set(["나라장터", "기업마당", "IRIS", "NRF", "IITP"]),
  searchQuery: "",
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
  const q = state.searchQuery.trim().toLowerCase();
  return state.data.items.filter((it) => {
    if (state.scenarioId && !it.scenario_ids.includes(state.scenarioId)) return false;
    if (!state.sourceFilters.has(it.source)) return false;
    const status = getStatus(it.deadline);
    if (!state.statusFilters.has(status)) return false;
    if (q) {
      const haystack = `${it.title || ""} ${it.org || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
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
  state.currentItem = item;
  document.getElementById("plan-modal-title").textContent = "사업계획서 초안 생성";
  document.getElementById("plan-modal-body").innerHTML = `
    <p><strong>${item.title}</strong></p>
    <p style="color:var(--text-muted); font-size:13px;">${item.org || ""} · ${item.source}</p>
    <p style="color:var(--text-muted); font-size:13px;">아래 버튼을 누르면 공고 정보를 기반으로 한 사업계획서 초안(.doc)이 다운로드됩니다. 공고 본문 세부 내용은 원문 링크에서 추가로 확인해주세요.</p>
  `;
  document.getElementById("plan-modal").classList.remove("hidden");
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generateDraftDoc(item) {
  const budget = item.budget ? `${Number(item.budget).toLocaleString()}원` : "공고 원문 확인 필요";
  const content = [
    `발주/소관기관: ${item.org || "-"}`,
    item.demand_org ? `수요/수행기관: ${item.demand_org}` : null,
    `출처: ${item.source}${item.category ? " (" + item.category + ")" : ""}`,
    item.notice_date ? `공고일: ${formatDate(item.notice_date)}` : null,
    item.deadline ? `마감일: ${formatDate(item.deadline)}` : null,
    item.url ? `공고 원문: ${item.url}` : null,
    "",
    "※ 본 항목은 수집된 공고 메타데이터를 기반으로 자동 생성된 초안입니다.",
    "  공고 원문(첨부파일)의 상세 요구사항을 반드시 확인 후 보완해주세요.",
  ].filter(Boolean).join("<br/>");

  const goal = `본 사업을 통해 「${item.title}」 관련 요구사항을 충족하는 결과물을 성공적으로 수행하고,\n발주기관(${item.org || "-"})의 사업 목적에 부합하는 성과를 창출하고자 함.`;

  const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>사업계획서 초안</title>
<style>
  body { font-family: '맑은 고딕', sans-serif; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 30px; }
  .field-label { font-weight: bold; margin-top: 20px; }
  .field-value { margin: 6px 0 0 0; padding: 10px; border: 1px solid #ccc; }
</style>
</head>
<body>
  <h1>사업계획서 (초안)</h1>

  <p class="field-label">사업명 :</p>
  <p class="field-value">${escapeHtml(item.title)}</p>

  <p class="field-label">사업내용 :</p>
  <p class="field-value">${content}</p>

  <p class="field-label">사업예산 :</p>
  <p class="field-value">${escapeHtml(budget)}</p>

  <p class="field-label">사업 목표 :</p>
  <p class="field-value">${escapeHtml(goal).replace(/\n/g, "<br/>")}</p>

  <p style="margin-top:40px; color:#888; font-size:9pt;">
    본 문서는 공공 공고 트래커에서 자동 생성된 초안이며, 실제 제출 전 공고 원문 및 평가기준을 반드시 확인해야 합니다.
  </p>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const safeTitle = (item.title || "사업계획서초안").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  link.download = `사업계획서_초안_${safeTitle}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderTable();
  });

  document.getElementById("search-stop").addEventListener("click", () => {
    state.searchQuery = "";
    searchInput.value = "";
    renderTable();
    searchInput.blur();
  });

  document.getElementById("draft-btn").addEventListener("click", () => {
    if (state.currentItem) generateDraftDoc(state.currentItem);
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
