/* ============================================================================
   FIREBASE BACKEND — CONTENT MODULE
   Gallery, Advertisements, FAQs and site Branding.
   Loads after firebase-backend.js / firebase-backend-2.js and extends the
   same FIREBASE_ACTIONS map. Uses the same fbRequireAdmin / fbGenerateId /
   fbFormatDate / fbGetAll / jsonResponse helpers already defined there.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   GALLERY
   Node: gallery/{galleryId} -> { GalleryID, Title, ImageUrl, Category,
   Caption, SortOrder, Status, CreatedDate }
--------------------------------------------------------------------------- */
async function fbGetGallery(p) {
  const rows = await fbGetAll('gallery');
  const authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && (await fbRequireAdmin(p)).ok;
  const out = authed ? rows : rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  out.sort(function (a, b) { return (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0); });
  return jsonResponse(true, 'OK', { gallery: out });
}

async function fbCreateGalleryItem(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['title', 'imageUrl']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const id = fbGenerateId('GAL');
  await db.ref('gallery/' + id).set({
    GalleryID: id, Title: p.title, ImageUrl: p.imageUrl, Category: p.category || 'General',
    Caption: p.caption || '', SortOrder: Number(p.sortOrder) || 0, Status: p.status || 'Active',
    CreatedDate: fbFormatDate(new Date())
  });
  return jsonResponse(true, 'Gallery item added.', { galleryId: id });
}

async function fbUpdateGalleryItem(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['galleryId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('gallery/' + p.galleryId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Gallery item not found.');
  const updates = {};
  if (!isEmpty(p.title)) updates.Title = p.title;
  if (!isEmpty(p.imageUrl)) updates.ImageUrl = p.imageUrl;
  if (!isEmpty(p.category)) updates.Category = p.category;
  if (p.caption !== undefined) updates.Caption = p.caption;
  if (p.sortOrder !== undefined) updates.SortOrder = Number(p.sortOrder) || 0;
  if (!isEmpty(p.status)) updates.Status = p.status;
  await ref.update(updates);
  return jsonResponse(true, 'Gallery item updated.');
}

async function fbDeleteGalleryItem(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['galleryId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('gallery/' + p.galleryId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Gallery item not found.');
  await ref.remove();
  return jsonResponse(true, 'Gallery item deleted.');
}

/* ---------------------------------------------------------------------------
   ADVERTISEMENTS
   Node: advertisements/{adId} -> { AdID, Title, ImageUrl, LinkUrl,
   StartDate, EndDate, Status, SortOrder, CreatedDate }
--------------------------------------------------------------------------- */
function fbIsAdInWindow(ad) {
  const now = new Date();
  if (!isEmpty(ad.StartDate) && now < new Date(ad.StartDate)) return false;
  if (!isEmpty(ad.EndDate) && now > new Date(ad.EndDate + 'T23:59:59')) return false;
  return true;
}

async function fbGetAdvertisements(p) {
  const rows = await fbGetAll('advertisements');
  const authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && (await fbRequireAdmin(p)).ok;
  const out = authed ? rows : rows.filter(function (r) {
    return String(r.Status).toLowerCase() === 'active' && fbIsAdInWindow(r);
  });
  out.sort(function (a, b) { return (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0); });
  return jsonResponse(true, 'OK', { advertisements: out });
}

async function fbCreateAdvertisement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['title', 'imageUrl']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const id = fbGenerateId('ADV');
  await db.ref('advertisements/' + id).set({
    AdID: id, Title: p.title, ImageUrl: p.imageUrl, LinkUrl: p.linkUrl || '',
    StartDate: p.startDate || '', EndDate: p.endDate || '', SortOrder: Number(p.sortOrder) || 0,
    Status: p.status || 'Active', CreatedDate: fbFormatDate(new Date())
  });
  return jsonResponse(true, 'Advertisement created.', { adId: id });
}

async function fbUpdateAdvertisement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('advertisements/' + p.adId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Advertisement not found.');
  const updates = {};
  if (!isEmpty(p.title)) updates.Title = p.title;
  if (!isEmpty(p.imageUrl)) updates.ImageUrl = p.imageUrl;
  if (p.linkUrl !== undefined) updates.LinkUrl = p.linkUrl;
  if (p.startDate !== undefined) updates.StartDate = p.startDate;
  if (p.endDate !== undefined) updates.EndDate = p.endDate;
  if (p.sortOrder !== undefined) updates.SortOrder = Number(p.sortOrder) || 0;
  if (!isEmpty(p.status)) updates.Status = p.status;
  await ref.update(updates);
  return jsonResponse(true, 'Advertisement updated.');
}

