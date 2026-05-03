const state = {
  view: "overview",
  adminToken: window.sessionStorage.getItem("cryptoclass_admin_token") || "",
  adminUser: null,
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

const loginView = document.querySelector("#login-view");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const adminName = document.querySelector("#admin-name");
const alertBox = document.querySelector("#alert");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");

function token() {
  return state.adminToken;
}

function headers(extra = {}) {
  const base = token() ? { authorization: `Bearer ${token()}` } : {};
  return { ...base, ...extra };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: headers(options.headers || {})
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) logout();
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
    if (response.status === 401 || response.status === 403) logout();
    throw new Error(body.error?.message || "Request failed");
  }
  return body;
}

async function loginRequest(email, password) {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || "Login failed");
  }

  if (body.data?.user?.role !== "admin") {
    throw new Error("This account is not allowed to access the admin console.");
  }

  return body.data;
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

function showLogin(message = "") {
  adminApp.classList.add("hidden");
  loginView.classList.remove("hidden");
  if (message) {
    loginError.textContent = message;
    loginError.classList.remove("hidden");
  } else {
    loginError.textContent = "";
    loginError.classList.add("hidden");
  }
}

function showAdmin() {
  loginView.classList.add("hidden");
  adminApp.classList.remove("hidden");
  adminName.textContent = state.adminUser?.fullName || state.adminUser?.email || "Admin";
}

function logout() {
  state.adminToken = "";
  state.adminUser = null;
  window.sessionStorage.removeItem("cryptoclass_admin_token");
  window.sessionStorage.removeItem("cryptoclass_admin_user");
  showLogin();
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
      const photo = item.selfieImageUrl
        ? `<a class="kyc-photo-link" href="${safe(item.selfieImageUrl)}" target="_blank" rel="noreferrer">
             <img class="kyc-photo" src="${safe(item.selfieImageUrl)}" alt="${safe(item.legalName)} selfie" />
           </a>`
        : `<span class="muted">No photo</span>`;
      const documentLink = item.documentImageUrl
        ? `<br><a class="inline-link" href="${safe(item.documentImageUrl)}" target="_blank" rel="noreferrer">View image</a>`
        : "";

      return `<tr>
        <td><strong>${safe(item.legalName)}</strong></td>
        <td>${photo}</td>
        <td>${safe(item.country)}</td>
        <td>${safe(item.documentType)} <span class="mono">${safe(item.documentNumber)}</span>${documentLink}</td>
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

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("hidden");

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Logging in...";

  try {
    const session = await loginRequest(String(data.email), String(data.password));
    state.adminToken = session.token;
    state.adminUser = session.user;
    window.sessionStorage.setItem("cryptoclass_admin_token", session.token);
    window.sessionStorage.setItem("cryptoclass_admin_user", JSON.stringify(session.user));
    showAdmin();
    await loadAll();
    form.reset();
  } catch (error) {
    showLogin(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Login";
  }
});

refreshButton.addEventListener("click", async () => {
  try {
    await loadAll();
    showAlert("Dashboard refreshed.");
  } catch (error) {
    showAlert(error.message, "error");
  }
});

logoutButton.addEventListener("click", logout);

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

async function init() {
  const savedUser = window.sessionStorage.getItem("cryptoclass_admin_user");
  if (savedUser) {
    try {
      state.adminUser = JSON.parse(savedUser);
    } catch {
      state.adminUser = null;
    }
  }

  if (!state.adminToken) {
    showLogin();
    return;
  }

  try {
    showAdmin();
    await loadAll();
  } catch {
    logout();
  }
}

init();

window.setInterval(() => {
  if (state.adminToken && !adminApp.classList.contains("hidden")) {
    loadAssets().catch(() => {});
  }
}, 10000);
