/* ============================================================================
   ARY QUIZE BANK — FRONTEND LOGIC
   Talks ONLY to the existing deployed Google Apps Script backend below.
   No Code.gs is created or modified here.
   ============================================================================ */

const API_URL = "https://script.google.com/macros/s/AKfycbwUyx6Cka3OOdUlM8d1fIAG-Y5yrAREbnmdMVu51p57ceEdLQavqApagQjTIzt9s0wZ/exec";

/* ----------------------------------------------------------------------------
   API ACTION MAP
   Every action below exists in the deployed Code.gs and is safe to call.
   Actions marked BACKEND ACTION REQUIRED do NOT exist yet — any UI that would
   need them shows an explanatory notice instead of pretending to work.
---------------------------------------------------------------------------- */
const API_ACTIONS = {
  // Student
  registerStudent: 'registerStudent',
  studentLogin: 'studentLogin',
  studentLogout: 'studentLogout',
  getStudentProfile: 'getStudentProfile',
  updateStudentProfile: 'updateStudentProfile',
  getQuizzes: 'getQuizzes',
  getQuizQuestions: 'getQuizQuestions',
  submitQuiz: 'submitQuiz',
  getStudentResults: 'getStudentResults',
  getStudentDashboard: 'getStudentDashboard',
  // Admin
  adminLogin: 'adminLogin',
  getStudents: 'getStudents',
  approveStudent: 'approveStudent',
  rejectStudent: 'rejectStudent',
  setStudentStatus: 'setStudentStatus',
  getAllQuizzesAdmin: 'getAllQuizzesAdmin',
  setQuizActive: 'setQuizActive',
  setQuizExpiry: 'setQuizExpiry',
  updateQuizSettings: 'updateQuizSettings',
  getAllResults: 'getAllResults',
  searchStudentResults: 'searchStudentResults',
  getClassAnalytics: 'getClassAnalytics',
  getQuizAnalytics: 'getQuizAnalytics',
  createAnnouncement: 'createAnnouncement',
  updateAnnouncement: 'updateAnnouncement',
  deleteAnnouncement: 'deleteAnnouncement',
  getAnnouncements: 'getAnnouncements',
  // Quiz review workflow (v2)
  reviewQuiz: 'reviewQuiz',
  publishQuiz: 'publishQuiz',
  unpublishQuiz: 'unpublishQuiz',
  requestChanges: 'requestChanges',
  // Contacts (v2)
  getContacts: 'getContacts',
  createContact: 'createContact',
  updateContact: 'updateContact',
  deleteContact: 'deleteContact',
  // Admin management + own profile (v2)
  getAdmins: 'getAdmins',
  createAdmin: 'createAdmin',
  approveAdmin: 'approveAdmin',
  rejectAdmin: 'rejectAdmin',
  setAdminStatus: 'setAdminStatus',
  updateAdminPermissions: 'updateAdminPermissions',
  removeAdmin: 'removeAdmin',
  updateAdminProfile: 'updateAdminProfile'
};

/* ----------------------------------------------------------------------------
   CORE API HELPER
   Uses text/plain to avoid a CORS preflight against Apps Script, which only
   reads e.postData.contents as JSON regardless of the declared content type.
---------------------------------------------------------------------------- */
async function apiCall(action, params = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, message: 'Network error — could not reach the server. ' + err.message, data: {} };
  }
}

/* ----------------------------------------------------------------------------
   TOASTS
---------------------------------------------------------------------------- */
function toast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'default' ? ' toast-' + type : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ----------------------------------------------------------------------------
   CONFIRM MODAL
---------------------------------------------------------------------------- */
function confirmModal(title, body) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').textContent = body;
    backdrop.classList.remove('hidden');
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');
    function cleanup(result) {
      backdrop.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/* ----------------------------------------------------------------------------
   GENERIC MODAL HELPERS
---------------------------------------------------------------------------- */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

/* ----------------------------------------------------------------------------
   BUTTON LOADING STATE
---------------------------------------------------------------------------- */
function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
}

/* ----------------------------------------------------------------------------
   SMALL UTILITIES
---------------------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#E2E8F0"/><circle cx="32" cy="24" r="12" fill="#94A3B8"/><path d="M10 56c2-14 14-20 22-20s20 6 22 20" fill="#94A3B8"/></svg>`
);
function photoOrDefault(p) { return (p && String(p).trim().length > 0) ? p : DEFAULT_AVATAR; }

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// Resizes/compresses an uploaded image client-side before it is stored as a
// base64 string in the Photo column (keeps the Sheet cell small).
function resizeImageFile(file, maxDim = 180, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function badge(text, cls) { return `<span class="badge badge-${cls}">${escapeHtml(text)}</span>`; }
function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'active' || s === 'true') return 'approved';
  if (s === 'pending') return 'pending';
  if (s === 'rejected') return 'rejected';
  if (s === 'deactivated') return 'deactivated';
  if (s === 'inactive' || s === 'false') return 'inactive';
  return 'pending';
}

function fmtPct(n) { const v = Number(n); return isNaN(v) ? '—' : v.toFixed(2) + '%'; }

/* ============================================================================
   SESSION MANAGEMENT
   ============================================================================ */
const Session = {
  getStudent() { try { return JSON.parse(localStorage.getItem('aryStudent')); } catch { return null; } },
  setStudent(obj) { localStorage.setItem('aryStudent', JSON.stringify(obj)); },
  clearStudent() { localStorage.removeItem('aryStudent'); },
  getAdmin() { try { return JSON.parse(localStorage.getItem('aryAdmin')); } catch { return null; } },
  setAdmin(obj) { localStorage.setItem('aryAdmin', JSON.stringify(obj)); },
  clearAdmin() { localStorage.removeItem('aryAdmin'); }
};

/* ============================================================================
   ROUTER
   ============================================================================ */
const PUBLIC_SECTIONS = ['home', 'contact', 'student-login', 'student-register', 'admin-login'];
const STUDENT_SECTIONS = ['student-dashboard', 'student-quizzes', 'student-attempt', 'student-results', 'student-history', 'student-profile', 'student-contact'];
const ADMIN_SECTIONS = ['admin-dashboard', 'admin-students', 'admin-quizzes', 'admin-review', 'admin-results', 'admin-analytics', 'admin-announcements', 'admin-contacts', 'admin-management', 'admin-profile'];

const STUDENT_TITLES = {
  'student-dashboard': 'Dashboard', 'student-quizzes': 'Available Quizzes', 'student-attempt': 'Quiz in Progress',
  'student-results': 'Results', 'student-history': 'Quiz History', 'student-profile': 'Profile', 'student-contact': 'Contact'
};
const ADMIN_TITLES = {
  'admin-dashboard': 'Dashboard', 'admin-students': 'Students', 'admin-quizzes': 'Quizzes', 'admin-review': 'Quiz Review',
  'admin-results': 'Results', 'admin-analytics': 'Analytics', 'admin-announcements': 'Announcements',
  'admin-contacts': 'Contacts', 'admin-management': 'Admin Management', 'admin-profile': 'My Profile'
};

function hideAll() {
  PUBLIC_SECTIONS.forEach(s => document.getElementById('section-' + s)?.classList.add('hidden'));
  document.getElementById('studentApp').classList.add('hidden');
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('publicHeader').classList.remove('hidden');
}

