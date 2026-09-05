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
  updateAdminProfile: 'updateAdminProfile',
  // Full results control (v3)
  deleteResult: 'deleteResult',
  updateResult: 'updateResult',
  deleteQuiz: 'deleteQuiz',
  getLeaderboard: 'getLeaderboard',
  getStudentPerformance: 'getStudentPerformance',
  // Quiz question management (v5)
  createQuiz: 'createQuiz',
  getQuizQuestionsAdmin: 'getQuizQuestionsAdmin',
  updateQuizQuestions: 'updateQuizQuestions',
  // Notifications (v3)
  createNotification: 'createNotification',
  getNotifications: 'getNotifications',
  getAllNotificationsAdmin: 'getAllNotificationsAdmin',
  deleteNotification: 'deleteNotification',
  // Email delivery (v3)
  sendResultEmail: 'sendResultEmail',
  sendReportEmail: 'sendReportEmail',
  // Certificates (v4)
  issueCertificate: 'issueCertificate',
  getStudentCertificates: 'getStudentCertificates',
  getAllCertificatesAdmin: 'getAllCertificatesAdmin',
  deleteCertificate: 'deleteCertificate'
};

/* ----------------------------------------------------------------------------
   CORE API HELPER
   Uses text/plain to avoid a CORS preflight against Apps Script, which only
   reads e.postData.contents as JSON regardless of the declared content type.
---------------------------------------------------------------------------- */
async function apiCall(action, params = {}) {
  try {
    const handler = FIREBASE_ACTIONS[action];
    if (!handler) {
      return { success: false, message: 'This feature ("' + action + '") has not been migrated to Firebase yet.', data: {} };
    }
    return await handler(params);
  } catch (err) {
    console.error('apiCall error for action "' + action + '":', err);
    return { success: false, message: 'Error: ' + err.message, data: {} };
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
const STUDENT_SECTIONS = ['student-dashboard', 'student-quizzes', 'student-attempt', 'student-results', 'student-history', 'student-leaderboard', 'student-notifications', 'student-certificates', 'student-profile', 'student-contact'];
const ADMIN_SECTIONS = ['admin-dashboard', 'admin-students', 'admin-quizzes', 'admin-review', 'admin-results', 'admin-leaderboard', 'admin-analytics', 'admin-announcements', 'admin-notifications', 'admin-certificates', 'admin-performance', 'admin-contacts', 'admin-management', 'admin-profile'];

const STUDENT_TITLES = {
  'student-dashboard': 'Dashboard', 'student-quizzes': 'Available Quizzes', 'student-attempt': 'Quiz in Progress',
  'student-results': 'Results', 'student-history': 'Quiz History', 'student-leaderboard': 'Leaderboard',
  'student-notifications': 'Notifications', 'student-certificates': 'Certificates', 'student-profile': 'Profile', 'student-contact': 'Contact'
};
const ADMIN_TITLES = {
  'admin-dashboard': 'Dashboard', 'admin-students': 'Students', 'admin-quizzes': 'Quizzes', 'admin-review': 'Quiz Review',
  'admin-results': 'Results', 'admin-leaderboard': 'Leaderboard', 'admin-analytics': 'Analytics', 'admin-announcements': 'Announcements',
  'admin-notifications': 'Notifications', 'admin-certificates': 'Certificates', 'admin-performance': 'Student Performance',
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
      'student-history': 'studentSectionHistory', 'student-leaderboard': 'studentSectionLeaderboard',
      'student-notifications': 'studentSectionNotifications', 'student-certificates': 'studentSectionCertificates',
      'student-profile': 'studentSectionProfile', 'student-contact': 'studentSectionContact'
    };
    document.getElementById(map[name]).classList.remove('hidden');
    if (name === 'student-dashboard') loadStudentDashboard();
    if (name === 'student-quizzes') loadStudentQuizzes();
    if (name === 'student-results') loadStudentResults();
    if (name === 'student-history') loadStudentHistory();
    if (name === 'student-leaderboard') loadStudentLeaderboard();
    if (name === 'student-notifications') loadStudentNotifications();
    if (name === 'student-certificates') loadStudentCertificates();
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
      'admin-results': 'adminSectionResults', 'admin-leaderboard': 'adminSectionLeaderboard',
      'admin-analytics': 'adminSectionAnalytics',
      'admin-announcements': 'adminSectionAnnouncements', 'admin-notifications': 'adminSectionNotifications',
      'admin-certificates': 'adminSectionCertificates',
      'admin-performance': 'adminSectionPerformance', 'admin-contacts': 'adminSectionContacts',
      'admin-management': 'adminSectionAdmins', 'admin-profile': 'adminSectionProfile'
    };
    document.getElementById(map[name]).classList.remove('hidden');
    if (name === 'admin-dashboard') loadAdminDashboard();
    if (name === 'admin-students') loadAdminStudents();
    if (name === 'admin-quizzes') loadAdminQuizzes();
    if (name === 'admin-review') loadAdminReview();
    if (name === 'admin-results') loadAdminResults();
    if (name === 'admin-leaderboard') loadAdminLeaderboard();
    if (name === 'admin-analytics') loadAdminAnalytics();
    if (name === 'admin-announcements') loadAdminAnnouncements();
    if (name === 'admin-notifications') loadAdminNotifications();
    if (name === 'admin-certificates') loadAdminCertificates();
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
    requestNotificationPermission();
    startNotificationPolling();
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
  stopNotificationPolling();
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
  durationSeconds: 0, remainingSeconds: 0, timerHandle: null, startedAt: 0
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
  Attempt.startedAt = Date.now();

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
  const timeTakenSeconds = Math.max(Math.round((Date.now() - Attempt.startedAt) / 1000), 0);
  const res = await apiCall(API_ACTIONS.submitQuiz, {
    studentId: s.studentId, quizName: Attempt.quizName, answers: JSON.stringify(answers), timeTakenSeconds
  });

  if (!res.success) {
    toast(res.message || 'Could not submit your quiz. Please try again.', 'error');
    return;
  }

  // Check the freshly-updated leaderboard to see if this attempt landed at #1.
  let isTopScore = false;
  const lbRes = await apiCall(API_ACTIONS.getLeaderboard, { quizName: Attempt.quizName });
  if (lbRes.success) {
    const top = (lbRes.data.leaderboard || [])[0];
    isTopScore = !!top && top.resultId === res.data.resultId;
  }
  showResultModal(res.data, Attempt.quizName, isTopScore);
}

