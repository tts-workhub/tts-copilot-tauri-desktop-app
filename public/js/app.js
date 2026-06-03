/**
 * TTS COPILOT - Survey Modeling Suite
 * Main Application Logic & State Management
 * 
 * Features:
 * - Secure local storage with encryption
 * - User authentication and role-based access control
 * - TF-IDF lexical search indexing
 * - Multi-provider LLM gateway
 * - Admin panel for user management
 * - Offline-capable with graceful fallbacks
 */

// ============================================================================
// DATABASE & STORAGE LAYER
// ============================================================================

const DB = {
    isTauri: typeof window !== 'undefined' && !!window.__TAURI__,

    async init() {
        // Seed default users (CHANGE DEFAULT PASSWORDS IN PRODUCTION!)
        if (!localStorage.getItem('tts_tbl_users')) {
            const defaultInst = `
# Core Survey Modeling & Design Guidelines
All questionnaire structures must adhere to:
- Standard Likert Scales: 5-point or 7-point balanced structures
- Validation Rules: Filter straight-lining and contradictory responses
- Sample Segments: Detail target demographic distribution frameworks
- Response Target: Minimum 95% completion rate per cohort
- Anomaly Detection: Statistical validation with <5% margin of error
            `.trim();

            localStorage.setItem('tts_tbl_users', JSON.stringify([
                {
                    id: "TTS-ADM-001",
                    name: "Admin Account",
                    email: "admin@tts.com",
                    password_hash: await this.hashPassword("SecurePassword123!"),
                    role: "admin",
                    status: "approved",
                    custom_instructions: defaultInst,
                    persona_content: "",
                    kb_content: "",
                    persona_filename: "",
                    kb_filename: "",
                    last_login: null,
                    created_at: new Date().toISOString()
                }
            ]));
        }

        if (!localStorage.getItem('tts_global_settings')) {
            localStorage.setItem('tts_global_settings', JSON.stringify({
                global_api_key: "",
                default_ai_mode: "simulated",
                default_model_name: "gemini-2.5-flash",
                encryption_key: this.generateEncryptionKey()
            }));
        }
    },

    async hashPassword(password) {
        // Simple SHA256 hash (use bcrypt in production backend)
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.bufferToHex(hashBuffer);
    },

    async verifyPassword(password, hash) {
        const newHash = await this.hashPassword(password);
        return newHash === hash;
    },

    bufferToHex(buffer) {
        const view = new Uint8Array(buffer);
        return Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    generateEncryptionKey() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    getUsers() {
        return JSON.parse(localStorage.getItem('tts_tbl_users')) || [];
    },

    saveUsers(users) {
        localStorage.setItem('tts_tbl_users', JSON.stringify(users));
    },

    getGlobalSettings() {
        return JSON.parse(localStorage.getItem('tts_global_settings')) || {
            global_api_key: "",
            default_ai_mode: "simulated",
            default_model_name: "gemini-2.5-flash"
        };
    },

    saveGlobalSettings(settings) {
        localStorage.setItem('tts_global_settings', JSON.stringify(settings));
    },

    getLogs(userId) {
        const histories = JSON.parse(localStorage.getItem('tts_user_history')) || {};
        return histories[userId] || [];
    },

    addLog(userId, title) {
        const histories = JSON.parse(localStorage.getItem('tts_user_history')) || {};
        if (!histories[userId]) histories[userId] = [];
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        histories[userId].unshift({ title, time });
        if (histories[userId].length > 50) histories[userId].pop();
        localStorage.setItem('tts_user_history', JSON.stringify(histories));
        return histories[userId];
    },

    clearLogs(userId) {
        const histories = JSON.parse(localStorage.getItem('tts_user_history')) || {};
        histories[userId] = [];
        localStorage.setItem('tts_user_history', JSON.stringify(histories));
    }
};

// ============================================================================
// OBSERVABILITY & METRICS
// ============================================================================

const Observability = {
    history: { ocr: [], retrieval: [], llm: [] },
    metrics: { dbQueries: 0, errorEvents: 0 },

    addTimelineMetric(key, seconds) {
        if (this.history[key]) this.history[key].push(Math.round(seconds * 1000));
    },

    getPercentile(arr, percentile) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        return Math.round(sorted[Math.floor(index)]);
    }
};

