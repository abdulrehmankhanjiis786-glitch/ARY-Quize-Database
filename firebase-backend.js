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
  if (isEmpty(p.photo)) return jsonResponse(false, 'Profile Picture Required – Please upload your profile picture to complete your registration.');

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

/* ---------------------------------------------------------------------------
   PASSWORD RESET — OTP-based, works for both students and admins.

   Flow: requestPasswordReset (email+role) -> emails a 6-digit code, returns
   an opaque resetId that ties the rest of the flow together (the client
   never needs to re-send the email) -> verifyOtp (resetId+otp) -> marks the
   record verified -> completePasswordReset (resetId+newPassword) -> updates
   the account and deletes the record.

   Security notes:
   - The response never reveals whether the email exists — a resetId is
     always returned, and a request against an unknown email creates an
     inert record so verifyOtp behaves identically either way.
   - OTP expires after 10 minutes.
   - Max 5 incorrect OTP attempts per resetId, then it's locked and a fresh
     request is required.
   - Resend has a 45-second cooldown and also rotates the code.
   - completePasswordReset only succeeds if that resetId was already OTP-
     verified in this same flow.
   IMPORTANT CAVEAT: this project's "backend" is plain client-side JS
   talking directly to the Firebase Realtime Database (there is no real
   server). That means this logic is a strong UX-level gate, but a
   technically sophisticated user could still call the Firebase REST API
   directly and write to /passwordResets or /students /admins themselves.
   Real server-side enforcement needs Firebase Security Rules that lock
   down direct writes to those paths (e.g. only allow a Cloud Function to
   write verified:true or a new Password) — that's outside what a static
   HTML/JS site can enforce on its own.
--------------------------------------------------------------------------- */
function fbGenerateOpaqueId() {
  var bytes = new Uint8Array(24);
  (self.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}
function fbGenerateOtp() {
  var arr = new Uint32Array(1);
  (self.crypto || window.crypto).getRandomValues(arr);
  return String(100000 + (arr[0] % 900000)); // 6 digits, 100000–999999
}

async function fbRequestPasswordReset(p) {
  var missing = validateRequired(p, ['email', 'role']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const role = p.role === 'admin' ? 'admin' : 'student';
  const collection = role === 'admin' ? 'admins' : 'students';
  const rows = await fbGetAll(collection);
  const match = rows.find(function (r) { return String(r.Email).toLowerCase() === String(p.email).toLowerCase(); });

  const resetId = fbGenerateOpaqueId();
  const otp = fbGenerateOtp();
  const now = Date.now();
  await db.ref('passwordResets/' + resetId).set({
    userId: match ? (role === 'admin' ? match.AdminID : match.StudentID) : '',
    role: role, email: p.email, valid: !!match,
    otp: otp, attempts: 0, verified: false,
    createdAt: now, expiresAt: now + 10 * 60 * 1000, lastSentAt: now
  });

  if (match) {
    const emailRes = await fbRelayCall('sendPlainEmail', {
      to: match.Email,
      subject: 'Your ARY Quize Bank password reset code',
      message: 'Hi ' + (match.Name || '') + ',\n\nYour password reset code is: ' + otp + '\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.\n\n— ARY Quize Bank'
    });
    if (!emailRes.success) return jsonResponse(false, 'Could not send the reset email: ' + emailRes.message);
  }
  // Always the same generic message and response shape, whether or not the email was found.
  return jsonResponse(true, 'If an account exists with that email, a 6-digit code has been sent.', { resetId: resetId });
}

async function fbResendOtp(p) {
  var missing = validateRequired(p, ['resetId']);
  if (missing.length) return jsonResponse(false, 'Missing resetId.');
  const ref = db.ref('passwordResets/' + p.resetId);
  const snap = await ref.once('value');
  const rec = snap.val();
  if (!rec) return jsonResponse(false, 'This session has expired. Please start over.');
  const now = Date.now();
  if (now - rec.lastSentAt < 45 * 1000) {
    return jsonResponse(false, 'Please wait ' + Math.ceil((45 * 1000 - (now - rec.lastSentAt)) / 1000) + 's before requesting another code.');
  }
  const otp = fbGenerateOtp();
  await ref.update({ otp: otp, attempts: 0, verified: false, expiresAt: now + 10 * 60 * 1000, lastSentAt: now });
  if (rec.valid) {
    const emailRes = await fbRelayCall('sendPlainEmail', {
      to: rec.email,
      subject: 'Your ARY Quize Bank password reset code',
      message: 'Your new password reset code is: ' + otp + '\n\nThis code expires in 10 minutes.\n\n— ARY Quize Bank'
    });
    if (!emailRes.success) return jsonResponse(false, 'Could not send the reset email: ' + emailRes.message);
  }
  return jsonResponse(true, 'A new code has been sent if that email is registered.');
}

async function fbVerifyOtp(p) {
  var missing = validateRequired(p, ['resetId', 'otp']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('passwordResets/' + p.resetId);
  const snap = await ref.once('value');
  const rec = snap.val();
  if (!rec) return jsonResponse(false, 'This session has expired. Please start over.');
  if (Date.now() > rec.expiresAt) return jsonResponse(false, 'This code has expired. Please request a new one.');
  if (rec.attempts >= 5) return jsonResponse(false, 'Too many incorrect attempts. Please request a new code.');

  if (!rec.valid || String(p.otp).trim() !== rec.otp) {
    const attempts = (rec.attempts || 0) + 1;
    await ref.update({ attempts: attempts });
    const remaining = 5 - attempts;
    if (remaining <= 0) return jsonResponse(false, 'Too many incorrect attempts. Please request a new code.');
    return jsonResponse(false, 'Incorrect code. ' + remaining + ' attempt(s) remaining.');
  }
  await ref.update({ verified: true });
  return jsonResponse(true, 'Code verified.');
}

async function fbCompletePasswordReset(p) {
  var missing = validateRequired(p, ['resetId', 'newPassword']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (String(p.newPassword).length < 6) return jsonResponse(false, 'Password must be at least 6 characters.');

  const ref = db.ref('passwordResets/' + p.resetId);
  const snap = await ref.once('value');
  const rec = snap.val();
  if (!rec || !rec.verified || Date.now() > rec.expiresAt) return jsonResponse(false, 'This session is invalid or has expired. Please start over.');

  const collection = rec.role === 'admin' ? 'admins' : 'students';
  await db.ref(collection + '/' + rec.userId).update({ Password: p.newPassword });
  await ref.remove();
  return jsonResponse(true, 'Password updated. You can now log in with your new password.');
}

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
      subject: settings.Subject || '',
      semester: settings.Semester || '',
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

  let correctCount = 0, wrongCount = 0, skippedCount = 0;
  const answerDetails = rawQuestions.map(function (q, idx) {
    const given = answerMap.hasOwnProperty(idx) ? answerMap[idx] : '';
    const correct = String(q.CorrectAnswer).trim().toUpperCase();
    let status;
    if (!given) { status = 'Skipped'; skippedCount++; }
    else if (given === correct) { status = 'Correct'; correctCount++; }
    else { status = 'Incorrect'; wrongCount++; }
    return {
      questionIndex: idx, question: q.Question, optionA: q.OptionA, optionB: q.OptionB, optionC: q.OptionC, optionD: q.OptionD,
      correctAnswer: correct, selected: given, status: status
    };
  });

  const total = rawQuestions.length;
  const percentage = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const studentRecord = studentSnap.exists() ? studentSnap.val() : null;
  const studentName = studentRecord ? studentRecord.Name : (p.studentName || 'Unknown');

  const resultId = fbGenerateId('RES');
  const now = new Date();
  await db.ref('results/' + resultId).set({
    ResultID: resultId, StudentID: p.studentId, StudentName: studentName, StudentPhoto: studentRecord ? (studentRecord.Photo || '') : '',
    QuizName: p.quizName, Subject: settings.Subject || '',
    Score: correctCount, TotalQuestions: total, Percentage: percentage,
    CorrectAnswers: correctCount, WrongAnswers: wrongCount, SkippedAnswers: skippedCount,
    Date: fbFormatDate(now), Time: fbFormatTime(now),
    TimeTakenSeconds: isEmpty(p.timeTakenSeconds) ? '' : Number(p.timeTakenSeconds),
    AnswerDetails: answerDetails
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
  requestPasswordReset: fbRequestPasswordReset,
  resendOtp: fbResendOtp,
  verifyOtp: fbVerifyOtp,
  completePasswordReset: fbCompletePasswordReset,
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
