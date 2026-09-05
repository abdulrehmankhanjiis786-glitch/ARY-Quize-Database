/* ============================================================================
   FIREBASE BACKEND — EMAIL (hybrid: Firebase data + Apps Script mail relay)

   Realtime Database has no way to send an email itself, and sending SMTP
   directly from browser JS would mean exposing mail credentials to anyone
   who opens dev tools — not safe. So these two actions do:
     1. Read the student's name/email straight from Firebase (source of truth).
     2. POST just the email/subject/body/attachment to the existing Apps
        Script deployment, which now ONLY relays mail via MailApp — it no
        longer touches Google Sheets at all.

   IMPORTANT: RELAY_KEY below must exactly match EMAIL_RELAY_KEY in Code.gs.
   Change both to your own secret string before going live (the placeholder
   is not secure long-term, just enough to stop random abuse of the /exec URL).
   ============================================================================ */
const EMAIL_RELAY_URL = "https://script.google.com/macros/s/AKfycbwUyx6Cka3OOdUlM8d1fIAG-Y5yrAREbnmdMVu51p57ceEdLQavqApagQjTIzt9s0wZ/exec";
const RELAY_KEY = 'ARY-QB-2026-CHANGE-ME';

async function fbRelayCall(action, params) {
  try {
    const res = await fetch(EMAIL_RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, relayKey: RELAY_KEY, ...params })
    });
    return await res.json();
  } catch (err) {
    return jsonResponse(false, 'Could not reach the mail relay: ' + err.message);
  }
}

async function fbSendResultEmail(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId', 'imageDataUrl']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const student = studentSnap.val();
  if (!student || isEmpty(student.Email)) return jsonResponse(false, 'This student has no registered email on file.');

  return fbRelayCall('sendResultEmail', {
    studentEmail: student.Email, studentName: student.Name, adminName: auth.admin.Name,
    imageDataUrl: p.imageDataUrl, subject: p.subject, message: p.message
  });
}

async function fbSendReportEmail(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['studentId', 'pdfDataUrl']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const studentSnap = await db.ref('students/' + p.studentId).once('value');
  const student = studentSnap.val();
  if (!student || isEmpty(student.Email)) return jsonResponse(false, 'This student has no registered email on file.');

  return fbRelayCall('sendReportEmail', {
    studentEmail: student.Email, studentName: student.Name, adminName: auth.admin.Name,
    pdfDataUrl: p.pdfDataUrl, subject: p.subject, message: p.message
  });
}

Object.assign(FIREBASE_ACTIONS, {
  sendResultEmail: fbSendResultEmail,
  sendReportEmail: fbSendReportEmail
});
