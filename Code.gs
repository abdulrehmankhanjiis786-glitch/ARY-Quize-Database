/**************************************************************************************
 * ARY QUIZE BANK — BACKEND (Google Apps Script) — v2
 * ---------------------------------------------------------------------------------
 * Single-file production backend. Google Sheets is the database.
 * Every quiz is simply a new sheet tab (auto-detected). System sheets are:
 *   Students, Results, Admins, Announcements, QuizSettings, Contacts
 * Any other tab in the spreadsheet is automatically treated as a quiz.
 *
 * WHAT'S NEW IN v2 (replaces the v1 Code.gs):
 *   - Contacts sheet + getContacts/createContact/updateContact/deleteContact
 *   - Admins sheet gains Photo + Permissions columns
 *   - Admin Management: getAdmins, createAdmin, approveAdmin, rejectAdmin,
 *     setAdminStatus, updateAdminPermissions, removeAdmin (all Super Admin only)
 *   - updateAdminProfile (any logged-in admin can edit their own name/photo/password)
 *   - Full quiz review workflow: QuizSettings gains ReviewStatus + ReviewNote.
 *     Statuses: Draft, UnderReview, ChangesRequired, Approved, Published, Rejected.
 *     Actions: reviewQuiz, publishQuiz, unpublishQuiz, requestChanges.
 *     Only Published (and not expired) quizzes are visible to students.
 *
 * Existing v1 data is unaffected: run `setup()` again after pasting this in — it
 * only adds the new sheets/columns, it does not erase anything. Quizzes that were
 * already Active=true are treated as Published automatically (no ReviewStatus
 * needed to keep working).
 *
 * SETUP:
 *   1. Open script.google.com, open your existing project, replace Code.gs with
 *      this file.
 *   2. Run "setup" once (Run > setup) to create/upgrade the system sheets.
 *   3. Deploy > Manage deployments > Edit > New version, so your existing /exec
 *      URL picks up the new actions. The URL itself does not change.
 **************************************************************************************/

// ======================================================================================
// CONFIGURATION
// ======================================================================================

var SPREADSHEET_ID = '';

var SYSTEM_SHEETS = ['Students', 'Results', 'Admins', 'Announcements', 'QuizSettings', 'Contacts'];

var STUDENTS_HEADERS = ['StudentID', 'Name', 'Email', 'Password', 'Class', 'Photo', 'Status', 'RegistrationDate'];
var RESULTS_HEADERS = ['ResultID', 'StudentID', 'StudentName', 'QuizName', 'Score', 'TotalQuestions', 'Percentage', 'CorrectAnswers', 'WrongAnswers', 'Date', 'Time'];
var ADMINS_HEADERS = ['AdminID', 'Name', 'Email', 'Password', 'Role', 'Status', 'Photo', 'Permissions'];
var ANNOUNCEMENTS_HEADERS = ['AnnouncementID', 'Title', 'Message', 'Date', 'Status'];
var QUIZSETTINGS_HEADERS = ['QuizName', 'Active', 'ExpiryDate', 'ExpiryTime', 'DurationMinutes', 'AllowMultipleAttempts', 'QuizType', 'RandomizeQuestions', 'RandomizeOptions', 'CreatedDate', 'ReviewStatus', 'ReviewNote'];
var CONTACTS_HEADERS = ['ContactID', 'Name', 'Role', 'Phone', 'WhatsApp', 'Email', 'Status'];