function showResultModal(d, quizName, isTopScore) {
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

  const celebrationEl = document.getElementById('resultCelebration');
  celebrationEl.classList.toggle('hidden', !isTopScore);
  if (isTopScore) fireConfetti();

  const stampHost = document.getElementById('resultStamp');
  if (stampHost) stampHost.innerHTML = navyStampSVG(72);

  openModal('resultModal');
}
document.getElementById('resultCloseBtn').addEventListener('click', () => {
  closeModal('resultModal');
  navigate('student-dashboard');
});
document.getElementById('resultScreenshotBtn').addEventListener('click', () => {
  downloadElementAsImage('resultCaptureArea', `${Attempt.quizName || 'quiz-result'}.png`);
});

/* ============================================================================
   SCREENSHOT / CONFETTI HELPERS
   ============================================================================ */
// "Download as image" stands in for a real device screenshot, which no
// website can trigger directly — this captures the given element and saves
// it as a PNG the person can view, keep, or share.
async function downloadElementAsImage(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el || typeof html2canvas === 'undefined') { toast('Screenshot tool did not load — check your connection.', 'error'); return; }
  try {
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    toast('Could not generate the image.', 'error');
  }
}
async function elementToImageDataUrl(elementId) {
  const el = document.getElementById(elementId);
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
  return canvas.toDataURL('image/png');
}

function fireConfetti() {
  let canvas = document.getElementById('confettiCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confettiCanvas';
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#2563EB', '#60A5FA', '#FBBF24', '#34D399', '#F87171'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.3,
    size: 5 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
    speedY: 2 + Math.random() * 3, speedX: -1.5 + Math.random() * 3, rotation: Math.random() * 360, spin: -8 + Math.random() * 16
  }));
  let frame = 0;
  const maxFrames = 150;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(pc => {
      pc.x += pc.speedX; pc.y += pc.speedY; pc.rotation += pc.spin;
      ctx.save();
      ctx.translate(pc.x, pc.y);
      ctx.rotate(pc.rotation * Math.PI / 180);
      ctx.fillStyle = pc.color;
      ctx.fillRect(-pc.size / 2, -pc.size / 2, pc.size, pc.size * 0.6);
      ctx.restore();
    });
    frame++;
    if (frame < maxFrames) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(tick);
}

/* ============================================================================
   STUDENT: RESULTS / HISTORY
   ============================================================================ */
async function loadStudentResults() {
  const s = Session.getStudent();
  const el = document.getElementById('studentResultsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentResults, { studentId: s.studentId });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  renderResultCards(el, res.data.results);
}
async function loadStudentHistory() {
  const s = Session.getStudent();
  const el = document.getElementById('studentHistoryTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentResults, { studentId: s.studentId });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const sorted = (res.data.results || []).slice().sort((a, b) => new Date(b.Date + ' ' + (b.Time || '')) - new Date(a.Date + ' ' + (a.Time || '')));
  renderResultCards(el, sorted);
}

// Each quiz result gets its own card (per the brief) with a Download
// Screenshot button underneath it, powered by html2canvas.
function renderResultCards(container, rows) {
  if (!rows || rows.length === 0) { container.innerHTML = `<div class="empty-state"><h4>No results yet</h4><p>Your quiz attempts will show up here.</p></div>`; return; }
  container.className = 'result-cards';
  container.innerHTML = rows.map((r, i) => {
    const cardId = `resultCard-${i}-${r.ResultID}`;
    return `
    <div class="result-card" id="${cardId}" style="position:relative;">
      <div class="result-card-stamp">${navyStampSVG(76)}</div>
      <div class="result-card-top">
        <div>
          <h4>${escapeHtml(r.QuizName)}</h4>
          <time>${escapeHtml(r.Date)} · ${escapeHtml(r.Time)}</time>
        </div>
        <div class="result-card-pct">${fmtPct(r.Percentage)}</div>
      </div>
      <div class="result-card-meta">
        <span><strong>${escapeHtml(r.Score)}</strong>/${escapeHtml(r.TotalQuestions)} score</span>
        <span><strong>${escapeHtml(r.CorrectAnswers)}</strong> correct</span>
        <span><strong>${escapeHtml(r.WrongAnswers)}</strong> wrong</span>
        ${!isEmptyVal(r.TimeTakenSeconds) ? `<span><strong>${formatDuration(r.TimeTakenSeconds)}</strong> taken</span>` : ''}
      </div>
      <div class="result-card-actions">
        <button class="btn btn-outline btn-sm" data-screenshot="${cardId}" data-filename="${escapeHtml(r.QuizName)}-result.png">Download Screenshot</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-screenshot]').forEach(btn => {
    btn.addEventListener('click', () => downloadElementAsImage(btn.dataset.screenshot, btn.dataset.filename));
  });
}
function isEmptyVal(v) { return v === undefined || v === null || v === ''; }
function formatDuration(totalSeconds) {
  const s = Number(totalSeconds) || 0;
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
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
    'admin-results': 'results', 'admin-leaderboard': 'results', 'admin-analytics': 'analytics',
    'admin-announcements': 'announcements', 'admin-notifications': 'announcements',
    'admin-certificates': 'students',
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
          <button class="btn btn-ghost btn-sm" data-action="performance" data-id="${escapeHtml(s.StudentID)}">View Performance</button>
        </td>
      </tr>
    `).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action]:not([data-action="performance"])').forEach(btn => {
    btn.addEventListener('click', () => handleStudentAction(btn.dataset.action, btn.dataset.id));
  });
  el.querySelectorAll('[data-action="performance"]').forEach(btn => {
    btn.addEventListener('click', () => { navigate('admin-performance'); loadStudentPerformance(btn.dataset.id); });
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
          <button class="btn btn-ghost btn-sm" data-action="edit-questions" data-name="${escapeHtml(q.QuizName)}">Edit Questions</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-name="${escapeHtml(q.QuizName)}">Delete</button>
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
  el.querySelectorAll('[data-action="edit-questions"]').forEach(btn => {
    btn.addEventListener('click', () => openQuestionEditor(btn.dataset.name));
  });
  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteQuiz(btn.dataset.name, targetId));
  });
}
document.getElementById('refreshAdminQuizzesBtn').addEventListener('click', () => loadAdminQuizzes());

