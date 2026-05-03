const state = {
  view: "overview",
  dashboard: null,
  users: [],
  kyc: [],
  withdrawals: [],
  transactions: [],
  assets: [],
  previousPrices: {},
  market: null,
  fees: null
};

const titleByView = {
  overview: "Overview",
  users: "Users",
  kyc: "KYC Reviews",
  withdrawals: "Withdrawals",
  transactions: "Transactions",
  assets: "Assets",
  fees: "Fee Settings"
};

const tokenInput = document.querySelector("#token-input");
const alertBox = document.querySelector("#alert");
const refreshButton = document.querySelector("#refresh-button");

function token() {
  return tokenInput.value.trim() || "demo-admin-token";
}

function headers(extra = {}) {
  return {
    authorization: `Bearer ${token()}`,
    ...extra
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: headers(options.headers || {})
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || "Request failed");
  }
  return body.data;
}

async function apiEnvelope(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: headers(options.headers || {})
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || "Request failed");
  }
  return body;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function number(value, digits = 4) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "Not reviewed";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function time(value) {
  if (!value) return "waiting";
  return new Intl.DateTimeFormat("en", { timeStyle: "medium" }).format(new Date(value));
}

function safe(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function statusChip(status) {
  return `<span class="status ${safe(status)}">${safe(String(status).replaceAll("_", " "))}</span>`;
}

function showAlert(message, type = "info") {
  alertBox.textContent = message;
  alertBox.className = `alert ${type === "error" ? "error" : ""}`;
  window.setTimeout(() => {
    alertBox.className = "alert hidden";
  }, 3500);
}

function setView(view) {
  state.view = view;
  document.querySelector("#view-title").textContent = titleByView[view];
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}-view`);
  });
  render();
}

async function loadAll() {
  const [dashboard, users, kyc, withdrawals, transactions, assetsResponse, fees] = await Promise.all([
    api("/admin/dashboard"),
    api("/admin/users"),
    api("/admin/kyc"),
    api("/admin/withdrawals"),
    api("/admin/transactions"),
    apiEnvelope("/admin/assets"),
    api("/admin/fees")
  ]);

  state.dashboard = dashboard;
  state.users = users;
  state.kyc = kyc;
  state.withdrawals = withdrawals;
  state.transactions = transactions;
  state.previousPrices = Object.fromEntries(state.assets.map((asset) => [asset.symbol, asset.priceUsd]));
  state.assets = assetsResponse.data;
  state.market = assetsResponse.meta?.market || null;
  state.fees = fees;
  render();
}

async function loadAssets() {
  const assetsResponse = await apiEnvelope("/admin/assets");
  state.previousPrices = Object.fromEntries(state.assets.map((asset) => [asset.symbol, asset.priceUsd]));
  state.assets = assetsResponse.data;
  state.market = assetsResponse.meta?.market || null;
  renderOverview();
  renderAssets();
}

function inferFeesFromForm() {
  return state.fees || {
    buyFeePercent: 1,
    sellFeePercent: 1,
    swapFeePercent: 0.6,
    withdrawalFlatUsd: 3,
    spreadPercent: 0.5
  };
}

function renderOverview() {
  const dashboard = state.dashboard || {};
  const metrics = [
    ["Users", dashboard.users],
    ["Pending KYC", dashboard.pendingKyc],
    ["Pending Withdrawals", dashboard.pendingWithdrawals],
    ["Assets", dashboard.assets],
    ["Completed Volume", money(dashboard.completedVolumeUsd)]
  ];

  document.querySelector("#metric-grid").innerHTML = metrics
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value ?? 0}</strong></article>`)
    .join("");

  const pendingKyc = state.kyc.filter((item) => item.status === "pending").length;
  const pendingWithdrawals = state.withdrawals.filter((item) => item.status === "pending").length;
  const completedTransactions = state.transactions.filter((item) => item.status === "completed").length;

  document.querySelector("#queue-summary").innerHTML = [
    ["KYC waiting", pendingKyc],
    ["Withdrawals waiting", pendingWithdrawals],
    ["Completed ledger entries", completedTransactions],
    ["Supported assets", state.assets.length]
  ]
    .map(([label, value]) => `<article class="queue-item"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderUsers() {
  document.querySelector("#users-table").innerHTML = state.users
    .map((user) => {
      return `<tr>
        <td><strong>${safe(user.fullName)}</strong></td>
        <td>${safe(user.email)}</td>
        <td>${safe(user.phone)}</td>
        <td>${statusChip(user.kycStatus)}</td>
        <td>${date(user.createdAt)}</td>
      </tr>`;
    })
    .join("");
}

function renderKyc() {
  document.querySelector("#kyc-table").innerHTML = state.kyc
    .map((item) => {
      const actions =
        item.status === "pending"
          ? `<button class="table-button approve" data-action="kyc" data-status="approved" data-id="${item.id}" type="button">Approve</button>
             <button class="table-button reject" data-action="kyc" data-status="rejected" data-id="${item.id}" type="button">Reject</button>`
          : `<span class="muted">Reviewed</span>`;

      return `<tr>
        <td><strong>${safe(item.legalName)}</strong></td>
        <td>${safe(item.country)}</td>
        <td>${safe(item.documentType)} <span class="mono">${safe(item.documentNumber)}</span></td>
        <td>${statusChip(item.status)}</td>
        <td>${date(item.submittedAt)}</td>
        <td class="actions-cell">${actions}</td>
      </tr>`;
    })
    .join("");
}

function renderWithdrawals() {
  document.querySelector("#withdrawals-table").innerHTML = state.withdrawals
    .map((item) => {
      const actions =
        item.status === "pending"
          ? `<button class="table-button approve" data-action="withdrawal" data-status="approved" data-id="${item.id}" type="button">Approve</button>
             <button class="table-button reject" data-action="withdrawal" data-status="rejected" data-id="${item.id}" type="button">Reject</button>`
          : `<span class="muted">Reviewed</span>`;

      return `<tr>
        <td><strong>${safe(item.assetSymbol)}</strong></td>
        <td>${number(item.amount, 8)} <span class="muted">fee ${number(item.feeAssetAmount, 8)}</span></td>
        <td>${safe(item.network)}</td>
        <td>${statusChip(item.status)}</td>
        <td class="mono">${safe(item.address).slice(0, 18)}...</td>
        <td class="actions-cell">${actions}</td>
      </tr>`;
    })
    .join("");
}

function renderTransactions() {
  document.querySelector("#transactions-table").innerHTML = state.transactions
    .map((item) => {
      return `<tr>
        <td class="mono">${safe(item.reference)}</td>
        <td>${safe(item.type)}</td>
        <td>${statusChip(item.status)}</td>
        <td>${number(item.fromAmount, 8)} ${safe(item.fromAsset)}</td>
        <td>${number(item.toAmount, 8)} ${safe(item.toAsset)}</td>
        <td>${money(item.feeAmount)}</td>
        <td>${date(item.createdAt)}</td>
      </tr>`;
    })
    .join("");
}

function renderAssets() {
  const marketStatus = document.querySelector("#market-status");
  if (marketStatus) {
    marketStatus.textContent = `Live sim updated ${time(state.market?.lastUpdatedAt)}`;
  }

  document.querySelector("#assets-table").innerHTML = state.assets
    .map((asset) => {
      const previousPrice = state.previousPrices[asset.symbol];
      const direction =
        previousPrice === undefined || previousPrice === asset.priceUsd ? "" : asset.priceUsd > previousPrice ? "price-up" : "price-down";
      const changeClass = asset.change24h >= 0 ? "price-up" : "price-down";
      const actionLabel = asset.isActive ? "Pause" : "Allow";
      const actionClass = asset.isActive ? "reject" : "approve";
      const nextIsActive = asset.isActive ? "false" : "true";

      return `<tr>
        <td><strong>${safe(asset.symbol)}</strong><br><span class="muted">${safe(asset.name)}</span></td>
        <td>${safe(asset.network)}</td>
        <td class="${direction}">${money(asset.priceUsd)}</td>
        <td class="${changeClass}">${number(asset.change24h, 2)}%</td>
        <td>${statusChip(asset.isActive ? "active" : "inactive")}</td>
        <td class="actions-cell">
          <button class="table-button ${actionClass}" data-action="asset-status" data-symbol="${safe(asset.symbol)}" data-active="${nextIsActive}" type="button">${actionLabel}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderFees() {
  const fees = inferFeesFromForm();
  const form = document.querySelector("#fees-form");
  for (const [key, value] of Object.entries(fees)) {
    const input = form.elements.namedItem(key);
    if (input && document.activeElement !== input) input.value = value;
  }
}

function render() {
  renderOverview();
  renderUsers();
  renderKyc();
  renderWithdrawals();
  renderTransactions();
  renderAssets();
  renderFees();
}

async function reviewKyc(id, status) {
  await api(`/admin/kyc/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, reviewerNote: `Marked ${status} from admin console.` })
  });
  showAlert(`KYC ${status}.`);
  await loadAll();
}

async function reviewWithdrawal(id, status) {
  await api(`/admin/withdrawals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, reviewerNote: `Marked ${status} from admin console.` })
  });
  showAlert(`Withdrawal ${status}.`);
  await loadAll();
}