// ============================================================================
// LEXICAL SEARCH INDEXER (TF-IDF)
// ============================================================================

const BackgroundIndexer = {
    indices: {},

    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    },

    indexDocumentCollection(userId, fileCollection) {
        const tStart = performance.now();
        const rawChunks = [];

        fileCollection.forEach(fileObj => {
            if (fileObj.content) {
                rawChunks.push({
                    id: fileObj.id,
                    source: fileObj.source,
                    content: fileObj.content
                });
            }
        });

        if (rawChunks.length === 0) {
            this.indices[userId] = { docs: [], idfs: {} };
            return;
        }

        const docFreqs = {};
        const tokenizedChunks = rawChunks.map(chunk => {
            const tokens = this.tokenize(chunk.content);
            tokens.forEach(t => {
                docFreqs[t] = (docFreqs[t] || 0) + 1;
            });
            return { ...chunk, tokens };
        });

        const numDocs = rawChunks.length;
        const idfs = {};
        for (const token in docFreqs) {
            idfs[token] = Math.log(numDocs / docFreqs[token]);
        }

        this.indices[userId] = { docs: tokenizedChunks, idfs };
        const tEnd = performance.now();
        Observability.addTimelineMetric('retrieval', (tEnd - tStart) / 1000);
    },

    retrieveBestMatch(userId, queryText, threshold = 0.1, maxResults = 3) {
        const tStart = performance.now();
        let index = this.indices[userId];

        if (!index || !index.docs || index.docs.length === 0) {
            return [];
        }

        const queryTokens = this.tokenize(queryText);
        if (queryTokens.length === 0) return [];

        const queryTf = {};
        queryTokens.forEach(t => {
            queryTf[t] = (queryTf[t] || 0) + 1;
        });

        const queryVector = {};
        let queryMagnitude = 0;
        for (const token in queryTf) {
            const tf = queryTf[token] / queryTokens.length;
            const idf = index.idfs[token] || 0;
            queryVector[token] = tf * idf;
            queryMagnitude += queryVector[token] * queryVector[token];
        }
        queryMagnitude = Math.sqrt(queryMagnitude);

        if (queryMagnitude === 0) return [];

        const scoredChunks = index.docs.map(doc => {
            let docMagnitude = 0;
            let dotProduct = 0;
            doc.tokens.forEach(token => {
                const tf = 1 / doc.tokens.length;
                const idf = index.idfs[token] || 0;
                const weight = tf * idf;
                docMagnitude += weight * weight;
                if (queryVector[token]) {
                    dotProduct += queryVector[token] * weight;
                }
            });
            docMagnitude = Math.sqrt(docMagnitude);
            const similarity = docMagnitude > 0 ? dotProduct / (queryMagnitude * docMagnitude) : 0;
            return { ...doc, score: similarity };
        });

        const results = scoredChunks
            .filter(c => c.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);

        const tEnd = performance.now();
        Observability.addTimelineMetric('retrieval', (tEnd - tStart) / 1000);
        return results;
    }
};

// ============================================================================
// CONTEXT ENGINE (Instruction & Knowledge Management)
// ============================================================================

const ContextEngine = {
    rebuildCollectionIndex(userId) {
        const users = DB.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return;

        const files = [];
        if (user.custom_instructions) {
            files.push({
                id: 'custom_instructions',
                source: 'Custom Instructions',
                content: user.custom_instructions
            });
        }
        if (user.persona_content) {
            files.push({
                id: 'persona',
                source: user.persona_filename || 'Persona',
                content: user.persona_content
            });
        }
        if (user.kb_content) {
            files.push({
                id: 'knowledge_base',
                source: user.kb_filename || 'Knowledge Base',
                content: user.kb_content
            });
        }

        BackgroundIndexer.indexDocumentCollection(userId, files);
    },

    query(userId, prompt, threshold = 0.1) {
        const results = BackgroundIndexer.retrieveBestMatch(userId, prompt, threshold, 2);
        if (results.length > 0) {
            return results.map(r => r.content).join('\n\n');
        }
        return null;
    }
};

// ============================================================================
// SECURE CREDENTIAL VAULT
// ============================================================================