// Destructive — the admin must type the exact quiz name to confirm, and can
// choose whether to also wipe every logged Result for that quiz.
async function handleDeleteQuiz(quizName, targetId) {
  const typed = prompt(`This permanently deletes the "${quizName}" quiz tab and its settings.\nType the quiz name exactly to confirm:`);
  if (typed !== quizName) { if (typed !== null) toast('Name did not match — nothing deleted.', 'warning'); return; }
  const alsoResults = await confirmModal('Also delete its results?', 'Choose Confirm to also erase every student result logged for this quiz, or Cancel to keep results but delete the quiz.');
  const res = await apiCall(API_ACTIONS.deleteQuiz, { quizName, deleteResults: alsoResults, ...adminAuthParams() });
  if (res.success) { toast('Quiz deleted.', 'success'); loadAdminQuizzes(targetId); }
  else toast(res.message || 'Could not delete quiz.', 'error');
}

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
   ADMIN: QUIZ QUESTION EDITOR — create a new quiz, or edit/add/delete the
   questions inside an existing one. Also supports pasting bulk rows.
   ============================================================================ */
let qeMode = 'create'; // 'create' | 'edit'
let qeEditingQuizName = '';
let qeRows = []; // [{question, optionA, optionB, optionC, optionD, correctAnswer}]

function openQuestionEditor(quizName) {
  const nameField = document.getElementById('qeQuizNameField');
  const nameInput = document.getElementById('qeQuizName');
  if (quizName) {
    qeMode = 'edit';
    qeEditingQuizName = quizName;
    document.getElementById('questionEditorTitle').textContent = 'Edit Questions — ' + quizName;
    nameField.classList.add('hidden');
    nameInput.value = quizName;
    qeRows = [];
    renderQeRows();
    document.getElementById('qeQuestionRows').innerHTML = `<div class="empty-state">Loading questions…</div>`;
    apiCall(API_ACTIONS.getQuizQuestionsAdmin, { quizName, ...adminAuthParams() }).then(res => {
      if (!res.success) { toast(res.message || 'Could not load questions.', 'error'); closeModal('questionEditorModal'); return; }
      qeRows = res.data.questions.length > 0 ? res.data.questions : [blankQeRow()];
      renderQeRows();
    });
  } else {
    qeMode = 'create';
    qeEditingQuizName = '';
    document.getElementById('questionEditorTitle').textContent = 'Create New Quiz';
    nameField.classList.remove('hidden');
    nameInput.value = '';
    qeRows = [blankQeRow()];
    renderQeRows();
  }
  document.getElementById('qeBulkText').value = '';
  openModal('questionEditorModal');
}
document.getElementById('newQuizBtn').addEventListener('click', () => openQuestionEditor(null));
document.getElementById('questionEditorCancelBtn').addEventListener('click', () => closeModal('questionEditorModal'));

function blankQeRow() { return { question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' }; }

function renderQeRows() {
  const container = document.getElementById('qeQuestionRows');
  container.innerHTML = qeRows.map((q, i) => `
    <div class="qe-row" data-index="${i}">
      ${qeRows.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm qe-remove-btn" data-remove="${i}">✕</button>` : ''}
      <div class="qe-row-head"><strong>Question ${i + 1}</strong></div>
      <textarea rows="2" placeholder="Question text" data-field="question" data-index="${i}">${escapeHtml(q.question)}</textarea>
      <div class="qe-options-grid">
        <label>A <input type="text" placeholder="Option A" data-field="optionA" data-index="${i}" value="${escapeHtml(q.optionA)}"></label>
        <label>B <input type="text" placeholder="Option B" data-field="optionB" data-index="${i}" value="${escapeHtml(q.optionB)}"></label>
        <label>C <input type="text" placeholder="Option C" data-field="optionC" data-index="${i}" value="${escapeHtml(q.optionC)}"></label>
        <label>D <input type="text" placeholder="Option D" data-field="optionD" data-index="${i}" value="${escapeHtml(q.optionD)}"></label>
      </div>
      <div class="qe-correct-row">
        <span>Correct answer:</span>
        <select data-field="correctAnswer" data-index="${i}">
          ${['A', 'B', 'C', 'D'].map(l => `<option value="${l}" ${q.correctAnswer === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', (e) => {
      qeRows[Number(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
    });
  });
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => { qeRows.splice(Number(btn.dataset.remove), 1); renderQeRows(); });
  });
}

document.getElementById('qeAddRowBtn').addEventListener('click', () => {
  qeRows.push(blankQeRow());
  renderQeRows();
  document.getElementById('qeQuestionRows').scrollTop = document.getElementById('qeQuestionRows').scrollHeight;
});

// Parses "Question | OptA | OptB | OptC | OptD | CorrectLetter" per line and
// appends them as new rows — the fast path for uploading many questions at once.
document.getElementById('qeBulkImportBtn').addEventListener('click', () => {
  const raw = document.getElementById('qeBulkText').value;
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) { toast('Paste at least one question line first.', 'warning'); return; }

  let added = 0, skipped = 0;
  const parsed = [];
  lines.forEach(line => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length !== 6 || ['A', 'B', 'C', 'D'].indexOf(parts[5].toUpperCase()) === -1) { skipped++; return; }
    parsed.push({ question: parts[0], optionA: parts[1], optionB: parts[2], optionC: parts[3], optionD: parts[4], correctAnswer: parts[5].toUpperCase() });
    added++;
  });

  if (added === 0) { toast('No valid rows found. Check the format: 6 fields separated by |.', 'error'); return; }
  // Replace a single still-empty starter row if present, otherwise append.
  if (qeRows.length === 1 && !qeRows[0].question) qeRows = parsed;
  else qeRows = qeRows.concat(parsed);
  renderQeRows();
  document.getElementById('qeBulkText').value = '';
  toast(`Added ${added} question(s)${skipped > 0 ? `, skipped ${skipped} malformed line(s)` : ''}.`, 'success');
});

document.getElementById('questionEditorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('questionEditorSaveBtn');

  const cleaned = qeRows.filter(q => q.question.trim());
  if (cleaned.length === 0) { toast('Add at least one complete question.', 'error'); return; }
  for (let i = 0; i < cleaned.length; i++) {
    const q = cleaned[i];
    if (!q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim()) {
      toast(`Question ${i + 1} is missing an option.`, 'error');
      return;
    }
  }

  setBtnLoading(btn, true);
  let res;
  if (qeMode === 'create') {
    const quizName = document.getElementById('qeQuizName').value.trim();
    if (!quizName) { setBtnLoading(btn, false); toast('Enter a quiz name.', 'error'); return; }
    res = await apiCall(API_ACTIONS.createQuiz, { quizName, questions: JSON.stringify(cleaned), ...adminAuthParams() });
  } else {
    res = await apiCall(API_ACTIONS.updateQuizQuestions, { quizName: qeEditingQuizName, questions: JSON.stringify(cleaned), ...adminAuthParams() });
  }
  setBtnLoading(btn, false);

  if (res.success) {
    toast(res.message || 'Saved.', 'success');
    closeModal('questionEditorModal');
    loadAdminQuizzes(); loadAdminQuizzes('adminReviewTable');
  } else toast(res.message || 'Could not save the quiz.', 'error');
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
  el.innerHTML = `<table><thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Date</th><th>Time</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${escapeHtml(r.StudentName)}</td>
      <td>${escapeHtml(r.QuizName)}</td>
      <td>${escapeHtml(r.Score)}/${escapeHtml(r.TotalQuestions)}</td>
      <td>${fmtPct(r.Percentage)}</td>
      <td>${escapeHtml(r.Date)}</td>
      <td>${escapeHtml(r.Time)}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="edit-result" data-id="${escapeHtml(r.ResultID)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-result" data-id="${escapeHtml(r.ResultID)}">Delete</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="delete-result"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete this result?', 'This permanently removes the student\'s attempt from Results. This cannot be undone.');
      if (!ok) return;
      const res = await apiCall(API_ACTIONS.deleteResult, { resultId: btn.dataset.id, ...adminAuthParams() });
      if (res.success) { toast('Result deleted.', 'success'); loadAdminResults(); }
      else toast(res.message || 'Could not delete result.', 'error');
    });
  });
  el.querySelectorAll('[data-action="edit-result"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = rows.find(x => x.ResultID === btn.dataset.id);
      openResultEditModal(r);
    });
  });
}