async function navigate(name) {
  if (PUBLIC_SECTIONS.includes(name)) {
    hideAll();
    document.getElementById('section-' + name).classList.remove('hidden');
    if (name === 'contact') renderPublicContact();
    window.scrollTo(0, 0);
    closeMobileNav();
    return;
  }

  if (STUDENT_SECTIONS.includes(name)) {
    const student = Session.getStudent();
    if (!student) { toast('Please log in as a student first.', 'warning'); navigate('student-login'); return; }
    hideAll();
    document.getElementById('publicHeader').classList.add('hidden');
    document.getElementById('studentApp').classList.remove('hidden');
    document.querySelectorAll('#studentSidebar .sidebar-nav a').forEach(a => a.classList.toggle('is-active', a.dataset.nav === name));
    document.getElementById('studentTopbarTitle').textContent = STUDENT_TITLES[name] || '';
    document.querySelectorAll('#studentApp .content-section').forEach(s => s.classList.add('hidden'));
    closeSidebar('studentSidebar');
    const map = {
      'student-dashboard': 'studentSectionDashboard', 'student-quizzes': 'studentSectionQuizzes',
      'student-attempt': 'studentSectionAttempt', 'student-results': 'studentSectionResults',
      'student-history': 'studentSectionHistory', 'student-profile': 'studentSectionProfile',
      'student-contact': 'studentSectionContact'
    };
    document.getElementById(map[name]).classList.remove('hidden');
    if (name === 'student-dashboard') loadStudentDashboard();
    if (name === 'student-quizzes') loadStudentQuizzes();
    if (name === 'student-results') loadStudentResults();
    if (name === 'student-history') loadStudentHistory();
    if (name === 'student-profile') loadStudentProfile();
    if (name === 'student-contact') renderContactCards('contactCardsStudent');
    window.scrollTo(0, 0);
    return;
  }

  if (ADMIN_SECTIONS.includes(name)) {
    const admin = Session.getAdmin();
    if (!admin) { toast('Please log in as an admin first.', 'warning'); navigate('admin-login'); return; }
    hideAll();
    document.getElementById('publicHeader').classList.add('hidden');
    document.getElementById('adminApp').classList.remove('hidden');
    document.querySelectorAll('#adminSidebar .sidebar-nav a').forEach(a => a.classList.toggle('is-active', a.dataset.nav === name));
    document.getElementById('adminTopbarTitle').textContent = ADMIN_TITLES[name] || '';
    document.querySelectorAll('#adminApp .content-section').forEach(s => s.classList.add('hidden'));
    closeSidebar('adminSidebar');
    const map = {
      'admin-dashboard': 'adminSectionDashboard', 'admin-students': 'adminSectionStudents',
      'admin-quizzes': 'adminSectionQuizzes', 'admin-review': 'adminSectionReview',
      'admin-results': 'adminSectionResults', 'admin-analytics': 'adminSectionAnalytics',
      'admin-announcements': 'adminSectionAnnouncements', 'admin-contacts': 'adminSectionContacts',
      'admin-management': 'adminSectionAdmins', 'admin-profile': 'adminSectionProfile'
    };
    document.getElementById(map[name]).classList.remove('hidden');
    if (name === 'admin-dashboard') loadAdminDashboard();
    if (name === 'admin-students') loadAdminStudents();
    if (name === 'admin-quizzes') loadAdminQuizzes();
    if (name === 'admin-review') loadAdminReview();
    if (name === 'admin-results') loadAdminResults();
    if (name === 'admin-analytics') loadAdminAnalytics();
    if (name === 'admin-announcements') loadAdminAnnouncements();
    if (name === 'admin-contacts') loadAdminContacts();
    if (name === 'admin-management') loadAdminManagement();
    if (name === 'admin-profile') loadAdminProfile();
    window.scrollTo(0, 0);
    return;
  }
}

function closeMobileNav() { document.getElementById('mobileNavPanel').classList.add('hidden'); }
function closeSidebar(id) { document.getElementById(id).classList.remove('is-open'); }

document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    navigate(navEl.dataset.nav);
  }
});

document.getElementById('mobileNavToggle').addEventListener('click', () => {
  document.getElementById('mobileNavPanel').classList.toggle('hidden');
});
document.getElementById('studentSidebarToggle').addEventListener('click', () => {
  document.getElementById('studentSidebar').classList.toggle('is-open');
});
document.getElementById('adminSidebarToggle').addEventListener('click', () => {
  document.getElementById('adminSidebar').classList.toggle('is-open');
});

/* ============================================================================
   PUBLIC / STUDENT: CONTACT (backed by the real getContacts action)
   ============================================================================ */
async function renderContactCards(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getContacts, {});
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const contacts = res.data.contacts || [];
  if (contacts.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No contact details yet</h4></div>`; return; }
  el.innerHTML = contacts.map(c => `
    <div class="contact-card">
      <h4>${escapeHtml(c.Name)}</h4>
      <p>${escapeHtml(c.Role || '')}</p>
      <div class="row-actions">
        ${c.Phone ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHtml(String(c.Phone).replace(/\s/g, ''))}">Call</a>` : ''}
        ${c.WhatsApp ? `<a class="btn btn-success btn-sm" href="https://wa.me/${escapeHtml(String(c.WhatsApp).replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${c.Email ? `<a class="btn btn-ghost btn-sm" href="mailto:${escapeHtml(c.Email)}">Email</a>` : ''}
      </div>
    </div>
  `).join('');
}
function renderPublicContact() { renderContactCards('contactCardsPublic'); }

/* ============================================================================
   STUDENT: REGISTRATION
   ============================================================================ */
let regPhotoData = '';
document.getElementById('regPhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    regPhotoData = await resizeImageFile(file);
    document.getElementById('regPhotoPreview').src = regPhotoData;
  } catch { toast('Could not read that image.', 'error'); }
});
document.getElementById('regPhotoPreview').src = DEFAULT_AVATAR;

document.getElementById('studentRegisterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('studentRegisterError');
  const okEl = document.getElementById('studentRegisterSuccess');
  errEl.classList.add('hidden'); okEl.classList.add('hidden');

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const className = document.getElementById('regClass').value.trim();
  const pw = document.getElementById('regPassword').value;
  const pw2 = document.getElementById('regConfirmPassword').value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.remove('hidden'); return; }
  if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
  if (pw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('studentRegisterBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.registerStudent, { name, email, password: pw, class: className, photo: regPhotoData });
  setBtnLoading(btn, false);

  if (res.success) {
    okEl.textContent = res.message || 'Registration submitted. Waiting for admin approval.';
    okEl.classList.remove('hidden');
    e.target.reset();
    regPhotoData = '';
    document.getElementById('regPhotoPreview').src = DEFAULT_AVATAR;
    toast('Account created — waiting for approval.', 'success');
  } else {
    errEl.textContent = res.message || 'Registration failed.';
    errEl.classList.remove('hidden');
  }
});

/* ============================================================================
   STUDENT: LOGIN / LOGOUT
   ============================================================================ */
document.getElementById('studentLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('studentLoginError');
  errEl.classList.add('hidden');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('studentLoginBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.studentLogin, { email, password });
  setBtnLoading(btn, false);

  if (res.success) {
    Session.setStudent(res.data);
    toast(`Welcome back, ${res.data.name}.`, 'success');
    e.target.reset();
    applyStudentSessionToUI();
    navigate('student-dashboard');
  } else {
    errEl.textContent = res.message || 'Login failed.';
    errEl.classList.remove('hidden');
  }
});

function applyStudentSessionToUI() {
  const s = Session.getStudent();
  if (!s) return;
  document.getElementById('studentSidebarName').textContent = s.name || '—';
  document.getElementById('studentSidebarClass').textContent = s.className || '—';
  document.getElementById('studentSidebarPhoto').src = photoOrDefault(s.photo);
}

document.getElementById('studentLogoutBtn').addEventListener('click', async () => {
  const ok = await confirmModal('Log out?', 'You will need to log in again to access your quizzes.');
  if (!ok) return;
  await apiCall(API_ACTIONS.studentLogout, {});
  Session.clearStudent();
  toast('Logged out.', 'default');
  navigate('student-login');
});

/* ============================================================================
   STUDENT: DASHBOARD
   ============================================================================ */
