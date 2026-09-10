/* ============================================================================
   FIREBASE BACKEND — CERTIFICATES & ACHIEVEMENTS
   Implements the full workflow:
     Student attempts quiz -> Eligibility scan detects candidates ->
     Admin reviews in "Certificate Eligibility" -> Admin Approves/Rejects ->
     Admin generates certificates for Approved candidates (bulk or single) ->
     Certificate gets a unique sequential ID + is stored in `certificates`.

   Firebase nodes used (new, additive — nothing existing is touched):
     certificateEligibility/{id}  — candidates detected by the scan
     certificates/{id}            — final generated certificates (kept
                                     alongside the existing simple ones from
                                     firebase-backend-2.js; same node)
     settings/certificateCounter  — atomic counter for ARYQB-YYYY-000001 IDs
     settings/signatures          — Founder/Mentor/Admin name + signature image
   ============================================================================ */

const CERT_TYPES = {
  QuizTopPerformer: 'Quiz Top Performer',
  OverallTopPerformer: 'Overall Top Performer',
  ConsistentStudent: 'Consistent Student',
  SubjectExcellence: 'Subject Excellence',
  QuizCompletion: 'Quiz Completion',
  SpecialAchievement: 'Special Achievement'
};

function fbAchievementText(type, ctx) {
  switch (type) {
    case 'QuizTopPerformer':
      return `${ctx.studentName} has demonstrated outstanding academic performance and secured Rank #${ctx.rank} in "${ctx.quizName}".`;
    case 'OverallTopPerformer':
      return `${ctx.studentName} has demonstrated outstanding overall academic performance across ${ctx.quizzesAttempted} quizzes on ARY Quize Bank, with an average score of ${ctx.percentage}%.`;
    case 'ConsistentStudent':
      return `${ctx.studentName} is recognized for consistent participation, dedication, and commitment to academic learning, having attempted ${ctx.percentage}% of available quizzes.`;
    case 'SubjectExcellence':
      return `${ctx.studentName} has demonstrated exceptional academic excellence in ${ctx.subject}, achieving an average of ${ctx.percentage}%.`;
    case 'QuizCompletion':
      return `${ctx.studentName} has successfully completed "${ctx.quizName}" and demonstrated dedication to learning.`;
    case 'SpecialAchievement':
      return ctx.customMessage || `${ctx.studentName} is recognized for outstanding achievement and valuable contribution to academic excellence.`;
    default:
      return ctx.customMessage || '';
  }
}

/* ---------------------------------------------------------------------------
   ELIGIBILITY SCAN
--------------------------------------------------------------------------- */
async function fbEligibilityExists(studentId, certType, refName) {
  const rows = await fbGetAll('certificateEligibility');
  return rows.some(function (r) { return r.StudentID === studentId && r.CertificateType === certType && r.RefName === (refName || '') && r.Status !== 'Rejected'; });
}

async function fbAddEligibility(row) {
  const dup = await fbEligibilityExists(row.StudentID, row.CertificateType, row.RefName);
  if (dup) return null;
  const id = fbGenerateId('ELG');
  const record = Object.assign({ EligibilityID: id, DetectedDate: fbFormatDate(new Date()), Status: 'PendingReview' }, row);
  await db.ref('certificateEligibility/' + id).set(record);
  return id;
}