function openResultEditModal(r) {
  const correct = prompt(`Correct answers for ${r.StudentName} — ${r.QuizName}\n(out of ${r.TotalQuestions} total questions):`, r.CorrectAnswers);
  if (correct === null) return;
  const total = prompt('Total questions (leave as-is unless the quiz changed):', r.TotalQuestions);
  if (total === null) return;
  const correctNum = Number(correct), totalNum = Number(total);
  if (isNaN(correctNum) || isNaN(totalNum) || correctNum < 0 || totalNum <= 0 || correctNum > totalNum) {
    toast('Enter valid numbers (correct answers cannot exceed total questions).', 'error');
    return;
  }
  apiCall(API_ACTIONS.updateResult, { resultId: r.ResultID, correctAnswers: correctNum, totalQuestions: totalNum, ...adminAuthParams() })
    .then(res => {
      if (res.success) { toast('Result updated.', 'success'); loadAdminResults(); }
      else toast(res.message || 'Could not update result.', 'error');
    });
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
   NAVY STAMP (SVG, vector — always crisp, never blurry, at any zoom/print size)
   Reused on certificates and on result receipts, per the brief.
   ============================================================================ */
let stampSeq = 0;
function navyStampSVG(size = 130) {
  const id = `stamp-${Date.now()}-${stampSeq++}`;
  const r = size / 2;
  return `
  <svg class="navy-stamp" width="${size}" height="${size}" viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <path id="${id}-top" d="M 15,65 A 50,50 0 0 1 115,65" fill="none"/>
      <path id="${id}-bottom" d="M 115,68 A 50,50 0 0 1 15,68" fill="none"/>
    </defs>
    <g transform="rotate(-8 65 65)">
      <circle cx="65" cy="65" r="62" fill="none" stroke="#1E3A8A" stroke-width="2.5"/>
      <circle cx="65" cy="65" r="54" fill="none" stroke="#1E3A8A" stroke-width="1.2"/>
      <circle cx="65" cy="65" r="4" fill="#1E3A8A"/>
      <path d="M48 66 L59 77 L83 51" fill="none" stroke="#1E3A8A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text font-family="Sora, sans-serif" font-size="11.5" font-weight="700" fill="#1E3A8A" letter-spacing="1.5">
        <textPath href="#${id}-top" startOffset="50%" text-anchor="middle">ARY QUIZE BANK</textPath>
      </text>
      <text font-family="Sora, sans-serif" font-size="9.5" font-weight="700" fill="#1E3A8A" letter-spacing="3">
        <textPath href="#${id}-bottom" startOffset="50%" text-anchor="middle">★ OFFICIAL SEAL ★</textPath>
      </text>
    </g>
  </svg>`;
}

/* ============================================================================
   LEADERBOARD (score desc, ties broken by faster completion time)
   ============================================================================ */
async function populateLeaderboardQuizSelect(selectId, quizzes) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = quizzes.map(q => `<option value="${escapeHtml(q.quizName || q.QuizName)}">${escapeHtml(q.quizName || q.QuizName)}</option>`).join('');
}

async function loadStudentLeaderboard() {
  const res = await apiCall(API_ACTIONS.getQuizzes, {});
  const quizzes = res.success ? (res.data.quizzes || []) : [];
  const sel = document.getElementById('studentLeaderboardQuizSelect');
  if (quizzes.length === 0) { document.getElementById('studentLeaderboardList').innerHTML = `<div class="empty-state"><h4>No published quizzes yet</h4></div>`; sel.innerHTML = ''; return; }
  await populateLeaderboardQuizSelect('studentLeaderboardQuizSelect', quizzes);
  renderLeaderboardForSelect('studentLeaderboardQuizSelect', 'studentLeaderboardList');
  sel.onchange = () => renderLeaderboardForSelect('studentLeaderboardQuizSelect', 'studentLeaderboardList');
}