// Quiz tab column order (row 1 must be exactly this)
var QUIZ_TAB_HEADERS = ['Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'CorrectAnswer'];

var STUDENT_STATUS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', DEACTIVATED: 'Deactivated' };
var ADMIN_STATUS = { PENDING: 'Pending', ACTIVE: 'Active', INACTIVE: 'Inactive', REJECTED: 'Rejected' };
var REVIEW_STATUSES = ['Draft', 'UnderReview', 'ChangesRequired', 'Approved', 'Published', 'Rejected'];


// ======================================================================================
// ENTRY POINTS
// ======================================================================================

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var action = '';
  var params = {};

  try {
    if (e && e.parameter && e.parameter.action) {
      action = e.parameter.action;
      params = e.parameter;
    }
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body.action) action = body.action;
      params = body;
    }

    if (!action) return jsonResponse(false, 'Missing "action" parameter');

    var routes = {
      // ---- Student ----
      registerStudent: apiRegisterStudent,
      studentLogin: apiStudentLogin,
      studentLogout: apiStudentLogout,
      getStudentProfile: apiGetStudentProfile,
      updateStudentProfile: apiUpdateStudentProfile,
      getQuizzes: apiGetQuizzes,
      getQuizQuestions: apiGetQuizQuestions,
      submitQuiz: apiSubmitQuiz,
      getStudentResults: apiGetStudentResults,
      getStudentDashboard: apiGetStudentDashboard,

      // ---- Admin: students / quizzes / results / analytics / announcements ----
      adminLogin: apiAdminLogin,
      getStudents: apiGetStudents,
      approveStudent: apiApproveStudent,
      rejectStudent: apiRejectStudent,
      setStudentStatus: apiSetStudentStatus,
      getAllQuizzesAdmin: apiGetAllQuizzesAdmin,
      setQuizActive: apiSetQuizActive,
      setQuizExpiry: apiSetQuizExpiry,
      updateQuizSettings: apiUpdateQuizSettings,
      getAllResults: apiGetAllResults,
      searchStudentResults: apiSearchStudentResults,
      getClassAnalytics: apiGetClassAnalytics,
      getQuizAnalytics: apiGetQuizAnalytics,
      createAnnouncement: apiCreateAnnouncement,
      updateAnnouncement: apiUpdateAnnouncement,
      deleteAnnouncement: apiDeleteAnnouncement,
      getAnnouncements: apiGetAnnouncements,

      // ---- Admin: quiz review workflow (NEW) ----
      reviewQuiz: apiReviewQuiz,
      publishQuiz: apiPublishQuiz,
      unpublishQuiz: apiUnpublishQuiz,
      requestChanges: apiRequestChanges,

      // ---- Admin: contacts (NEW) ----
      getContacts: apiGetContacts,
      createContact: apiCreateContact,
      updateContact: apiUpdateContact,
      deleteContact: apiDeleteContact,

      // ---- Admin: admin management + own profile (NEW) ----
      getAdmins: apiGetAdmins,
      createAdmin: apiCreateAdmin,
      approveAdmin: apiApproveAdmin,
      rejectAdmin: apiRejectAdmin,
      setAdminStatus: apiSetAdminStatus,
      updateAdminPermissions: apiUpdateAdminPermissions,
      removeAdmin: apiRemoveAdmin,
      updateAdminProfile: apiUpdateAdminProfile
    };

    if (!routes.hasOwnProperty(action)) return jsonResponse(false, 'Unknown action: ' + action);
    return routes[action](params);

  } catch (err) {
    return jsonResponse(false, 'Server error: ' + err.message);
  }
}


// ======================================================================================
// SETUP
// ======================================================================================

function setup() {
  getOrCreateSheet('Students', STUDENTS_HEADERS);
  getOrCreateSheet('Results', RESULTS_HEADERS);
  getOrCreateSheet('Admins', ADMINS_HEADERS);
  getOrCreateSheet('Announcements', ANNOUNCEMENTS_HEADERS);
  getOrCreateSheet('QuizSettings', QUIZSETTINGS_HEADERS);
  getOrCreateSheet('Contacts', CONTACTS_HEADERS);
  syncQuizSettingsWithTabs();
  Logger.log('Setup complete. System sheets created/verified (including v2 additions).');
}


// ======================================================================================
// SPREADSHEET / SHEET HELPERS
// ======================================================================================

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.length > 0) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(name, headers) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    var existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (existing[i] !== headers[i]) sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }
  return sheet;
}

function getSheetSafe(name) {
  var ss = getSpreadsheet();
  return ss.getSheetByName(name);
}

function sheetToObjects(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
  var values = range.getValues();
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj._row = r + 1;
    out.push(obj);
  }
  return out;
}