async function loadStudentDashboard() {
  const s = Session.getStudent();
  applyStudentSessionToUI();
  document.getElementById('dashPhoto').src = photoOrDefault(s.photo);
  document.getElementById('dashWelcome').textContent = `Welcome back, ${s.name}`;

  const grid = document.getElementById('studentStatGrid');
  grid.innerHTML = `<div class="empty-state">Loading your stats…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentDashboard, { studentId: s.studentId });
  if (!res.success) { grid.innerHTML = `<div class="empty-state">${escapeHtml(res.message || 'Could not load dashboard.')}</div>`; return; }
  const d = res.data;
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">Quizzes Taken</div><div class="stat-value">${d.quizzesTaken ?? 0}</div></div>
    <div class="stat-card"><div class="stat-label">Average Score</div><div class="stat-value">${fmtPct(d.averagePercentage)}</div></div>
    <div class="stat-card"><div class="stat-label">Available Quizzes</div><div class="stat-value">${d.availableQuizzes ?? 0}</div></div>
    <div class="stat-card"><div class="stat-label">Best Result</div><div class="stat-value">${d.bestResult ? fmtPct(d.bestResult.Percentage) : '—'}</div><div class="stat-sub">${d.bestResult ? escapeHtml(d.bestResult.QuizName) : 'No attempts yet'}</div></div>
  `;

  const recentEl = document.getElementById('dashRecentResults');
  if (!d.recentResults || d.recentResults.length === 0) {
    recentEl.innerHTML = `<div class="empty-state"><h4>No results yet</h4><p>Take a quiz to see it here.</p></div>`;
  } else {
    recentEl.innerHTML = renderResultsTable(d.recentResults);
  }

  const annEl = document.getElementById('dashAnnouncements');
  const annRes = await apiCall(API_ACTIONS.getAnnouncements, {});
  const anns = (annRes.success && annRes.data.announcements) ? annRes.data.announcements : [];
  annEl.innerHTML = anns.length === 0
    ? `<div class="empty-state"><h4>No announcements</h4></div>`
    : anns.map(a => `<div class="announcement-item"><h4>${escapeHtml(a.Title)}</h4><p>${escapeHtml(a.Message)}</p><time>${escapeHtml(a.Date)}</time></div>`).join('');
}

function renderResultsTable(rows) {
  if (!rows || rows.length === 0) return `<div class="empty-state"><h4>No results</h4></div>`;
  return `<table><thead><tr><th>Quiz</th><th>Score</th><th>Percentage</th><th>Date</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${escapeHtml(r.QuizName)}</td><td>${escapeHtml(r.Score)}/${escapeHtml(r.TotalQuestions)}</td><td>${fmtPct(r.Percentage)}</td><td>${escapeHtml(r.Date)} ${escapeHtml(r.Time || '')}</td></tr>`).join('')}
  </tbody></table>`;
}

/* ============================================================================
   STUDENT: AVAILABLE QUIZZES
   ============================================================================ */
async function loadStudentQuizzes() {
  const grid = document.getElementById('studentQuizGrid');
  grid.innerHTML = `<div class="empty-state">Loading quizzes…</div>`;
  const res = await apiCall(API_ACTIONS.getQuizzes, {});
  if (!res.success) { grid.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const quizzes = res.data.quizzes || [];
  if (quizzes.length === 0) { grid.innerHTML = `<div class="empty-state"><h4>No quizzes available right now</h4><p>Check back later.</p></div>`; return; }
  grid.innerHTML = quizzes.map(q => `
    <div class="quiz-card">
      <div class="quiz-card-top">
        <h3>${escapeHtml(q.quizName)}</h3>
        ${badge(q.quizType || 'Regular', q.quizType === 'Mock' ? 'pending' : 'approved')}
      </div>
      <div class="quiz-meta-row">
        <span>📝 ${q.questionCount} questions</span>
        <span>⏱ ${q.durationMinutes} min</span>
        ${q.expiryDate ? `<span>📅 Expires ${escapeHtml(q.expiryDate)} ${escapeHtml(q.expiryTime || '')}</span>` : ''}
      </div>
      <button class="btn btn-primary btn-block start-quiz-btn" data-quiz="${escapeHtml(q.quizName)}">Start Quiz</button>
    </div>
  `).join('');

  grid.querySelectorAll('.start-quiz-btn').forEach(btn => {
    btn.addEventListener('click', () => startQuizAttempt(btn.dataset.quiz));
  });
}
document.getElementById('refreshQuizzesBtn').addEventListener('click', loadStudentQuizzes);

/* ============================================================================
   STUDENT: QUIZ ATTEMPT
   ============================================================================ */
const Attempt = {
  quizName: '', questions: [], answers: {}, review: {}, index: 0,
  durationSeconds: 0, remainingSeconds: 0, timerHandle: null
};

async function startQuizAttempt(quizName) {
  const s = Session.getStudent();
  const res = await apiCall(API_ACTIONS.getQuizQuestions, { quizName, studentId: s.studentId });
  if (!res.success) { toast(res.message || 'Could not start this quiz.', 'error'); return; }
  const d = res.data;

  Attempt.quizName = quizName;
  Attempt.questions = d.questions;
  Attempt.answers = {};
  Attempt.review = {};
  Attempt.index = 0;
  Attempt.durationSeconds = (d.durationMinutes || 30) * 60;
  Attempt.remainingSeconds = Attempt.durationSeconds;

  document.getElementById('attemptQuizName').textContent = quizName;
  document.getElementById('attemptStudentInfo').textContent = `${s.name} — ${s.className || ''}`;
  renderPalette();
  renderQuestion();
  startAttemptTimer();

  navigate('student-attempt');
}

function startAttemptTimer() {
  clearInterval(Attempt.timerHandle);
  updateTimerDisplay();
  Attempt.timerHandle = setInterval(() => {
    Attempt.remainingSeconds--;
    updateTimerDisplay();
    if (Attempt.remainingSeconds <= 0) {
      clearInterval(Attempt.timerHandle);
      toast('Time is up — submitting your quiz automatically.', 'warning');
      finishAttempt(true);
    }
  }, 1000);
}
function updateTimerDisplay() {
  const el = document.getElementById('attemptTimer');
  const m = Math.floor(Math.max(Attempt.remainingSeconds, 0) / 60);
  const sec = Math.max(Attempt.remainingSeconds, 0) % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  el.classList.toggle('is-low', Attempt.remainingSeconds <= 60);
}

function renderQuestion() {
  const q = Attempt.questions[Attempt.index];
  document.getElementById('attemptQuestionIndex').textContent = `Question ${Attempt.index + 1} of ${Attempt.questions.length}`;
  document.getElementById('attemptQuestionText').textContent = q.question;
  document.getElementById('attemptProgressBar').style.width = `${Math.round(((Attempt.index + 1) / Attempt.questions.length) * 100)}%`;

  const optsEl = document.getElementById('attemptOptions');
  const selected = Attempt.answers[q.questionIndex];
  optsEl.innerHTML = q.options.map(opt => `
    <div class="attempt-option ${selected === opt.key ? 'is-selected' : ''}" data-key="${opt.key}">
      <span class="opt-letter">${opt.key}</span>
      <span>${escapeHtml(opt.text)}</span>
    </div>
  `).join('');
  optsEl.querySelectorAll('.attempt-option').forEach(el => {
    el.addEventListener('click', () => {
      Attempt.answers[q.questionIndex] = el.dataset.key;
      renderQuestion();
      renderPalette();
    });
  });

  document.getElementById('attemptPrevBtn').disabled = Attempt.index === 0;
  const isLast = Attempt.index === Attempt.questions.length - 1;
  document.getElementById('attemptNextBtn').classList.toggle('hidden', isLast);
  document.getElementById('attemptSubmitBtn').classList.toggle('hidden', !isLast);

  document.getElementById('attemptMarkBtn').textContent = Attempt.review[q.questionIndex] ? 'Unmark Review' : 'Mark for Review';
}

function renderPalette() {
  const el = document.getElementById('questionPalette');
  el.innerHTML = Attempt.questions.map((q, i) => {
    let cls = 'palette-btn';
    if (i === Attempt.index) cls += ' is-current';
    if (Attempt.review[q.questionIndex]) cls += ' is-review';
    else if (Attempt.answers[q.questionIndex]) cls += ' is-answered';
    return `<button type="button" class="${cls}" data-index="${i}">${i + 1}</button>`;
  }).join('');
  el.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => { Attempt.index = Number(btn.dataset.index); renderQuestion(); renderPalette(); });
  });
}

document.getElementById('attemptPrevBtn').addEventListener('click', () => { if (Attempt.index > 0) { Attempt.index--; renderQuestion(); renderPalette(); } });
document.getElementById('attemptNextBtn').addEventListener('click', () => { if (Attempt.index < Attempt.questions.length - 1) { Attempt.index++; renderQuestion(); renderPalette(); } });
document.getElementById('attemptMarkBtn').addEventListener('click', () => {
  const q = Attempt.questions[Attempt.index];
  Attempt.review[q.questionIndex] = !Attempt.review[q.questionIndex];
  renderQuestion(); renderPalette();
});
document.getElementById('attemptSubmitBtn').addEventListener('click', async () => {
  const unanswered = Attempt.questions.filter(q => !Attempt.answers[q.questionIndex]).length;
  const ok = await confirmModal('Submit quiz?', unanswered > 0
    ? `You have ${unanswered} unanswered question(s). Submit anyway?`
    : 'You will not be able to change your answers after submitting.');
  if (ok) finishAttempt(false);
});

async function finishAttempt(auto) {
  clearInterval(Attempt.timerHandle);
  const s = Session.getStudent();
  const answers = Attempt.questions.map(q => ({ questionIndex: q.questionIndex, selected: Attempt.answers[q.questionIndex] || '' }));
  const res = await apiCall(API_ACTIONS.submitQuiz, { studentId: s.studentId, quizName: Attempt.quizName, answers: JSON.stringify(answers) });

  if (!res.success) {
    toast(res.message || 'Could not submit your quiz. Please try again.', 'error');
    return;
  }
  showResultModal(res.data, Attempt.quizName);
}

function showResultModal(d, quizName) {
  document.getElementById('resultQuizName').textContent = quizName;
  document.getElementById('resultScore').textContent = d.score;
  document.getElementById('resultCorrect').textContent = d.correctAnswers;
  document.getElementById('resultWrong').textContent = d.wrongAnswers;
  document.getElementById('resultTotal').textContent = d.totalQuestions;
  document.getElementById('resultPercentage').textContent = fmtPct(d.percentage);
  document.getElementById('resultMeta').textContent = `Result ID: ${d.resultId}`;
  const circumference = 326.7;
  const fillEl = document.getElementById('resultRingFill');
  const offset = circumference - (Math.min(Math.max(d.percentage, 0), 100) / 100) * circumference;
  fillEl.style.strokeDasharray = String(circumference);
  fillEl.style.strokeDashoffset = String(offset);
  openModal('resultModal');
}
document.getElementById('resultCloseBtn').addEventListener('click', () => {
  closeModal('resultModal');
  navigate('student-dashboard');
});

/* ============================================================================
   STUDENT: RESULTS / HISTORY
   ============================================================================ */
async function loadStudentResults() {
  const s = Session.getStudent();
  const el = document.getElementById('studentResultsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentResults, { studentId: s.studentId });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  el.innerHTML = renderFullResultsTable(res.data.results);
}
async function loadStudentHistory() {
  const s = Session.getStudent();
  const el = document.getElementById('studentHistoryTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentResults, { studentId: s.studentId });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const sorted = (res.data.results || []).slice().sort((a, b) => new Date(b.Date + ' ' + (b.Time || '')) - new Date(a.Date + ' ' + (a.Time || '')));
  el.innerHTML = renderFullResultsTable(sorted);
}
function renderFullResultsTable(rows) {
  if (!rows || rows.length === 0) return `<div class="empty-state"><h4>No results yet</h4><p>Your quiz attempts will show up here.</p></div>`;
  return `<table><thead><tr><th>Quiz</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Percentage</th><th>Date</th><th>Time</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${escapeHtml(r.QuizName)}</td>
      <td>${escapeHtml(r.Score)}/${escapeHtml(r.TotalQuestions)}</td>
      <td>${escapeHtml(r.CorrectAnswers)}</td>
      <td>${escapeHtml(r.WrongAnswers)}</td>
      <td>${fmtPct(r.Percentage)}</td>
      <td>${escapeHtml(r.Date)}</td>
      <td>${escapeHtml(r.Time)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

/* ============================================================================
   STUDENT: PROFILE
   ============================================================================ */
let profilePhotoData = '';
async function loadStudentProfile() {
  const s = Session.getStudent();
  document.getElementById('profileName').value = s.name || '';
  document.getElementById('profileEmail').value = s.email || '';
  document.getElementById('profileClass').value = s.className || '';
  document.getElementById('profilePhotoPreview').src = photoOrDefault(s.photo);
  profilePhotoData = s.photo || '';
  document.getElementById('profilePassword').value = '';
  document.getElementById('profileFormMsg').classList.add('hidden');
}
document.getElementById('profilePhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    profilePhotoData = await resizeImageFile(file);
    document.getElementById('profilePhotoPreview').src = profilePhotoData;
  } catch { toast('Could not read that image.', 'error'); }
});
document.getElementById('studentProfileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const s = Session.getStudent();
  const btn = document.getElementById('profileSaveBtn');
  setBtnLoading(btn, true);
  const payload = {
    studentId: s.studentId,
    name: document.getElementById('profileName').value.trim(),
    class: document.getElementById('profileClass').value.trim(),
    photo: profilePhotoData
  };
  const pw = document.getElementById('profilePassword').value;
  if (pw) payload.password = pw;

  const res = await apiCall(API_ACTIONS.updateStudentProfile, payload);
  setBtnLoading(btn, false);
  const msg = document.getElementById('profileFormMsg');
  if (res.success) {
    Session.setStudent({ ...s, name: payload.name, className: payload.class, photo: payload.photo });
    applyStudentSessionToUI();
    msg.textContent = 'Profile updated.';
    msg.classList.remove('hidden');
    toast('Profile updated.', 'success');
  } else {
    toast(res.message || 'Could not update profile.', 'error');
  }
});