async function loadAdminLeaderboard() {
  const res = await apiCall(API_ACTIONS.getAllQuizzesAdmin, adminAuthParams());
  const quizzes = res.success ? (res.data.quizzes || []) : [];
  const sel = document.getElementById('adminLeaderboardQuizSelect');
  if (quizzes.length === 0) { document.getElementById('adminLeaderboardList').innerHTML = `<div class="empty-state"><h4>No quizzes yet</h4></div>`; sel.innerHTML = ''; return; }
  await populateLeaderboardQuizSelect('adminLeaderboardQuizSelect', quizzes);
  renderLeaderboardForSelect('adminLeaderboardQuizSelect', 'adminLeaderboardList');
  sel.onchange = () => renderLeaderboardForSelect('adminLeaderboardQuizSelect', 'adminLeaderboardList');
}

async function renderLeaderboardForSelect(selectId, listId) {
  const quizName = document.getElementById(selectId).value;
  const listEl = document.getElementById(listId);
  if (!quizName) { listEl.innerHTML = `<div class="empty-state"><h4>No quiz selected</h4></div>`; return; }
  listEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getLeaderboard, { quizName });
  if (!res.success) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.leaderboard || [];
  if (rows.length === 0) { listEl.innerHTML = `<div class="empty-state"><h4>No attempts yet</h4></div>`; return; }

  listEl.className = 'leaderboard-list';
  listEl.innerHTML = rows.map(r => {
    const topClass = r.rank === 1 ? 'is-top1' : r.rank === 2 ? 'is-top2' : r.rank === 3 ? 'is-top3' : '';
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '';
    return `
    <div class="leaderboard-row ${topClass}">
      <div class="leaderboard-rank">${medal || r.rank}</div>
      <div class="leaderboard-name">
        <img class="avatar-sm" src="${photoOrDefault(r.photo)}" alt="">
        <span>${escapeHtml(r.studentName)}</span>
      </div>
      <div class="leaderboard-meta">
        <span><strong>${fmtPct(r.percentage)}</strong></span>
        <span>${escapeHtml(r.score)}/${escapeHtml(r.totalQuestions)}</span>
        ${r.timeTakenSeconds !== null ? `<span><strong>${formatDuration(r.timeTakenSeconds)}</strong></span>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================================
   NOTIFICATIONS — in-app + browser Notification API while the app is open.
   (True push-to-a-closed-app needs a Firebase/service-worker backend, which
   this Sheets-based stack doesn't have — see the setup notes.)
   ============================================================================ */
let notifPollHandle = null;

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function startNotificationPolling() {
  stopNotificationPolling();
  checkForNewNotifications(); // immediate check on login
  notifPollHandle = setInterval(checkForNewNotifications, 25000);
}
function stopNotificationPolling() { if (notifPollHandle) clearInterval(notifPollHandle); notifPollHandle = null; }

async function checkForNewNotifications() {
  const s = Session.getStudent();
  if (!s) return;
  const res = await apiCall(API_ACTIONS.getNotifications, { studentId: s.studentId, className: s.className || '' });
  if (!res.success) return;
  const rows = res.data.notifications || [];
  const lastSeenKey = `aryLastNotifSeen_${s.studentId}`;
  const lastSeen = localStorage.getItem(lastSeenKey) || '';
  const unseen = rows.filter(r => `${r.CreatedDate} ${r.CreatedTime}` > lastSeen);

  document.getElementById('studentNotifDot')?.classList.toggle('hidden', unseen.length === 0);
  document.getElementById('studentNotifBellDot')?.classList.toggle('hidden', unseen.length === 0);

  if (unseen.length > 0) {
    const latest = unseen[0];
    showInAppAlert(latest.Title, latest.Message);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(latest.Title, { body: latest.Message, icon: DEFAULT_AVATAR }); } catch { /* ignore */ }
    }
  }
}

function showInAppAlert(title, message) {
  const el = document.createElement('div');
  el.className = 'in-app-alert';
  el.innerHTML = `<h4>🔔 ${escapeHtml(title)}</h4><p>${escapeHtml(message)}</p>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

async function loadStudentNotifications() {
  const s = Session.getStudent();
  const el = document.getElementById('studentNotificationsList');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getNotifications, { studentId: s.studentId, className: s.className || '' });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.notifications || [];
  el.innerHTML = rows.length === 0
    ? `<div class="empty-state"><h4>No notifications yet</h4></div>`
    : rows.map(n => `<div class="announcement-item"><h4>${escapeHtml(n.Title)}</h4><p>${escapeHtml(n.Message)}</p><time>${escapeHtml(n.CreatedDate)} · ${escapeHtml(n.CreatedTime)}</time></div>`).join('');

  // Mark everything up to the newest as seen, and clear the bell dot.
  if (rows.length > 0) {
    localStorage.setItem(`aryLastNotifSeen_${s.studentId}`, `${rows[0].CreatedDate} ${rows[0].CreatedTime}`);
    document.getElementById('studentNotifDot')?.classList.add('hidden');
    document.getElementById('studentNotifBellDot')?.classList.add('hidden');
  }
}

async function loadAdminNotifications() {
  const el = document.getElementById('adminNotificationsTable');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAllNotificationsAdmin, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const rows = res.data.notifications || [];
  if (rows.length === 0) { el.innerHTML = `<div class="empty-state"><h4>No notifications sent yet</h4></div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Title</th><th>Message</th><th>Sent to</th><th>Date</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(n => `<tr>
      <td>${escapeHtml(n.Title)}</td>
      <td>${escapeHtml(n.Message)}</td>
      <td>${n.TargetType === 'All' ? 'All Students' : n.TargetType === 'Class' ? 'Class: ' + escapeHtml(n.TargetValue) : 'Student: ' + escapeHtml(n.TargetValue)}</td>
      <td>${escapeHtml(n.CreatedDate)} ${escapeHtml(n.CreatedTime)}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" data-action="delete-notif" data-id="${escapeHtml(n.NotificationID)}">Delete</button></td>
    </tr>`).join('')}
  </tbody></table>`;

  el.querySelectorAll('[data-action="delete-notif"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete notification?', 'Students will no longer see this.');
      if (!ok) return;
      const res2 = await apiCall(API_ACTIONS.deleteNotification, { notificationId: btn.dataset.id, ...adminAuthParams() });
      if (res2.success) { toast('Notification deleted.', 'success'); loadAdminNotifications(); }
      else toast(res2.message || 'Delete failed.', 'error');
    });
  });
}

document.getElementById('newNotificationBtn').addEventListener('click', () => {
  document.getElementById('notificationForm').reset();
  document.getElementById('notifTargetValueField').classList.add('hidden');
  openModal('notificationModal');
});
document.getElementById('notificationCancelBtn').addEventListener('click', () => closeModal('notificationModal'));
document.getElementById('notifTargetType').addEventListener('change', (e) => {
  const field = document.getElementById('notifTargetValueField');
  const label = document.getElementById('notifTargetValueLabel');
  if (e.target.value === 'All') { field.classList.add('hidden'); }
  else {
    field.classList.remove('hidden');
    label.textContent = e.target.value === 'Class' ? 'Class name (e.g. BSN-3A)' : 'Student ID';
  }
});
document.getElementById('notificationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('notificationSaveBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.createNotification, {
    title: document.getElementById('notifTitle').value.trim(),
    message: document.getElementById('notifMessage').value.trim(),
    targetType: document.getElementById('notifTargetType').value,
    targetValue: document.getElementById('notifTargetValue').value.trim(),
    ...adminAuthParams()
  });
  setBtnLoading(btn, false);
  if (res.success) { toast('Notification sent.', 'success'); closeModal('notificationModal'); loadAdminNotifications(); }
  else toast(res.message || 'Could not send notification.', 'error');
});

/* ============================================================================
   ADMIN: STUDENT PERFORMANCE PANEL (screenshot / PDF / Gmail / WhatsApp)
   ============================================================================ */
let currentPerfStudentId = null;
let currentPerfStudent = null;

async function loadStudentPerformance(studentId) {
  currentPerfStudentId = studentId;
  document.getElementById('perfCaptureArea').innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentPerformance, { studentId, ...adminAuthParams() });
  if (!res.success) { document.getElementById('perfCaptureArea').innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  const d = res.data;
  currentPerfStudent = d.profile;

  document.getElementById('perfStudentName').textContent = d.profile.Name + ' — Performance';
  document.getElementById('perfCaptureArea').innerHTML = `
    <div id="perfStamp" class="result-receipt-stamp"></div>
    <div class="welcome-banner">
      <img id="perfPhoto" class="avatar-lg" src="${photoOrDefault(d.profile.Photo)}" alt="">
      <div>
        <h2 id="perfName">${escapeHtml(d.profile.Name)}</h2>
        <p class="section-sub">${escapeHtml(d.profile.Class || '')} · ${escapeHtml(d.profile.Email)}</p>
      </div>
    </div>
    <div class="stat-grid" id="perfStatGrid">
      <div class="stat-card"><div class="stat-label">Quizzes Attempted</div><div class="stat-value">${d.attempts}</div></div>
      <div class="stat-card"><div class="stat-label">Average Score</div><div class="stat-value">${fmtPct(d.averagePercentage)}</div></div>
      <div class="stat-card"><div class="stat-label">Best Result</div><div class="stat-value">${d.bestResult ? fmtPct(d.bestResult.Percentage) : '—'}</div><div class="stat-sub">${d.bestResult ? escapeHtml(d.bestResult.QuizName) : ''}</div></div>
      <div class="stat-card"><div class="stat-label">Weakest Result</div><div class="stat-value">${d.worstResult ? fmtPct(d.worstResult.Percentage) : '—'}</div><div class="stat-sub">${d.worstResult ? escapeHtml(d.worstResult.QuizName) : ''}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>All Results</h3></div>
      <div class="table-wrap">${d.results.length === 0 ? `<div class="empty-state"><h4>No attempts yet</h4></div>` : `
        <table><thead><tr><th>Quiz</th><th>Score</th><th>Percentage</th><th>Date</th></tr></thead><tbody>
          ${d.results.map(r => `<tr><td>${escapeHtml(r.QuizName)}</td><td>${escapeHtml(r.Score)}/${escapeHtml(r.TotalQuestions)}</td><td>${fmtPct(r.Percentage)}</td><td>${escapeHtml(r.Date)}</td></tr>`).join('')}
        </tbody></table>`}
      </div>
    </div>
  `;
  document.getElementById('perfStamp').innerHTML = navyStampSVG(72);
}

document.getElementById('perfScreenshotBtn').addEventListener('click', () => {
  if (!currentPerfStudent) return;
  downloadElementAsImage('perfCaptureArea', `${currentPerfStudent.Name}-performance.png`);
});

document.getElementById('perfPdfBtn').addEventListener('click', async () => {
  if (!currentPerfStudent) return;
  const btn = document.getElementById('perfPdfBtn');
  setBtnLoading(btn, true);
  try {
    await downloadPerformancePdf(`${currentPerfStudent.Name}-performance-report.pdf`);
  } finally {
    setBtnLoading(btn, false);
  }
});

// Renders the performance panel into a high-resolution PNG, then embeds that
// image into a landscape PDF page — the PDF stays sharp because the source
// capture is scaled up (scale:3) before being placed at native size.
async function buildPerformancePdfBlob() {
  const canvas = await html2canvas(document.getElementById('perfCaptureArea'), { backgroundColor: '#ffffff', scale: 3 });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 3, canvas.height / 3] });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 3, canvas.height / 3);
  return pdf;
}
async function downloadPerformancePdf(filename) {
  const pdf = await buildPerformancePdfBlob();
  pdf.save(filename);
}
async function performancePdfDataUrl() {
  const pdf = await buildPerformancePdfBlob();
  return pdf.output('datauristring');
}

document.getElementById('perfEmailBtn').addEventListener('click', () => {
  if (!currentPerfStudent) { toast('Open a student\'s performance first.', 'warning'); return; }
  document.getElementById('emailModalTarget').textContent = `${currentPerfStudent.Name} (${currentPerfStudent.Email})`;
  document.getElementById('emailSubject').value = 'Your ARY Quize Bank Performance Report';
  document.getElementById('emailMessage').value = `Hi ${currentPerfStudent.Name},\n\nHere is your latest performance summary from ARY Quize Bank.`;
  document.getElementById('emailForm').dataset.mode = 'performance';
  openModal('emailModal');
});
document.getElementById('emailCancelBtn').addEventListener('click', () => closeModal('emailModal'));
document.getElementById('emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('emailSendBtn');
  setBtnLoading(btn, true);
  try {
    const imageDataUrl = await elementToImageDataUrl('perfCaptureArea');
    const res = await apiCall(API_ACTIONS.sendResultEmail, {
      studentId: currentPerfStudentId, imageDataUrl,
      subject: document.getElementById('emailSubject').value.trim(),
      message: document.getElementById('emailMessage').value.trim(),
      ...adminAuthParams()
    });
    if (res.success) { toast(res.message || 'Emailed.', 'success'); closeModal('emailModal'); }
    else toast(res.message || 'Could not send email.', 'error');
  } catch {
    toast('Could not capture the screenshot to send.', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
});

// WhatsApp: no free API can auto-send an attachment without the user tapping
// Send themselves. On mobile this uses the native Share Sheet (pick WhatsApp,
// image is pre-attached); on desktop it falls back to downloading the image
// plus opening WhatsApp Web with a prefilled message.
document.getElementById('perfWhatsappBtn').addEventListener('click', async () => {
  if (!currentPerfStudent) { toast('Open a student\'s performance first.', 'warning'); return; }
  await shareImageViaWhatsapp('perfCaptureArea', `${currentPerfStudent.Name}-performance.png`, `${currentPerfStudent.Name}'s performance report — ARY Quize Bank`);
});

