/* ============================================================================
   FIREBASE BACKEND — PHASE 1
   Implements the same action names as the old Apps Script backend, but reads
   and writes Firebase Realtime Database directly from the browser.

   HOW THIS PLUGS IN:
   apiCall() in script.js is changed (see Step 3 instructions) to look up the
   action name in FIREBASE_ACTIONS below instead of POSTing to Apps Script.
   Every action here returns the exact same {success, message, data} shape
   the frontend already expects, so no other part of script.js needs to change.

   ALREADY MIGRATED (Phase 1):
     registerStudent, studentLogin, studentLogout, getStudentProfile,
     updateStudentProfile, getQuizzes, getQuizQuestions, submitQuiz,
     getStudentResults, getStudentDashboard, adminLogin, getStudents,
     approveStudent, rejectStudent, setStudentStatus

   NOT YET MIGRATED (falls through to a friendly "not ready yet" message):
     quiz creation/review workflow, results analytics, announcements,
     contacts, admin management, notifications, certificates, email sending.
     These will be added in the next steps.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   SMALL HELPERS (ported from Code.gs)
--------------------------------------------------------------------------- */
function isEmpty(v) { return v === undefined || v === null || String(v).trim() === ''; }

function validateRequired(params, fields) {
  var missing = [];
  for (var i = 0; i < fields.length; i++) if (isEmpty(params[fields[i]])) missing.push(fields[i]);
  return missing;
}

function fbGenerateId(prefix) {
  var stamp = Date.now().toString(36).toUpperCase();
  var rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase();
  return prefix + '-' + stamp + rand;
}

function fbFormatDate(d) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fbFormatTime(d) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function jsonResponse(success, message, data) {
  return { success: success, message: message, data: data || {} };
}

// Turns a Firebase "object of objects" node into a plain array of values
async function fbGetAll(path) {
  const snap = await db.ref(path).once('value');
  const val = snap.val();
  if (!val) return [];
  return Object.keys(val).map(function (k) { return val[k]; });
}

var STUDENT_STATUS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', DEACTIVATED: 'Deactivated' };

