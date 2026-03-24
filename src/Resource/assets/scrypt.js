const STORAGE_KEY = "db-diagram-state-v1";
const THEME_STORAGE_KEY = "db-digram-theme-v1";
const AUTH_STORAGE_KEY = "db-digram-auth-v1";
const SCHEMA_ENDPOINT = "/diagram/schema";
const TABLE_CREATE_ENDPOINT = "/diagram/tables";
const TABLE_UPDATE_ENDPOINT = "/diagram/tables";
const EXPORT_DB_SQL_ENDPOINT = "/diagram/export/sql";
const TABLE_COLUMN_TYPES = ["string", "text", "integer", "bigInteger", "boolean", "date", "dateTime", "decimal"];

function parseAuthConfig() {
    const tag = document.querySelector('meta[name="db-digram-auth-config"]');
    const raw = tag?.getAttribute("content") || "";

    if (!raw) {
        return { enabled: false, email: "", password: "" };
    }

    try {
        const parsed = JSON.parse(raw);
        return {
            enabled: Boolean(parsed?.enabled),
            email: String(parsed?.email || ""),
            password: String(parsed?.password || "")
        };
    } catch (error) {
        return { enabled: false, email: "", password: "" };
    }
}

const AUTH_CONFIG = parseAuthConfig();

const state = {
    tables: []
};

const ui = {
    authOverlay: document.getElementById("authOverlay"),
    authForm: document.getElementById("authForm"),
    authEmailInput: document.getElementById("authEmailInput"),
    authPasswordInput: document.getElementById("authPasswordInput"),
    authError: document.getElementById("authError"),

    themeToggleBtn: document.getElementById("themeToggleBtn"),
    addTableBtn: document.getElementById("addTableBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    autoZoomBtn: document.getElementById("autoZoomBtn"),
    zoomLevel: document.getElementById("zoomLevel"),
    exportDbBtn: document.getElementById("exportDbBtn"),
    importInput: document.getElementById("importInput"),
    tableList: document.getElementById("tableList"),
    scene: document.getElementById("scene"),
    canvas: document.getElementById("canvas"),
    canvasWrap: document.getElementById("canvasWrap"),
    relationLayer: document.getElementById("relationLayer"),

    tableDialog: document.getElementById("tableDialog"),
    tableDialogTitle: document.getElementById("tableDialogTitle"),
    tableForm: document.getElementById("tableForm"),
    tableNameInput: document.getElementById("tableNameInput"),
    tableColumnsBuilder: document.getElementById("tableColumnsBuilder"),
    tableColumnsList: document.getElementById("tableColumnsList"),
    addTableColumnBtn: document.getElementById("addTableColumnBtn"),
    tableSaveBtn: document.getElementById("tableSaveBtn"),
    cancelTableBtn: document.getElementById("cancelTableBtn"),

    columnDialog: document.getElementById("columnDialog"),
    columnDialogTitle: document.getElementById("columnDialogTitle"),
    columnForm: document.getElementById("columnForm"),
    columnNameInput: document.getElementById("columnNameInput"),
    columnTypeInput: document.getElementById("columnTypeInput"),
    columnDefaultInput: document.getElementById("columnDefaultInput"),
    pkInput: document.getElementById("pkInput"),
    uniqueInput: document.getElementById("uniqueInput"),
    notNullInput: document.getElementById("notNullInput"),
    fkInput: document.getElementById("fkInput"),
    fkSection: document.getElementById("fkSection"),
    refTableInput: document.getElementById("refTableInput"),
    refColumnInput: document.getElementById("refColumnInput"),
    cancelColumnBtn: document.getElementById("cancelColumnBtn")
};

let currentTableEditId = null;
let currentColumnContext = null;
const rowElementMap = new Map();
let currentZoom = 1;
let zoomStepOffset = 0;
let lastSpacingTableCount = -1;
let isTableSavePending = false;

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.35;

function isAuthEnabled() {
    return Boolean(AUTH_CONFIG.enabled);
}

function showDiagramApp() {
    document.body.classList.add("db-digram-auth-ready");
}

function hideDiagramApp() {
    document.body.classList.remove("db-digram-auth-ready");
}

function setAuthOverlayVisible(isVisible) {
    if (!ui.authOverlay) return;
    ui.authOverlay.hidden = !isVisible;
}

function readSavedAuth() {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
        return null;
    }
}

function saveAuth(email) {
    localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
            email,
            authenticatedAt: new Date().toISOString()
        })
    );
}

function clearAuth() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

function canAutoAuthenticate() {
    if (!isAuthEnabled()) return true;

    const expectedEmail = String(AUTH_CONFIG.email || "");
    const expectedPassword = String(AUTH_CONFIG.password || "");
    if (!expectedEmail || !expectedPassword) {
        return false;
    }

    const saved = readSavedAuth();
    if (!saved) return false;

    return String(saved.email || "") === expectedEmail;
}

function handleAuthSubmit(event) {
    event.preventDefault();

    const expectedEmail = String(AUTH_CONFIG.email || "");
    const expectedPassword = String(AUTH_CONFIG.password || "");
    const enteredEmail = String(ui.authEmailInput?.value || "").trim();
    const enteredPassword = String(ui.authPasswordInput?.value || "");

    if (enteredEmail === expectedEmail && enteredPassword === expectedPassword) {
        saveAuth(enteredEmail);
        if (ui.authError) {
            ui.authError.hidden = true;
        }
        setAuthOverlayVisible(false);
        showDiagramApp();
        initializeDiagram();
        return;
    }

    clearAuth();
    if (ui.authError) {
        ui.authError.hidden = false;
    }
    if (ui.authPasswordInput) {
        ui.authPasswordInput.value = "";
        ui.authPasswordInput.focus();
    }
}