async function shareImageViaWhatsapp(elementId, filename, caption) {
  try {
    const canvas = await html2canvas(document.getElementById(elementId), { backgroundColor: '#ffffff', scale: 2 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: caption });
    } else {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('Image downloaded — attach it manually in the WhatsApp chat that just opened.', 'default');
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
    }
  } catch (err) {
    toast('Could not prepare the image to share.', 'error');
  }
}

/* ============================================================================
   CERTIFICATE SYSTEM
   ============================================================================ */
const CERT_TITLES = {
  Completion: 'CERTIFICATE OF COMPLETION',
  OutstandingPerformance: 'CERTIFICATE OF OUTSTANDING PERFORMANCE',
  MockTest: 'MOCK TEST COMPLETION CERTIFICATE'
};

// Builds the certificate artwork as an off-DOM node so it can be captured at
// high resolution regardless of what's currently on screen. Uses only vector
// (SVG icons, CSS borders, web-font text) so nothing in it can look blurry.
function buildCertificateNode(cert) {
  const wrap = document.createElement('div');
  wrap.className = 'certificate-sheet';
  wrap.innerHTML = `
    <div class="certificate-border">
      <div class="certificate-stamp">${navyStampSVG(120)}</div>
      <div class="certificate-cap">🎓</div>
      <h1 class="certificate-brand">ARY QUIZE BANK</h1>
      <div class="certificate-rule"></div>
      <h2 class="certificate-title">${escapeHtml(CERT_TITLES[cert.CertificateType] || 'CERTIFICATE')}</h2>
      <p class="certificate-presented">THIS CERTIFICATE IS PROUDLY PRESENTED TO</p>
      <div class="certificate-name">${escapeHtml(cert.StudentName)}</div>
      <p class="certificate-body">${escapeHtml(cert.AchievementText)}</p>
      ${!isEmptyVal(cert.Score) && !isEmptyVal(cert.TotalQuizzes) ? `<p class="certificate-score">${escapeHtml(cert.Score)} OUT OF ${escapeHtml(cert.TotalQuizzes)}</p>` : ''}
      <div class="certificate-meta-grid">
        ${cert.Program ? `<div><strong>Program</strong><span>${escapeHtml(cert.Program)}</span></div>` : ''}
        ${cert.Semester ? `<div><strong>Semester</strong><span>${escapeHtml(cert.Semester)}</span></div>` : ''}
        ${cert.Shift ? `<div><strong>Shift</strong><span>${escapeHtml(cert.Shift)}</span></div>` : ''}
        ${cert.RollNo ? `<div><strong>Roll No.</strong><span>${escapeHtml(cert.RollNo)}</span></div>` : ''}
      </div>
      <div class="certificate-signatures">
        <div><span class="sig-script">${escapeHtml(cert.MentorName || 'Mentor')}</span><strong>${escapeHtml(cert.MentorName || '')}</strong><small>Test Preparation Mentor</small></div>
        <div><span class="sig-script">${escapeHtml(cert.AdminName || 'Admin')}</span><strong>${escapeHtml(cert.AdminName || '')}</strong><small>Admin & Founder</small></div>
      </div>
      <p class="certificate-issued">Issued ${escapeHtml(cert.IssuedDate)} · Certificate ID ${escapeHtml(cert.CertificateID)}</p>
    </div>
  `;
  wrap.style.position = 'fixed';
  wrap.style.left = '-9999px';
  wrap.style.top = '0';
  document.body.appendChild(wrap);
  return wrap;
}