function findRowByValue(sheet, columnName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(columnName);
  if (colIndex === -1) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var colValues = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < colValues.length; i++) {
    if (String(colValues[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

function setCellByRowAndHeader(sheet, rowNumber, headerName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(headerName);
  if (colIndex === -1) throw new Error('Column not found: ' + headerName);
  sheet.getRange(rowNumber, colIndex + 1).setValue(value);
}


// ======================================================================================
// GENERIC HELPERS
// ======================================================================================

function jsonResponse(success, message, data) {
  var payload = { success: success, message: message || '', data: data !== undefined ? data : {} };
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function generateId(prefix) {
  var stamp = new Date().getTime().toString(36).toUpperCase();
  var rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase();
  return prefix + '-' + stamp + rand;
}

function isEmpty(v) { return v === undefined || v === null || String(v).trim() === ''; }

function validateRequired(params, fields) {
  var missing = [];
  for (var i = 0; i < fields.length; i++) if (isEmpty(params[fields[i]])) missing.push(fields[i]);
  return missing;
}

function formatDate(d) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Karachi', 'yyyy-MM-dd'); }
function formatTime(d) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Karachi', 'HH:mm:ss'); }

function stripRowMeta(obj) {
  var out = {};
  for (var k in obj) if (k !== '_row') out[k] = obj[k];
  return out;
}


// ======================================================================================
// QUIZ TAB DETECTION + QuizSettings MANAGEMENT
// ======================================================================================

function isSystemSheet(name) { return SYSTEM_SHEETS.indexOf(name) !== -1; }

function getAllQuizTabNames() {
  var ss = getSpreadsheet();
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (!isSystemSheet(n)) names.push(n);
  }
  return names;
}

function syncQuizSettingsWithTabs() {
  var settingsSheet = getOrCreateSheet('QuizSettings', QUIZSETTINGS_HEADERS);
  var existing = sheetToObjects(settingsSheet);
  var existingNames = existing.map(function (r) { return r.QuizName; });

  var quizTabs = getAllQuizTabNames();
  var rowsToAdd = [];
  for (var i = 0; i < quizTabs.length; i++) {
    var name = quizTabs[i];
    if (existingNames.indexOf(name) === -1) {
      rowsToAdd.push([
        name, false, '', '', 30, false, 'Regular', false, false, formatDate(new Date()), 'Draft', ''
      ]);
    }
  }
  if (rowsToAdd.length > 0) {
    settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, rowsToAdd.length, QUIZSETTINGS_HEADERS.length).setValues(rowsToAdd);
  }
  return quizTabs;
}

function getQuizSettingsRow(quizName) {
  syncQuizSettingsWithTabs();
  var settingsSheet = getSheetSafe('QuizSettings');
  var all = sheetToObjects(settingsSheet);
  for (var i = 0; i < all.length; i++) if (all[i].QuizName === quizName) return all[i];
  return null;
}

// A quiz created before v2 (or with no ReviewStatus set) falls back to its
// Active flag so nothing that used to work for students breaks.
function getEffectiveReviewStatus(settingsRow) {
  if (!isEmpty(settingsRow.ReviewStatus)) return settingsRow.ReviewStatus;
  var active = settingsRow.Active === true || String(settingsRow.Active).toUpperCase() === 'TRUE';
  return active ? 'Published' : 'Draft';
}

function isQuizExpired(settingsRow) {
  if (!settingsRow || isEmpty(settingsRow.ExpiryDate)) return false;
  var expiryStr = settingsRow.ExpiryDate;
  if (settingsRow.ExpiryDate instanceof Date) expiryStr = formatDate(settingsRow.ExpiryDate);
  var timeStr = isEmpty(settingsRow.ExpiryTime) ? '23:59:59' : settingsRow.ExpiryTime;
  if (settingsRow.ExpiryTime instanceof Date) timeStr = formatTime(settingsRow.ExpiryTime);
  var expiryDateTime = new Date(expiryStr + 'T' + timeStr);
  if (isNaN(expiryDateTime.getTime())) return false;
  return new Date().getTime() > expiryDateTime.getTime();
}

function getQuizQuestionsFull(quizName) {
  var sheet = getSheetSafe(quizName);
  if (!sheet) return null;
  var rows = sheetToObjects(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (isEmpty(r.Question)) continue;
    out.push({
      index: i, question: r.Question, optionA: r.OptionA, optionB: r.OptionB, optionC: r.OptionC, optionD: r.OptionD,
      correctAnswer: String(r.CorrectAnswer).trim().toUpperCase()
    });
  }
  return out;
}

function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}


// ======================================================================================
// STUDENT APIs
// ======================================================================================

function apiRegisterStudent(p) {
  var missing = validateRequired(p, ['name', 'email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet('Students', STUDENTS_HEADERS);
    if (findRowByValue(sheet, 'Email', p.email) !== -1) return jsonResponse(false, 'An account with this email already exists.');

    var studentId = generateId('STU');
    sheet.appendRow([studentId, p.name, p.email, p.password, p['class'] || '', p.photo || '', STUDENT_STATUS.PENDING, formatDate(new Date())]);
    return jsonResponse(true, 'Registration submitted. Waiting for admin approval.', { studentId: studentId });
  } finally {
    lock.releaseLock();
  }
}

function apiStudentLogin(p) {
  var missing = validateRequired(p, ['email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var sheet = getSheetSafe('Students');
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.Email).toLowerCase() === String(p.email).toLowerCase()) {
      if (String(r.Password) !== String(p.password)) return jsonResponse(false, 'Incorrect password.');
      if (r.Status !== STUDENT_STATUS.APPROVED) return jsonResponse(false, 'Your account status is "' + r.Status + '". Only approved students can log in.');
      return jsonResponse(true, 'Login successful.', { studentId: r.StudentID, name: r.Name, email: r.Email, className: r['Class'], photo: r.Photo, status: r.Status });
    }
  }
  return jsonResponse(false, 'No account found with this email.');
}

function apiStudentLogout(p) { return jsonResponse(true, 'Logged out.'); }

function apiGetStudentProfile(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Students');
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].StudentID === p.studentId) {
      var r = rows[i];
      return jsonResponse(true, 'OK', { studentId: r.StudentID, name: r.Name, email: r.Email, className: r['Class'], photo: r.Photo, status: r.Status, registrationDate: r.RegistrationDate });
    }
  }
  return jsonResponse(false, 'Student not found.');
}

function apiUpdateStudentProfile(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Students');
  var rowNum = findRowByValue(sheet, 'StudentID', p.studentId);
  if (rowNum === -1) return jsonResponse(false, 'Student not found.');
  if (!isEmpty(p.name)) setCellByRowAndHeader(sheet, rowNum, 'Name', p.name);
  if (!isEmpty(p['class'])) setCellByRowAndHeader(sheet, rowNum, 'Class', p['class']);
  if (!isEmpty(p.photo)) setCellByRowAndHeader(sheet, rowNum, 'Photo', p.photo);
  if (!isEmpty(p.password)) setCellByRowAndHeader(sheet, rowNum, 'Password', p.password);
  return jsonResponse(true, 'Profile updated.');
}