/* ============================================================================
   ADMIN: LOGIN / LOGOUT
   ============================================================================ */
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('adminLoginError');
  errEl.classList.add('hidden');
  const email = document.getElementById('adminLoginEmail').value.trim();
  const password = document.getElementById('adminLoginPassword').value;
  const btn = document.getElementById('adminLoginBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.adminLogin, { email, password });
  setBtnLoading(btn, false);

  if (res.success) {
    Session.setAdmin({ ...res.data, email, password }); // password cached locally only, to authorize further admin calls; includes photo + permissions from adminLogin
    toast(`Welcome, ${res.data.name}.`, 'success');
    e.target.reset();
    applyAdminSessionToUI();
    navigate('admin-dashboard');
  } else {
    errEl.textContent = res.message || 'Login failed.';
    errEl.classList.remove('hidden');
  }
});

function applyAdminSessionToUI() {
  const a = Session.getAdmin();
  if (!a) return;
  document.getElementById('adminSidebarName').textContent = a.name || '—';
  document.getElementById('adminSidebarRole').textContent = a.role || 'Admin';
  document.getElementById('adminSidebarPhoto').src = photoOrDefault(a.photo);
  document.getElementById('adminTopbarPhoto').src = photoOrDefault(a.photo);
  applyAdminRoleVisibility(a.role, a.permissions);
}

// Super Admins see every section. Regular admins see Dashboard and My Profile
// plus whatever sections are in their comma-separated Permissions string
// (students, quizzes, review, results, analytics, announcements, contacts, admins).
function applyAdminRoleVisibility(role, permissionsStr) {
  const isSuperAdmin = String(role || '').toLowerCase().includes('super');
  const perms = String(permissionsStr || '').split(',').map(s => s.trim()).filter(Boolean);
  const sectionToPerm = {
    'admin-students': 'students', 'admin-quizzes': 'quizzes', 'admin-review': 'review',
    'admin-results': 'results', 'admin-analytics': 'analytics', 'admin-announcements': 'announcements',
    'admin-contacts': 'contacts', 'admin-management': 'admins'
  };
  document.querySelectorAll('#adminNav a').forEach(a => {
    const name = a.dataset.nav;
    const permKey = sectionToPerm[name];
    const alwaysVisible = !permKey; // dashboard, profile
    const visible = isSuperAdmin || alwaysVisible || perms.includes(permKey);
    a.classList.toggle('hidden', !visible);
  });
}

function adminAuthParams() {
  const a = Session.getAdmin();
  return a ? { adminEmail: a.email, adminPassword: a.password } : {};
}

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  const ok = await confirmModal('Log out?', 'You will need to log in again to access the admin panel.');
  if (!ok) return;
  Session.clearAdmin();
  toast('Logged out.', 'default');
  navigate('admin-login');
});

/* ============================================================================
   ADMIN: DASHBOARD
   ============================================================================ */
