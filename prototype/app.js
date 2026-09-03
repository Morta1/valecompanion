const modules = [
  { id: "loot", code: "VL", icon: "coins", name: "Loot", detail: "Inventory and filters", kicker: "Live inventory", title: "Loot ledger", freshness: "Updated just now" },
  { id: "market", code: "VM", icon: "storefront", name: "Market", detail: "Listings and prices", kicker: "Global listings", title: "Market ledger", freshness: "Snapshot 6 minutes ago" },
  { id: "module-3", code: "03", name: "Third module", detail: "Reserved capacity", kicker: "Future module", title: "Module slot 03", freshness: "Not connected", future: true },
  { id: "module-4", code: "04", name: "Fourth module", detail: "Reserved capacity", kicker: "Future module", title: "Module slot 04", freshness: "Not connected", future: true },
];

const params = new URLSearchParams(location.search);
let activeModule = modules.some((module) => module.id === params.get("module")) ? params.get("module") : "loot";
let variant = ["rail", "ribbon", "dock"].includes(params.get("variant")) ? params.get("variant") : "dock";
let commandIndex = 0;

function moduleIcon(module) {
  if (module.icon === "coins") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>`;
  }
  if (module.icon === "storefront") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5V21h16V10.5M3 10.5 5.2 4h13.6l2.2 6.5"/><path d="M3 10.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.2 2.5s2.2-1.1 2.2-2.5c0 1.4 1 2.5 2.2 2.5s2.2-1.1 2.2-2.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5"/><path d="M8 21v-5.5h5V21m3-5.5h2"/></svg>`;
  }
  return module.code;
}

const buttonMarkup = (module, index) => `
  <button class="module-button${module.future ? " future" : ""}" type="button" data-module="${module.id}" data-label="${module.name}" title="${module.name} · Ctrl ${index + 1}">
    <span class="module-code" aria-hidden="true">${moduleIcon(module)}</span>
    <span class="module-copy"><b>${module.name}</b><small>${module.detail}</small></span>
    <span class="module-key">0${index + 1}</span>
  </button>`;

for (const nav of document.querySelectorAll(".module-nav")) {
  nav.innerHTML = modules.map(buttonMarkup).join("");
}

const mobileNav = document.createElement("nav");
mobileNav.className = "mobile-module-nav";
mobileNav.setAttribute("aria-label", "Companion modules");
mobileNav.innerHTML = modules.map(buttonMarkup).join("");
document.body.append(mobileNav);

const commandDialog = document.querySelector("#command-dialog");
const commandQuery = document.querySelector("#command-query");
const commandResults = document.querySelector(".command-results");
const captureDrawer = document.querySelector("#capture-drawer");
const settingsDrawer = document.querySelector("#settings-drawer");
const drawerScrim = document.querySelector(".drawer-scrim");

function writeUrl({ replace = false } = {}) {
  const next = new URL(location.href);
  next.searchParams.set("variant", variant);
  next.searchParams.set("module", activeModule);
  history[replace ? "replaceState" : "pushState"]({}, "", next);
}

function applyVariant(nextVariant, { updateUrl = true } = {}) {
  if (!["rail", "ribbon", "dock"].includes(nextVariant)) return;
  variant = nextVariant;
  const shellSetting = document.querySelector("#settings-shell");
  if (shellSetting) shellSetting.value = variant;
  document.body.dataset.variant = variant;
  for (const link of document.querySelectorAll("[data-variant-link]")) {
    link.setAttribute("aria-current", String(link.dataset.variantLink === variant));
  }
  if (updateUrl) writeUrl();
}

function switchModule(id, { updateUrl = true, focusWorkspace = false } = {}) {
  const module = modules.find((candidate) => candidate.id === id);
  if (!module) return;
  activeModule = id;
  document.body.dataset.module = id;

  for (const button of document.querySelectorAll("[data-module]")) {
    const selected = button.dataset.module === id;
    button.setAttribute("aria-current", selected ? "page" : "false");
    if (selected && focusWorkspace) button.focus({ preventScroll: true });
  }
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== id;
  }

  document.querySelector("#module-kicker").textContent = module.kicker;
  document.querySelector("#module-title").textContent = module.title;
  document.querySelector("#module-freshness").textContent = module.freshness;
  document.title = `${module.name} — Vale Companion switcher prototype`;
  if (updateUrl) writeUrl();
}

function visibleCommandModules() {
  const needle = commandQuery.value.trim().toLowerCase();
  return needle ? modules.filter((module) => `${module.name} ${module.detail}`.toLowerCase().includes(needle)) : modules;
}