// Returns quizzes visible to students: ReviewStatus === Published (or legacy Active=true) + not expired
function apiGetQuizzes(p) {
  var quizNames = syncQuizSettingsWithTabs();
  var out = [];
  for (var i = 0; i < quizNames.length; i++) {
    var settings = getQuizSettingsRow(quizNames[i]);
    if (!settings) continue;
    var published = getEffectiveReviewStatus(settings) === 'Published';
    var expired = isQuizExpired(settings);
    if (!published || expired) continue;

    var sheet = getSheetSafe(quizNames[i]);
    var questionCount = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;

    out.push({
      quizName: quizNames[i],
      quizType: settings.QuizType || 'Regular',
      durationMinutes: settings.DurationMinutes || 30,
      allowMultipleAttempts: settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE',
      expiryDate: settings.ExpiryDate || '',
      expiryTime: settings.ExpiryTime || '',
      questionCount: questionCount
    });
  }
  return jsonResponse(true, 'OK', { quizzes: out });
}

function apiGetQuizQuestions(p) {
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var settings = getQuizSettingsRow(p.quizName);
  if (!settings) return jsonResponse(false, 'Quiz not found.');
  if (getEffectiveReviewStatus(settings) !== 'Published') return jsonResponse(false, 'This quiz is not currently published.');
  if (isQuizExpired(settings)) return jsonResponse(false, 'This quiz has expired.');

  var allowMultiple = settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE';
  if (!allowMultiple && !isEmpty(p.studentId) && studentHasAttempted(p.studentId, p.quizName)) {
    return jsonResponse(false, 'You have already attempted this quiz.');
  }

  var full = getQuizQuestionsFull(p.quizName);
  if (full === null) return jsonResponse(false, 'Quiz tab not found.');

  var randomizeQ = settings.RandomizeQuestions === true || String(settings.RandomizeQuestions).toUpperCase() === 'TRUE';
  var randomizeO = settings.RandomizeOptions === true || String(settings.RandomizeOptions).toUpperCase() === 'TRUE';

  var order = full.map(function (q) { return q.index; });
  if (randomizeQ) order = shuffleArray(order);

  var studentQuestions = [];
  for (var i = 0; i < order.length; i++) {
    var q = full[order[i]];
    var options = [{ key: 'A', text: q.optionA }, { key: 'B', text: q.optionB }, { key: 'C', text: q.optionC }, { key: 'D', text: q.optionD }];
    if (randomizeO) options = shuffleArray(options);
    studentQuestions.push({ questionIndex: q.index, question: q.question, options: options });
  }

  return jsonResponse(true, 'OK', {
    quizName: p.quizName, durationMinutes: settings.DurationMinutes || 30, quizType: settings.QuizType || 'Regular',
    totalQuestions: studentQuestions.length, questions: studentQuestions
  });
}

function studentHasAttempted(studentId, quizName) {
  var sheet = getSheetSafe('Results');
  if (!sheet) return false;
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) if (rows[i].StudentID === studentId && rows[i].QuizName === quizName) return true;
  return false;
}

function apiSubmitQuiz(p) {
  var missing = validateRequired(p, ['studentId', 'quizName', 'answers']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var settings = getQuizSettingsRow(p.quizName);
    if (!settings) return jsonResponse(false, 'Quiz not found.');

    var allowMultiple = settings.AllowMultipleAttempts === true || String(settings.AllowMultipleAttempts).toUpperCase() === 'TRUE';
    if (!allowMultiple && studentHasAttempted(p.studentId, p.quizName)) return jsonResponse(false, 'You have already attempted this quiz.');

    var full = getQuizQuestionsFull(p.quizName);
    if (full === null) return jsonResponse(false, 'Quiz tab not found.');

    var answers = typeof p.answers === 'string' ? JSON.parse(p.answers) : p.answers;
    var answerMap = {};
    for (var i = 0; i < answers.length; i++) answerMap[answers[i].questionIndex] = String(answers[i].selected || '').trim().toUpperCase();

    var correctCount = 0, wrongCount = 0;
    for (var q = 0; q < full.length; q++) {
      var given = answerMap.hasOwnProperty(full[q].index) ? answerMap[full[q].index] : '';
      if (given && given === full[q].correctAnswer) correctCount++; else wrongCount++;
    }

    var total = full.length;
    var percentage = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;

    var studentSheet = getSheetSafe('Students');
    var studentRowNum = findRowByValue(studentSheet, 'StudentID', p.studentId);
    var studentName = studentRowNum !== -1 ? studentSheet.getRange(studentRowNum, STUDENTS_HEADERS.indexOf('Name') + 1).getValue() : (p.studentName || 'Unknown');

    var resultsSheet = getOrCreateSheet('Results', RESULTS_HEADERS);
    var resultId = generateId('RES');
    var now = new Date();
    resultsSheet.appendRow([resultId, p.studentId, studentName, p.quizName, correctCount, total, percentage, correctCount, wrongCount, formatDate(now), formatTime(now)]);

    return jsonResponse(true, 'Quiz submitted successfully.', {
      resultId: resultId, score: correctCount, totalQuestions: total, percentage: percentage, correctAnswers: correctCount, wrongAnswers: wrongCount
    });
  } finally {
    lock.releaseLock();
  }
}