async function loadAdminDashboard() {
  applyAdminSessionToUI();
  const grid = document.getElementById('adminStatGrid');
  grid.innerHTML = `<div class="empty-state">Loading…</div>`;

  const [studentsRes, quizzesRes, resultsRes] = await Promise.all([
    apiCall(API_ACTIONS.getStudents, adminAuthParams()),
    apiCall(API_ACTIONS.getAllQuizzesAdmin, adminAuthParams()),
    apiCall(API_ACTIONS.getAllResults, adminAuthParams())
  ]);

  if (!studentsRes.success || !quizzesRes.success || !resultsRes.success) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(studentsRes.message || quizzesRes.message || resultsRes.message || 'Could not load dashboard.')}</div>`;
    return;
  }

  const students = studentsRes.data.students || [];
  const quizzes = quizzesRes.data.quizzes || [];
  const results = resultsRes.data.results || [];

  const pending = students.filter(s => s.Status === 'Pending').length;
  const active = students.filter(s => s.Status === 'Approved').length;
  const published = quizzes.filter(q => q.Active === true || String(q.Active).toUpperCase() === 'TRUE').length;

  grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Students</div><div class="stat-value">${students.length}</div></div>
    <div class="stat-card"><div class="stat-label">Pending Students</div><div class="stat-value">${pending}</div></div>
    <div class="stat-card"><div class="stat-label">Active Students</div><div class="stat-value">${active}</div></div>
    <div class="stat-card"><div class="stat-label">Total Quizzes</div><div class="stat-value">${quizzes.length}</div></div>
    <div class="stat-card"><div class="stat-label">Published Quizzes</div><div class="stat-value">${published}</div></div>
    <div class="stat-card"><div class="stat-label">Total Results Logged</div><div class="stat-value">${results.length}</div></div>
  `;

  const recentEl = document.getElementById('adminRecentActivity');
  const recent = results.slice(-8).reverse();
  recentEl.innerHTML = recent.length === 0
    ? `<div class="empty-state"><h4>No activity yet</h4></div>`
    : `<table><thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Date</th></tr></thead><tbody>
        ${recent.map(r => `<tr><td>${escapeHtml(r.StudentName)}</td><td>${escapeHtml(r.QuizName)}</td><td>${fmtPct(r.Percentage)}</td><td>${escapeHtml(r.Date)}</td></tr>`).join('')}
      </tbody></table>`;

  const pendingEl = document.getElementById('adminPendingPreview');
  const pendingStudents = students.filter(s => s.Status === 'Pending').slice(0, 8);
  pendingEl.innerHTML = pendingStudents.length === 0
    ? `<div class="empty-state"><h4>No pending approvals</h4></div>`
    : `<table><thead><tr><th>Name</th><th>Class</th></tr></thead><tbody>
        ${pendingStudents.map(s => `<tr><td>${escapeHtml(s.Name)}</td><td>${escapeHtml(s.Class)}</td></tr>`).join('')}
      </tbody></table>`;
}

/* ============================================================================
   ADMIN: STUDENTS
   ============================================================================ */
let allStudentsCache = [];
let studentStatusFilter = 'All';