async function fbDeleteAdvertisement(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['adId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('advertisements/' + p.adId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'Advertisement not found.');
  await ref.remove();
  return jsonResponse(true, 'Advertisement deleted.');
}

/* ---------------------------------------------------------------------------
   FAQS
   Node: faqs/{faqId} -> { FaqID, Question, Answer, Category, SortOrder,
   Status, CreatedDate }
--------------------------------------------------------------------------- */
async function fbGetFaqs(p) {
  const rows = await fbGetAll('faqs');
  const authed = !isEmpty(p.adminEmail) && !isEmpty(p.adminPassword) && (await fbRequireAdmin(p)).ok;
  const out = authed ? rows : rows.filter(function (r) { return String(r.Status).toLowerCase() === 'active'; });
  out.sort(function (a, b) { return (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0); });
  return jsonResponse(true, 'OK', { faqs: out });
}

async function fbCreateFaq(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['question', 'answer']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const id = fbGenerateId('FAQ');
  await db.ref('faqs/' + id).set({
    FaqID: id, Question: p.question, Answer: p.answer, Category: p.category || 'General',
    SortOrder: Number(p.sortOrder) || 0, Status: p.status || 'Active', CreatedDate: fbFormatDate(new Date())
  });
  return jsonResponse(true, 'FAQ added.', { faqId: id });
}

async function fbUpdateFaq(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['faqId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('faqs/' + p.faqId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'FAQ not found.');
  const updates = {};
  if (!isEmpty(p.question)) updates.Question = p.question;
  if (!isEmpty(p.answer)) updates.Answer = p.answer;
  if (!isEmpty(p.category)) updates.Category = p.category;
  if (p.sortOrder !== undefined) updates.SortOrder = Number(p.sortOrder) || 0;
  if (!isEmpty(p.status)) updates.Status = p.status;
  await ref.update(updates);
  return jsonResponse(true, 'FAQ updated.');
}

async function fbDeleteFaq(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  var missing = validateRequired(p, ['faqId']);
  if (missing.length) return jsonResponse(false, 'Missing fields: ' + missing.join(', '));
  const ref = db.ref('faqs/' + p.faqId);
  const snap = await ref.once('value');
  if (!snap.exists()) return jsonResponse(false, 'FAQ not found.');
  await ref.remove();
  return jsonResponse(true, 'FAQ deleted.');
}

/* ---------------------------------------------------------------------------
   BRANDING
   Single node: branding/settings -> { SiteName, Tagline, LogoUrl, FaviconUrl,
   PrimaryColor, AccentColor, ContactEmail, ContactPhone, Address,
   FacebookUrl, InstagramUrl, YoutubeUrl, UpdatedDate }
   Public read (no auth needed), admin-only write.
--------------------------------------------------------------------------- */
async function fbGetBranding(p) {
  const snap = await db.ref('branding/settings').once('value');
  const data = snap.val() || {};
  return jsonResponse(true, 'OK', { branding: data });
}

async function fbUpdateBranding(p) {
  const auth = await fbRequireAdmin(p); if (!auth.ok) return auth.response;
  const updates = {};
  var fields = {
    siteName: 'SiteName', tagline: 'Tagline', logoUrl: 'LogoUrl', faviconUrl: 'FaviconUrl',
    primaryColor: 'PrimaryColor', accentColor: 'AccentColor', contactEmail: 'ContactEmail',
    contactPhone: 'ContactPhone', address: 'Address', facebookUrl: 'FacebookUrl',
    instagramUrl: 'InstagramUrl', youtubeUrl: 'YoutubeUrl'
  };
  for (var key in fields) {
    if (p[key] !== undefined) updates[fields[key]] = p[key];
  }
  updates.UpdatedDate = fbFormatDate(new Date());
  await db.ref('branding/settings').update(updates);
  return jsonResponse(true, 'Branding updated.');
}

/* ---------------------------------------------------------------------------
   REGISTER CONTENT ACTIONS
--------------------------------------------------------------------------- */
Object.assign(FIREBASE_ACTIONS, {
  getGallery: fbGetGallery,
  createGalleryItem: fbCreateGalleryItem,
  updateGalleryItem: fbUpdateGalleryItem,
  deleteGalleryItem: fbDeleteGalleryItem,

  getAdvertisements: fbGetAdvertisements,
  createAdvertisement: fbCreateAdvertisement,
  updateAdvertisement: fbUpdateAdvertisement,
  deleteAdvertisement: fbDeleteAdvertisement,

  getFaqs: fbGetFaqs,
  createFaq: fbCreateFaq,
  updateFaq: fbUpdateFaq,
  deleteFaq: fbDeleteFaq,

  getBranding: fbGetBranding,
  updateBranding: fbUpdateBranding
});