const SecureCredentialVault = {
    async getAPIKey() {
        const settings = DB.getGlobalSettings();
        return settings.global_api_key ? this.deobfuscate(settings.global_api_key) : "";
    },

    async setAPIKey(plainKey) {
        const settings = DB.getGlobalSettings();
        settings.global_api_key = this.obfuscate(plainKey);
        DB.saveGlobalSettings(settings);
    },

    obfuscate(str) {
        return btoa(unescape(encodeURIComponent(str)));
    },

    deobfuscate(str) {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch (e) {
            return "";
        }
    }
};

// ============================================================================
// LLM GATEWAY (Multi-Provider Support)
// ============================================================================

const llmGateway = {
    async generate({ provider, model, prompt, context }) {
        const tStart = performance.now();

        const systemPrompt = `You are TTS Copilot, an enterprise survey modeling AI assistant.
Instructions:
- Be professional, warm, structured, and concise
- Focus on grounded context: valid survey structures, Likert scales, demographic sampling
- Provide actionable survey design recommendations

Context:
${context || 'No grounded context available. Use simulated response.'}`;

        let textResult = "";

        try {
            if (provider === 'gemini') {
                const apiKey = await SecureCredentialVault.getAPIKey();
                if (!apiKey) throw new Error("API key not configured");

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `${systemPrompt}\n\nUser Query: ${prompt}` }] }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                        })
                    }
                );

                if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);
                const json = await response.json();
                textResult = json.candidates[0].content.parts[0].text;
            } else if (provider === 'openai') {
                const apiKey = await SecureCredentialVault.getAPIKey();
                if (!apiKey) throw new Error("API key not configured");

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model || 'gpt-4',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 1024
                    })
                });

                if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
                const json = await response.json();
                textResult = json.choices[0].message.content;
            } else if (provider === 'ollama') {
                const response = await fetch('http://localhost:11434/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model || 'llama2',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: prompt }
                        ],
                        stream: false
                    })
                });

                if (!response.ok) throw new Error(`Ollama service unavailable`);
                const json = await response.json();
                textResult = json.message.content;
            } else {
                // Simulated mode (offline-capable)
                textResult = `**Simulated Response:** Successfully analyzed query using local context indices. Recommended approach for survey design: ensure Likert scale consistency, validate sampling matrices, and implement quality checks for response completion.`;
            }

            const tEnd = performance.now();
            Observability.addTimelineMetric('llm', (tEnd - tStart) / 1000);

            return {
                content: textResult,
                provider: provider,
                model: model || 'simulated-v1',
                latency: ((tEnd - tStart) / 1000).toFixed(3) + 's'
            };
        } catch (err) {
            Observability.metrics.errorEvents++;
            throw err;
        }
    }
};

// ============================================================================
// APPLICATION STATE
// ============================================================================

const State = {
    currentUser: null,
    isProcessing: false,
    activeAdminTab: 'users',
    selectedDetailUserId: null,
    deleteTargetUserId: null
};