function apiGetStudentResults(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Results');
  var rows = sheetToObjects(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) if (rows[i].StudentID === p.studentId) out.push(stripRowMeta(rows[i]));
  return jsonResponse(true, 'OK', { results: out });
}

function apiGetStudentDashboard(p) {
  var missing = validateRequired(p, ['studentId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var resultsSheet = getSheetSafe('Results');
  var rows = sheetToObjects(resultsSheet);
  var mine = rows.filter(function (r) { return r.StudentID === p.studentId; });

  var quizzesTaken = mine.length, totalPercentage = 0, best = null;
  for (var i = 0; i < mine.length; i++) {
    totalPercentage += Number(mine[i].Percentage) || 0;
    if (best === null || Number(mine[i].Percentage) > Number(best.Percentage)) best = mine[i];
  }
  var avgPercentage = quizzesTaken > 0 ? Math.round((totalPercentage / quizzesTaken) * 100) / 100 : 0;
  var availableQuizzesResp = JSON.parse(apiGetQuizzes({}).getContent());
  var availableQuizCount = availableQuizzesResp.data.quizzes.length;

  return jsonResponse(true, 'OK', {
    quizzesTaken: quizzesTaken, averagePercentage: avgPercentage, bestResult: best ? stripRowMeta(best) : null,
    availableQuizzes: availableQuizCount, recentResults: mine.slice(-5).reverse().map(stripRowMeta)
  });
}


// ======================================================================================
// ADMIN AUTH
// ======================================================================================

function apiAdminLogin(p) {
  var missing = validateRequired(p, ['email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var sheet = getOrCreateSheet('Admins', ADMINS_HEADERS);
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.Email).toLowerCase() === String(p.email).toLowerCase()) {
      if (String(r.Password) !== String(p.password)) return jsonResponse(false, 'Incorrect password.');
      var status = String(r.Status || '').toLowerCase();
      if (status === 'inactive') return jsonResponse(false, 'This admin account is inactive.');
      if (status === 'pending') return jsonResponse(false, 'This admin account is awaiting Super Admin approval.');
      if (status === 'rejected') return jsonResponse(false, 'This admin account was rejected.');
      return jsonResponse(true, 'Login successful.', {
        adminId: r.AdminID, name: r.Name, email: r.Email, role: r.Role, photo: r.Photo || '',
        permissions: r.Permissions || ''
      });
    }
  }
  return jsonResponse(false, 'No admin account found with this email.');
}

function requireAdmin(p) {
  if (isEmpty(p.adminEmail) || isEmpty(p.adminPassword)) return { ok: false, response: jsonResponse(false, 'Admin credentials required.') };
  var sheet = getSheetSafe('Admins');
  var rows = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.Email).toLowerCase() === String(p.adminEmail).toLowerCase() && String(r.Password) === String(p.adminPassword)) {
      var status = String(r.Status || '').toLowerCase();
      if (status === 'inactive') return { ok: false, response: jsonResponse(false, 'This admin account is inactive.') };
      if (status === 'pending') return { ok: false, response: jsonResponse(false, 'This admin account is awaiting approval.') };
      if (status === 'rejected') return { ok: false, response: jsonResponse(false, 'This admin account was rejected.') };
      return { ok: true, admin: r };
    }
  }
  return { ok: false, response: jsonResponse(false, 'Unauthorized: invalid admin credentials.') };
}

function requireSuperAdmin(p) {
  var auth = requireAdmin(p);
  if (!auth.ok) return auth;
  if (String(auth.admin.Role || '').toLowerCase().indexOf('super') === -1) {
    return { ok: false, response: jsonResponse(false, 'Unauthorized: Super Admin access required.') };
  }
  return auth;
}


// ======================================================================================
// ADMIN: STUDENTS
// ======================================================================================

function apiGetStudents(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var sheet = getOrCreateSheet('Students', STUDENTS_HEADERS);
  var rows = sheetToObjects(sheet).map(function (r) { var c = stripRowMeta(r); delete c.Password; return c; });
  return jsonResponse(true, 'OK', { students: rows });
}

function apiApproveStudent(p) { var auth = requireAdmin(p); if (!auth.ok) return auth.response; return setStudentStatusInternal(p.studentId, STUDENT_STATUS.APPROVED); }
function apiRejectStudent(p) { var auth = requireAdmin(p); if (!auth.ok) return auth.response; return setStudentStatusInternal(p.studentId, STUDENT_STATUS.REJECTED); }
function apiSetStudentStatus(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId', 'status']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  return setStudentStatusInternal(p.studentId, p.status);
}
function setStudentStatusInternal(studentId, status) {
  if (isEmpty(studentId)) return jsonResponse(false, 'studentId is required.');
  var sheet = getSheetSafe('Students');
  var rowNum = findRowByValue(sheet, 'StudentID', studentId);
  if (rowNum === -1) return jsonResponse(false, 'Student not found.');
  setCellByRowAndHeader(sheet, rowNum, 'Status', status);
  return jsonResponse(true, 'Student status updated to "' + status + '".');
}


// ======================================================================================
// ADMIN: QUIZZES + REVIEW WORKFLOW
// ======================================================================================