async function updateAssetStatus(symbol, isActive) {
  await api(`/admin/assets/${encodeURIComponent(symbol)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isActive })
  });
  showAlert(`${symbol} ${isActive ? "allowed" : "paused"}.`);
  await loadAssets();
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

refreshButton.addEventListener("click", async () => {
  try {
    await loadAll();
    showAlert("Dashboard refreshed.");
  } catch (error) {
    showAlert(error.message, "error");
  }
});

document.body.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  try {
    if (target.dataset.action === "kyc") {
      await reviewKyc(target.dataset.id, target.dataset.status);
    }
    if (target.dataset.action === "withdrawal") {
      await reviewWithdrawal(target.dataset.id, target.dataset.status);
    }
    if (target.dataset.action === "asset-status") {
      await updateAssetStatus(target.dataset.symbol, target.dataset.active === "true");
    }
  } catch (error) {
    showAlert(error.message, "error");
  }
});

document.querySelector("#asset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.symbol = String(data.symbol).toUpperCase();
  data.priceUsd = Number(data.priceUsd);
  data.change24h = 0;
  data.isActive = true;
  data.minBuyUsd = 10;
  data.minSellUsd = 10;
  data.iconUrl = `/assets/${String(data.symbol).toLowerCase()}.svg`;

  try {
    await api("/admin/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });
    form.reset();
    showAlert("Asset added.");
    await loadAll();
  } catch (error) {
    showAlert(error.message, "error");
  }
});

document.querySelector("#fees-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(data)) data[key] = Number(data[key]);

  try {
    state.fees = await api("/admin/fees", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });
    showAlert("Fee settings saved.");
    renderFees();
  } catch (error) {
    showAlert(error.message, "error");
  }
});

loadAll().catch((error) => showAlert(error.message, "error"));

window.setInterval(() => {
  loadAssets().catch(() => {});
}, 10000);