async function fbRunEligibilityScan(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;

  const topN = Number(p.topN) || 3;
  const overallThreshold = Number(p.overallThreshold) || 85;
  const overallMinQuizzes = Number(p.overallMinQuizzes) || 3;
  const consistencyThreshold = Number(p.consistencyThreshold) || 90;
  const subjectThreshold = Number(p.subjectThreshold) || 85;

  const students = await fbGetAll('students');
  const results = await fbGetAll('results');
  const quizSettingsSnap = await db.ref('quizSettings').once('value');
  const allQuizSettings = quizSettingsSnap.val() || {};
  const publishedQuizzes = Object.keys(allQuizSettings).filter(function (name) { return fbGetEffectiveReviewStatus(allQuizSettings[name]) === 'Published'; });

  const studentMap = {};
  students.forEach(function (s) { studentMap[s.StudentID] = s; });

  let created = 0;

  // A) Quiz Top Performer — per quiz, rank by percentage (best attempt per student)
  const byQuiz = {};
  results.forEach(function (r) { (byQuiz[r.QuizName] = byQuiz[r.QuizName] || []).push(r); });
  for (const quizName in byQuiz) {
    const bestPerStudent = {};
    byQuiz[quizName].forEach(function (r) {
      if (!bestPerStudent[r.StudentID] || Number(r.Percentage) > Number(bestPerStudent[r.StudentID].Percentage)) bestPerStudent[r.StudentID] = r;
    });
    const ranked = Object.values(bestPerStudent).sort(function (a, b) { return Number(b.Percentage) - Number(a.Percentage); });
    for (let i = 0; i < Math.min(topN, ranked.length); i++) {
      const r = ranked[i];
      const s = studentMap[r.StudentID];
      if (!s) continue;
      const id = await fbAddEligibility({
        StudentID: r.StudentID, StudentName: r.StudentName, StudentPhoto: s.Photo || '',
        CertificateType: 'QuizTopPerformer', RefName: quizName, QuizName: quizName, Subject: r.Subject || '',
        Rank: i + 1, Score: r.Score, TotalQuestions: r.TotalQuestions, Percentage: r.Percentage,
        EligibilityReason: 'Ranked #' + (i + 1) + ' in "' + quizName + '" with ' + r.Percentage + '%.'
      });
      if (id) created++;
    }
  }

  // B) Overall Top Performer — students with >= overallMinQuizzes attempts, ranked by average %
  const byStudent = {};
  results.forEach(function (r) { (byStudent[r.StudentID] = byStudent[r.StudentID] || []).push(r); });
  const overallRanked = Object.keys(byStudent).map(function (sid) {
    const rows = byStudent[sid];
    const avg = rows.reduce(function (sum, r) { return sum + Number(r.Percentage); }, 0) / rows.length;
    return { studentId: sid, attempts: rows.length, avg: Math.round(avg * 100) / 100 };
  }).filter(function (x) { return x.attempts >= overallMinQuizzes && x.avg >= overallThreshold; })
    .sort(function (a, b) { return b.avg - a.avg; });
  for (let i = 0; i < Math.min(topN, overallRanked.length); i++) {
    const x = overallRanked[i];
    const s = studentMap[x.studentId];
    if (!s) continue;
    const id = await fbAddEligibility({
      StudentID: x.studentId, StudentName: s.Name, StudentPhoto: s.Photo || '',
      CertificateType: 'OverallTopPerformer', RefName: '', QuizzesAttempted: x.attempts, Percentage: x.avg, Rank: i + 1,
      EligibilityReason: 'Overall average ' + x.avg + '% across ' + x.attempts + ' quizzes (Rank #' + (i + 1) + ').'
    });
    if (id) created++;
  }

  // C) Consistent Student — attempted >= consistencyThreshold% of published quizzes
  if (publishedQuizzes.length > 0) {
    for (const sid in byStudent) {
      const s = studentMap[sid];
      if (!s) continue;
      const attemptedQuizNames = new Set(byStudent[sid].map(function (r) { return r.QuizName; }));
      const attemptedPublished = publishedQuizzes.filter(function (q) { return attemptedQuizNames.has(q); }).length;
      const pct = Math.round((attemptedPublished / publishedQuizzes.length) * 10000) / 100;
      if (pct >= consistencyThreshold) {
        const id = await fbAddEligibility({
          StudentID: sid, StudentName: s.Name, StudentPhoto: s.Photo || '',
          CertificateType: 'ConsistentStudent', RefName: '', QuizzesAttempted: attemptedPublished, Percentage: pct,
          EligibilityReason: 'Attempted ' + pct + '% (' + attemptedPublished + '/' + publishedQuizzes.length + ') of available quizzes.'
        });
        if (id) created++;
      }
    }
  }

  // D) Subject Excellence — per subject, students with subject-average >= subjectThreshold
  const bySubject = {};
  results.forEach(function (r) {
    if (isEmpty(r.Subject)) return;
    bySubject[r.Subject] = bySubject[r.Subject] || {};
    (bySubject[r.Subject][r.StudentID] = bySubject[r.Subject][r.StudentID] || []).push(r);
  });
  for (const subject in bySubject) {
    for (const sid in bySubject[subject]) {
      const rows = bySubject[subject][sid];
      const avg = Math.round((rows.reduce(function (sum, r) { return sum + Number(r.Percentage); }, 0) / rows.length) * 100) / 100;
      if (avg >= subjectThreshold) {
        const s = studentMap[sid];
        if (!s) continue;
        const id = await fbAddEligibility({
          StudentID: sid, StudentName: s.Name, StudentPhoto: s.Photo || '',
          CertificateType: 'SubjectExcellence', RefName: subject, Subject: subject, Percentage: avg,
          EligibilityReason: subject + ' average of ' + avg + '% across ' + rows.length + ' attempt(s).'
        });
        if (id) created++;
      }
    }
  }

  // E) Quiz Completion — every distinct student+quiz attempt is completion-eligible
  for (const quizName in byQuiz) {
    const seen = new Set();
    byQuiz[quizName].forEach(function (r) { seen.add(r.StudentID); });
    for (const sid of seen) {
      const s = studentMap[sid];
      if (!s) continue;
      const id = await fbAddEligibility({
        StudentID: sid, StudentName: s.Name, StudentPhoto: s.Photo || '',
        CertificateType: 'QuizCompletion', RefName: quizName, QuizName: quizName,
        EligibilityReason: 'Successfully completed "' + quizName + '".'
      });
      if (id) created++;
    }
  }

  return jsonResponse(true, 'Scan complete. ' + created + ' new eligibility record(s) added.', { created: created });
}

