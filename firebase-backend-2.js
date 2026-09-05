/* ============================================================================
   FIREBASE BACKEND — PHASE 2
   Quiz admin management + review workflow, results/analytics, leaderboard,
   student performance, quiz question CRUD (create/edit quiz + its questions).
   Loads after firebase-backend.js and extends the same FIREBASE_ACTIONS map.
   ============================================================================ */

var REVIEW_STATUSES = ['Draft', 'UnderReview', 'ChangesRequired', 'Approved', 'Published', 'Rejected'];

/* ---------------------------------------------------------------------------
   ADMIN: QUIZZES + REVIEW WORKFLOW
--------------------------------------------------------------------------- */
async function fbGetAllQuizzesAdmin(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const settingsSnap = await db.ref('quizSettings').once('value');
  const allSettings = settingsSnap.val() || {};
  const out = [];
  for (const quizName in allSettings) {
    const settings = allSettings[quizName];
    const qSnap = await db.ref('quizzes/' + quizName + '/questions').once('value');
    const questions = qSnap.val() || [];
    const copy = Object.assign({}, settings);
    copy.questionCount = questions.length;
    copy.expired = fbIsQuizExpired(settings);
    copy.EffectiveReviewStatus = fbGetEffectiveReviewStatus(settings);
    out.push(copy);
  }
  return jsonResponse(true, 'OK', { quizzes: out });
}

async function fbUpdateQuizSettingCell(quizName, updates) {
  const ref = db.ref('quizSettings/' + quizName);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Quiz not found.');
  await ref.update(updates);
  return null; // null = caller should return its own success message
}

async function fbSetQuizActive(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const active = (p.active === true || String(p.active).toUpperCase() === 'TRUE');
  const err = await fbUpdateQuizSettingCell(p.quizName, { Active: active, ReviewStatus: active ? 'Published' : 'Approved' });
  if (err) return err;
  return jsonResponse(true, active ? 'Quiz published.' : 'Quiz unpublished.');
}

async function fbSetQuizExpiry(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const updates = {};
  if (!isEmpty(p.expiryDate)) updates.ExpiryDate = p.expiryDate;
  if (!isEmpty(p.expiryTime)) updates.ExpiryTime = p.expiryTime;
  const err = await fbUpdateQuizSettingCell(p.quizName, updates);
  if (err) return err;
  return jsonResponse(true, 'Quiz expiry updated.');
}

async function fbUpdateQuizSettings(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const editable = ['Active', 'ExpiryDate', 'ExpiryTime', 'DurationMinutes', 'AllowMultipleAttempts', 'QuizType', 'RandomizeQuestions', 'RandomizeOptions'];
  const updates = {};
  editable.forEach(function (key) {
    const paramKey = key.charAt(0).toLowerCase() + key.slice(1);
    if (!isEmpty(p[paramKey])) updates[key] = p[paramKey];
  });
  const err = await fbUpdateQuizSettingCell(p.quizName, updates);
  if (err) return err;
  return jsonResponse(true, 'Quiz settings updated.');
}

async function fbReviewQuiz(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName', 'reviewStatus']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (REVIEW_STATUSES.indexOf(p.reviewStatus) === -1) return jsonResponse(false, 'Invalid reviewStatus. Must be one of: ' + REVIEW_STATUSES.join(', '));
  const updates = { ReviewStatus: p.reviewStatus, Active: p.reviewStatus === 'Published' };
  if (!isEmpty(p.reviewNote)) updates.ReviewNote = p.reviewNote;
  const err = await fbUpdateQuizSettingCell(p.quizName, updates);
  if (err) return err;
  return jsonResponse(true, 'Quiz status set to "' + p.reviewStatus + '".');
}

async function fbPublishQuiz(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const err = await fbUpdateQuizSettingCell(p.quizName, { ReviewStatus: 'Published', Active: true });
  if (err) return err;
  return jsonResponse(true, 'Quiz published. Students can now see it.');
}