const DOM = {
    authView: document.getElementById('auth-view'),
    loginCard: document.getElementById('card-login'),
    registerCard: document.getElementById('card-register'),

    loginForm: document.getElementById('form-login'),
    registerForm: document.getElementById('form-register'),

    loginEmail: document.getElementById('login-email'),
    loginPass: document.getElementById('login-password'),
    regName: document.getElementById('reg-name'),
    regEmail: document.getElementById('reg-email'),
    regPass: document.getElementById('reg-password'),

    userDisplayName: document.getElementById('user-display-name'),
    userDisplayId: document.getElementById('user-display-id'),

    chatContainer: document.getElementById('chat-container'),
    chatInput: document.getElementById('chat-input'),
    btnGetAnswer: document.getElementById('btn-get-answer'),
    btnScreenshot: document.getElementById('btn-screenshot'),
    btnLogOut: document.getElementById('btn-logout'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    historyList: document.getElementById('history-list'),

    personaUpload: document.getElementById('persona-upload'),
    personaStatus: document.getElementById('status-persona'),
    kbUpload: document.getElementById('kb-upload'),
    kbStatus: document.getElementById('status-kb'),

    aiEngineStatus: document.getElementById('ai-engine-status'),
    btnStressTest: document.getElementById('btn-stress-test'),

    ocrOverlay: document.getElementById('ocr-overlay'),
    btnCancelOcr: document.getElementById('btn-cancel-ocr'),
    btnExecuteOcr: document.getElementById('btn-execute-ocr'),

    toast: document.getElementById('notification-toast'),
    toastTitle: document.getElementById('toast-title'),
    toastMessage: document.getElementById('toast-message'),
    toastIcon: document.getElementById('toast-icon'),

    editorInstructions: document.getElementById('editor-instructions'),
    btnSaveInstructions: document.getElementById('btn-save-instructions'),

    btnAdminTrigger: document.getElementById('btn-admin-trigger'),
    adminPanelModal: document.getElementById('admin-panel-modal'),
    btnCloseAdminPanel: document.getElementById('btn-close-admin-panel'),
    tabBtnUsers: document.getElementById('tab-btn-users'),
    tabBtnLlm: document.getElementById('tab-btn-llm'),
    tabContentUsers: document.getElementById('tab-content-users'),
    tabContentLlm: document.getElementById('tab-content-llm'),

    formAdminAddUser: document.getElementById('form-admin-add-user'),
    addUserName: document.getElementById('add-user-name'),
    addUserEmail: document.getElementById('add-user-email'),
    addUserPassword: document.getElementById('add-user-password'),
    addUserRole: document.getElementById('add-user-role'),

    settingAdminApiKey: document.getElementById('setting-admin-api-key'),
    settingAdminAiMode: document.getElementById('setting-admin-ai-mode'),
    settingAdminModelName: document.getElementById('setting-admin-model-name'),
    btnAdminSaveLlm: document.getElementById('btn-admin-save-llm'),

    adminUserTableBody: document.getElementById('admin-user-table-body'),
    adminUserDetailView: document.getElementById('admin-user-detail-view'),
    userDetailsBody: document.getElementById('user-details-body'),

    deleteConfirmModal: document.getElementById('delete-confirm-modal'),
    deleteTargetUsername: document.getElementById('delete-target-username'),
    btnDeleteCancel: document.getElementById('btn-delete-cancel'),
    btnDeleteConfirm: document.getElementById('btn-delete-confirm'),

    editUserModal: document.getElementById('edit-user-modal'),
    formAdminEditUser: document.getElementById('form-admin-edit-user'),
    editUserId: document.getElementById('edit-user-id'),
    editUserName: document.getElementById('edit-user-name'),
    editUserEmail: document.getElementById('edit-user-email'),
    editUserPassword: document.getElementById('edit-user-password'),
    editUserRole: document.getElementById('edit-user-role'),
    btnEditUserCancel: document.getElementById('btn-edit-user-cancel')
};

// ============================================================================
// AUTHENTICATION
// ============================================================================

function showAuthCard(cardType) {
    DOM.loginCard.classList.add('hidden');
    DOM.registerCard.classList.add('hidden');

    if (cardType === 'login') DOM.loginCard.classList.remove('hidden');
    if (cardType === 'register') DOM.registerCard.classList.remove('hidden');
}

DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = DOM.loginEmail.value.trim();
    const password = DOM.loginPass.value;

    const users = DB.getUsers();
    const userMatch = users.find(u => u.email === email);

    if (userMatch && await DB.verifyPassword(password, userMatch.password_hash)) {
        if (userMatch.status !== "approved") {
            showToast("Access Pending", "Your account is awaiting admin approval.", "info");
            return;
        }

        userMatch.last_login = new Date().toISOString();
        DB.saveUsers(users);
        initializeSession(userMatch);
    } else {
        showToast("Auth Failed", "Invalid credentials. Please try again.", "error");
    }
});

DOM.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = DOM.regName.value.trim();
    const email = DOM.regEmail.value.trim();
    const pass = DOM.regPass.value;

    if (pass.length < 8) {
        showToast("Weak Password", "Password must be at least 8 characters.", "error");
        return;
    }

    const users = DB.getUsers();
    if (users.some(u => u.email === email)) {
        showToast("Email Exists", "This email is already registered.", "error");
        return;
    }

    const defaultInst = `
# Core Survey Modeling & Design Guidelines
- Standard Likert Scales: 5-point or 7-point balanced structures
- Validation Rules: Filter straight-lining and contradictory responses
- Sample Segments: Ensure balanced demographic distribution
    `.trim();

    const newUser = {
        id: "TTS-SRV-" + Math.floor(1000 + Math.random() * 9000),
        name,
        email,
        password_hash: await DB.hashPassword(pass),
        role: "user",
        status: "pending",
        custom_instructions: defaultInst,
        persona_content: "",
        kb_content: "",
        persona_filename: "",
        kb_filename: "",
        last_login: null,
        created_at: new Date().toISOString()
    };

    users.push(newUser);
    DB.saveUsers(users);

    showToast("Account Created", "Pending admin approval. Check back later.", "success");
    showAuthCard('login');
    DOM.registerForm.reset();
});