async function fbGetCertificateEligibility(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const rows = await fbGetAll('certificateEligibility');
  const filtered = isEmpty(p.status) ? rows : rows.filter(function (r) { return r.Status === p.status; });
  filtered.sort(function (a, b) { return new Date(b.DetectedDate) - new Date(a.DetectedDate); });
  return jsonResponse(true, 'OK', { eligibility: filtered });
}

async function fbUpdateEligibilityStatus(ids, status) {
  const updates = {};
  for (const id of ids) updates[id + '/Status'] = status;
  await db.ref('certificateEligibility').update(updates);
}

async function fbApproveEligibility(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const ids = Array.isArray(p.eligibilityIds) ? p.eligibilityIds : [p.eligibilityId];
  if (!ids.length || !ids[0]) return jsonResponse(false, 'eligibilityId(s) required.');
  await fbUpdateEligibilityStatus(ids, 'Approved');
  return jsonResponse(true, ids.length + ' candidate(s) approved.');
}

async function fbRejectEligibility(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const ids = Array.isArray(p.eligibilityIds) ? p.eligibilityIds : [p.eligibilityId];
  if (!ids.length || !ids[0]) return jsonResponse(false, 'eligibilityId(s) required.');
  await fbUpdateEligibilityStatus(ids, 'Rejected');
  return jsonResponse(true, ids.length + ' candidate(s) rejected.');
}

/* ---------------------------------------------------------------------------
   SEQUENTIAL CERTIFICATE ID  (ARYQB-2026-000001)
--------------------------------------------------------------------------- */
async function fbNextCertificateId() {
  const year = new Date().getFullYear();
  const counterRef = db.ref('settings/certificateCounter/' + year);
  const txResult = await counterRef.transaction(function (current) { return (current || 0) + 1; });
  const n = txResult.snapshot.val();
  return 'ARYQB-' + year + '-' + String(n).padStart(6, '0');
}