async function fbUnpublishQuiz(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const err = await fbUpdateQuizSettingCell(p.quizName, { ReviewStatus: 'Approved', Active: false });
  if (err) return err;
  return jsonResponse(true, 'Quiz unpublished. It is hidden from students but keeps its Approved status.');
}

async function fbRequestChanges(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const err = await fbUpdateQuizSettingCell(p.quizName, { ReviewStatus: 'ChangesRequired', Active: false, ReviewNote: p.reviewNote || '' });
  if (err) return err;
  return jsonResponse(true, 'Changes requested.');
}

/* ---------------------------------------------------------------------------
   QUIZ QUESTION MANAGEMENT (create / edit / delete quiz + its questions)
--------------------------------------------------------------------------- */
function fbValidateQuestionRows(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return { ok: false, message: 'Add at least one question.' };
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (isEmpty(q.question) || isEmpty(q.optionA) || isEmpty(q.optionB) || isEmpty(q.optionC) || isEmpty(q.optionD) || isEmpty(q.correctAnswer)) {
      return { ok: false, message: 'Question ' + (i + 1) + ' is missing a field (question text, all 4 options, or the correct answer).' };
    }
    if (['A', 'B', 'C', 'D'].indexOf(String(q.correctAnswer).toUpperCase()) === -1) {
      return { ok: false, message: 'Question ' + (i + 1) + ': correct answer must be A, B, C, or D.' };
    }
  }
  return { ok: true };
}

async function fbCreateQuiz(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName', 'questions']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const existingSnap = await db.ref('quizzes/' + p.quizName).once('value');
  if (existingSnap.exists()) return jsonResponse(false, 'A quiz with this name already exists.');

  const questions = typeof p.questions === 'string' ? JSON.parse(p.questions) : p.questions;
  const validation = fbValidateQuestionRows(questions);
  if (!validation.ok) return jsonResponse(false, validation.message);

  const rows = questions.map(function (q) {
    return { Question: q.question, OptionA: q.optionA, OptionB: q.optionB, OptionC: q.optionC, OptionD: q.optionD, CorrectAnswer: String(q.correctAnswer).toUpperCase() };
  });

  await db.ref('quizzes/' + p.quizName).set({ name: p.quizName, questions: rows });
  await db.ref('quizSettings/' + p.quizName).set({
    QuizName: p.quizName, Active: false, ExpiryDate: '', ExpiryTime: '',
    DurationMinutes: p.durationMinutes || 30, AllowMultipleAttempts: false, QuizType: p.quizType || 'Regular',
    RandomizeQuestions: false, RandomizeOptions: false, CreatedDate: fbFormatDate(new Date()),
    ReviewStatus: 'Draft', ReviewNote: ''
  });

  return jsonResponse(true, 'Quiz created with ' + rows.length + ' question(s).', { quizName: p.quizName, questionCount: rows.length });
}

async function fbGetQuizQuestionsAdmin(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const qSnap = await db.ref('quizzes/' + p.quizName + '/questions').once('value');
  const raw = qSnap.val();
  if (!raw) return jsonResponse(false, 'Quiz tab not found.');
  const questions = raw.map(function (q) {
    return { question: q.Question, optionA: q.OptionA, optionB: q.OptionB, optionC: q.OptionC, optionD: q.OptionD, correctAnswer: q.CorrectAnswer };
  });
  return jsonResponse(true, 'OK', { quizName: p.quizName, questions: questions });
}

async function fbUpdateQuizQuestions(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName', 'questions']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const existingSnap = await db.ref('quizzes/' + p.quizName).once('value');
  if (!existingSnap.exists()) return jsonResponse(false, 'Quiz tab not found.');

  const questions = typeof p.questions === 'string' ? JSON.parse(p.questions) : p.questions;
  const validation = fbValidateQuestionRows(questions);
  if (!validation.ok) return jsonResponse(false, validation.message);

  const rows = questions.map(function (q) {
    return { Question: q.question, OptionA: q.optionA, OptionB: q.optionB, OptionC: q.optionC, OptionD: q.optionD, CorrectAnswer: String(q.correctAnswer).toUpperCase() };
  });
  await db.ref('quizzes/' + p.quizName + '/questions').set(rows);

  return jsonResponse(true, 'Saved ' + rows.length + ' question(s).', { questionCount: rows.length });
}