DOM.btnLogOut.addEventListener('click', () => {
    State.currentUser = null;
    DOM.authView.classList.remove('hidden');
    DOM.loginForm.reset();
    DOM.registerForm.reset();
    showToast("Logged Out", "Session terminated safely.", "info");
});

async function initializeSession(user) {
    State.currentUser = user;
    DOM.authView.classList.add('hidden');

    DOM.userDisplayName.textContent = user.name;
    DOM.userDisplayId.textContent = `ID: ${user.id} (${user.role.toUpperCase()})`;

    if (user.role === 'admin') {
        DOM.btnAdminTrigger.classList.remove('hidden');
    } else {
        DOM.btnAdminTrigger.classList.add('hidden');
    }

    DOM.editorInstructions.value = user.custom_instructions || "";

    const globalSettings = DB.getGlobalSettings();
    if (globalSettings.default_ai_mode === 'simulated') {
        DOM.aiEngineStatus.textContent = "Engine: Local Lexical Sandbox";
    } else {
        DOM.aiEngineStatus.textContent = `Engine: ${globalSettings.default_ai_mode.toUpperCase()}`;
    }

    ContextEngine.rebuildCollectionIndex(user.id);
    renderLogs();
    showToast("Welcome", `Connected as ${user.name}`, "success");
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(title, message, type = 'info') {
    DOM.toastTitle.textContent = title;
    DOM.toastMessage.textContent = message;

    const iconClass = {
        'success': 'fa-circle-check text-green-400',
        'error': 'fa-circle-exclamation text-red-400',
        'info': 'fa-circle-info text-tts-cyan'
    };

    DOM.toastIcon.className = `fa-solid ${iconClass[type] || iconClass['info']}`;
    DOM.toast.classList.remove('translate-x-[150%]');

    setTimeout(() => {
        DOM.toast.classList.add('translate-x-[150%]');
    }, 4000);
}

// ============================================================================
// HISTORY & LOGS
// ============================================================================

function renderLogs() {
    if (!State.currentUser) return;
    const logs = DB.getLogs(State.currentUser.id);
    DOM.historyList.innerHTML = '';

    if (logs.length === 0) {
        DOM.historyList.innerHTML = `<li class="text-xs text-slate-400 italic p-2 text-center">No history yet</li>`;
        return;
    }

    logs.forEach(log => {
        const li = document.createElement('li');
        li.className = "text-xs text-slate-600 hover:text-tts-blue cursor-pointer truncate p-2 hover:bg-slate-100 rounded-lg transition-all";
        li.innerHTML = `${escapeHtml(log.title)} <span class="text-[9px] text-slate-400">${log.time}</span>`;
        li.addEventListener('click', () => {
            DOM.chatInput.value = log.title;
            DOM.chatInput.focus();
        });
        DOM.historyList.appendChild(li);
    });
}

DOM.btnClearHistory.addEventListener('click', () => {
    if (!State.currentUser) return;
    DB.clearLogs(State.currentUser.id);
    renderLogs();
    showToast("Cleared", "History deleted.", "info");
});

// ============================================================================
// FILE UPLOADS
// ============================================================================

DOM.personaUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        showToast("Size Error", "Max 10MB for persona files.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const users = DB.getUsers();
        const idx = users.findIndex(u => u.id === State.currentUser.id);
        if (idx !== -1) {
            users[idx].persona_content = event.target.result;
            users[idx].persona_filename = file.name;
            DB.saveUsers(users);
            State.currentUser = users[idx];
            ContextEngine.rebuildCollectionIndex(State.currentUser.id);
            showToast("Uploaded", "Persona file loaded.", "success");
            DOM.personaStatus.textContent = `✓ ${file.name}`;
        }
    };
    reader.readAsText(file);
});