function startApp() {
    applyTheme(getPreferredTheme());

    if (!isAuthEnabled()) {
        showDiagramApp();
        initializeDiagram();
        return;
    }

    if (canAutoAuthenticate()) {
        setAuthOverlayVisible(false);
        showDiagramApp();
        initializeDiagram();
        return;
    }

    hideDiagramApp();
    setAuthOverlayVisible(true);
    if (ui.authForm) {
        ui.authForm.addEventListener("submit", handleAuthSubmit);
    }
    if (ui.authError) {
        ui.authError.hidden = true;
    }
    if (ui.authEmailInput) {
        ui.authEmailInput.focus();
    }
}

function getPreferredTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeToggleLabel(theme) {
    if (!ui.themeToggleBtn) return;

    ui.themeToggleBtn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    ui.themeToggleBtn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
}

function applyTheme(theme) {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    updateThemeToggleLabel(resolvedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
}

function id(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function getTable(tableId) {
    return state.tables.find((table) => table.id === tableId);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getBaseZoomByTableCount(count) {
    if (count <= 6) return 1;
    if (count <= 10) return 0.92;
    if (count <= 14) return 0.84;
    if (count <= 18) return 0.76;
    if (count <= 24) return 0.68;
    return 0.6;
}

function getSpreadFactorByTableCount(count) {
    if (count <= 8) return 1.05;
    if (count <= 12) return 1.18;
    if (count <= 16) return 1.3;
    if (count <= 24) return 1.42;
    return 1.5;
}

function getSpacingByTableCount(count) {
    if (count <= 8) return { minX: 360, minY: 240 };
    if (count <= 14) return { minX: 420, minY: 280 };
    if (count <= 20) return { minX: 470, minY: 320 };
    return { minX: 520, minY: 360 };
}

function getFitZoom() {
    const wrapWidth = ui.canvasWrap.clientWidth - 40;
    const wrapHeight = ui.canvasWrap.clientHeight - 40;
    const sceneWidth = ui.scene.offsetWidth || 1200;
    const sceneHeight = ui.scene.offsetHeight || 900;

    if (sceneWidth <= 0 || sceneHeight <= 0) return 1;

    const fitX = wrapWidth / sceneWidth;
    const fitY = wrapHeight / sceneHeight;
    return clamp(Math.min(fitX, fitY), ZOOM_MIN, 1);
}

function updateSceneSize() {
    let maxRight = 1200;
    let maxBottom = 900;

    for (const table of state.tables) {
        const card = document.getElementById(table.id);
        const width = card ? card.offsetWidth : 280;
        const height = card ? card.offsetHeight : 220;
        maxRight = Math.max(maxRight, table.x + width + 140);
        maxBottom = Math.max(maxBottom, table.y + height + 140);
    }

    ui.scene.style.width = `${Math.ceil(maxRight)}px`;
    ui.scene.style.height = `${Math.ceil(maxBottom)}px`;
}

function applyZoom() {
    const count = state.tables.length;
    const baseZoom = getBaseZoomByTableCount(count);
    let targetZoom = clamp(baseZoom + zoomStepOffset * 0.08, ZOOM_MIN, ZOOM_MAX);

    if (zoomStepOffset === 0) {
        targetZoom = Math.min(targetZoom, getFitZoom());
    }

    currentZoom = targetZoom;
    ui.scene.style.transform = `scale(${currentZoom})`;
    ui.zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
}

function adjustSpacingForTableCount() {
    const count = state.tables.length;
    if (count === lastSpacingTableCount) return false;
    lastSpacingTableCount = count;
    if (count < 8) return false;

    const spreadFactor = getSpreadFactorByTableCount(count);
    const spacing = getSpacingByTableCount(count);

    let centerX = 0;
    let centerY = 0;
    for (const table of state.tables) {
        centerX += table.x;
        centerY += table.y;
    }
    centerX /= Math.max(1, state.tables.length);
    centerY /= Math.max(1, state.tables.length);

    if (spreadFactor > 1) {
        for (const table of state.tables) {
            table.x = Math.max(0, Math.round((table.x - centerX) * spreadFactor + centerX));
            table.y = Math.max(0, Math.round((table.y - centerY) * spreadFactor + centerY));
        }
    }

    for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i < state.tables.length; i += 1) {
            for (let j = i + 1; j < state.tables.length; j += 1) {
                const a = state.tables[i];
                const b = state.tables[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const needX = Math.abs(dx) < spacing.minX;
                const needY = Math.abs(dy) < spacing.minY;

                if (!needX || !needY) continue;

                const pushX = (spacing.minX - Math.abs(dx)) / 2;
                const pushY = (spacing.minY - Math.abs(dy)) / 2;
                const dirX = dx === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dx);
                const dirY = dy === 0 ? (j % 2 === 0 ? -1 : 1) : Math.sign(dy);

                a.x = Math.max(0, Math.round(a.x - pushX * dirX));
                b.x = Math.max(0, Math.round(b.x + pushX * dirX));
                a.y = Math.max(0, Math.round(a.y - pushY * dirY));
                b.y = Math.max(0, Math.round(b.y + pushY * dirY));
            }
        }
    }

    return true;
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tables));
}