async function fbDeleteQuiz(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const quizSnap = await db.ref('quizzes/' + p.quizName).once('value');
  if (!quizSnap.exists()) return jsonResponse(false, 'Quiz tab not found.');

  await db.ref('quizzes/' + p.quizName).remove();
  await db.ref('quizSettings/' + p.quizName).remove();

  let deletedResults = 0;
  if (p.deleteResults === true || String(p.deleteResults).toUpperCase() === 'TRUE') {
    const resultsSnap = await db.ref('results').once('value');
    const all = resultsSnap.val() || {};
    const updates = {};
    for (const resultId in all) {
      if (all[resultId].QuizName === p.quizName) { updates[resultId] = null; deletedResults++; }
    }
    if (Object.keys(updates).length) await db.ref('results').update(updates);
  }

  return jsonResponse(true, 'Quiz deleted.', { deletedResults: deletedResults });
}

/* ---------------------------------------------------------------------------
   ADMIN: RESULTS + ANALYTICS
--------------------------------------------------------------------------- */
async function fbGetAllResults(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('results');
  return jsonResponse(true, 'OK', { results: rows });
}

async function fbSearchStudentResults(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['query']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const q = String(p.query).toLowerCase();
  const rows = await fbGetAll('results');
  const out = rows.filter(function (r) {
    const haystack = (String(r.StudentName) + ' ' + String(r.StudentID) + ' ' + String(r.QuizName)).toLowerCase();
    return haystack.indexOf(q) !== -1;
  });
  return jsonResponse(true, 'OK', { results: out });
}

async function fbGetClassAnalytics(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const students = await fbGetAll('students');
  const results = await fbGetAll('results');
  const studentClassMap = {}, classCounts = {};
  students.forEach(function (s) {
    const cls = s.Class || 'Unassigned';
    studentClassMap[s.StudentID] = cls;
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  });
  const classStats = {};
  results.forEach(function (r) {
    const cls = studentClassMap[r.StudentID] || 'Unassigned';
    if (!classStats[cls]) classStats[cls] = { attempts: 0, totalPct: 0, high: -Infinity, low: Infinity };
    const pct = Number(r.Percentage) || 0;
    classStats[cls].attempts++; classStats[cls].totalPct += pct;
    classStats[cls].high = Math.max(classStats[cls].high, pct); classStats[cls].low = Math.min(classStats[cls].low, pct);
  });
  const out = [];
  for (const cls in classCounts) {
    const stat = classStats[cls];
    out.push({
      className: cls, totalStudents: classCounts[cls], totalAttempts: stat ? stat.attempts : 0,
      averagePercentage: stat && stat.attempts > 0 ? Math.round((stat.totalPct / stat.attempts) * 100) / 100 : 0,
      highestPercentage: stat && stat.attempts > 0 ? stat.high : 0, lowestPercentage: stat && stat.attempts > 0 ? stat.low : 0
    });
  }
  return jsonResponse(true, 'OK', { classAnalytics: out });
}

async function fbGetQuizAnalytics(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const results = await fbGetAll('results');
  const stats = {};
  results.forEach(function (r) {
    const name = r.QuizName;
    if (!stats[name]) stats[name] = { attempts: 0, totalPct: 0, high: -Infinity, low: Infinity };
    const pct = Number(r.Percentage) || 0;
    stats[name].attempts++; stats[name].totalPct += pct;
    stats[name].high = Math.max(stats[name].high, pct); stats[name].low = Math.min(stats[name].low, pct);
  });
  const out = [];
  for (const quizName in stats) {
    const s = stats[quizName];
    out.push({
      quizName: quizName, totalAttempts: s.attempts, averagePercentage: s.attempts > 0 ? Math.round((s.totalPct / s.attempts) * 100) / 100 : 0,
      highestPercentage: s.attempts > 0 ? s.high : 0, lowestPercentage: s.attempts > 0 ? s.low : 0
    });
  }
  return jsonResponse(true, 'OK', { quizAnalytics: out });
}