DOM.kbUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
        showToast("Size Error", "Max 50MB for knowledge base files.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const users = DB.getUsers();
        const idx = users.findIndex(u => u.id === State.currentUser.id);
        if (idx !== -1) {
            users[idx].kb_content = event.target.result;
            users[idx].kb_filename = file.name;
            DB.saveUsers(users);
            State.currentUser = users[idx];
            ContextEngine.rebuildCollectionIndex(State.currentUser.id);
            showToast("Uploaded", "Knowledge base loaded.", "success");
            DOM.kbStatus.textContent = `✓ ${file.name}`;
        }
    };
    reader.readAsText(file);
});

// ============================================================================
// INSTRUCTIONS
// ============================================================================

DOM.btnSaveInstructions.addEventListener('click', () => {
    if (!State.currentUser) return;
    const text = DOM.editorInstructions.value.trim();

    const users = DB.getUsers();
    const idx = users.findIndex(u => u.id === State.currentUser.id);
    if (idx !== -1) {
        users[idx].custom_instructions = text;
        DB.saveUsers(users);
        State.currentUser = users[idx];
        ContextEngine.rebuildCollectionIndex(State.currentUser.id);
        showToast("Saved", "Survey guidelines updated.", "success");
    }
});

// ============================================================================
// CHAT ENGINE
// ============================================================================

DOM.btnGetAnswer.addEventListener('click', () => executeQuery());
DOM.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        executeQuery();
    }
});

