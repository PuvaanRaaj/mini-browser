const STORAGE_KEY = "accounts";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const formEl = document.getElementById("add-form");
const errorEl = document.getElementById("form-error");
const addToggle = document.getElementById("add-toggle");

let accounts = [];
let copiedId = null;

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  accounts = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  render();
}

async function save() {
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
  render();
}

function titleOf(account) {
  if (account.issuer && account.label) return `${account.issuer} — ${account.label}`;
  return account.issuer || account.label || "Account";
}

function formatCode(code) {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

async function render() {
  listEl.innerHTML = "";
  emptyEl.hidden = accounts.length > 0;
  const now = Date.now();

  for (const account of accounts) {
    const code = await generateCode(account, now);
    const remaining = remainingSeconds(account.period || 30, now);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "account";
    button.innerHTML = `
      <span>
        <span class="meta">${titleOf(account)}</span>
        <span class="code">${formatCode(code)}</span>
        <span class="hint">${copiedId === account.id ? "Copied" : `${remaining}s · click to copy`}</span>
      </span>
    `;
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(code);
      copiedId = account.id;
      render();
    });
    item.append(button);
    listEl.append(item);
  }
}

addToggle.addEventListener("click", () => {
  formEl.hidden = !formEl.hidden;
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const secret = document.getElementById("secret").value.trim();
  const issuer = document.getElementById("issuer").value.trim();
  const label = document.getElementById("label").value.trim();
  try {
    const parsed = secret.toLowerCase().startsWith("otpauth://")
      ? parseOtpAuth(secret)
      : {
          issuer,
          label: label || "Account",
          secret: normalizeSecret(secret),
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        };
    if (issuer) parsed.issuer = issuer;
    if (label) parsed.label = label;
    accounts.push({ ...parsed, id: crypto.randomUUID(), createdAt: Date.now() });
    formEl.reset();
    formEl.hidden = true;
    await save();
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = error instanceof Error ? error.message : "Could not add account.";
  }
});

document.getElementById("demo").addEventListener("click", async () => {
  accounts.push({
    id: crypto.randomUUID(),
    issuer: "Minimal",
    label: "demo@minimal.local",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: Date.now(),
  });
  await save();
});

load();
setInterval(render, 1000);
