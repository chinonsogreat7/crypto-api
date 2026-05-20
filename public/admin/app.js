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
  fees: null,
  selectedUserId: null,
  selectedUserDetails: null,
  selectedUserLoading: false,
  selectedKycId: null,
  pagination: {
    users: { page: 1, pageSize: 10 },
    kyc: { page: 1, pageSize: 10 },
    withdrawals: { page: 1, pageSize: 10 },
    transactions: { page: 1, pageSize: 10 },
    assets: { page: 1, pageSize: 10 }
  }
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

function yesNo(value) {
  return value ? "Yes" : "No";
}

function emptyMessage(message) {
  return `<p class="empty-state">${safe(message)}</p>`;
}

function detailField(label, value) {
  return `<div class="detail-field"><span>${safe(label)}</span><strong>${safe(value ?? "Not provided")}</strong></div>`;
}

function assetAmount(value, symbol) {
  return `${number(value, symbol === "USD" || symbol === "NGN" ? 2 : 8)} ${safe(symbol)}`;
}

function pageNumbers(currentPage, totalPages) {
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function paginatedItems(key, items) {
  const pagination = state.pagination[key];
  const totalPages = Math.max(1, Math.ceil(items.length / pagination.pageSize));
  pagination.page = Math.min(Math.max(1, pagination.page), totalPages);

  const start = (pagination.page - 1) * pagination.pageSize;
  return items.slice(start, start + pagination.pageSize);
}

function renderPagination(key, totalItems, label) {
  const container = document.querySelector(`#${key}-pagination`);
  if (!container) return;

  const pagination = state.pagination[key];
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  pagination.page = Math.min(Math.max(1, pagination.page), totalPages);

  const startItem = totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(totalItems, pagination.page * pagination.pageSize);
  const pages = pageNumbers(pagination.page, totalPages);

  container.innerHTML = `<div class="pagination-summary">
    Showing <strong>${startItem}-${endItem}</strong> of <strong>${totalItems}</strong> ${safe(label)}
  </div>
  <div class="pagination-controls">
    <label>
      <span>Rows</span>
      <select data-action="page-size" data-key="${safe(key)}">
        ${[10, 25, 50]
          .map((size) => `<option value="${size}"${pagination.pageSize === size ? " selected" : ""}>${size}</option>`)
          .join("")}
      </select>
    </label>
    <button class="pagination-button" data-action="page" data-key="${safe(key)}" data-page="${pagination.page - 1}" type="button"${
      pagination.page === 1 ? " disabled" : ""
    }>Previous</button>
    <div class="page-number-group">
      ${pages
        .map(
          (page) => `<button class="pagination-button page-number${page === pagination.page ? " active" : ""}" data-action="page" data-key="${safe(
            key
          )}" data-page="${page}" type="button">${page}</button>`
        )
        .join("")}
    </div>
    <button class="pagination-button" data-action="page" data-key="${safe(key)}" data-page="${pagination.page + 1}" type="button"${
      pagination.page === totalPages ? " disabled" : ""
    }>Next</button>
  </div>`;
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
  const users = paginatedItems("users", state.users);
  document.querySelector("#users-table").innerHTML = users
    .map((user) => {
      const selected = state.selectedUserId === user.id ? " selected-row" : "";
      return `<tr class="${selected}">
        <td><strong>${safe(user.fullName)}</strong></td>
        <td>${safe(user.email)}</td>
        <td>${safe(user.phone)}</td>
        <td>${statusChip(user.kycStatus)}</td>
        <td>${date(user.createdAt)}</td>
        <td class="actions-cell">
          <button class="table-button" data-action="view-user" data-id="${safe(user.id)}" type="button">View</button>
        </td>
      </tr>`;
    })
    .join("");
  renderPagination("users", state.users.length, "users");
  renderUserDetails();
}

function renderUserDetailTransactions(transactions) {
  if (!transactions.length) return emptyMessage("No transactions yet.");
  return `<div class="detail-table-wrap">
    <table class="compact-table">
      <thead>
        <tr>
          <th>Reference</th>
          <th>Type</th>
          <th>Status</th>
          <th>From</th>
          <th>To</th>
          <th>Fee</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${transactions
          .map(
            (item) => `<tr>
              <td class="mono">${safe(item.reference)}</td>
              <td>${safe(item.type)}</td>
              <td>${statusChip(item.status)}</td>
              <td>${assetAmount(item.fromAmount, item.fromAsset)}</td>
              <td>${assetAmount(item.toAmount, item.toAsset)}</td>
              <td>${money(item.feeAmount)}</td>
              <td>${date(item.createdAt)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderUserDetailKyc(items) {
  if (!items.length) return emptyMessage("No KYC submission on file.");
  return items
    .map((item) => {
      const selfie = item.selfieImageUrl
        ? `<a class="inline-link" href="${safe(item.selfieImageUrl)}" target="_blank" rel="noreferrer">Selfie</a>`
        : `<span class="muted">No selfie</span>`;
      const documentImage = item.documentImageUrl
        ? `<a class="inline-link" href="${safe(item.documentImageUrl)}" target="_blank" rel="noreferrer">Document image</a>`
        : `<span class="muted">No document image</span>`;

      return `<article class="mini-card">
        <div class="mini-card-header">
          <strong>${safe(item.legalName)}</strong>
          ${statusChip(item.status)}
        </div>
        <div class="detail-grid">
          ${detailField("Country", item.country)}
          ${detailField("Document", `${item.documentType} ${item.documentNumber}`)}
          ${detailField("Submitted", date(item.submittedAt))}
          ${detailField("Reviewed", date(item.reviewedAt))}
          ${detailField("Reviewer note", item.reviewerNote || "None")}
        </div>
        <div class="link-row">${selfie}${documentImage}</div>
      </article>`;
    })
    .join("");
}

function renderUserDetailBalances(wallet) {
  const balances = wallet?.balances || [];
  if (!balances.length) return emptyMessage("No wallet balances yet.");
  return `<div class="detail-table-wrap">
    <table class="compact-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Available</th>
          <th>Locked</th>
        </tr>
      </thead>
      <tbody>
        ${balances
          .map(
            (balance) => `<tr>
              <td><strong>${safe(balance.assetSymbol)}</strong></td>
              <td>${number(balance.available, balance.assetSymbol === "USD" || balance.assetSymbol === "NGN" ? 2 : 8)}</td>
              <td>${number(balance.locked, balance.assetSymbol === "USD" || balance.assetSymbol === "NGN" ? 2 : 8)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderUserDetailAddresses(wallet) {
  const addresses = wallet?.depositAddresses || [];
  if (!addresses.length) return emptyMessage("No deposit addresses yet.");
  return addresses
    .map(
      (address) => `<article class="mini-card">
        <div class="mini-card-header">
          <strong>${safe(address.assetSymbol)}</strong>
          <span class="muted">${safe(address.network)}</span>
        </div>
        <p class="mono break-text">${safe(address.address)}</p>
      </article>`
    )
    .join("");
}

function renderUserDetailWithdrawals(withdrawals) {
  if (!withdrawals.length) return emptyMessage("No withdrawal requests.");
  return `<div class="detail-table-wrap">
    <table class="compact-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Amount</th>
          <th>Network</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${withdrawals
          .map(
            (item) => `<tr>
              <td><strong>${safe(item.assetSymbol)}</strong></td>
              <td>${number(item.amount, 8)} <span class="muted">fee ${number(item.feeAssetAmount, 8)}</span></td>
              <td>${safe(item.network)}</td>
              <td>${statusChip(item.status)}</td>
              <td>${date(item.createdAt)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderUserDetailNotifications(notifications) {
  if (!notifications.length) return emptyMessage("No notifications.");
  return notifications
    .map(
      (item) => `<article class="mini-card">
        <div class="mini-card-header">
          <strong>${safe(item.title)}</strong>
          ${statusChip(item.isRead ? "read" : "unread")}
        </div>
        <p>${safe(item.body)}</p>
        <span class="muted">${safe(item.type)} · ${date(item.createdAt)}</span>
      </article>`
    )
    .join("");
}

function renderUserDetailPriceAlerts(alerts) {
  if (!alerts.length) return emptyMessage("No price alerts.");
  return alerts
    .map(
      (item) => `<article class="mini-card">
        <div class="mini-card-header">
          <strong>${safe(item.assetSymbol)} ${safe(item.direction)} ${money(item.targetPriceUsd)}</strong>
          ${statusChip(item.isActive ? "active" : "inactive")}
        </div>
        <span class="muted">Created ${date(item.createdAt)} · Triggered ${date(item.triggeredAt)}</span>
      </article>`
    )
    .join("");
}

function renderUserDetailDevices(devices) {
  if (!devices.length) return emptyMessage("No registered devices.");
  return devices
    .map(
      (item) => `<article class="mini-card">
        <div class="mini-card-header">
          <strong>${safe(item.platform)}</strong>
          <span class="mono">...${safe(item.tokenEnding)}</span>
        </div>
        <span class="muted">Created ${date(item.createdAt)} · Last seen ${date(item.lastSeenAt)}</span>
      </article>`
    )
    .join("");
}

function renderUserDetails() {
  const panel = document.querySelector("#user-detail-panel");
  if (!state.selectedUserId) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  if (state.selectedUserLoading) {
    panel.innerHTML = `<div class="detail-loading">Loading user details...</div>`;
    return;
  }

  const details = state.selectedUserDetails;
  if (!details) {
    panel.innerHTML = `<div class="detail-loading">Select a user to view their details.</div>`;
    return;
  }

  const user = details.user;
  const watchlist = user.watchlist?.length ? user.watchlist.join(", ") : "None";
  const activeAlerts = details.priceAlerts?.filter((alert) => alert.isActive).length || 0;
  const devices = details.deviceTokens?.length || 0;

  panel.innerHTML = `<div class="detail-header">
    <div>
      <p class="eyebrow">Single User</p>
      <h3>${safe(user.fullName)}</h3>
      <p>${safe(user.email)} · ${safe(user.phone)}</p>
    </div>
    <button class="secondary-button" data-action="close-user" type="button">Close</button>
  </div>

  <div class="detail-summary">
    <article class="summary-tile"><span>Portfolio</span><strong>${money(details.portfolioValueUsd)}</strong></article>
    <article class="summary-tile"><span>KYC</span><strong>${safe(user.kycStatus.replaceAll("_", " "))}</strong></article>
    <article class="summary-tile"><span>Transactions</span><strong>${details.transactions.length}</strong></article>
    <article class="summary-tile"><span>Active alerts</span><strong>${activeAlerts}</strong></article>
  </div>

  <div class="detail-section-grid">
    <section class="detail-section">
      <h4>Account</h4>
      <div class="detail-grid">
        ${detailField("User ID", user.id)}
        ${detailField("Role", user.role)}
        ${detailField("Created", date(user.createdAt))}
        ${detailField("Avatar URL", user.avatarUrl || "None")}
        ${detailField("Watchlist", watchlist)}
      </div>
    </section>
    <section class="detail-section">
      <h4>Security & Settings</h4>
      <div class="detail-grid">
        ${detailField("2FA enabled", yesNo(user.twoFactorEnabled))}
        ${detailField("Fiat currency", user.settings?.fiatCurrency)}
        ${detailField("Theme", user.settings?.theme)}
        ${detailField("Price alerts", yesNo(user.settings?.priceAlerts))}
        ${detailField("Push notifications", yesNo(user.settings?.pushNotifications))}
        ${detailField("Biometric login", yesNo(user.settings?.biometricEnabled))}
        ${detailField("Registered devices", devices)}
      </div>
    </section>
  </div>

  <section class="detail-section">
    <h4>Wallet Balances</h4>
    ${renderUserDetailBalances(details.wallet)}
  </section>

  <section class="detail-section">
    <h4>Deposit Addresses</h4>
    <div class="mini-card-grid">${renderUserDetailAddresses(details.wallet)}</div>
  </section>

  <section class="detail-section">
    <h4>KYC Submissions</h4>
    <div class="mini-card-grid">${renderUserDetailKyc(details.kycSubmissions || [])}</div>
  </section>

  <section class="detail-section">
    <h4>Withdrawals</h4>
    ${renderUserDetailWithdrawals(details.withdrawals || [])}
  </section>

  <section class="detail-section">
    <h4>Recent Transactions</h4>
    ${renderUserDetailTransactions(details.transactions || [])}
  </section>

  <section class="detail-section">
    <h4>Recent Notifications</h4>
    <div class="mini-card-grid">${renderUserDetailNotifications(details.notifications || [])}</div>
  </section>

  <section class="detail-section">
    <h4>Price Alerts</h4>
    <div class="mini-card-grid">${renderUserDetailPriceAlerts(details.priceAlerts || [])}</div>
  </section>

  <section class="detail-section">
    <h4>Registered Devices</h4>
    <div class="mini-card-grid">${renderUserDetailDevices(details.deviceTokens || [])}</div>
  </section>`;
}

function renderKyc() {
  const kyc = paginatedItems("kyc", state.kyc);
  document.querySelector("#kyc-table").innerHTML = kyc
    .map((item) => {
      const reviewActions =
        item.status === "pending"
          ? `<button class="table-button approve" data-action="kyc" data-status="approved" data-id="${item.id}" type="button">Approve</button>
             <button class="table-button reject" data-action="kyc" data-status="rejected" data-id="${item.id}" type="button">Reject</button>`
          : `<span class="muted">Reviewed</span>`;
      const actions = `<button class="table-button" data-action="view-kyc" data-id="${safe(item.id)}" type="button">View</button>${reviewActions}`;
      const photo = item.selfieImageUrl
        ? `<a class="kyc-photo-link" href="${safe(item.selfieImageUrl)}" target="_blank" rel="noreferrer">
             <img class="kyc-photo" src="${safe(item.selfieImageUrl)}" alt="${safe(item.legalName)} selfie" />
           </a>`
        : `<span class="muted">No photo</span>`;
      const documentLink = item.documentImageUrl
        ? `<br><a class="inline-link" href="${safe(item.documentImageUrl)}" target="_blank" rel="noreferrer">View image</a>`
        : "";

      const selected = state.selectedKycId === item.id ? " selected-row" : "";
      return `<tr class="${selected}">
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
  renderPagination("kyc", state.kyc.length, "KYC submissions");
  renderKycDetails();
}

function renderKycPreview(title, imageUrl, fallback) {
  if (!imageUrl) {
    return `<article class="kyc-preview empty-preview">
      <span>${safe(title)}</span>
      <strong>${safe(fallback)}</strong>
    </article>`;
  }

  return `<a class="kyc-preview" href="${safe(imageUrl)}" target="_blank" rel="noreferrer">
    <span>${safe(title)}</span>
    <img src="${safe(imageUrl)}" alt="${safe(title)} preview" />
    <strong>Open full image</strong>
  </a>`;
}

function renderKycDetails() {
  const panel = document.querySelector("#kyc-detail-panel");
  if (!state.selectedKycId) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  const item = state.kyc.find((kyc) => kyc.id === state.selectedKycId);
  if (!item) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    state.selectedKycId = null;
    return;
  }

  const user = state.users.find((candidate) => candidate.id === item.userId);
  const reviewActions =
    item.status === "pending"
      ? `<button class="table-button approve" data-action="kyc" data-status="approved" data-id="${safe(item.id)}" type="button">Approve</button>
         <button class="table-button reject" data-action="kyc" data-status="rejected" data-id="${safe(item.id)}" type="button">Reject</button>`
      : `<span class="muted">Reviewed</span>`;

  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="detail-header">
    <div>
      <p class="eyebrow">KYC Submission</p>
      <h3>${safe(item.legalName)}</h3>
      <p>${safe(user?.email || "No linked user email")} · ${safe(user?.phone || "No phone")}</p>
    </div>
    <div class="detail-actions">
      ${reviewActions}
      <button class="secondary-button" data-action="close-kyc" type="button">Close</button>
    </div>
  </div>

  <div class="detail-summary">
    <article class="summary-tile"><span>Status</span><strong>${safe(item.status.replaceAll("_", " "))}</strong></article>
    <article class="summary-tile"><span>Country</span><strong>${safe(item.country)}</strong></article>
    <article class="summary-tile"><span>Submitted</span><strong>${date(item.submittedAt)}</strong></article>
    <article class="summary-tile"><span>Reviewed</span><strong>${date(item.reviewedAt)}</strong></article>
  </div>

  <div class="detail-section-grid">
    <section class="detail-section">
      <h4>Identity</h4>
      <div class="detail-grid">
        ${detailField("Submission ID", item.id)}
        ${detailField("User ID", item.userId)}
        ${detailField("Legal name", item.legalName)}
        ${detailField("Document type", item.documentType)}
        ${detailField("Document number", item.documentNumber)}
        ${detailField("Reviewer note", item.reviewerNote || "None")}
      </div>
    </section>
    <section class="detail-section">
      <h4>Linked Account</h4>
      <div class="detail-grid">
        ${detailField("Customer", user?.fullName || "Unknown user")}
        ${detailField("Email", user?.email || "Not available")}
        ${detailField("Phone", user?.phone || "Not available")}
        ${detailField("Account KYC", user?.kycStatus || "Not available")}
        ${detailField("Created", user ? date(user.createdAt) : "Not available")}
      </div>
    </section>
  </div>

  <section class="detail-section">
    <h4>Submitted Images</h4>
    <div class="kyc-preview-grid">
      ${renderKycPreview("Selfie photo", item.selfieImageUrl, "No selfie uploaded")}
      ${renderKycPreview("Document image", item.documentImageUrl, "No document image uploaded")}
    </div>
  </section>`;
}

function closeKycDetails() {
  state.selectedKycId = null;
  renderKyc();
}

function renderWithdrawals() {
  const withdrawals = paginatedItems("withdrawals", state.withdrawals);
  document.querySelector("#withdrawals-table").innerHTML = withdrawals
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
  renderPagination("withdrawals", state.withdrawals.length, "withdrawals");
}

function renderTransactions() {
  const transactions = paginatedItems("transactions", state.transactions);
  document.querySelector("#transactions-table").innerHTML = transactions
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
  renderPagination("transactions", state.transactions.length, "transactions");
}

function renderAssets() {
  const marketStatus = document.querySelector("#market-status");
  if (marketStatus) {
    marketStatus.textContent = `Live sim updated ${time(state.market?.lastUpdatedAt)}`;
  }

  const assets = paginatedItems("assets", state.assets);
  document.querySelector("#assets-table").innerHTML = assets
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
  renderPagination("assets", state.assets.length, "assets");
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

async function loadUserDetails(userId) {
  state.selectedUserId = userId;
  state.selectedUserDetails = null;
  state.selectedUserLoading = true;
  renderUsers();

  try {
    state.selectedUserDetails = await api(`/admin/users/${encodeURIComponent(userId)}`);
  } finally {
    state.selectedUserLoading = false;
    renderUsers();
  }
}

function closeUserDetails() {
  state.selectedUserId = null;
  state.selectedUserDetails = null;
  state.selectedUserLoading = false;
  renderUsers();
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
    if (target.dataset.action === "view-user") {
      await loadUserDetails(target.dataset.id);
    }
    if (target.dataset.action === "close-user") {
      closeUserDetails();
    }
    if (target.dataset.action === "view-kyc") {
      state.selectedKycId = target.dataset.id;
      renderKyc();
    }
    if (target.dataset.action === "close-kyc") {
      closeKycDetails();
    }
    if (target.dataset.action === "page") {
      state.pagination[target.dataset.key].page = Number(target.dataset.page);
      render();
    }
  } catch (error) {
    showAlert(error.message, "error");
  }
});

document.body.addEventListener("change", (event) => {
  const target = event.target.closest("[data-action='page-size']");
  if (!target) return;

  state.pagination[target.dataset.key].pageSize = Number(target.value);
  state.pagination[target.dataset.key].page = 1;
  render();
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