async function downloadCertificateImage(cert) {
  const node = buildCertificateNode(cert);
  try {
    const canvas = await html2canvas(node.querySelector('.certificate-border'), { backgroundColor: '#ffffff', scale: 3 });
    const link = document.createElement('a');
    link.download = `${cert.StudentName}-certificate.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    node.remove();
  }
}

async function downloadCertificatePdf(cert) {
  const node = buildCertificateNode(cert);
  try {
    const canvas = await html2canvas(node.querySelector('.certificate-border'), { backgroundColor: '#ffffff', scale: 3 });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 3, canvas.height / 3] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 3, canvas.height / 3);
    pdf.save(`${cert.StudentName}-certificate.pdf`);
  } finally {
    node.remove();
  }
}

function renderCertificateCards(container, rows, isAdmin) {
  if (!rows || rows.length === 0) { container.innerHTML = `<div class="empty-state"><h4>No certificates yet</h4></div>`; return; }
  container.className = 'quiz-grid';
  container.innerHTML = rows.map(c => `
    <div class="quiz-card">
      <div class="quiz-card-top">
        <h3>${escapeHtml(CERT_TITLES[c.CertificateType] || 'Certificate')}</h3>
      </div>
      <p class="section-sub" style="margin:0;">${escapeHtml((c.AchievementText || '').slice(0, 90))}${(c.AchievementText || '').length > 90 ? '…' : ''}</p>
      <div class="quiz-meta-row"><span>📅 ${escapeHtml(c.IssuedDate)}</span></div>
      <div class="row-actions">
        <button class="btn btn-outline btn-sm" data-cert-action="image" data-id="${escapeHtml(c.CertificateID)}">Download Image</button>
        <button class="btn btn-outline btn-sm" data-cert-action="pdf" data-id="${escapeHtml(c.CertificateID)}">Download PDF</button>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" data-cert-action="revoke" data-id="${escapeHtml(c.CertificateID)}">Revoke</button>` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-cert-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cert = rows.find(c => c.CertificateID === btn.dataset.id);
      if (btn.dataset.certAction === 'image') downloadCertificateImage(cert);
      if (btn.dataset.certAction === 'pdf') downloadCertificatePdf(cert);
      if (btn.dataset.certAction === 'revoke') {
        const ok = await confirmModal('Revoke this certificate?', 'The student will no longer see it.');
        if (!ok) return;
        const res = await apiCall(API_ACTIONS.deleteCertificate, { certificateId: cert.CertificateID, ...adminAuthParams() });
        if (res.success) { toast('Certificate revoked.', 'success'); loadAdminCertificates(); }
        else toast(res.message || 'Could not revoke.', 'error');
      }
    });
  });
}

