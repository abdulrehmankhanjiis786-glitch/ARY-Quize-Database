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
const EMAIL_RELAY_URL = "https://script.google.com/macros/s/AKfycbxBSJy-6Nr0X6w5PfJw12Rrz7izDTeQyg1GR8BuhEgXSFW9HCFR8ljb-HWE5FxcWVqS/exec";
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

/* ---------------------------------------------------------------------------
   EMAIL CENTER — resolve an audience selector into {email,name} recipients,
   then relay through the same Apps Script mail service.
   Audience types: 'one' | 'multiple' | 'all' | 'class' | 'topPerformers' |
                   'eligibleCandidates' | 'approvedCandidates'
--------------------------------------------------------------------------- */
async function fbResolveEmailAudience(p) {
  const students = await fbGetAll('students');
  const byId = {}; students.forEach(function (s) { byId[s.StudentID] = s; });

  switch (p.audienceType) {
    case 'one':
    case 'multiple': {
      const ids = Array.isArray(p.studentIds) ? p.studentIds : [p.studentIds];
      return ids.map(function (id) { return byId[id]; }).filter(Boolean).map(function (s) { return { email: s.Email, name: s.Name }; });
    }
    case 'all':
      return students.map(function (s) { return { email: s.Email, name: s.Name }; });
    case 'class':
      if (isEmpty(p.className)) return [];
      return students.filter(function (s) { return String(s.Class).toLowerCase() === String(p.className).toLowerCase(); })
        .map(function (s) { return { email: s.Email, name: s.Name }; });
    case 'topPerformers': {
      const results = await fbGetAll('results');
      const byStudent = {};
      results.forEach(function (r) { (byStudent[r.StudentID] = byStudent[r.StudentID] || []).push(r); });
      const ranked = Object.keys(byStudent).map(function (sid) {
        const rows = byStudent[sid];
        const avg = rows.reduce(function (sum, r) { return sum + Number(r.Percentage); }, 0) / rows.length;
        return { sid: sid, avg: avg };
      }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, Number(p.topN) || 10);
      return ranked.map(function (x) { return byId[x.sid]; }).filter(Boolean).map(function (s) { return { email: s.Email, name: s.Name }; });
    }
    case 'eligibleCandidates':
    case 'approvedCandidates': {
      const status = p.audienceType === 'eligibleCandidates' ? 'PendingReview' : 'Approved';
      const elig = (await fbGetAll('certificateEligibility')).filter(function (r) { return r.Status === status; });
      const seen = new Set(); const out = [];
      elig.forEach(function (r) {
        if (seen.has(r.StudentID)) return; seen.add(r.StudentID);
        const s = byId[r.StudentID]; if (s) out.push({ email: s.Email, name: s.Name });
      });
      return out;
    }
    default:
      return [];
  }
}

async function fbSendBulkEmail(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['audienceType', 'subject', 'message']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));

  const recipients = await fbResolveEmailAudience(p);
  if (recipients.length === 0) return jsonResponse(false, 'No matching recipients found for that audience.');

  return fbRelayCall('sendBulkEmail', { recipients: recipients, subject: p.subject, message: p.message });
}

async function fbPreviewEmailAudience(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const recipients = await fbResolveEmailAudience(p);
  return jsonResponse(true, 'OK', { count: recipients.length, recipients: recipients });
}

Object.assign(FIREBASE_ACTIONS, {
  sendResultEmail: fbSendResultEmail,
  sendReportEmail: fbSendReportEmail,
  sendBulkEmail: fbSendBulkEmail,
  previewEmailAudience: fbPreviewEmailAudience
});