async function loadAdminStudents() {
  const el = document.getElementById('adminStudentsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudents, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  allStudentsCache = res.data.students || [];
  renderStudentsTable();
}

function renderStudentsTable() {
  const el = document.getElementById('adminStudentsTable');
  const query = document.getElementById('studentSearchInput').value.trim().toLowerCase();
  let rows = allStudentsCache;
  if (studentStatusFilter !== 'All') rows = rows.filter(s => s.Status === studentStatusFilter);
  if (query) rows = rows.filter(s => `${s.Name} ${s.Email} ${s.Class}`.toLowerCase().includes(query));

  if (rows.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No matching students</h4></div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Student</th><th>Email</th><th>Class</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(s => `
      <tr>
        <td><div class="table-name-cell"><img class="avatar-sm" src="${photoOrDefault(s.Photo)}" alt=""> ${escapeHtml(s.Name)}</div></td>
        <td>${escapeHtml(s.Email)}</td>
        <td>${escapeHtml(s.Class)}</td>
        <td>${badge(s.Status, statusBadgeClass(s.Status))}</td>
        <td>${escapeHtml(s.RegistrationDate)}</td>
        <td class="row-actions">
          ${s.Status !== 'Approved' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(s.StudentID)}">Approve</button>` : ''}
          ${s.Status !== 'Rejected' ? `<button class="btn btn-danger btn-sm" data-action="reject" data-id="${escapeHtml(s.StudentID)}">Reject</button>` : ''}
          ${s.Status === 'Approved' ? `<button class="btn btn-outline btn-sm" data-action="deactivate" data-id="${escapeHtml(s.StudentID)}">Deactivate</button>` : ''}
          ${s.Status === 'Deactivated' ? `<button class="btn btn-outline btn-sm" data-action="approve" data-id="${escapeHtml(s.StudentID)}">Reactivate</button>` : ''}
        </td>
      </tr>
    `).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleStudentAction(btn.dataset.action, btn.dataset.id));
  });
}

async function handleStudentAction(action, studentId) {
  const labels = { approve: 'approve', reject: 'reject', deactivate: 'deactivate' };
  const ok = await confirmModal(`Confirm ${labels[action]}`, `Are you sure you want to ${labels[action]} this student?`);
  if (!ok) return;

  let res;
  if (action === 'approve') res = await apiCall(API_ACTIONS.approveStudent, { studentId, ...adminAuthParams() });
  else if (action === 'reject') res = await apiCall(API_ACTIONS.rejectStudent, { studentId, ...adminAuthParams() });
  else if (action === 'deactivate') res = await apiCall(API_ACTIONS.setStudentStatus, { studentId, status: 'Deactivated', ...adminAuthParams() });

  if (res.success) { toast(res.message || 'Updated.', 'success'); loadAdminStudents(); }
  else toast(res.message || 'Action failed.', 'error');
}

document.getElementById('studentSearchInput').addEventListener('input', debounce(renderStudentsTable, 200));
document.getElementById('studentStatusFilter').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#studentStatusFilter .chip').forEach(c => c.classList.remove('is-active'));
  chip.classList.add('is-active');
  studentStatusFilter = chip.dataset.filter;
  renderStudentsTable();
});

/* ============================================================================
   ADMIN: QUIZZES (+ QUIZ REVIEW re-uses the same table into a different target)
   ============================================================================ */
async function loadAdminQuizzes(targetId = 'adminQuizzesTable') {
  const el = document.getElementById(targetId);
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAllQuizzesAdmin, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const quizzes = res.data.quizzes || [];
  if (quizzes.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No quiz tabs detected</h4><p>Add a new sheet tab with Question/OptionA-D/CorrectAnswer columns.</p></div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Quiz</th><th>Status</th><th>Questions</th><th>Duration</th><th>Type</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>
    ${quizzes.map(q => {
      const isActive = q.Active === true || String(q.Active).toUpperCase() === 'TRUE';
      return `<tr>
        <td>${escapeHtml(q.QuizName)}</td>
        <td>${badge(isActive ? 'Published' : 'Inactive', isActive ? 'published' : 'inactive')} ${q.expired ? badge('Expired', 'rejected') : ''}</td>
        <td>${q.questionCount}</td>
        <td>${escapeHtml(q.DurationMinutes)} min</td>
        <td>${escapeHtml(q.QuizType)}</td>
        <td>${q.ExpiryDate ? escapeHtml(q.ExpiryDate) + ' ' + escapeHtml(q.ExpiryTime || '') : '—'}</td>
        <td class="row-actions">
          <button class="btn btn-outline btn-sm" data-action="toggle" data-name="${escapeHtml(q.QuizName)}" data-active="${isActive}">${isActive ? 'Unpublish' : 'Publish'}</button>
          <button class="btn btn-ghost btn-sm" data-action="settings" data-name="${escapeHtml(q.QuizName)}">Settings</button>
        </td>
      </tr>`;
    }).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const active = btn.dataset.active === 'true';
      const res2 = await apiCall(API_ACTIONS.setQuizActive, { quizName: btn.dataset.name, active: !active, ...adminAuthParams() });
      if (res2.success) { toast(!active ? 'Quiz published.' : 'Quiz unpublished.', 'success'); loadAdminQuizzes(targetId); }
      else toast(res2.message || 'Could not update quiz.', 'error');
    });
  });
  el.querySelectorAll('[data-action="settings"]').forEach(btn => {
    btn.addEventListener('click', () => openQuizSettingsModal(btn.dataset.name, quizzes.find(q => q.QuizName === btn.dataset.name)));
  });
}
document.getElementById('refreshAdminQuizzesBtn').addEventListener('click', () => loadAdminQuizzes());

function openQuizSettingsModal(quizName, settings) {
  document.getElementById('quizSettingsName').textContent = quizName;
  document.getElementById('quizDuration').value = settings.DurationMinutes || 30;
  document.getElementById('quizType').value = settings.QuizType || 'Regular';
  document.getElementById('quizAllowMultiple').checked = settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE';
  document.getElementById('quizRandomizeQ').checked = settings.RandomizeQuestions === true || String(settings.RandomizeQuestions).toUpperCase() === 'TRUE';
  document.getElementById('quizRandomizeO').checked = settings.RandomizeOptions === true || String(settings.RandomizeOptions).toUpperCase() === 'TRUE';
  document.getElementById('quizExpiryDate').value = settings.ExpiryDate || '';
  document.getElementById('quizExpiryTime').value = settings.ExpiryTime || '';
  document.getElementById('quizSettingsForm').dataset.quizName = quizName;
  openModal('quizSettingsModal');
}
document.getElementById('quizSettingsCancelBtn').addEventListener('click', () => closeModal('quizSettingsModal'));
document.getElementById('quizSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const quizName = e.target.dataset.quizName;
  const btn = document.getElementById('quizSettingsSaveBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.updateQuizSettings, {
    quizName,
    durationMinutes: document.getElementById('quizDuration').value,
    quizType: document.getElementById('quizType').value,
    allowMultipleAttempts: document.getElementById('quizAllowMultiple').checked,
    randomizeQuestions: document.getElementById('quizRandomizeQ').checked,
    randomizeOptions: document.getElementById('quizRandomizeO').checked,
    expiryDate: document.getElementById('quizExpiryDate').value,
    expiryTime: document.getElementById('quizExpiryTime').value,
    ...adminAuthParams()
  });
  setBtnLoading(btn, false);
  if (res.success) {
    toast('Quiz settings saved.', 'success');
    closeModal('quizSettingsModal');
    loadAdminQuizzes(); loadAdminQuizzes('adminReviewTable');
  } else toast(res.message || 'Could not save settings.', 'error');
});

/* ============================================================================
   ADMIN: QUIZ REVIEW WORKFLOW
   ============================================================================ */
const REVIEW_STATUS_BADGE = {
  Draft: 'deactivated', UnderReview: 'pending', ChangesRequired: 'inactive',
  Approved: 'pending', Published: 'published', Rejected: 'rejected'
};
const REVIEW_STATUS_LABEL = {
  Draft: 'Draft', UnderReview: 'Under Review', ChangesRequired: 'Changes Required',
  Approved: 'Approved', Published: 'Published', Rejected: 'Rejected'
};

async function loadAdminReview() {
  const el = document.getElementById('adminReviewTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAllQuizzesAdmin, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const quizzes = res.data.quizzes || [];
  if (quizzes.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No quiz tabs detected</h4></div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Quiz</th><th>Status</th><th>Note</th><th>Actions</th></tr></thead><tbody>
    ${quizzes.map(q => {
      const status = q.EffectiveReviewStatus || 'Draft';
      return `<tr>
        <td>${escapeHtml(q.QuizName)}</td>
        <td>${badge(REVIEW_STATUS_LABEL[status] || status, REVIEW_STATUS_BADGE[status] || 'pending')} ${q.expired ? badge('Expired', 'rejected') : ''}</td>
        <td>${q.ReviewNote ? escapeHtml(q.ReviewNote) : '—'}</td>
        <td class="row-actions">${renderReviewActions(q.QuizName, status)}</td>
      </tr>`;
    }).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-review-action]').forEach(btn => {
    btn.addEventListener('click', () => handleReviewAction(btn.dataset.reviewAction, btn.dataset.name));
  });
}

function renderReviewActions(quizName, status) {
  const n = escapeHtml(quizName);
  const actions = [];
  if (status === 'Draft') actions.push(`<button class="btn btn-outline btn-sm" data-review-action="UnderReview" data-name="${n}">Submit for Review</button>`);
  if (status === 'UnderReview') {
    actions.push(`<button class="btn btn-success btn-sm" data-review-action="Approved" data-name="${n}">Approve</button>`);
    actions.push(`<button class="btn btn-outline btn-sm" data-review-action="ChangesRequired" data-name="${n}">Request Changes</button>`);
    actions.push(`<button class="btn btn-danger btn-sm" data-review-action="Rejected" data-name="${n}">Reject</button>`);
  }
  if (status === 'ChangesRequired') actions.push(`<button class="btn btn-outline btn-sm" data-review-action="UnderReview" data-name="${n}">Resubmit for Review</button>`);
  if (status === 'Approved') actions.push(`<button class="btn btn-primary btn-sm" data-review-action="publish" data-name="${n}">Publish</button>`);
  if (status === 'Published') actions.push(`<button class="btn btn-outline btn-sm" data-review-action="unpublish" data-name="${n}">Unpublish</button>`);
  if (status === 'Rejected') actions.push(`<button class="btn btn-outline btn-sm" data-review-action="Draft" data-name="${n}">Reopen as Draft</button>`);
  actions.push(`<button class="btn btn-ghost btn-sm" data-review-action="settings" data-name="${n}">Settings</button>`);
  return actions.join('');
}

async function handleReviewAction(action, quizName) {
  if (action === 'settings') {
    const res = await apiCall(API_ACTIONS.getAllQuizzesAdmin, adminAuthParams());
    const q = res.success ? (res.data.quizzes || []).find(x => x.QuizName === quizName) : null;
    if (q) openQuizSettingsModal(quizName, q);
    return;
  }
  if (action === 'ChangesRequired') {
    const note = prompt('Note for the quiz creator (what needs to change)?', '');
    const res = await apiCall(API_ACTIONS.requestChanges, { quizName, reviewNote: note || '', ...adminAuthParams() });
    if (res.success) { toast('Changes requested.', 'success'); loadAdminReview(); } else toast(res.message || 'Action failed.', 'error');
    return;
  }
  if (action === 'publish') {
    const res = await apiCall(API_ACTIONS.publishQuiz, { quizName, ...adminAuthParams() });
    if (res.success) { toast('Quiz published.', 'success'); loadAdminReview(); } else toast(res.message || 'Action failed.', 'error');
    return;
  }
  if (action === 'unpublish') {
    const res = await apiCall(API_ACTIONS.unpublishQuiz, { quizName, ...adminAuthParams() });
    if (res.success) { toast('Quiz unpublished.', 'success'); loadAdminReview(); } else toast(res.message || 'Action failed.', 'error');
    return;
  }
  // Draft / UnderReview / Approved / Rejected via the generic reviewQuiz action
  const ok = await confirmModal('Confirm status change', `Set this quiz to "${REVIEW_STATUS_LABEL[action] || action}"?`);
  if (!ok) return;
  const res = await apiCall(API_ACTIONS.reviewQuiz, { quizName, reviewStatus: action, ...adminAuthParams() });
  if (res.success) { toast('Status updated.', 'success'); loadAdminReview(); } else toast(res.message || 'Action failed.', 'error');
}
document.getElementById('refreshReviewBtn').addEventListener('click', loadAdminReview);

/* ============================================================================
   ADMIN: RESULTS
   ============================================================================ */
async function loadAdminResults() {
  const el = document.getElementById('adminResultsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAllResults, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  renderAdminResultsTable(res.data.results || []);
}
function renderAdminResultsTable(rows) {
  const el = document.getElementById('adminResultsTable');
  if (rows.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No results yet</h4></div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Date</th><th>Time</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${escapeHtml(r.StudentName)}</td>
      <td>${escapeHtml(r.QuizName)}</td>
      <td>${escapeHtml(r.Score)}/${escapeHtml(r.TotalQuestions)}</td>
      <td>${fmtPct(r.Percentage)}</td>
      <td>${escapeHtml(r.Date)}</td>
      <td>${escapeHtml(r.Time)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
document.getElementById('resultsSearchInput').addEventListener('input', debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) { loadAdminResults(); return; }
  const res = await apiCall(API_ACTIONS.searchStudentResults, { query: q, ...adminAuthParams() });
  if (res.success) renderAdminResultsTable(res.data.results || []);
}, 250));

/* ============================================================================
   ADMIN: ANALYTICS
   ============================================================================ */
async function loadAdminAnalytics() {
  const classEl = document.getElementById('classAnalyticsTable');
  const quizEl = document.getElementById('quizAnalyticsTable');
  const topEl = document.getElementById('topStudentsTable');
  classEl.innerHTML = quizEl.innerHTML = topEl.innerHTML = `<div class="empty-state">Loading…</div>`;

  const [classRes, quizRes, resultsRes] = await Promise.all([
    apiCall(API_ACTIONS.getClassAnalytics, adminAuthParams()),
    apiCall(API_ACTIONS.getQuizAnalytics, adminAuthParams()),
    apiCall(API_ACTIONS.getAllResults, adminAuthParams())
  ]);

  if (classRes.success) {
    const rows = classRes.data.classAnalytics || [];
    classEl.innerHTML = rows.length === 0 ? `<div class="empty-state"><h4>No data yet</h4></div>` :
      `<table><thead><tr><th>Class</th><th>Students</th><th>Attempts</th><th>Average</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${escapeHtml(r.className)}</td><td>${r.totalStudents}</td><td>${r.totalAttempts}</td><td>${fmtPct(r.averagePercentage)}</td><td>${fmtPct(r.highestPercentage)}</td><td>${fmtPct(r.lowestPercentage)}</td></tr>`).join('')}
      </tbody></table>`;
  } else classEl.innerHTML = `<div class="empty-state">${escapeHtml(classRes.message)}</div>`;

  if (quizRes.success) {
    const rows = quizRes.data.quizAnalytics || [];
    quizEl.innerHTML = rows.length === 0 ? `<div class="empty-state"><h4>No data yet</h4></div>` :
      `<table><thead><tr><th>Quiz</th><th>Attempts</th><th>Average</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${escapeHtml(r.quizName)}</td><td>${r.totalAttempts}</td><td>${fmtPct(r.averagePercentage)}</td><td>${fmtPct(r.highestPercentage)}</td><td>${fmtPct(r.lowestPercentage)}</td></tr>`).join('')}
      </tbody></table>`;
  } else quizEl.innerHTML = `<div class="empty-state">${escapeHtml(quizRes.message)}</div>`;

  if (resultsRes.success) {
    const results = resultsRes.data.results || [];
    const byStudent = {};
    results.forEach(r => {
      const key = r.StudentID;
      if (!byStudent[key]) byStudent[key] = { name: r.StudentName, total: 0, count: 0 };
      byStudent[key].total += Number(r.Percentage) || 0;
      byStudent[key].count += 1;
    });
    const top = Object.values(byStudent)
      .map(s => ({ name: s.name, avg: s.total / s.count, attempts: s.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
    topEl.innerHTML = top.length === 0 ? `<div class="empty-state"><h4>No data yet</h4></div>` :
      `<table><thead><tr><th>#</th><th>Student</th><th>Average</th><th>Attempts</th></tr></thead><tbody>
        ${top.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${fmtPct(s.avg)}</td><td>${s.attempts}</td></tr>`).join('')}
      </tbody></table>`;
  }
}