async function fbDeleteResult(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['resultId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('results/' + p.resultId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Result not found.');
  await ref.remove();
  return jsonResponse(true, 'Result deleted.');
}

async function fbUpdateResult(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['resultId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('results/' + p.resultId);
  const snap = await ref.once('value');
  const current = snap.val();
  if (!current) return jsonResponse(false, 'Result not found.');

  const correct = !isEmpty(p.correctAnswers) ? Number(p.correctAnswers) : Number(current.CorrectAnswers);
  const total = !isEmpty(p.totalQuestions) ? Number(p.totalQuestions) : Number(current.TotalQuestions);
  const wrong = Math.max(total - correct, 0);
  const percentage = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

  await ref.update({ CorrectAnswers: correct, WrongAnswers: wrong, Score: correct, TotalQuestions: total, Percentage: percentage });
  return jsonResponse(true, 'Result updated.', { correctAnswers: correct, wrongAnswers: wrong, percentage: percentage });
}

async function fbGetLeaderboard(p) {
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const allResults = await fbGetAll('results');
  const rows = allResults.filter(function (r) { return r.QuizName === p.quizName; });

  rows.sort(function (a, b) {
    const pctDiff = (Number(b.Percentage) || 0) - (Number(a.Percentage) || 0);
    if (pctDiff !== 0) return pctDiff;
    const aTime = isEmpty(a.TimeTakenSeconds) ? Infinity : Number(a.TimeTakenSeconds);
    const bTime = isEmpty(b.TimeTakenSeconds) ? Infinity : Number(b.TimeTakenSeconds);
    if (aTime !== bTime) return aTime - bTime;
    const aStamp = new Date(a.Date + ' ' + (a.Time || '00:00:00')).getTime();
    const bStamp = new Date(b.Date + ' ' + (b.Time || '00:00:00')).getTime();
    return aStamp - bStamp;
  });

  const students = await fbGetAll('students');
  const studentPhotoMap = {};
  students.forEach(function (s) { studentPhotoMap[s.StudentID] = s.Photo || ''; });

  const out = rows.map(function (r, i) {
    return {
      rank: i + 1, resultId: r.ResultID, studentId: r.StudentID, studentName: r.StudentName,
      photo: studentPhotoMap[r.StudentID] || '', score: r.Score, totalQuestions: r.TotalQuestions,
      percentage: r.Percentage, timeTakenSeconds: isEmpty(r.TimeTakenSeconds) ? null : Number(r.TimeTakenSeconds),
      date: r.Date, time: r.Time
    };
  });

  return jsonResponse(true, 'OK', { quizName: p.quizName, leaderboard: out });
}

async function fbGetStudentPerformance(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const studentRow = studentSnap.val();
  if (!studentRow) return jsonResponse(false, 'Student not found.');

  const allResults = await fbGetAll('results');
  const results = allResults.filter(function (r) { return r.StudentID === p.studentId; });
  let totalPct = 0, best = null, worst = null;
  results.forEach(function (r) {
    const pct = Number(r.Percentage) || 0;
    totalPct += pct;
    if (best === null || pct > Number(best.Percentage)) best = r;
    if (worst === null || pct < Number(worst.Percentage)) worst = r;
  });
  const avgPct = results.length > 0 ? Math.round((totalPct / results.length) * 100) / 100 : 0;

  const profile = Object.assign({}, studentRow); delete profile.Password;
  return jsonResponse(true, 'OK', {
    profile: profile, attempts: results.length, averagePercentage: avgPct,
    bestResult: best, worstResult: worst, results: results
  });
}

/* ---------------------------------------------------------------------------
   ANNOUNCEMENTS
--------------------------------------------------------------------------- */
async function fbCreateAnnouncement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['title', 'message']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const id = fbGenerateId('ANN');
  await db.ref('announcements/' + id).set({ AnnouncementID: id, Title: p.title, Message: p.message, Date: fbFormatDate(new Date()), Status: p.status || 'Active' });
  return jsonResponse(true, 'Announcement created.', { announcementId: id });
}