async function loadStudentCertificates() {
  const s = Session.getStudent();
  const el = document.getElementById('studentCertificatesGrid');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getStudentCertificates, { studentId: s.studentId });
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  renderCertificateCards(el, res.data.certificates, false);
}

async function loadAdminCertificates() {
  const el = document.getElementById('adminCertificatesGrid');
  el.innerHTML = `<div class="empty-state">Loading…</div>`;
  const res = await apiCall(API_ACTIONS.getAllCertificatesAdmin, adminAuthParams());
  if (!res.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(res.message)}</div>`; return; }
  renderCertificateCards(el, res.data.certificates, true);
}

document.getElementById('newCertificateBtn').addEventListener('click', async () => {
  document.getElementById('certificateForm').reset();
  document.getElementById('certStudentSearchResult').innerHTML = '';
  document.getElementById('certSelectedStudentId').value = '';
  const admin = Session.getAdmin();
  document.getElementById('certAdminName').value = admin ? admin.name : '';
  openModal('certificateModal');
});
document.getElementById('certificateCancelBtn').addEventListener('click', () => closeModal('certificateModal'));

document.getElementById('certStudentSearchBtn').addEventListener('click', async () => {
  const query = document.getElementById('certStudentSearchInput').value.trim().toLowerCase();
  const resultEl = document.getElementById('certStudentSearchResult');
  if (!query) return;
  const res = await apiCall(API_ACTIONS.getStudents, adminAuthParams());
  if (!res.success) { resultEl.innerHTML = `<p class="form-error">${escapeHtml(res.message)}</p>`; return; }
  const matches = (res.data.students || []).filter(s => `${s.Name} ${s.Email} ${s.StudentID}`.toLowerCase().includes(query)).slice(0, 6);
  resultEl.innerHTML = matches.length === 0 ? `<p class="field-hint">No students matched.</p>` : matches.map(s => `
    <div class="cert-student-pick" data-id="${escapeHtml(s.StudentID)}" data-name="${escapeHtml(s.Name)}" data-class="${escapeHtml(s.Class)}">
      <img class="avatar-sm" src="${photoOrDefault(s.Photo)}" alt=""> <span>${escapeHtml(s.Name)} — ${escapeHtml(s.Class)}</span>
    </div>`).join('');
  resultEl.querySelectorAll('.cert-student-pick').forEach(row => {
    row.addEventListener('click', () => {
      document.getElementById('certSelectedStudentId').value = row.dataset.id;
      document.getElementById('certSelectedStudentLabel').textContent = `Selected: ${row.dataset.name} (${row.dataset.class})`;
      document.getElementById('certSemester').value = document.getElementById('certSemester').value || '';
    });
  });
});

document.getElementById('certificateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = document.getElementById('certSelectedStudentId').value;
  if (!studentId) { toast('Search and select a student first.', 'warning'); return; }
  const btn = document.getElementById('certificateSaveBtn');
  setBtnLoading(btn, true);
  const res = await apiCall(API_ACTIONS.issueCertificate, {
    studentId,
    certificateType: document.getElementById('certType').value,
    program: document.getElementById('certProgram').value.trim(),
    semester: document.getElementById('certSemester').value.trim(),
    shift: document.getElementById('certShift').value.trim(),
    rollNo: document.getElementById('certRollNo').value.trim(),
    achievementText: document.getElementById('certAchievement').value.trim(),
    score: document.getElementById('certScore').value.trim(),
    totalQuizzes: document.getElementById('certTotalQuizzes').value.trim(),
    mentorName: document.getElementById('certMentorName').value.trim(),
    adminName: document.getElementById('certAdminName').value.trim(),
    ...adminAuthParams()
  });
  setBtnLoading(btn, false);
  if (res.success) { toast('Certificate issued.', 'success'); closeModal('certificateModal'); loadAdminCertificates(); }
  else toast(res.message || 'Could not issue certificate.', 'error');
});

/* ============================================================================
   INIT — restore session on load
   ============================================================================ */
(function init() {
  document.getElementById('regPhotoPreview').src = DEFAULT_AVATAR;
  const student = Session.getStudent();
  const admin = Session.getAdmin();
  if (student) {
    applyStudentSessionToUI();
    navigate('student-dashboard');
    requestNotificationPermission();
    startNotificationPolling();
  }
  else if (admin) { applyAdminSessionToUI(); navigate('admin-dashboard'); }
  else navigate('home');
})();