function apiGetAllQuizzesAdmin(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var quizNames = syncQuizSettingsWithTabs();
  var out = [];
  for (var i = 0; i < quizNames.length; i++) {
    var settings = getQuizSettingsRow(quizNames[i]);
    var sheet = getSheetSafe(quizNames[i]);
    var questionCount = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
    var copy = stripRowMeta(settings);
    copy.questionCount = questionCount;
    copy.expired = isQuizExpired(settings);
    copy.EffectiveReviewStatus = getEffectiveReviewStatus(settings);
    out.push(copy);
  }
  return jsonResponse(true, 'OK', { quizzes: out });
}

function apiSetQuizActive(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var active = (p.active === true || String(p.active).toUpperCase() === 'TRUE');
  // Kept for backward compatibility: mirrors onto the review workflow too.
  updateQuizSettingCell(p.quizName, 'Active', active);
  updateQuizSettingCell(p.quizName, 'ReviewStatus', active ? 'Published' : 'Approved');
  return jsonResponse(true, active ? 'Quiz published.' : 'Quiz unpublished.');
}

function apiSetQuizExpiry(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  if (!isEmpty(p.expiryDate)) setCellByRowAndHeader(sheet, rowNum, 'ExpiryDate', p.expiryDate);
  if (!isEmpty(p.expiryTime)) setCellByRowAndHeader(sheet, rowNum, 'ExpiryTime', p.expiryTime);
  return jsonResponse(true, 'Quiz expiry updated.');
}

function apiUpdateQuizSettings(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  var editable = ['Active', 'ExpiryDate', 'ExpiryTime', 'DurationMinutes', 'AllowMultipleAttempts', 'QuizType', 'RandomizeQuestions', 'RandomizeOptions'];
  for (var i = 0; i < editable.length; i++) {
    var key = editable[i];
    var paramKey = key.charAt(0).toLowerCase() + key.slice(1);
    if (!isEmpty(p[paramKey])) setCellByRowAndHeader(sheet, rowNum, key, p[paramKey]);
  }
  return jsonResponse(true, 'Quiz settings updated.');
}

function updateQuizSettingCell(quizName, header, value) {
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  setCellByRowAndHeader(sheet, rowNum, header, value);
  return jsonResponse(true, header + ' updated.');
}

// Generic setter for any of the six review stages.
function apiReviewQuiz(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName', 'reviewStatus']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (REVIEW_STATUSES.indexOf(p.reviewStatus) === -1) return jsonResponse(false, 'Invalid reviewStatus. Must be one of: ' + REVIEW_STATUSES.join(', '));

  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');

  setCellByRowAndHeader(sheet, rowNum, 'ReviewStatus', p.reviewStatus);
  setCellByRowAndHeader(sheet, rowNum, 'Active', p.reviewStatus === 'Published');
  if (!isEmpty(p.reviewNote)) setCellByRowAndHeader(sheet, rowNum, 'ReviewNote', p.reviewNote);
  return jsonResponse(true, 'Quiz status set to "' + p.reviewStatus + '".');
}

function apiPublishQuiz(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  setCellByRowAndHeader(sheet, rowNum, 'ReviewStatus', 'Published');
  setCellByRowAndHeader(sheet, rowNum, 'Active', true);
  return jsonResponse(true, 'Quiz published. Students can now see it.');
}

function apiUnpublishQuiz(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  setCellByRowAndHeader(sheet, rowNum, 'ReviewStatus', 'Approved');
  setCellByRowAndHeader(sheet, rowNum, 'Active', false);
  return jsonResponse(true, 'Quiz unpublished. It is hidden from students but keeps its Approved status.');
}

function apiRequestChanges(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['quizName']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  syncQuizSettingsWithTabs();
  var sheet = getSheetSafe('QuizSettings');
  var rowNum = findRowByValue(sheet, 'QuizName', p.quizName);
  if (rowNum === -1) return jsonResponse(false, 'Quiz not found.');
  setCellByRowAndHeader(sheet, rowNum, 'ReviewStatus', 'ChangesRequired');
  setCellByRowAndHeader(sheet, rowNum, 'Active', false);
  setCellByRowAndHeader(sheet, rowNum, 'ReviewNote', p.reviewNote || '');
  return jsonResponse(true, 'Changes requested.');
}


// ======================================================================================
// ADMIN: RESULTS + ANALYTICS
// ======================================================================================

function apiGetAllResults(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var sheet = getOrCreateSheet('Results', RESULTS_HEADERS);
  return jsonResponse(true, 'OK', { results: sheetToObjects(sheet).map(stripRowMeta) });
}

function apiSearchStudentResults(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['query']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var q = String(p.query).toLowerCase();
  var sheet = getSheetSafe('Results');
  var rows = sheetToObjects(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var haystack = (String(r.StudentName) + ' ' + String(r.StudentID) + ' ' + String(r.QuizName)).toLowerCase();
    if (haystack.indexOf(q) !== -1) out.push(stripRowMeta(r));
  }
  return jsonResponse(true, 'OK', { results: out });
}