/* ---------------------------------------------------------------------------
   STUDENT AUTH + PROFILE
--------------------------------------------------------------------------- */
async function fbRegisterStudent(p) {
  var missing = validateRequired(p, ['name', 'email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const existing = await fbGetAll('students');
  const dup = existing.some(function (s) { return String(s.Email).toLowerCase() === String(p.email).toLowerCase(); });
  if (dup) return jsonResponse(false, 'An account with this email already exists.');

  const studentId = fbGenerateId('STU');
  await db.ref('students/' + studentId).set({
    StudentID: studentId,
    Name: p.name,
    Email: p.email,
    Password: p.password,
    Class: p['class'] || '',
    Photo: p.photo || '',
    Status: STUDENT_STATUS.PENDING,
    RegistrationDate: fbFormatDate(new Date())
  });
  return jsonResponse(true, 'Registration submitted. Waiting for admin approval.', { studentId: studentId });
}

async function fbStudentLogin(p) {
  var missing = validateRequired(p, ['email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const rows = await fbGetAll('students');
  for (const r of rows) {
    if (String(r.Email).toLowerCase() === String(p.email).toLowerCase()) {
      if (String(r.Password) !== String(p.password)) return jsonResponse(false, 'Incorrect password.');
      if (r.Status !== STUDENT_STATUS.APPROVED) return jsonResponse(false, 'Your account status is "' + r.Status + '". Only approved students can log in.');
      return jsonResponse(true, 'Login successful.', { studentId: r.StudentID, name: r.Name, email: r.Email, className: r.Class, photo: r.Photo, status: r.Status });
    }
  }
  return jsonResponse(false, 'No account found with this email.');
}

async function fbStudentLogout(p) { return jsonResponse(true, 'Logged out.'); }

async function fbGetStudentProfile(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const snap = await db.ref('students/' + p.studentId).once('value');
  const r = snap.val();
  if (!r) return jsonResponse(false, 'Student not found.');
  return jsonResponse(true, 'OK', { studentId: r.StudentID, name: r.Name, email: r.Email, className: r.Class, photo: r.Photo, status: r.Status, registrationDate: r.RegistrationDate });
}

async function fbUpdateStudentProfile(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('students/' + p.studentId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Student not found.');

  const updates = {};
  if (!isEmpty(p.name)) updates.Name = p.name;
  if (!isEmpty(p['class'])) updates.Class = p['class'];
  if (!isEmpty(p.photo)) updates.Photo = p.photo;
  if (!isEmpty(p.password)) updates.Password = p.password;
  await ref.update(updates);
  return jsonResponse(true, 'Profile updated.');
}

/* ---------------------------------------------------------------------------
   QUIZZES (student-facing)
--------------------------------------------------------------------------- */
function fbGetEffectiveReviewStatus(settingsRow) {
  if (!isEmpty(settingsRow.ReviewStatus)) return settingsRow.ReviewStatus;
  var active = settingsRow.Active === true || String(settingsRow.Active).toUpperCase() === 'TRUE';
  return active ? 'Published' : 'Draft';
}

function fbIsQuizExpired(settingsRow) {
  if (!settingsRow || isEmpty(settingsRow.ExpiryDate)) return false;
  var timeStr = isEmpty(settingsRow.ExpiryTime) ? '23:59:59' : settingsRow.ExpiryTime;
  var expiryDateTime = new Date(settingsRow.ExpiryDate + 'T' + timeStr);
  if (isNaN(expiryDateTime.getTime())) return false;
  return Date.now() > expiryDateTime.getTime();
}

async function fbGetQuizzes(p) {
  const snap = await db.ref('quizSettings').once('value');
  const all = snap.val() || {};
  const out = [];
  for (const quizName in all) {
    const settings = all[quizName];
    if (fbGetEffectiveReviewStatus(settings) !== 'Published' || fbIsQuizExpired(settings)) continue;
    const qSnap = await db.ref('quizzes/' + quizName + '/questions').once('value');
    const questions = qSnap.val() || [];
    out.push({
      quizName: quizName,
      quizType: settings.QuizType || 'Regular',
      durationMinutes: settings.DurationMinutes || 30,
      allowMultipleAttempts: settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE',
      expiryDate: settings.ExpiryDate || '',
      expiryTime: settings.ExpiryTime || '',
      questionCount: questions.length
    });
  }
  return jsonResponse(true, 'OK', { quizzes: out });
}

async function fbStudentHasAttempted(studentId, quizName) {
  const results = await fbGetAll('results');
  return results.some(function (r) { return r.StudentID === studentId && r.QuizName === quizName; });
}

async function fbGetQuizQuestions(p) {
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const settingsSnap = await db.ref('quizSettings/' + p.quizName).once('value');
  const settings = settingsSnap.val();
  if (!settings) return jsonResponse(false, 'Quiz not found.');
  if (fbGetEffectiveReviewStatus(settings) !== 'Published') return jsonResponse(false, 'This quiz is not currently published.');
  if (fbIsQuizExpired(settings)) return jsonResponse(false, 'This quiz has expired.');

  const allowMultiple = settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE';
  if (!allowMultiple && !isEmpty(p.studentId) && await fbStudentHasAttempted(p.studentId, p.quizName)) {
    return jsonResponse(false, 'You have already attempted this quiz.');
  }

  const qSnap = await db.ref('quizzes/' + p.quizName + '/questions').once('value');
  const rawQuestions = qSnap.val();
  if (!rawQuestions) return jsonResponse(false, 'Quiz tab not found.');

  const randomizeQ = settings.RandomizeQuestions === true || String(settings.RandomizeQuestions).toUpperCase() === 'TRUE';
  const randomizeO = settings.RandomizeOptions === true || String(settings.RandomizeOptions).toUpperCase() === 'TRUE';

  let order = rawQuestions.map(function (_, i) { return i; });
  if (randomizeQ) order = shuffleArray(order);

  const studentQuestions = order.map(function (idx) {
    const q = rawQuestions[idx];
    let options = [{ key: 'A', text: q.OptionA }, { key: 'B', text: q.OptionB }, { key: 'C', text: q.OptionC }, { key: 'D', text: q.OptionD }];
    if (randomizeO) options = shuffleArray(options);
    return { questionIndex: idx, question: q.Question, options: options };
  });

  return jsonResponse(true, 'OK', {
    quizName: p.quizName, durationMinutes: settings.DurationMinutes || 30, quizType: settings.QuizType || 'Regular',
    totalQuestions: studentQuestions.length, questions: studentQuestions
  });
}

async function fbSubmitQuiz(p) {
  var missing = validateRequired(p, ['studentId', 'quizName', 'answers']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const settingsSnap = await db.ref('quizSettings/' + p.quizName).once('value');
  const settings = settingsSnap.val();
  if (!settings) return jsonResponse(false, 'Quiz not found.');

  const allowMultiple = settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE';
  if (!allowMultiple && await fbStudentHasAttempted(p.studentId, p.quizName)) return jsonResponse(false, 'You have already attempted this quiz.');

  const qSnap = await db.ref('quizzes/' + p.quizName + '/questions').once('value');
  const rawQuestions = qSnap.val();
  if (!rawQuestions) return jsonResponse(false, 'Quiz tab not found.');

  const answers = typeof p.answers === 'string' ? JSON.parse(p.answers) : p.answers;
  const answerMap = {};
  answers.forEach(function (a) { answerMap[a.questionIndex] = String(a.selected || '').trim().toUpperCase(); });

  let correctCount = 0, wrongCount = 0;
  rawQuestions.forEach(function (q, idx) {
    const given = answerMap.hasOwnProperty(idx) ? answerMap[idx] : '';
    const correct = String(q.CorrectAnswer).trim().toUpperCase();
    if (given && given === correct) correctCount++; else wrongCount++;
  });

  const total = rawQuestions.length;
  const percentage = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const studentName = studentSnap.exists() ? studentSnap.val().Name : (p.studentName || 'Unknown');

  const resultId = fbGenerateId('RES');
  const now = new Date();
  await db.ref('results/' + resultId).set({
    ResultID: resultId, StudentID: p.studentId, StudentName: studentName, QuizName: p.quizName,
    Score: correctCount, TotalQuestions: total, Percentage: percentage,
    CorrectAnswers: correctCount, WrongAnswers: wrongCount,
    Date: fbFormatDate(now), Time: fbFormatTime(now),
    TimeTakenSeconds: isEmpty(p.timeTakenSeconds) ? '' : Number(p.timeTakenSeconds)
  });

  return jsonResponse(true, 'Quiz submitted successfully.', {
    resultId: resultId, score: correctCount, totalQuestions: total, percentage: percentage, correctAnswers: correctCount, wrongAnswers: wrongCount
  });
}

async function fbGetStudentResults(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const rows = await fbGetAll('results');
  const out = rows.filter(function (r) { return r.StudentID === p.studentId; });
  return jsonResponse(true, 'OK', { results: out });
}

async function fbGetStudentDashboard(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const rows = await fbGetAll('results');
  const mine = rows.filter(function (r) { return r.StudentID === p.studentId; });

  let totalPercentage = 0, best = null;
  mine.forEach(function (r) {
    totalPercentage += Number(r.Percentage) || 0;
    if (best === null || Number(r.Percentage) > Number(best.Percentage)) best = r;
  });
  const avgPercentage = mine.length > 0 ? Math.round((totalPercentage / mine.length) * 100) / 100 : 0;
  const availableQuizzesResp = await fbGetQuizzes({});

  return jsonResponse(true, 'OK', {
    quizzesTaken: mine.length, averagePercentage: avgPercentage, bestResult: best,
    availableQuizzes: availableQuizzesResp.data.quizzes.length, recentResults: mine.slice(-5).reverse()
  });
}

/* ---------------------------------------------------------------------------
   ADMIN AUTH + STUDENT MANAGEMENT
--------------------------------------------------------------------------- */
async function fbAdminLogin(p) {
  var missing = validateRequired(p, ['email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const rows = await fbGetAll('admins');
  for (const r of rows) {
    if (String(r.Email).toLowerCase() === String(p.email).toLowerCase()) {
      if (String(r.Password) !== String(p.password)) return jsonResponse(false, 'Incorrect password.');
      const status = String(r.Status || '').toLowerCase();
      if (status === 'inactive') return jsonResponse(false, 'This admin account is inactive.');
      if (status === 'pending') return jsonResponse(false, 'This admin account is awaiting Super Admin approval.');
      if (status === 'rejected') return jsonResponse(false, 'This admin account was rejected.');
      return jsonResponse(true, 'Login successful.', { adminId: r['Admin ID'] || r.AdminID, name: r.Name, email: r.Email, role: r.Role, photo: r.Photo || '', permissions: r.Permissions || '' });
    }
  }
  return jsonResponse(false, 'No admin account found with this email.');
}

async function fbRequireAdmin(p) {
  if (isEmpty(p.adminEmail) || isEmpty(p.adminPassword)) return { ok: false, response: jsonResponse(false, 'Admin credentials required.') };
  const rows = await fbGetAll('admins');
  for (const r of rows) {
    if (String(r.Email).toLowerCase() === String(p.adminEmail).toLowerCase() && String(r.Password) === String(p.adminPassword)) {
      const status = String(r.Status || '').toLowerCase();
      if (status === 'inactive') return { ok: false, response: jsonResponse(false, 'This admin account is inactive.') };
      if (status === 'pending') return { ok: false, response: jsonResponse(false, 'This admin account is awaiting approval.') };
      if (status === 'rejected') return { ok: false, response: jsonResponse(false, 'This admin account was rejected.') };
      return { ok: true, admin: r };
    }
  }
  return { ok: false, response: jsonResponse(false, 'Unauthorized: invalid admin credentials.') };
}

async function fbGetStudents(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('students');
  const out = rows.map(function (r) { const c = Object.assign({}, r); delete c.Password; return c; });
  return jsonResponse(true, 'OK', { students: out });
}

async function fbSetStudentStatusInternal(studentId, status) {
  if (isEmpty(studentId)) return jsonResponse(false, 'studentId is required.');
  const ref = db.ref('students/' + studentId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Student not found.');
  await ref.update({ Status: status });
  return jsonResponse(true, 'Student status updated to "' + status + '".');
}

async function fbApproveStudent(p) { const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response; return fbSetStudentStatusInternal(p.studentId, STUDENT_STATUS.APPROVED); }
async function fbRejectStudent(p) { const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response; return fbSetStudentStatusInternal(p.studentId, STUDENT_STATUS.REJECTED); }
async function fbSetStudentStatus(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId', 'status']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  return fbSetStudentStatusInternal(p.studentId, p.status);
}

/* ---------------------------------------------------------------------------
   ACTION MAP — this is what apiCall() in script.js looks up
--------------------------------------------------------------------------- */
const FIREBASE_ACTIONS = {
  registerStudent: fbRegisterStudent,
  studentLogin: fbStudentLogin,
  studentLogout: fbStudentLogout,
  getStudentProfile: fbGetStudentProfile,
  updateStudentProfile: fbUpdateStudentProfile,
  getQuizzes: fbGetQuizzes,
  getQuizQuestions: fbGetQuizQuestions,
  submitQuiz: fbSubmitQuiz,
  getStudentResults: fbGetStudentResults,
  getStudentDashboard: fbGetStudentDashboard,
  adminLogin: fbAdminLogin,
  getStudents: fbGetStudents,
  approveStudent: fbApproveStudent,
  rejectStudent: fbRejectStudent,
  setStudentStatus: fbSetStudentStatus
};