function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        state.tables = [
            {
                id: id("table"),
                name: "users",
                x: 80,
                y: 100,
                columns: [
                    { id: id("col"), name: "id", type: "INT", defaultValue: "", pk: true, unique: true, notNull: true, fk: false, refTableId: "", refColumnId: "" },
                    { id: id("col"), name: "email", type: "VARCHAR(255)", defaultValue: "", pk: false, unique: true, notNull: true, fk: false, refTableId: "", refColumnId: "" },
                    { id: id("col"), name: "password", type: "VARCHAR(255)", defaultValue: "", pk: false, unique: false, notNull: true, fk: false, refTableId: "", refColumnId: "" }
                ]
            },

            {
                id: id("table"),
                name: "profiles",
                x: 250,
                y: 100,
                columns: [
                    { id: id("col"), name: "id", type: "INT", defaultValue: "", pk: true, unique: true, notNull: true, fk: false, refTableId: "", refColumnId: "" },
                    { id: id("col"), name: "user_id", type: "INT", defaultValue: "", pk: false, unique: false, notNull: true, fk: true, refTableId: "users", refColumnId: "id" },
                    { id: id("col"), name: "bio", type: "TEXT", defaultValue: "", pk: false, unique: false, notNull: false, fk: false, refTableId: "", refColumnId: "" }
                ]
            },

            {
                id: id("table"),
                name: "posts",
                x: 420,
                y: 100,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true, fk: false },
                    { id: id("col"), name: "user_id", type: "INT", pk: false, unique: false, notNull: true, fk: true, refTableId: "users", refColumnId: "id" },
                    { id: id("col"), name: "title", type: "VARCHAR(255)", pk: false, unique: false, notNull: true, fk: false }
                ]
            },

            {
                id: id("table"),
                name: "comments",
                x: 600,
                y: 100,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true, fk: false },
                    { id: id("col"), name: "post_id", type: "INT", notNull: true, fk: true, refTableId: "posts", refColumnId: "id" },
                    { id: id("col"), name: "user_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "categories",
                x: 80,
                y: 260,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true, fk: false },
                    { id: id("col"), name: "name", type: "VARCHAR(150)", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "post_categories",
                x: 260,
                y: 260,
                columns: [
                    { id: id("col"), name: "post_id", type: "INT", notNull: true, fk: true, refTableId: "posts", refColumnId: "id" },
                    { id: id("col"), name: "category_id", type: "INT", notNull: true, fk: true, refTableId: "categories", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "products",
                x: 420,
                y: 260,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "name", type: "VARCHAR(255)", notNull: true },
                    { id: id("col"), name: "price", type: "DECIMAL(10,2)", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "orders",
                x: 600,
                y: 260,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "user_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "order_items",
                x: 780,
                y: 260,
                columns: [
                    { id: id("col"), name: "order_id", type: "INT", notNull: true, fk: true, refTableId: "orders", refColumnId: "id" },
                    { id: id("col"), name: "product_id", type: "INT", notNull: true, fk: true, refTableId: "products", refColumnId: "id" },
                    { id: id("col"), name: "quantity", type: "INT", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "payments",
                x: 960,
                y: 260,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "order_id", type: "INT", notNull: true, fk: true, refTableId: "orders", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "roles",
                x: 80,
                y: 420,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "name", type: "VARCHAR(100)", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "permissions",
                x: 240,
                y: 420,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "name", type: "VARCHAR(100)", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "role_permissions",
                x: 420,
                y: 420,
                columns: [
                    { id: id("col"), name: "role_id", type: "INT", notNull: true, fk: true, refTableId: "roles", refColumnId: "id" },
                    { id: id("col"), name: "permission_id", type: "INT", notNull: true, fk: true, refTableId: "permissions", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "user_roles",
                x: 600,
                y: 420,
                columns: [
                    { id: id("col"), name: "user_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" },
                    { id: id("col"), name: "role_id", type: "INT", notNull: true, fk: true, refTableId: "roles", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "tags",
                x: 780,
                y: 420,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "name", type: "VARCHAR(100)", notNull: true }
                ]
            },

            {
                id: id("table"),
                name: "post_tags",
                x: 960,
                y: 420,
                columns: [
                    { id: id("col"), name: "post_id", type: "INT", notNull: true, fk: true, refTableId: "posts", refColumnId: "id" },
                    { id: id("col"), name: "tag_id", type: "INT", notNull: true, fk: true, refTableId: "tags", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "addresses",
                x: 80,
                y: 580,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "user_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "notifications",
                x: 260,
                y: 580,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "user_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "messages",
                x: 440,
                y: 580,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "sender_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" },
                    { id: id("col"), name: "receiver_id", type: "INT", notNull: true, fk: true, refTableId: "users", refColumnId: "id" }
                ]
            },

            {
                id: id("table"),
                name: "logs",
                x: 620,
                y: 580,
                columns: [
                    { id: id("col"), name: "id", type: "INT", pk: true, unique: true, notNull: true },
                    { id: id("col"), name: "message", type: "TEXT", notNull: true }
                ]
            }

        ];

        state.tables = state.tables.map((table, idx) => normalizeTable(table, idx));
        resolveLegacyReferenceIds();
        saveState();
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        state.tables = Array.isArray(parsed) ? parsed.map((table, idx) => normalizeTable(table, idx)) : [];
        if (resolveLegacyReferenceIds()) {
            saveState();
        }
    } catch (error) {
        state.tables = [];
    }
}

function mapServerSchemaTables(tables) {
    const mappedTables = (Array.isArray(tables) ? tables : []).map((table, idx) => {
        return normalizeTable({
            id: id("table"),
            name: String(table?.name || `table_${idx + 1}`),
            x: 80 + (idx % 5) * 300,
            y: 80 + Math.floor(idx / 5) * 240,
            columns: (Array.isArray(table?.columns) ? table.columns : []).map((column) => {
                return normalizeColumn({
                    id: id("col"),
                    name: String(column?.name || "column"),
                    type: String(column?.type || "TEXT"),
                    defaultValue: column?.defaultValue == null ? "" : String(column.defaultValue),
                    pk: Boolean(column?.pk),
                    unique: Boolean(column?.unique),
                    notNull: Boolean(column?.notNull),
                    fk: Boolean(column?.fk),
                    refTableId: "",
                    refColumnId: "",
                    refTableName: String(column?.refTableName || ""),
                    refColumnName: String(column?.refColumnName || "")
                });
            })
        }, idx);
    });

    const tableByName = new Map();
    for (const table of mappedTables) {
        tableByName.set(String(table.name).trim().toLowerCase(), table);
    }

    for (const table of mappedTables) {
        for (const column of table.columns) {
            if (!column.fk) continue;

            const refTableName = String(column.refTableName || "").trim().toLowerCase();
            const refColumnName = String(column.refColumnName || "").trim().toLowerCase();
            const refTable = tableByName.get(refTableName);
            if (!refTable) continue;

            column.refTableId = refTable.id;
            const refColumn = refTable.columns.find((candidate) => String(candidate.name).trim().toLowerCase() === refColumnName);
            if (refColumn) {
                column.refColumnId = refColumn.id;
            }
        }
    }

    return mappedTables;
}

async function syncSchemaFromServer() {
    const response = await fetch(SCHEMA_ENDPOINT, {
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Schema request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const serverTables = mapServerSchemaTables(payload?.tables || []);
    if (!serverTables.length) {
        return false;
    }

    state.tables = serverTables;
    lastSpacingTableCount = -1;
    zoomStepOffset = 0;
    saveState();
    return true;
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
}

async function createTableOnServer(name, columns = []) {
    const response = await fetch(TABLE_CREATE_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": getCsrfToken()
        },
        body: JSON.stringify({ name, columns })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const validationMessage = payload?.errors ? JSON.stringify(payload.errors) : "";
        const message = payload?.message || payload?.error || validationMessage || `Create table request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

async function updateTableOnServer(currentName, nextName, columns = []) {
    const endpoint = `${TABLE_UPDATE_ENDPOINT}/${encodeURIComponent(currentName)}`;
    const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": getCsrfToken()
        },
        body: JSON.stringify({ name: nextName, columns })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const validationMessage = payload?.errors ? JSON.stringify(payload.errors) : "";
        const message = payload?.message || payload?.error || validationMessage || `Update table request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

async function deleteTableOnServer(tableName) {
    const endpoint = `${TABLE_UPDATE_ENDPOINT}/${encodeURIComponent(tableName)}`;
    const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": getCsrfToken()
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload?.message || payload?.error || `Delete table request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

async function deleteColumnOnServer(tableName, columnName) {
    const endpoint = `${TABLE_UPDATE_ENDPOINT}/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`;
    const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": getCsrfToken()
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload?.message || payload?.error || `Delete column request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

async function initializeDiagram() {
    loadState();
    render();

    try {
        const synced = await syncSchemaFromServer();
        if (synced) {
            render();
        }
    } catch (error) {
        console.warn("Unable to load database schema from server.", error);
    }
}

function renderSidebarList() {
    ui.tableList.innerHTML = "";
    for (const table of state.tables) {
        const item = document.createElement("li");
        item.textContent = `${table.name} (${table.columns.length} cols)`;
        ui.tableList.appendChild(item);
    }
}

function makeBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text;
    return badge;
}

function isColumnReferencedByOtherColumns(tableId, columnId) {
    return state.tables.some((table) => {
        return table.columns.some((column) => {
            return column.fk && column.refTableId === tableId && column.refColumnId === columnId;
        });
    });
}

function hasAnyRelationOnColumn(tableId, columnId) {
    return isColumnReferencedByOtherColumns(tableId, columnId);
}

function hasAnyRelationOnTable(tableId) {
    const table = getTable(tableId);
    if (!table) return false;

    return table.columns.some((column) => isColumnReferencedByOtherColumns(tableId, column.id));
}

async function removeTable(tableId) {
    const table = getTable(tableId);
    if (!table) return;

    try {
        await deleteTableOnServer(table.name);
        await syncSchemaFromServer();
        render();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete table.";
        alert(message);
    }
}

async function removeColumn(tableId, columnId) {
    const table = getTable(tableId);
    if (!table) return;

    const column = table.columns.find((col) => col.id === columnId);
    if (!column) return;

    try {
        await deleteColumnOnServer(table.name, column.name);
        await syncSchemaFromServer();
        render();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete column.";
        alert(message);
    }
}

function openTableDialog(tableId = null) {
    currentTableEditId = tableId;

    if (tableId) {
        const table = getTable(tableId);
        if (!table) return;
        ui.tableDialogTitle.textContent = "Edit Table";
        ui.tableNameInput.value = table.name;
        ui.tableColumnsBuilder.classList.remove("hidden");
        const existingColumns = table.columns.map((column) => ({
            name: column.name,
            type: mapColumnTypeForBuilder(column.type),
            defaultValue: column.defaultValue || "",
            nullable: !column.notNull,
            unique: column.unique,
            fk: column.fk,
            refTableName: column.refTableName || "",
            refColumnName: column.refColumnName || "id"
        }));
        resetTableColumnBuilder(existingColumns);
    } else {
        ui.tableDialogTitle.textContent = "Add Table";
        ui.tableNameInput.value = "";
        ui.tableColumnsBuilder.classList.remove("hidden");
        resetTableColumnBuilder();
    }

    ui.tableDialog.showModal();
}

function normalizeColumn(column) {
    return {
        id: column.id || id("col"),
        name: column.name || "column",
        type: column.type || "TEXT",
        defaultValue: column.defaultValue || "",
        pk: Boolean(column.pk),
        unique: Boolean(column.unique),
        notNull: Boolean(column.notNull),
        fk: Boolean(column.fk),
        refTableId: column.refTableId || "",
        refColumnId: column.refColumnId || "",
        refTableName: column.refTableName || "",
        refColumnName: column.refColumnName || ""
    };
}

function normalizeTable(table, idx = 0) {
    return {
        id: table.id || id("table"),
        name: table.name || `table_${idx + 1}`,
        x: Number.isFinite(table.x) ? table.x : 80 + idx * 40,
        y: Number.isFinite(table.y) ? table.y : 80 + idx * 35,
        columns: Array.isArray(table.columns) ? table.columns.map(normalizeColumn) : []
    };
}

function resolveLegacyReferenceIds() {
    let changed = false;
    const tableById = new Map();
    const tableByName = new Map();

    for (const table of state.tables) {
        tableById.set(String(table.id), table);
        tableByName.set(String(table.name).trim().toLowerCase(), table);
    }

    for (const table of state.tables) {
        for (const column of table.columns) {
            if (!column.fk) continue;

            let targetTable = tableById.get(String(column.refTableId));
            if (!targetTable && column.refTableId) {
                targetTable = tableByName.get(String(column.refTableId).trim().toLowerCase());
                if (targetTable) {
                    column.refTableId = targetTable.id;
                    changed = true;
                }
            }

            if (!targetTable) continue;

            const hasColumnId = targetTable.columns.some((refColumn) => refColumn.id === column.refColumnId);
            if (hasColumnId) continue;

            if (column.refColumnId) {
                const targetColumnByName = targetTable.columns.find(
                    (refColumn) => String(refColumn.name).trim().toLowerCase() === String(column.refColumnId).trim().toLowerCase()
                );
                if (targetColumnByName) {
                    column.refColumnId = targetColumnByName.id;
                    changed = true;
                }
            }
        }
    }

    return changed;
}

function hasDuplicateColumnName(table, candidateName, currentColumnId = "") {
    const normalized = candidateName.trim().toLowerCase();
    return table.columns.some((column) => {
        if (column.id === currentColumnId) return false;
        return String(column.name).trim().toLowerCase() === normalized;
    });
}

function hasOtherPrimaryKey(table, currentColumnId = "") {
    return table.columns.some((column) => column.pk && column.id !== currentColumnId);
}

function removeTableColumnEmptyState() {
    const emptyNode = ui.tableColumnsList.querySelector(".table-col-empty");
    if (emptyNode) {
        emptyNode.remove();
    }
}

function showTableColumnEmptyState() {
    if (ui.tableColumnsList.querySelector(".table-col-row")) return;

    const emptyNode = document.createElement("div");
    emptyNode.className = "table-col-empty";
    emptyNode.textContent = "No extra columns will be created. You can still add columns later.";
    ui.tableColumnsList.appendChild(emptyNode);
}

function createTableColumnRow(column = {}) {
    const row = document.createElement("div");
    row.className = "table-col-row";

    const identitySection = document.createElement("section");
    identitySection.className = "table-col-section";

    const identityTitle = document.createElement("div");
    identityTitle.className = "table-col-section-title";
    identityTitle.textContent = "Column Identity";
    identitySection.appendChild(identityTitle);

    const grid = document.createElement("div");
    grid.className = "table-col-grid";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Column Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 60;
    nameInput.placeholder = "title";
    nameInput.className = "table-col-name";
    nameInput.value = column.name || "";
    nameLabel.appendChild(nameInput);

    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Type";
    const typeSelect = document.createElement("select");
    typeSelect.className = "table-col-type";
    for (const typeName of TABLE_COLUMN_TYPES) {
        const option = document.createElement("option");
        option.value = typeName;
        option.textContent = typeName;
        typeSelect.appendChild(option);
    }
    typeSelect.value = column.type || "string";
    typeLabel.appendChild(typeSelect);

    grid.append(nameLabel, typeLabel);
    identitySection.appendChild(grid);
    row.appendChild(identitySection);

    const detailSection = document.createElement("section");
    detailSection.className = "table-col-section";

    const detailTitle = document.createElement("div");
    detailTitle.className = "table-col-section-title";
    detailTitle.textContent = "Column Settings";
    detailSection.appendChild(detailTitle);

    const defaultLabel = document.createElement("label");
    defaultLabel.textContent = "Default (optional)";
    const defaultInput = document.createElement("input");
    defaultInput.type = "text";
    defaultInput.maxLength = 100;
    defaultInput.placeholder = "example";
    defaultInput.className = "table-col-default";
    defaultInput.value = column.defaultValue || "";
    defaultLabel.appendChild(defaultInput);
    detailSection.appendChild(defaultLabel);

    const options = document.createElement("div");
    options.className = "table-col-options";

    const left = document.createElement("div");
    left.className = "checkbox-row";

    const nullableLabel = document.createElement("label");
    const nullableInput = document.createElement("input");
    nullableInput.type = "checkbox";
    nullableInput.className = "table-col-nullable";
    nullableInput.checked = Boolean(column.nullable);
    nullableLabel.append(nullableInput, document.createTextNode("Nullable"));

    const uniqueLabel = document.createElement("label");
    const uniqueInput = document.createElement("input");
    uniqueInput.type = "checkbox";
    uniqueInput.className = "table-col-unique";
    uniqueInput.checked = Boolean(column.unique);
    uniqueLabel.append(uniqueInput, document.createTextNode("Unique"));

    const fkLabel = document.createElement("label");
    const fkInput = document.createElement("input");
    fkInput.type = "checkbox";
    fkInput.className = "table-col-fk";
    fkInput.checked = Boolean(column.fk);
    fkLabel.append(fkInput, document.createTextNode("Foreign Key"));

    left.append(nullableLabel, uniqueLabel, fkLabel);

    const relationSection = document.createElement("div");
    relationSection.className = "table-col-relation";

    const refTableLabel = document.createElement("label");
    refTableLabel.textContent = "Reference Table";
    const refTableInput = document.createElement("input");
    refTableInput.type = "text";
    refTableInput.maxLength = 60;
    refTableInput.placeholder = "users";
    refTableInput.className = "table-col-ref-table";
    refTableInput.value = column.refTableName || "";
    refTableLabel.appendChild(refTableInput);

    const refColumnLabel = document.createElement("label");
    refColumnLabel.textContent = "Reference Column";
    const refColumnInput = document.createElement("input");
    refColumnInput.type = "text";
    refColumnInput.maxLength = 60;
    refColumnInput.placeholder = "id";
    refColumnInput.className = "table-col-ref-column";
    refColumnInput.value = column.refColumnName || "id";
    refColumnLabel.appendChild(refColumnInput);

    relationSection.append(refTableLabel, refColumnLabel);
    relationSection.classList.toggle("hidden", !fkInput.checked);

    fkInput.addEventListener("change", () => {
        relationSection.classList.toggle("hidden", !fkInput.checked);
        if (fkInput.checked && !refColumnInput.value.trim()) {
            refColumnInput.value = "id";
        }
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
        row.remove();
        showTableColumnEmptyState();
    });

    options.append(left, removeBtn);
    detailSection.appendChild(relationSection);
    detailSection.appendChild(options);
    row.appendChild(detailSection);

    return row;
}

function addTableColumnRow(column = {}) {
    removeTableColumnEmptyState();
    ui.tableColumnsList.appendChild(createTableColumnRow(column));
}

function resetTableColumnBuilder(initialColumns = []) {
    ui.tableColumnsList.innerHTML = "";
    if (!initialColumns.length) {
        addTableColumnRow();
        return;
    }

    for (const column of initialColumns) {
        addTableColumnRow(column);
    }
}

function mapColumnTypeForBuilder(rawType) {
    const type = String(rawType || "").trim().toLowerCase();

    if (type.includes("bigint")) return "bigInteger";
    if (type.includes("int")) return "integer";
    if (type.includes("bool")) return "boolean";
    if (type.includes("datetime") || type.includes("timestamp")) return "dateTime";
    if (type.includes("date")) return "date";
    if (type.includes("decimal") || type.includes("numeric")) return "decimal";
    if (type.includes("text")) return "text";
    return "string";
}

function collectTableColumnsFromDialog() {
    const rows = Array.from(ui.tableColumnsList.querySelectorAll(".table-col-row"));
    const columns = [];
    const seen = new Set();

    for (const row of rows) {
        const name = row.querySelector(".table-col-name")?.value.trim() || "";
        const type = row.querySelector(".table-col-type")?.value || "string";
        const defaultValue = row.querySelector(".table-col-default")?.value.trim() || "";
        const nullable = Boolean(row.querySelector(".table-col-nullable")?.checked);
        const unique = Boolean(row.querySelector(".table-col-unique")?.checked);
        const fk = Boolean(row.querySelector(".table-col-fk")?.checked);
        const refTableName = row.querySelector(".table-col-ref-table")?.value.trim() || "";
        const refColumnName = row.querySelector(".table-col-ref-column")?.value.trim() || "";

        if (!name) continue;

        const normalizedName = name.toLowerCase();
        if (seen.has(normalizedName)) {
            return { columns: [], error: `Duplicate column name '${name}' in table form.` };
        }

        if (fk && (!refTableName || !refColumnName)) {
            return { columns: [], error: `Column '${name}' is foreign key, please set reference table and column.` };
        }

        seen.add(normalizedName);
        columns.push({
            name,
            type,
            nullable,
            unique,
            default: defaultValue,
            fk,
            refTableName,
            refColumnName
        });
    }

    return { columns, error: "" };
}

function setTableSaveLoading(isLoading) {
    if (!ui.tableSaveBtn) return;

    ui.tableSaveBtn.disabled = isLoading;
    ui.cancelTableBtn.disabled = isLoading;
    ui.addTableColumnBtn.disabled = isLoading;
    ui.tableNameInput.disabled = isLoading;

    ui.tableSaveBtn.classList.toggle("btn-loading", isLoading);
    ui.tableSaveBtn.textContent = isLoading ? "Saving..." : "Save";

    const rowInputs = ui.tableColumnsList.querySelectorAll("input, select, button");
    rowInputs.forEach((element) => {
        if (element === ui.addTableColumnBtn || element === ui.tableSaveBtn || element === ui.cancelTableBtn) return;
        element.disabled = isLoading;
    });
}

function syncPrimaryKeyRules() {
    if (ui.pkInput.checked) {
        ui.uniqueInput.checked = true;
        ui.notNullInput.checked = true;
        ui.uniqueInput.disabled = true;
        ui.notNullInput.disabled = true;
        return;
    }

    ui.uniqueInput.disabled = false;
    ui.notNullInput.disabled = false;
}

function openColumnDialog(tableId, columnId = null) {
    currentColumnContext = { tableId, columnId };
    const table = getTable(tableId);
    if (!table) return;

    const editing = columnId ? table.columns.find((col) => col.id === columnId) : null;
    ui.columnDialogTitle.textContent = editing ? "Edit Column" : "Add Column";

    ui.columnNameInput.value = editing ? editing.name : "";
    ui.columnTypeInput.value = editing ? editing.type : "TEXT";
    ui.columnDefaultInput.value = editing ? editing.defaultValue || "" : "";
    ui.pkInput.checked = editing ? editing.pk : false;
    ui.uniqueInput.checked = editing ? editing.unique : false;
    ui.notNullInput.checked = editing ? editing.notNull : false;
    ui.fkInput.checked = editing ? editing.fk : false;
    syncPrimaryKeyRules();

    populateRefTables(tableId, editing ? editing.refTableId : "");
    if (ui.refTableInput.value) {
        populateRefColumns(ui.refTableInput.value, editing ? editing.refColumnId : "");
    } else {
        ui.refColumnInput.innerHTML = "";
    }

    ui.fkSection.classList.toggle("hidden", !ui.fkInput.checked);
    ui.columnDialog.showModal();
}

function populateRefTables(currentTableId, selectedRefTableId = "") {
    ui.refTableInput.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select table";
    ui.refTableInput.appendChild(opt);

    for (const table of state.tables) {
        if (table.id === currentTableId) continue;
        const option = document.createElement("option");
        option.value = table.id;
        option.textContent = table.name;
        ui.refTableInput.appendChild(option);
    }

    if (selectedRefTableId) {
        ui.refTableInput.value = selectedRefTableId;
    }
}

function populateRefColumns(refTableId, selectedRefColumnId = "") {
    ui.refColumnInput.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select column";
    ui.refColumnInput.appendChild(defaultOption);

    const refTable = getTable(refTableId);
    if (!refTable) return;

    for (const column of refTable.columns) {
        const option = document.createElement("option");
        option.value = column.id;
        option.textContent = column.name;
        ui.refColumnInput.appendChild(option);
    }

    if (selectedRefColumnId) {
        ui.refColumnInput.value = selectedRefColumnId;
    }
}

async function handleTableSave(event) {
    event.preventDefault();
    if (isTableSavePending) return;

    const name = ui.tableNameInput.value.trim();
    if (!name) return;

    isTableSavePending = true;
    setTableSaveLoading(true);

    try {
        const collected = collectTableColumnsFromDialog();
        if (collected.error) {
            alert(collected.error);
            return;
        }

        if (currentTableEditId) {
            const table = getTable(currentTableEditId);
            if (!table) {
                alert("Unable to find selected table.");
                return;
            }

            await updateTableOnServer(table.name, name, collected.columns);
            await syncSchemaFromServer();
            render();
            ui.tableDialog.close();
            return;
        }

        await createTableOnServer(name, collected.columns);
        await syncSchemaFromServer();
        render();
        ui.tableDialog.close();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create table.";
        alert(message);
    } finally {
        isTableSavePending = false;
        setTableSaveLoading(false);
    }
}

function handleColumnSave(event) {
    event.preventDefault();
    if (!currentColumnContext) return;

    const table = getTable(currentColumnContext.tableId);
    if (!table) return;

    const nextColumn = normalizeColumn({
        id: currentColumnContext.columnId || id("col"),
        name: ui.columnNameInput.value.trim(),
        type: ui.columnTypeInput.value.trim(),
        defaultValue: ui.columnDefaultInput.value.trim(),
        pk: ui.pkInput.checked,
        unique: ui.uniqueInput.checked,
        notNull: ui.notNullInput.checked,
        fk: ui.fkInput.checked,
        refTableId: ui.fkInput.checked ? ui.refTableInput.value : "",
        refColumnId: ui.fkInput.checked ? ui.refColumnInput.value : ""
    });

    if (!nextColumn.name || !nextColumn.type) return;
    if (hasDuplicateColumnName(table, nextColumn.name, nextColumn.id)) {
        alert(`Column name '${nextColumn.name}' already exists in table '${table.name}'.`);
        return;
    }

    if (nextColumn.pk && hasOtherPrimaryKey(table, nextColumn.id)) {
        alert(`Table '${table.name}' already has a primary key column. Only one primary key column is allowed.`);
        return;
    }

    if (nextColumn.pk) {
        nextColumn.unique = true;
        nextColumn.notNull = true;
    }

    if (nextColumn.fk && (!nextColumn.refTableId || !nextColumn.refColumnId)) {
        alert("Choose both reference table and reference column for foreign key.");
        return;
    }

    if (currentColumnContext.columnId) {
        const index = table.columns.findIndex((col) => col.id === currentColumnContext.columnId);
        if (index !== -1) {
            table.columns[index] = nextColumn;
        }
    } else {
        table.columns.push(nextColumn);
    }

    ui.columnDialog.close();
    saveState();
    render();
}

function startDrag(event, tableId) {
    if (event.button !== 0) return;
    const table = getTable(tableId);
    if (!table) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = table.x;
    const originalY = table.y;

    function onMove(moveEvent) {
        const dx = (moveEvent.clientX - startX) / currentZoom;
        const dy = (moveEvent.clientY - startY) / currentZoom;

        table.x = Math.max(0, originalX + dx);
        table.y = Math.max(0, originalY + dy);

        const card = document.getElementById(table.id);
        if (card) {
            card.style.left = `${table.x}px`;
            card.style.top = `${table.y}px`;
        }
        drawRelations();
    }

    function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveState();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
}

function renderTables() {
    ui.canvas.innerHTML = "";
    rowElementMap.clear();

    for (const table of state.tables) {
        const card = document.createElement("article");
        card.className = "table-card";
        card.id = table.id;
        card.style.left = `${table.x}px`;
        card.style.top = `${table.y}px`;

        const header = document.createElement("header");
        header.className = "table-header";
        header.addEventListener("mousedown", (event) => startDrag(event, table.id));

        const title = document.createElement("h3");
        title.className = "table-title";
        title.textContent = table.name;
        header.appendChild(title);

        const tableActions = document.createElement("div");
        tableActions.className = "table-actions";

        const editBtn = document.createElement("button");
        editBtn.className = "icon-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("mousedown", (event) => event.stopPropagation());
        editBtn.addEventListener("click", () => openTableDialog(table.id));

        const delBtn = document.createElement("button");
        delBtn.className = "icon-btn danger";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("mousedown", (event) => event.stopPropagation());
        delBtn.addEventListener("click", () => {
            if (confirm(`Delete table '${table.name}'?`)) {
                removeTable(table.id);
            }
        });

        tableActions.append(editBtn, delBtn);
        header.appendChild(tableActions);
        card.appendChild(header);

        const columnList = document.createElement("ul");
        columnList.className = "column-list";

        for (const column of table.columns) {
            const row = document.createElement("li");
            row.className = "column-row";

            const top = document.createElement("div");
            top.className = "column-top";

            const name = document.createElement("span");
            name.className = "column-name";
            name.textContent = column.name;

            const type = document.createElement("span");
            type.className = "column-type";
            type.textContent = column.type;

            top.append(name, type);
            row.appendChild(top);

            const meta = document.createElement("div");
            meta.className = "column-meta";

            if (column.pk) meta.appendChild(makeBadge("PK", "badge-pk"));
            if (column.fk) meta.appendChild(makeBadge("FK", "badge-fk"));
            if (column.unique) meta.appendChild(makeBadge("UNIQUE", "badge-uk"));
            if (column.notNull) meta.appendChild(makeBadge("NOT NULL", "badge-nn"));
            if (column.defaultValue) meta.appendChild(makeBadge(`DEFAULT ${column.defaultValue}`, "badge-nn"));

            row.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "column-actions";

            const editColBtn = document.createElement("button");
            editColBtn.className = "icon-btn";
            editColBtn.textContent = "Edit";
            editColBtn.addEventListener("click", () => openColumnDialog(table.id, column.id));

            const delColBtn = document.createElement("button");
            delColBtn.className = "icon-btn danger";
            delColBtn.textContent = "Delete";
            delColBtn.addEventListener("click", () => {
                if (confirm(`Delete column '${column.name}'?`)) {
                    removeColumn(table.id, column.id);
                }
            });

            actions.append(editColBtn, delColBtn);
            row.appendChild(actions);

            columnList.appendChild(row);
            rowElementMap.set(`${table.id}:${column.id}`, row);
        }

        card.appendChild(columnList);
        ui.canvas.appendChild(card);
    }
}

function drawRelations() {
    ui.relationLayer.setAttribute("width", String(ui.scene.offsetWidth));
    ui.relationLayer.setAttribute("height", String(ui.scene.offsetHeight));
    ui.relationLayer.innerHTML = "";

    for (const table of state.tables) {
        for (const column of table.columns) {
            if (!column.fk || !column.refTableId || !column.refColumnId) continue;

            const sourceRow = rowElementMap.get(`${table.id}:${column.id}`);
            const targetRow = rowElementMap.get(`${column.refTableId}:${column.refColumnId}`);
            const targetTable = getTable(column.refTableId);
            if (!sourceRow || !targetRow || !targetTable) continue;

            const x1 = table.x + sourceRow.offsetLeft + sourceRow.offsetWidth;
            const y1 = table.y + sourceRow.offsetTop + sourceRow.offsetHeight / 2;
            const x2 = targetTable.x + targetRow.offsetLeft;
            const y2 = targetTable.y + targetRow.offsetTop + targetRow.offsetHeight / 2;

            const curve = Math.max(40, Math.abs(x2 - x1) * 0.35);
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "var(--relation-line)");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-dasharray", "5 4");

            ui.relationLayer.appendChild(path);
        }
    }
}

function render() {
    const spacingChanged = adjustSpacingForTableCount();
    if (spacingChanged) {
        saveState();
    }

    renderSidebarList();
    renderTables();
    updateSceneSize();
    applyZoom();
    requestAnimationFrame(drawRelations);
}

function exportJson() {
    const blob = new Blob([JSON.stringify(state.tables, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "db-diagram.json";
    link.click();
    URL.revokeObjectURL(url);
}

async function exportDatabaseSql() {
    try {
        const response = await fetch(EXPORT_DB_SQL_ENDPOINT, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                Accept: "application/sql, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        if (!response.ok) {
            throw new Error(`Export DB SQL failed with status ${response.status}`);
        }

        const sql = await response.text();
        const blob = new Blob([sql], { type: "application/sql" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.href = url;
        link.download = `db-schema-${stamp}.sql`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to export DB SQL.";
        alert(message);
    }
}

function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result));
            if (!Array.isArray(parsed)) {
                alert("Invalid JSON format. Expected an array of tables.");
                return;
            }

            state.tables = parsed.map((table, idx) => normalizeTable(table, idx));
            resolveLegacyReferenceIds();

            saveState();
            render();
        } catch (error) {
            alert("Unable to parse JSON file.");
        }
    };
    reader.readAsText(file);
}

ui.addTableBtn.addEventListener("click", () => openTableDialog());
ui.zoomOutBtn.addEventListener("click", () => {
    zoomStepOffset = clamp(zoomStepOffset - 1, -6, 6);
    applyZoom();
    drawRelations();
});

ui.zoomInBtn.addEventListener("click", () => {
    zoomStepOffset = clamp(zoomStepOffset + 1, -6, 6);
    applyZoom();
    drawRelations();
});

ui.autoZoomBtn.addEventListener("click", () => {
    zoomStepOffset = 0;
    applyZoom();
    drawRelations();
});

ui.exportDbBtn?.addEventListener("click", exportDatabaseSql);
ui.importInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    ui.importInput.value = "";
});

ui.tableForm.addEventListener("submit", handleTableSave);
ui.addTableColumnBtn.addEventListener("click", () => addTableColumnRow());
ui.cancelTableBtn.addEventListener("click", () => ui.tableDialog.close());

ui.columnForm.addEventListener("submit", handleColumnSave);
ui.cancelColumnBtn.addEventListener("click", () => ui.columnDialog.close());

ui.fkInput.addEventListener("change", () => {
    ui.fkSection.classList.toggle("hidden", !ui.fkInput.checked);
});

ui.pkInput.addEventListener("change", syncPrimaryKeyRules);

ui.refTableInput.addEventListener("change", () => {
    populateRefColumns(ui.refTableInput.value);
});

window.addEventListener("resize", () => {
    applyZoom();
    drawRelations();
});
ui.canvasWrap.addEventListener("scroll", drawRelations);

ui.themeToggleBtn?.addEventListener("click", toggleTheme);

startApp();