function apiGetClassAnalytics(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var students = sheetToObjects(getSheetSafe('Students'));
  var results = sheetToObjects(getSheetSafe('Results'));
  var studentClassMap = {}, classCounts = {};
  for (var i = 0; i < students.length; i++) {
    var cls = students[i]['Class'] || 'Unassigned';
    studentClassMap[students[i].StudentID] = cls;
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }
  var classStats = {};
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var cls2 = studentClassMap[r.StudentID] || 'Unassigned';
    if (!classStats[cls2]) classStats[cls2] = { attempts: 0, totalPct: 0, high: -Infinity, low: Infinity };
    var pct = Number(r.Percentage) || 0;
    classStats[cls2].attempts++; classStats[cls2].totalPct += pct;
    classStats[cls2].high = Math.max(classStats[cls2].high, pct); classStats[cls2].low = Math.min(classStats[cls2].low, pct);
  }
  var out = [];
  for (var cls3 in classCounts) {
    var stat = classStats[cls3];
    out.push({
      className: cls3, totalStudents: classCounts[cls3], totalAttempts: stat ? stat.attempts : 0,
      averagePercentage: stat && stat.attempts > 0 ? Math.round((stat.totalPct / stat.attempts) * 100) / 100 : 0,
      highestPercentage: stat && stat.attempts > 0 ? stat.high : 0, lowestPercentage: stat && stat.attempts > 0 ? stat.low : 0
    });
  }
  return jsonResponse(true, 'OK', { classAnalytics: out });
}

function apiGetQuizAnalytics(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var results = sheetToObjects(getSheetSafe('Results'));
  var stats = {};
  for (var i = 0; i < results.length; i++) {
    var r = results[i]; var name = r.QuizName;
    if (!stats[name]) stats[name] = { attempts: 0, totalPct: 0, high: -Infinity, low: Infinity };
    var pct = Number(r.Percentage) || 0;
    stats[name].attempts++; stats[name].totalPct += pct;
    stats[name].high = Math.max(stats[name].high, pct); stats[name].low = Math.min(stats[name].low, pct);
  }
  var out = [];
  for (var quizName in stats) {
    var s = stats[quizName];
    out.push({
      quizName: quizName, totalAttempts: s.attempts, averagePercentage: s.attempts > 0 ? Math.round((s.totalPct / s.attempts) * 100) / 100 : 0,
      highestPercentage: s.attempts > 0 ? s.high : 0, lowestPercentage: s.attempts > 0 ? s.low : 0
    });
  }
  return jsonResponse(true, 'OK', { quizAnalytics: out });
}


// ======================================================================================
// ADMIN: ANNOUNCEMENTS
// ======================================================================================

function apiCreateAnnouncement(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['title', 'message']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getOrCreateSheet('Announcements', ANNOUNCEMENTS_HEADERS);
  var id = generateId('ANN');
  sheet.appendRow([id, p.title, p.message, formatDate(new Date()), p.status || 'Active']);
  return jsonResponse(true, 'Announcement created.', { announcementId: id });
}

function apiUpdateAnnouncement(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['announcementId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Announcements');
  var rowNum = findRowByValue(sheet, 'AnnouncementID', p.announcementId);
  if (rowNum === -1) return jsonResponse(false, 'Announcement not found.');
  if (!isEmpty(p.title)) setCellByRowAndHeader(sheet, rowNum, 'Title', p.title);
  if (!isEmpty(p.message)) setCellByRowAndHeader(sheet, rowNum, 'Message', p.message);
  if (!isEmpty(p.status)) setCellByRowAndHeader(sheet, rowNum, 'Status', p.status);
  return jsonResponse(true, 'Announcement updated.');
}

function apiDeleteAnnouncement(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['announcementId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Announcements');
  var rowNum = findRowByValue(sheet, 'AnnouncementID', p.announcementId);
  if (rowNum === -1) return jsonResponse(false, 'Announcement not found.');
  sheet.deleteRow(rowNum);
  return jsonResponse(true, 'Announcement deleted.');
}

function apiGetAnnouncements(p) {
  var sheet = getOrCreateSheet('Announcements', ANNOUNCEMENTS_HEADERS);
  var rows = sheetToObjects(sheet).map(stripRowMeta);
  var authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && requireAdmin(p).ok;
  if (!authed) rows = rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  return jsonResponse(true, 'OK', { announcements: rows });
}


// ======================================================================================
// ADMIN: CONTACTS (NEW)
// ======================================================================================

function apiGetContacts(p) {
  var sheet = getOrCreateSheet('Contacts', CONTACTS_HEADERS);
  var rows = sheetToObjects(sheet).map(stripRowMeta);
  var authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && requireAdmin(p).ok;
  if (!authed) rows = rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  return jsonResponse(true, 'OK', { contacts: rows });
}

function apiCreateContact(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['name']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getOrCreateSheet('Contacts', CONTACTS_HEADERS);
  var id = generateId('CON');
  sheet.appendRow([id, p.name, p.role || '', p.phone || '', p.whatsapp || '', p.email || '', p.status || 'Active']);
  return jsonResponse(true, 'Contact created.', { contactId: id });
}