/* ============================================================================
   ADMIN: ANNOUNCEMENTS
   ============================================================================ */
async function loadAdminAnnouncements() {
  const el = document.getElementById('adminAnnouncementsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAnnouncements, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.announcements || [];
  if (rows.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No announcements yet</h4></div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Title</th><th>Message</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(a => `<tr>
      <td>${escapeHtml(a.Title)}</td>
      <td>${escapeHtml(a.Message)}</td>
      <td>${badge(a.Status, statusBadgeClass(a.Status))}</td>
      <td>${escapeHtml(a.Date)}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="edit" data-id="${escapeHtml(a.AnnouncementID)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(a.AnnouncementID)}">Delete</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = rows.find(r => r.AnnouncementID === btn.dataset.id);
      document.getElementById('announcementModalTitle').textContent = 'Edit Announcement';
      document.getElementById('announcementId').value = a.AnnouncementID;
      document.getElementById('announcementTitle').value = a.Title;
      document.getElementById('announcementMessage').value = a.Message;
      document.getElementById('announcementStatus').value = a.Status;
      openModal('announcementModal');
    });
  });
  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete announcement?', 'This cannot be undone.');
      if (!ok) return;
      const res2 = await apiCall(API_ACTIONS.deleteAnnouncement, { announcementId: btn.dataset.id, ...adminAuthParams() });
      if (res2.success) { toast('Announcement deleted.', 'success'); loadAdminAnnouncements(); }
      else toast(res2.message || 'Delete failed.', 'error');
    });
  });
}
document.getElementById('newAnnouncementBtn').addEventListener('click', () => {
  document.getElementById('announcementModalTitle').textContent = 'New Announcement';
  document.getElementById('announcementForm').reset();
  document.getElementById('announcementId').value = '';
  openModal('announcementModal');
});
document.getElementById('announcementCancelBtn').addEventListener('click', () => closeModal('announcementModal'));
document.getElementById('announcementForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('announcementId').value;
  const btn = document.getElementById('announcementSaveBtn');
  setBtnLoading(btn, true);
  const payload = {
    title: document.getElementById('announcementTitle').value.trim(),
    message: document.getElementById('announcementMessage').value.trim(),
    status: document.getElementById('announcementStatus').value,
    ...adminAuthParams()
  };
  const res = id
    ? await apiCall(API_ACTIONS.updateAnnouncement, { announcementId: id, ...payload })
    : await apiCall(API_ACTIONS.createAnnouncement, payload);
  setBtnLoading(btn, false);
  if (res.success) {
    toast(id ? 'Announcement updated.' : 'Announcement created.', 'success');
    closeModal('announcementModal');
    loadAdminAnnouncements();
  } else toast(res.message || 'Save failed.', 'error');
});

/* ============================================================================
   ADMIN: CONTACTS (CRUD)
   ============================================================================ */
async function loadAdminContacts() {
  const el = document.getElementById('adminContactsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getContacts, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.contacts || [];
  if (rows.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No contacts yet</h4><p>Add one so it shows on the public Contact page.</p></div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>WhatsApp</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(c => `<tr>
      <td>${escapeHtml(c.Name)}</td>
      <td>${escapeHtml(c.Role)}</td>
      <td>${escapeHtml(c.Phone)}</td>
      <td>${escapeHtml(c.WhatsApp)}</td>
      <td>${escapeHtml(c.Email)}</td>
      <td>${badge(c.Status, statusBadgeClass(c.Status))}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="edit" data-id="${escapeHtml(c.ContactID)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(c.ContactID)}">Delete</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = rows.find(r => r.ContactID === btn.dataset.id);
      document.getElementById('contactModalTitle').textContent = 'Edit Contact';
      document.getElementById('contactId').value = c.ContactID;
      document.getElementById('contactName').value = c.Name || '';
      document.getElementById('contactRole').value = c.Role || '';
      document.getElementById('contactPhone').value = c.Phone || '';
      document.getElementById('contactWhatsapp').value = c.WhatsApp || '';
      document.getElementById('contactEmail').value = c.Email || '';
      document.getElementById('contactStatus').value = c.Status || 'Active';
      openModal('contactModal');
    });
  });
  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete contact?', 'This cannot be undone.');
      if (!ok) return;
      const res2 = await apiCall(API_ACTIONS.deleteContact, { contactId: btn.dataset.id, ...adminAuthParams() });
      if (res2.success) { toast('Contact deleted.', 'success'); loadAdminContacts(); } else toast(res2.message || 'Delete failed.', 'error');
    });
  });
}
document.getElementById('newContactBtn').addEventListener('click', () => {
  document.getElementById('contactModalTitle').textContent = 'New Contact';
  document.getElementById('contactForm').reset();
  document.getElementById('contactId').value = '';
  openModal('contactModal');
});
document.getElementById('contactCancelBtn').addEventListener('click', () => closeModal('contactModal'));
document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('contactId').value;
  const btn = document.getElementById('contactSaveBtn');
  setBtnLoading(btn, true);
  const payload = {
    name: document.getElementById('contactName').value.trim(),
    role: document.getElementById('contactRole').value.trim(),
    phone: document.getElementById('contactPhone').value.trim(),
    whatsapp: document.getElementById('contactWhatsapp').value.trim(),
    email: document.getElementById('contactEmail').value.trim(),
    status: document.getElementById('contactStatus').value,
    ...adminAuthParams()
  };
  const res = id
    ? await apiCall(API_ACTIONS.updateContact, { contactId: id, ...payload })
    : await apiCall(API_ACTIONS.createContact, payload);
  setBtnLoading(btn, false);
  if (res.success) { toast(id ? 'Contact updated.' : 'Contact created.', 'success'); closeModal('contactModal'); loadAdminContacts(); }
  else toast(res.message || 'Save failed.', 'error');
});