function renderCommandResults() {
  const visible = visibleCommandModules();
  commandIndex = Math.max(0, Math.min(commandIndex, visible.length - 1));
  commandResults.innerHTML = visible.map((module, index) => `
    <button class="command-result${index === commandIndex ? " active" : ""}" type="button" data-command-module="${module.id}">
      <span class="module-code" aria-hidden="true">${moduleIcon(module)}</span>
      <span><b>${module.name}</b><small>${module.detail}</small></span>
      <kbd>Ctrl ${modules.indexOf(module) + 1}</kbd>
    </button>`).join("") || `<div class="command-result"><span></span><span><b>No module found</b><small>Try another name.</small></span></div>`;
}

function openCommand() {
  commandIndex = Math.max(0, modules.findIndex((module) => module.id === activeModule));
  commandQuery.value = "";
  renderCommandResults();
  commandDialog.showModal();
  requestAnimationFrame(() => commandQuery.focus());
}

function openDrawer(drawer) {
  for (const candidate of document.querySelectorAll(".side-drawer")) {
    const open = candidate === drawer;
    candidate.classList.toggle("open", open);
    candidate.setAttribute("aria-hidden", String(!open));
  }
  drawerScrim.classList.add("open");
}

function closeDrawers() {
  for (const drawer of document.querySelectorAll(".side-drawer")) {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  drawerScrim.classList.remove("open");
}

document.addEventListener("click", (event) => {
  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) switchModule(moduleButton.dataset.module);

  const commandModule = event.target.closest("[data-command-module]");
  if (commandModule) {
    switchModule(commandModule.dataset.commandModule);
    commandDialog.close();
  }
  if (event.target.closest("[data-command-open]")) openCommand();
  if (event.target.closest("[data-capture-toggle]")) openDrawer(captureDrawer);
  if (event.target.closest("[data-settings-toggle]")) openDrawer(settingsDrawer);
  if (event.target.closest("[data-drawer-close]")) closeDrawers();

  const variantLink = event.target.closest("[data-variant-link]");
  if (variantLink) {
    event.preventDefault();
    applyVariant(variantLink.dataset.variantLink);
  }

  const lootItem = event.target.closest("[data-item]");
  if (lootItem) {
    for (const item of document.querySelectorAll("[data-item]")) item.classList.toggle("selected", item === lootItem);
    const title = document.querySelector("#loot-inspector h2");
    const subtitle = document.querySelector("#loot-inspector .inspector-title p");
    title.textContent = lootItem.dataset.item;
    subtitle.textContent = lootItem.dataset.detail;
  }

  const marketItem = event.target.closest("[data-market-item]");
  if (marketItem) {
    for (const item of document.querySelectorAll("[data-market-item]")) item.classList.toggle("selected", item === marketItem);
    document.querySelector("#market-selected-name").textContent = marketItem.dataset.marketItem;
  }
});

document.querySelectorAll("[data-capture-toggle][role=button]").forEach((control) => {
  control.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCapture();
    }
  });
});

commandQuery.addEventListener("input", () => {
  commandIndex = 0;
  renderCommandResults();
});
commandQuery.addEventListener("keydown", (event) => {
  const visible = visibleCommandModules();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    commandIndex = Math.min(commandIndex + 1, visible.length - 1);
    renderCommandResults();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    commandIndex = Math.max(commandIndex - 1, 0);
    renderCommandResults();
  } else if (event.key === "Enter" && visible[commandIndex]) {
    event.preventDefault();
    switchModule(visible[commandIndex].id);
    commandDialog.close();
  }
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (commandDialog.open) commandDialog.close();
    else openCommand();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    switchModule(modules[Number(event.key) - 1].id, { focusWorkspace: true });
  }
  if (event.key === "Escape" && document.querySelector(".side-drawer.open")) closeDrawers();
});

window.addEventListener("popstate", () => {
  const next = new URLSearchParams(location.search);
  applyVariant(next.get("variant") || "dock", { updateUrl: false });
  switchModule(next.get("module") || "loot", { updateUrl: false });
});

document.querySelector("#loot-search").addEventListener("input", (event) => {
  const needle = event.currentTarget.value.trim().toLowerCase();
  for (const item of document.querySelectorAll("#loot-grid [data-item]")) {
    item.hidden = needle !== "" && !`${item.dataset.item} ${item.dataset.detail}`.toLowerCase().includes(needle);
  }
});

document.querySelector("#market-search").addEventListener("input", (event) => {
  const needle = event.currentTarget.value.trim().toLowerCase();
  let visible = 0;
  for (const row of document.querySelectorAll("#market-rows [data-market-item]")) {
    row.hidden = needle !== "" && !row.textContent.toLowerCase().includes(needle);
    if (!row.hidden) visible += 1;
  }
  document.querySelector("#market-count").textContent = `${visible} listing${visible === 1 ? "" : "s"}`;
});
document.querySelector("#settings-shell").addEventListener("change", (event) => {
  applyVariant(event.currentTarget.value);
});

applyVariant(variant, { updateUrl: false });
switchModule(activeModule, { updateUrl: false });
writeUrl({ replace: true });