function apiUpdateContact(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['contactId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Contacts');
  var rowNum = findRowByValue(sheet, 'ContactID', p.contactId);
  if (rowNum === -1) return jsonResponse(false, 'Contact not found.');
  if (!isEmpty(p.name)) setCellByRowAndHeader(sheet, rowNum, 'Name', p.name);
  if (!isEmpty(p.role)) setCellByRowAndHeader(sheet, rowNum, 'Role', p.role);
  if (!isEmpty(p.phone)) setCellByRowAndHeader(sheet, rowNum, 'Phone', p.phone);
  if (!isEmpty(p.whatsapp)) setCellByRowAndHeader(sheet, rowNum, 'WhatsApp', p.whatsapp);
  if (!isEmpty(p.email)) setCellByRowAndHeader(sheet, rowNum, 'Email', p.email);
  if (!isEmpty(p.status)) setCellByRowAndHeader(sheet, rowNum, 'Status', p.status);
  return jsonResponse(true, 'Contact updated.');
}

function apiDeleteContact(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['contactId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Contacts');
  var rowNum = findRowByValue(sheet, 'ContactID', p.contactId);
  if (rowNum === -1) return jsonResponse(false, 'Contact not found.');
  sheet.deleteRow(rowNum);
  return jsonResponse(true, 'Contact deleted.');
}


// ======================================================================================
// ADMIN: ADMIN MANAGEMENT (Super Admin only) + own profile (NEW)
// ======================================================================================

function apiGetAdmins(p) {
  var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response;
  var sheet = getOrCreateSheet('Admins', ADMINS_HEADERS);
  var rows = sheetToObjects(sheet).map(function (r) { var c = stripRowMeta(r); delete c.Password; return c; });
  return jsonResponse(true, 'OK', { admins: rows });
}

function apiCreateAdmin(p) {
  var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['name', 'email', 'password']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet('Admins', ADMINS_HEADERS);
    if (findRowByValue(sheet, 'Email', p.email) !== -1) return jsonResponse(false, 'An admin with this email already exists.');
    var id = generateId('ADM');
    var permissions = Array.isArray(p.permissions) ? p.permissions.join(',') : (p.permissions || '');
    sheet.appendRow([id, p.name, p.email, p.password, p.role || 'Admin', ADMIN_STATUS.PENDING, p.photo || '', permissions]);
    return jsonResponse(true, 'Admin created. It is Pending until approved.', { adminId: id });
  } finally {
    lock.releaseLock();
  }
}

function apiApproveAdmin(p) { var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response; return setAdminStatusInternal(p.adminId, ADMIN_STATUS.ACTIVE); }
function apiRejectAdmin(p) { var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response; return setAdminStatusInternal(p.adminId, ADMIN_STATUS.REJECTED); }
function apiSetAdminStatus(p) {
  var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId', 'status']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  return setAdminStatusInternal(p.adminId, p.status);
}
function setAdminStatusInternal(adminId, status) {
  if (isEmpty(adminId)) return jsonResponse(false, 'adminId is required.');
  var sheet = getSheetSafe('Admins');
  var rowNum = findRowByValue(sheet, 'AdminID', adminId);
  if (rowNum === -1) return jsonResponse(false, 'Admin not found.');
  setCellByRowAndHeader(sheet, rowNum, 'Status', status);
  return jsonResponse(true, 'Admin status updated to "' + status + '".');
}

function apiUpdateAdminPermissions(p) {
  var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  var sheet = getSheetSafe('Admins');
  var rowNum = findRowByValue(sheet, 'AdminID', p.adminId);
  if (rowNum === -1) return jsonResponse(false, 'Admin not found.');
  var permissions = Array.isArray(p.permissions) ? p.permissions.join(',') : (p.permissions || '');
  setCellByRowAndHeader(sheet, rowNum, 'Permissions', permissions);
  if (!isEmpty(p.role)) setCellByRowAndHeader(sheet, rowNum, 'Role', p.role);
  return jsonResponse(true, 'Permissions updated.');
}

function apiRemoveAdmin(p) {
  var auth = requireSuperAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adminId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  if (auth.admin.AdminID === p.adminId) return jsonResponse(false, 'You cannot remove your own account while logged in as it.');
  var sheet = getSheetSafe('Admins');
  var rowNum = findRowByValue(sheet, 'AdminID', p.adminId);
  if (rowNum === -1) return jsonResponse(false, 'Admin not found.');
  sheet.deleteRow(rowNum);
  return jsonResponse(true, 'Admin removed.');
}

// Any authenticated admin can update their own name / photo / password.
function apiUpdateAdminProfile(p) {
  var auth = requireAdmin(p); if (!auth.ok) return auth.response;
  var sheet = getSheetSafe('Admins');
  var rowNum = findRowByValue(sheet, 'Email', auth.admin.Email);
  if (rowNum === -1) return jsonResponse(false, 'Admin not found.');
  if (!isEmpty(p.name)) setCellByRowAndHeader(sheet, rowNum, 'Name', p.name);
  if (!isEmpty(p.photo)) setCellByRowAndHeader(sheet, rowNum, 'Photo', p.photo);
  if (!isEmpty(p.newPassword)) setCellByRowAndHeader(sheet, rowNum, 'Password', p.newPassword);
  return jsonResponse(true, 'Profile updated.');
}