/* ---------------------------------------------------------------------------
   GENERATE CERTIFICATES (from Approved eligibility, bulk-capable)
--------------------------------------------------------------------------- */
async function fbGenerateCertificatesFromEligibility(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const ids = Array.isArray(p.eligibilityIds) ? p.eligibilityIds : [p.eligibilityId];
  if (!ids.length || !ids[0]) return jsonResponse(false, 'eligibilityId(s) required.');

  const sig = await fbGetSignaturesInternal();
  const generated = [];

  for (const eligId of ids) {
    const snap = await db.ref('certificateEligibility/' + eligId).once('value');
    const elig = snap.val();
    if (!elig || elig.Status !== 'Approved') continue;

    const certId = await fbNextCertificateId();
    const ctx = {
      studentName: elig.StudentName, quizName: elig.QuizName || '', subject: elig.Subject || '',
      rank: elig.Rank || '', percentage: elig.Percentage || '', quizzesAttempted: elig.QuizzesAttempted || '',
      customMessage: p.customMessage || ''
    };
    const record = {
      CertificateID: certId, StudentID: elig.StudentID, StudentName: elig.StudentName, StudentPhoto: elig.StudentPhoto || '',
      CertificateType: elig.CertificateType, CertificateTitle: p.certificateTitle || 'Certificate of Achievement',
      AchievementText: p.customAchievementText || fbAchievementText(elig.CertificateType, ctx),
      QuizName: elig.QuizName || '', Subject: elig.Subject || '', Rank: elig.Rank || '',
      Score: elig.Score || '', TotalQuestions: elig.TotalQuestions || '', Percentage: elig.Percentage || '',
      FounderName: sig.founderName || '', MentorName: p.mentorName || sig.mentorName || '', AdminName: p.adminName || auth.admin.Name,
      IssuedDate: fbFormatDate(new Date()), Status: 'Generated', EligibilityID: eligId
    };
    await db.ref('certificates/' + certId).set(record);
    await db.ref('certificateEligibility/' + eligId).update({ Status: 'Generated', CertificateID: certId });
    generated.push(record);
  }

  return jsonResponse(true, generated.length + ' certificate(s) generated.', { certificates: generated });
}

/* ---------------------------------------------------------------------------
   VERIFICATION (public — no admin auth required)
--------------------------------------------------------------------------- */
async function fbVerifyCertificate(p) {
  var missing = validateRequired(p, ['certificateId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const snap = await db.ref('certificates/' + p.certificateId).once('value');
  const cert = snap.val();
  if (!cert) return jsonResponse(false, 'Certificate Not Found or Invalid.');
  return jsonResponse(true, 'VERIFIED – ARY QUIZ BANK', { certificate: cert });
}

/* ---------------------------------------------------------------------------
   SIGNATURES (Founder / Mentor / Admin) — settings/signatures
--------------------------------------------------------------------------- */
async function fbGetSignaturesInternal() {
  const snap = await db.ref('settings/signatures').once('value');
  return snap.val() || {};
}
async function fbGetSignatures(p) {
  const sig = await fbGetSignaturesInternal();
  return jsonResponse(true, 'OK', { signatures: sig });
}
async function fbSaveSignatures(p) {
  const auth = await fbRequireSuperAdmin(p); if (!auth.ok) return auth.response;
  const updates = {};
  ['founderName', 'founderSignature', 'mentorName', 'mentorSignature', 'adminSignature'].forEach(function (k) {
    if (!isEmpty(p[k])) updates[k.charAt(0).toUpperCase() + k.slice(1)] = p[k];
  });
  await db.ref('settings/signatures').update(updates);
  return jsonResponse(true, 'Signatures updated.');
}

/* ---------------------------------------------------------------------------
   REGISTER ACTIONS
--------------------------------------------------------------------------- */
Object.assign(FIREBASE_ACTIONS, {
  runEligibilityScan: fbRunEligibilityScan,
  getCertificateEligibility: fbGetCertificateEligibility,
  approveEligibility: fbApproveEligibility,
  rejectEligibility: fbRejectEligibility,
  generateCertificatesFromEligibility: fbGenerateCertificatesFromEligibility,
  verifyCertificate: fbVerifyCertificate,
  getSignatures: fbGetSignatures,
  saveSignatures: fbSaveSignatures
});