async function fbUpdateAnnouncement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['announcementId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('announcements/' + p.announcementId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Announcement not found.');
  const updates = {};
  if (!isEmpty(p.title)) updates.Title = p.title;
  if (!isEmpty(p.message)) updates.Message = p.message;
  if (!isEmpty(p.status)) updates.Status = p.status;
  await ref.update(updates);
  return jsonResponse(true, 'Announcement updated.');
}

async function fbDeleteAnnouncement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['announcementId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('announcements/' + p.announcementId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Announcement not found.');
  await ref.remove();
  return jsonResponse(true, 'Announcement deleted.');
}

async function fbGetAnnouncements(p) {
  const rows = await fbGetAll('announcements');
  const authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && (await fbRequireAdmin(p)).ok;
  const out = authed ? rows : rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  return jsonResponse(true, 'OK', { announcements: out });
}

/* ---------------------------------------------------------------------------
   CONTACTS
--------------------------------------------------------------------------- */
async function fbGetContacts(p) {
  const rows = await fbGetAll('contacts');
  const authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && (await fbRequireAdmin(p)).ok;
  const out = authed ? rows : rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  return jsonResponse(true, 'OK', { contacts: out });
}

async function fbCreateContact(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['name']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const id = fbGenerateId('CON');
  await db.ref('contacts/' + id).set({ ContactID: id, Name: p.name, Role: p.role || '', Phone: p.phone || '', WhatsApp: p.whatsapp || '', Email: p.email || '', Status: p.status || 'Active' });
  return jsonResponse(true, 'Contact created.', { contactId: id });
}

async function fbUpdateContact(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['contactId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('contacts/' + p.contactId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Contact not found.');
  const updates = {};
  ['name:Name', 'role:Role', 'phone:Phone', 'whatsapp:WhatsApp', 'email:Email', 'status:Status'].forEach(function (pair) {
    const [pk, fk] = pair.split(':');
    if (!isEmpty(p[pk])) updates[fk] = p[pk];
  });
  await ref.update(updates);
  return jsonResponse(true, 'Contact updated.');
}

async function fbDeleteContact(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['contactId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('contacts/' + p.contactId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Contact not found.');
  await ref.remove();
  return jsonResponse(true, 'Contact deleted.');
}

/* ---------------------------------------------------------------------------
   ADMIN MANAGEMENT (Super Admin only) + own profile
--------------------------------------------------------------------------- */
async function fbRequireSuperAdmin(p) {
  const auth = await fbRequireAdmin(p);
  if (!auth.ok) return auth;
  if (String(auth.admin.Role || '').toLowerCase().indexOf('super') === -1) {
    return { ok: false, response: jsonResponse(false, 'Unauthorized: Super Admin access required.') };
  }
  return auth;
}

function fbAdminId(r) { return r['Admin ID'] || r.AdminID; }

async function fbGetAdmins(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('admins');
  const out = rows.map(function (r) { const c = Object.assign({}, r); delete c.Password; return c; });
  return jsonResponse(true, 'OK', { admins: out });
}