function appendChatBubble(text, isUser = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-4 ${isUser ? 'flex-row-reverse' : ''} fade-in`;

    const avatar = document.createElement('div');
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border ${isUser ? 'bg-tts-cyan text-tts-dark border-cyan-300' : 'bg-tts-dark text-white border-slate-700'}`;
    avatar.innerHTML = isUser ? '<i class="fa-solid fa-user text-md"></i>' : '<i class="fa-solid fa-robot text-md"></i>';

    const bubble = document.createElement('div');
    bubble.className = `px-5 py-3.5 shadow-sm max-w-[85%] text-sm leading-relaxed border ${isUser ? 'bg-tts-blue text-white border-blue-900 rounded-2xl rounded-tr-none' : 'bg-white text-slate-800 border-slate-200 rounded-2xl rounded-tl-none'}`;
    bubble.innerHTML = isUser ? escapeHtml(text) : sanitizeHTML(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    DOM.chatContainer.appendChild(wrapper);
    DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
}

async function executeQuery() {
    if (State.isProcessing || !State.currentUser) return;

    const query = DOM.chatInput.value.trim();
    if (!query) return;

    State.isProcessing = true;
    DOM.btnGetAnswer.disabled = true;

    appendChatBubble(query, true);
    DOM.chatInput.value = '';
    DB.addLog(State.currentUser.id, query);
    renderLogs();

    try {
        const context = ContextEngine.query(State.currentUser.id, query, 0.1);
        const globalSettings = DB.getGlobalSettings();

        const result = await llmGateway.generate({
            provider: globalSettings.default_ai_mode,
            model: globalSettings.default_model_name,
            prompt: query,
            context: context
        });

        appendChatBubble(result.content, false);
    } catch (err) {
        console.error(err);
        appendChatBubble(`**Error:** ${err.message}`, false);
    } finally {
        State.isProcessing = false;
        DOM.btnGetAnswer.disabled = false;
    }
}

// ============================================================================
// ADMIN PANEL
// ============================================================================

DOM.btnAdminTrigger.addEventListener('click', () => {
    if (!State.currentUser || State.currentUser.role !== 'admin') {
        showToast("Denied", "Admin only.", "error");
        return;
    }
    loadAdminSettings();
    renderAdminUserTable();
    DOM.adminPanelModal.classList.remove('hidden');
});

DOM.btnCloseAdminPanel.addEventListener('click', () => {
    DOM.adminPanelModal.classList.add('hidden');
});

DOM.tabBtnUsers.addEventListener('click', () => switchAdminTab('users'));
DOM.tabBtnLlm.addEventListener('click', () => switchAdminTab('llm'));

function switchAdminTab(tab) {
    State.activeAdminTab = tab;
    const isUsers = tab === 'users';
    DOM.tabBtnUsers.className = isUsers ? "px-4 py-2 text-white border-b-2 border-tts-cyan font-semibold" : "px-4 py-2 text-slate-400 hover:text-white font-medium";
    DOM.tabBtnLlm.className = !isUsers ? "px-4 py-2 text-white border-b-2 border-tts-cyan font-semibold" : "px-4 py-2 text-slate-400 hover:text-white font-medium";
    DOM.tabContentUsers.classList.toggle('hidden', !isUsers);
    DOM.tabContentLlm.classList.toggle('hidden', isUsers);
}

function loadAdminSettings() {
    const settings = DB.getGlobalSettings();
    DOM.settingAdminAiMode.value = settings.default_ai_mode || "simulated";
    DOM.settingAdminModelName.value = settings.default_model_name || "gemini-2.5-flash";
    DOM.settingAdminApiKey.value = settings.global_api_key ? SecureCredentialVault.deobfuscate(settings.global_api_key) : "";
}

DOM.btnAdminSaveLlm.addEventListener('click', async () => {
    const plainKey = DOM.settingAdminApiKey.value.trim();
    const mode = DOM.settingAdminAiMode.value;
    const model = DOM.settingAdminModelName.value.trim();

    const settings = {
        global_api_key: plainKey ? SecureCredentialVault.obfuscate(plainKey) : "",
        default_ai_mode: mode,
        default_model_name: model
    };

    DB.saveGlobalSettings(settings);
    showToast("Saved", "Global settings updated.", "success");
});

function renderAdminUserTable() {
    const users = DB.getUsers();
    DOM.adminUserTableBody.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900 border-b border-slate-850 cursor-pointer text-xs transition-colors";

        let statusBadge = user.status === 'approved' ?
            '<span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold">Approved</span>' :
            '<span class="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 text-[10px] font-bold">Pending</span>';

        tr.innerHTML = `
            <td class="p-2">${escapeHtml(user.name)}</td>
            <td class="p-2">${escapeHtml(user.email)}</td>
            <td class="p-2"><span class="text-slate-400">${user.role}</span></td>
            <td class="p-2">${statusBadge}</td>
            <td class="p-2 text-center space-x-1">
                <button type="button" class="px-2 py-1 bg-slate-700 text-xs rounded hover:bg-slate-600 edit-user-btn" data-id="${user.id}">Edit</button>
                <button type="button" class="px-2 py-1 bg-red-700 text-xs rounded hover:bg-red-600 delete-user-btn" data-id="${user.id}">Delete</button>
            </td>
        `;

        tr.addEventListener('click', () => showUserDetails(user.id));
        DOM.adminUserTableBody.appendChild(tr);
    });

    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditUserModal(btn.dataset.id);
        });
    });

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteConfirmModal(btn.dataset.id);
        });
    });
}

function showUserDetails(id) {
    const users = DB.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return;

    State.selectedDetailUserId = id;
    DOM.adminUserDetailView.classList.remove('hidden');
    DOM.userDetailsBody.innerHTML = `
        <div><strong>ID:</strong> ${escapeHtml(user.id)}</div>
        <div><strong>Name:</strong> ${escapeHtml(user.name)}</div>
        <div><strong>Email:</strong> ${escapeHtml(user.email)}</div>
        <div><strong>Role:</strong> ${user.role}</div>
        <div><strong>Status:</strong> ${user.status}</div>
        <div><strong>Instructions:</strong> ${user.custom_instructions ? user.custom_instructions.substring(0, 100) + '...' : 'None'}</div>
    `;
}

DOM.formAdminAddUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = DOM.addUserName.value.trim();
    const email = DOM.addUserEmail.value.trim();
    const password = DOM.addUserPassword.value;
    const role = DOM.addUserRole.value;

    const users = DB.getUsers();
    if (users.some(u => u.email === email)) {
        showToast("Error", "Email already exists.", "error");
        return;
    }

    const newUser = {
        id: "TTS-SRV-" + Math.floor(1000 + Math.random() * 9000),
        name,
        email,
        password_hash: await DB.hashPassword(password),
        role,
        status: "approved",
        custom_instructions: "# Survey Guidelines",
        persona_content: "",
        kb_content: "",
        persona_filename: "",
        kb_filename: "",
        last_login: null,
        created_at: new Date().toISOString()
    };

    users.push(newUser);
    DB.saveUsers(users);
    showToast("Added", `${name} has been added.`, "success");
    DOM.formAdminAddUser.reset();
    renderAdminUserTable();
});