/* ============================================================================
   ADMIN: ADMIN MANAGEMENT (Super Admin only)
   ============================================================================ */
async function loadAdminManagement() {
  const el = document.getElementById('adminManagementTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAdmins, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.admins || [];
  const me = Session.getAdmin();

  el.innerHTML = `<table><thead><tr><th>Admin</th><th>Email</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(a => `<tr>
      <td><div class="table-name-cell"><img class="avatar-sm" src="${photoOrDefault(a.Photo)}" alt=""> ${escapeHtml(a.Name)}</div></td>
      <td>${escapeHtml(a.Email)}</td>
      <td>${escapeHtml(a.Role)}</td>
      <td>${escapeHtml(a.Permissions) || '—'}</td>
      <td>${badge(a.Status, statusBadgeClass(a.Status))}</td>
      <td class="row-actions">
        ${a.Status !== 'Active' ? `<button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(a.AdminID)}">Approve</button>` : ''}
        ${a.Status !== 'Rejected' ? `<button class="btn btn-danger btn-sm" data-action="reject" data-id="${escapeHtml(a.AdminID)}">Reject</button>` : ''}
        ${a.Status === 'Active' ? `<button class="btn btn-outline btn-sm" data-action="deactivate" data-id="${escapeHtml(a.AdminID)}">Deactivate</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-action="permissions" data-id="${escapeHtml(a.AdminID)}">Edit Permissions</button>
        ${me && me.adminId !== a.AdminID ? `<button class="btn btn-danger btn-sm" data-action="remove" data-id="${escapeHtml(a.AdminID)}">Remove</button>` : ''}
      </td>
    </tr>`).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="approve"]').forEach(btn => btn.addEventListener('click', () => handleAdminAction('approveAdmin', btn.dataset.id, 'approve')));
  el.querySelectorAll('[data-action="reject"]').forEach(btn => btn.addEventListener('click', () => handleAdminAction('rejectAdmin', btn.dataset.id, 'reject')));
  el.querySelectorAll('[data-action="deactivate"]').forEach(btn => btn.addEventListener('click', () => handleAdminAction('setAdminStatus', btn.dataset.id, 'deactivate', { status: 'Inactive' })));
  el.querySelectorAll('[data-action="remove"]').forEach(btn => btn.addEventListener('click', () => handleAdminAction('removeAdmin', btn.dataset.id, 'remove')));
  el.querySelectorAll('[data-action="permissions"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = rows.find(r => r.AdminID === btn.dataset.id);
      openAdminEditModal(a);
    });
  });
}

async function handleAdminAction(actionName, adminId, label, extra = {}) {
  const ok = await confirmModal(`Confirm ${label}`, `Are you sure you want to ${label} this admin?`);
  if (!ok) return;
  const res = await apiCall(API_ACTIONS[actionName], { adminId, ...extra, ...adminAuthParams() });
  if (res.success) { toast(res.message || 'Updated.', 'success'); loadAdminManagement(); } else toast(res.message || 'Action failed.', 'error');
}

document.getElementById('newAdminBtn').addEventListener('click', () => openAdminEditModal(null));

function openAdminEditModal(admin) {
  const form = document.getElementById('adminEditForm');
  form.reset();
  document.querySelectorAll('.perm-check').forEach(c => c.checked = false);

  if (admin) {
    document.getElementById('adminEditModalTitle').textContent = 'Edit Permissions — ' + admin.Name;
    document.getElementById('adminEditId').value = admin.AdminID;
    document.getElementById('adminEditName').value = admin.Name;
    document.getElementById('adminEditEmail').value = admin.Email;
    document.getElementById('adminEditRole').value = String(admin.Role || '').toLowerCase().includes('super') ? 'SuperAdmin' : 'Admin';
    document.getElementById('adminEditNameField').classList.add('hidden');
    document.getElementById('adminEditEmailField').classList.add('hidden');
    document.getElementById('adminEditPasswordField').classList.add('hidden');
    document.getElementById('adminEditPassword').required = false;
    const perms = String(admin.Permissions || '').split(',').map(s => s.trim());
    document.querySelectorAll('.perm-check').forEach(c => { c.checked = perms.includes(c.value); });
  } else {
    document.getElementById('adminEditModalTitle').textContent = 'Add Admin';
    document.getElementById('adminEditId').value = '';
    document.getElementById('adminEditRole').value = 'Admin';
    document.getElementById('adminEditNameField').classList.remove('hidden');
    document.getElementById('adminEditEmailField').classList.remove('hidden');
    document.getElementById('adminEditPasswordField').classList.remove('hidden');
    document.getElementById('adminEditPassword').required = true;
  }
  openModal('adminEditModal');
}
document.getElementById('adminEditCancelBtn').addEventListener('click', () => closeModal('adminEditModal'));
document.getElementById('adminEditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('adminEditId').value;
  const btn = document.getElementById('adminEditSaveBtn');
  setBtnLoading(btn, true);
  const permissions = Array.from(document.querySelectorAll('.perm-check:checked')).map(c => c.value);
  const role = document.getElementById('adminEditRole').value;

  let res;
  if (id) {
    res = await apiCall(API_ACTIONS.updateAdminPermissions, { adminId: id, permissions: permissions.join(','), role, ...adminAuthParams() });
  } else {
    res = await apiCall(API_ACTIONS.createAdmin, {
      name: document.getElementById('adminEditName').value.trim(),
      email: document.getElementById('adminEditEmail').value.trim(),
      password: document.getElementById('adminEditPassword').value,
      role, permissions: permissions.join(','),
      ...adminAuthParams()
    });
  }
  setBtnLoading(btn, false);
  if (res.success) { toast(id ? 'Permissions updated.' : 'Admin created — pending approval.', 'success'); closeModal('adminEditModal'); loadAdminManagement(); }
  else toast(res.message || 'Save failed.', 'error');
});

/* ============================================================================
   ADMIN: PROFILE (editable)
   ============================================================================ */
let adminProfilePhotoData = '';
function loadAdminProfile() {
  const a = Session.getAdmin();
  adminProfilePhotoData = a.photo || '';
  document.getElementById('adminProfilePhotoPreview').src = photoOrDefault(a.photo);
  document.getElementById('adminProfileName').value = a.name || '';
  document.getElementById('adminProfileEmail').value = a.email || '';
  document.getElementById('adminProfileRole').value = a.role || '';
  document.getElementById('adminProfilePassword').value = '';
  document.getElementById('adminProfileFormMsg').classList.add('hidden');
}
document.getElementById('adminProfilePhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    adminProfilePhotoData = await resizeImageFile(file);
    document.getElementById('adminProfilePhotoPreview').src = adminProfilePhotoData;
  } catch { toast('Could not read that image.', 'error'); }
});
document.getElementById('adminProfileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('adminProfileSaveBtn');
  setBtnLoading(btn, true);
  const payload = { name: document.getElementById('adminProfileName').value.trim(), photo: adminProfilePhotoData, ...adminAuthParams() };
  const pw = document.getElementById('adminProfilePassword').value;
  if (pw) payload.newPassword = pw;

  const res = await apiCall(API_ACTIONS.updateAdminProfile, payload);
  setBtnLoading(btn, false);
  const msg = document.getElementById('adminProfileFormMsg');
  if (res.success) {
    const a = Session.getAdmin();
    Session.setAdmin({ ...a, name: payload.name, photo: payload.photo });
    applyAdminSessionToUI();
    msg.textContent = 'Profile updated.';
    msg.classList.remove('hidden');
    toast('Profile updated.', 'success');
  } else toast(res.message || 'Could not update profile.', 'error');
});

/* ============================================================================
   INIT — restore session on load
   ============================================================================ */
(function init() {
  document.getElementById('regPhotoPreview').src = DEFAULT_AVATAR;
  const student = Session.getStudent();
  const admin = Session.getAdmin();
  if (student) { applyStudentSessionToUI(); navigate('student-dashboard'); }
  else if (admin) { applyAdminSessionToUI(); navigate('admin-dashboard'); }
  else navigate('home');
})();