async function fbCreateAdmin(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['name', 'email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const existing = await fbGetAll('admins');
  if (existing.some(function (r) { return String(r.Email).toLowerCase() === String(p.email).toLowerCase(); })) {
    return jsonResponse(false, 'An admin with this email already exists.');
  }
  const id = fbGenerateId('ADM');
  const permissions = Array.isArray(p.permissions) ? p.permissions.join(',') : (p.permissions || '');
  await db.ref('admins/' + id).set({ AdminID: id, Name: p.name, Email: p.email, Password: p.password, Role: p.role || 'Admin', Status: 'Pending', Photo: p.photo || '', Permissions: permissions });
  return jsonResponse(true, 'Admin created. It is Pending until approved.', { adminId: id });
}

async function fbSetAdminStatusInternal(adminId, status) {
  if (isEmpty(adminId)) return jsonResponse(false, 'adminId is required.');
  const ref = db.ref('admins/' + adminId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Admin not found.');
  await ref.update({ Status: status });
  return jsonResponse(true, 'Admin status updated to "' + status + '".');
}
async function fbApproveAdmin(p) { const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response; return fbSetAdminStatusInternal(p.adminId, 'Active'); }
async function fbRejectAdmin(p) { const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response; return fbSetAdminStatusInternal(p.adminId, 'Rejected'); }
async function fbSetAdminStatus(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId', 'status']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  return fbSetAdminStatusInternal(p.adminId, p.status);
}

async function fbUpdateAdminPermissions(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('admins/' + p.adminId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Admin not found.');
  const permissions = Array.isArray(p.permissions) ? p.permissions.join(',') : (p.permissions || '');
  const updates = { Permissions: permissions };
  if (!isEmpty(p.role)) updates.Role = p.role;
  await ref.update(updates);
  return jsonResponse(true, 'Permissions updated.');
}

async function fbRemoveAdmin(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (fbAdminId(auth.admin) === p.adminId) return jsonResponse(false, 'You cannot remove your own account while logged in as it.');
  const ref = db.ref('admins/' + p.adminId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Admin not found.');
  await ref.remove();
  return jsonResponse(true, 'Admin removed.');
}

async function fbUpdateAdminProfile(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const id = fbAdminId(auth.admin);
  const ref = db.ref('admins/' + id);
  const updates = {};
  if (!isEmpty(p.name)) updates.Name = p.name;
  if (!isEmpty(p.photo)) updates.Photo = p.photo;
  if (!isEmpty(p.newPassword)) updates.Password = p.newPassword;
  await ref.update(updates);
  return jsonResponse(true, 'Profile updated.');
}

/* ---------------------------------------------------------------------------
   NOTIFICATIONS
--------------------------------------------------------------------------- */
async function fbCreateNotification(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['title', 'message', 'targetType']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (['All', 'Class', 'Student'].indexOf(p.targetType) === -1) return jsonResponse(false, 'targetType must be All, Class, or Student.');
  if (p.targetType !== 'All' && isEmpty(p.targetValue)) return jsonResponse(false, 'targetValue is required for Class/Student notifications.');

  const id = fbGenerateId('NTF');
  const now = new Date();
  await db.ref('notifications/' + id).set({
    NotificationID: id, Title: p.title, Message: p.message, TargetType: p.targetType, TargetValue: p.targetValue || '',
    CreatedDate: fbFormatDate(now), CreatedTime: fbFormatTime(now), Status: 'Active'
  });
  return jsonResponse(true, 'Notification sent.', { notificationId: id });
}

async function fbGetNotifications(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const rows = (await fbGetAll('notifications')).filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  const className = p.className || '';
  const relevant = rows.filter(function (r) {
    if (r.TargetType === 'All') return true;
    if (r.TargetType === 'Class') return String(r.TargetValue).toLowerCase() === String(className).toLowerCase();
    if (r.TargetType === 'Student') return r.TargetValue === p.studentId;
    return false;
  });
  relevant.sort(function (a, b) { return new Date(b.CreatedDate + ' ' + b.CreatedTime) - new Date(a.CreatedDate + ' ' + a.CreatedTime); });
  return jsonResponse(true, 'OK', { notifications: relevant });
}

async function fbGetAllNotificationsAdmin(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('notifications');
  rows.sort(function (a, b) { return new Date(b.CreatedDate + ' ' + b.CreatedTime) - new Date(a.CreatedDate + ' ' + a.CreatedTime); });
  return jsonResponse(true, 'OK', { notifications: rows });
}

async function fbDeleteNotification(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['notificationId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('notifications/' + p.notificationId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Notification not found.');
  await ref.remove();
  return jsonResponse(true, 'Notification deleted.');
}

/* ---------------------------------------------------------------------------
   CERTIFICATES
--------------------------------------------------------------------------- */
async function fbIssueCertificate(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId', 'certificateType', 'achievementText']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const studentRow = studentSnap.val();
  if (!studentRow) return jsonResponse(false, 'Student not found.');

  const id = fbGenerateId('CERT');
  await db.ref('certificates/' + id).set({
    CertificateID: id, StudentID: p.studentId, StudentName: studentRow.Name, CertificateType: p.certificateType,
    Program: p.program || '', Semester: p.semester || '', Shift: p.shift || '', RollNo: p.rollNo || '',
    AchievementText: p.achievementText, Score: p.score || '', TotalQuizzes: p.totalQuizzes || '',
    MentorName: p.mentorName || '', AdminName: p.adminName || auth.admin.Name,
    IssuedDate: fbFormatDate(new Date()), Status: 'Active'
  });
  return jsonResponse(true, 'Certificate issued.', { certificateId: id });
}

async function fbGetStudentCertificates(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const rows = (await fbGetAll('certificates')).filter(function (r) { return r.StudentID === p.studentId && String(r.Status).toLowerCase() === 'active'; });
  return jsonResponse(true, 'OK', { certificates: rows });
}

async function fbGetAllCertificatesAdmin(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('certificates');
  rows.sort(function (a, b) { return new Date(b.IssuedDate) - new Date(a.IssuedDate); });
  return jsonResponse(true, 'OK', { certificates: rows });
}

async function fbDeleteCertificate(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['certificateId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('certificates/' + p.certificateId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Certificate not found.');
  await ref.remove();
  return jsonResponse(true, 'Certificate revoked.');
}

/* ---------------------------------------------------------------------------
   REGISTER PHASE 2 ACTIONS
--------------------------------------------------------------------------- */
Object.assign(FIREBASE_ACTIONS, {
  getAllQuizzesAdmin: fbGetAllQuizzesAdmin,
  setQuizActive: fbSetQuizActive,
  setQuizExpiry: fbSetQuizExpiry,
  updateQuizSettings: fbUpdateQuizSettings,
  reviewQuiz: fbReviewQuiz,
  publishQuiz: fbPublishQuiz,
  unpublishQuiz: fbUnpublishQuiz,
  requestChanges: fbRequestChanges,
  createQuiz: fbCreateQuiz,
  getQuizQuestionsAdmin: fbGetQuizQuestionsAdmin,
  updateQuizQuestions: fbUpdateQuizQuestions,
  deleteQuiz: fbDeleteQuiz,

  getAllResults: fbGetAllResults,
  searchStudentResults: fbSearchStudentResults,
  getClassAnalytics: fbGetClassAnalytics,
  getQuizAnalytics: fbGetQuizAnalytics,
  deleteResult: fbDeleteResult,
  updateResult: fbUpdateResult,
  getLeaderboard: fbGetLeaderboard,
  getStudentPerformance: fbGetStudentPerformance,

  createAnnouncement: fbCreateAnnouncement,
  updateAnnouncement: fbUpdateAnnouncement,
  deleteAnnouncement: fbDeleteAnnouncement,
  getAnnouncements: fbGetAnnouncements,

  getContacts: fbGetContacts,
  createContact: fbCreateContact,
  updateContact: fbUpdateContact,
  deleteContact: fbDeleteContact,

  getAdmins: fbGetAdmins,
  createAdmin: fbCreateAdmin,
  approveAdmin: fbApproveAdmin,
  rejectAdmin: fbRejectAdmin,
  setAdminStatus: fbSetAdminStatus,
  updateAdminPermissions: fbUpdateAdminPermissions,
  removeAdmin: fbRemoveAdmin,
  updateAdminProfile: fbUpdateAdminProfile,

  createNotification: fbCreateNotification,
  getNotifications: fbGetNotifications,
  getAllNotificationsAdmin: fbGetAllNotificationsAdmin,
  deleteNotification: fbDeleteNotification,

  issueCertificate: fbIssueCertificate,
  getStudentCertificates: fbGetStudentCertificates,
  getAllCertificatesAdmin: fbGetAllCertificatesAdmin,
  deleteCertificate: fbDeleteCertificate
});