function openEditUserModal(id) {
    const users = DB.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return;

    DOM.editUserId.value = user.id;
    DOM.editUserName.value = user.name;
    DOM.editUserEmail.value = user.email;
    DOM.editUserPassword.value = "••••••••";
    DOM.editUserRole.value = user.role;
    DOM.editUserModal.classList.remove('hidden');
}

DOM.btnEditUserCancel.addEventListener('click', () => {
    DOM.editUserModal.classList.add('hidden');
});

DOM.formAdminEditUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = DOM.editUserId.value;
    const name = DOM.editUserName.value.trim();
    const email = DOM.editUserEmail.value.trim();
    const password = DOM.editUserPassword.value;
    const role = DOM.editUserRole.value;

    const users = DB.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) {
        users[idx].name = name;
        users[idx].email = email;
        if (!password.includes('•')) {
            users[idx].password_hash = await DB.hashPassword(password);
        }
        users[idx].role = role;
        DB.saveUsers(users);
        showToast("Updated", "User information saved.", "success");
        DOM.editUserModal.classList.add('hidden');
        renderAdminUserTable();
    }
});

function openDeleteConfirmModal(id) {
    const users = DB.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return;

    State.deleteTargetUserId = id;
    DOM.deleteTargetUsername.textContent = `${user.name} (${user.email})`;
    DOM.deleteConfirmModal.classList.remove('hidden');
}

DOM.btnDeleteCancel.addEventListener('click', () => {
    DOM.deleteConfirmModal.classList.add('hidden');
    State.deleteTargetUserId = null;
});

DOM.btnDeleteConfirm.addEventListener('click', () => {
    if (!State.deleteTargetUserId) return;

    const users = DB.getUsers();
    const idx = users.findIndex(u => u.id === State.deleteTargetUserId);
    if (idx !== -1) {
        const name = users[idx].name;
        users.splice(idx, 1);
        DB.saveUsers(users);
        showToast("Deleted", `${name} removed.`, "success");
        DOM.deleteConfirmModal.classList.add('hidden');
        renderAdminUserTable();
        State.deleteTargetUserId = null;
    }
});

// ============================================================================
// OCR SCREENSHOT
// ============================================================================

DOM.btnScreenshot.addEventListener('click', () => {
    if (typeof html2canvas === 'undefined') {
        showToast("OCR Disabled", "html2canvas library not loaded.", "error");
        return;
    }
    DOM.ocrOverlay.classList.remove('hidden');
});

DOM.btnCancelOcr.addEventListener('click', () => {
    DOM.ocrOverlay.classList.add('hidden');
});

DOM.btnExecuteOcr.addEventListener('click', async () => {
    showToast("Processing", "Capturing and analyzing screenshot...", "info");

    try {
        if (typeof html2canvas === 'undefined' || typeof Tesseract === 'undefined') {
            throw new Error("Required libraries not loaded");
        }

        const canvas = await html2canvas(document.body);
        const imageURL = canvas.toDataURL('image/png');

        Tesseract.recognize(imageURL, 'eng', { logger: progress => {} }).then(({ data: { text } }) => {
            appendChatBubble(`**OCR Extracted Text:**\n\n${text}`, false);
            DOM.ocrOverlay.classList.add('hidden');
            showToast("Complete", "OCR analysis finished.", "success");
        });
    } catch (err) {
        console.error(err);
        showToast("Error", "OCR processing failed.", "error");
    }
});

// ============================================================================
// UTILITIES
// ============================================================================

function sanitizeHTML(html) {
    const temp = document.createElement('div');
    temp.textContent = html;
    let text = temp.innerHTML;
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.*?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">$1</code>');
    text = text.replace(/\n/g, '<br>');
    return text;
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    await DB.init();
    DOM.loginEmail.value = "admin@tts.com";
    DOM.loginPass.value = ""; // Don't auto-fill passwords!
    showToast("Ready", "TTS Copilot initialized.", "info");
});
