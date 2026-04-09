let wishId = null;
let templateNo = 1;
let templateName = 'Rose Petal';
let photos = [null, null, null, null, null];
let currentShareUrl = '';

const templateNames = {
  1: 'Rose Petal',
  2: 'Midnight Letter',
  3: 'Pastel Dream'
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showStatus(type, message) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.className = `save-status ${type} show`;
  el.textContent = message;
  if (type !== 'saving') {
    setTimeout(() => el.classList.remove('show'), 2500);
  }
}

function updateWishCount() {
  const value = document.getElementById('wishMessage')?.value || '';
  const count = document.getElementById('wishCharCount');
  if (count) count.textContent = `${value.length} / 800 characters`;
}

function updatePhotoProgress() {
  const uploaded = photos.filter(Boolean).length;
  const bar = document.getElementById('overallProgress');
  if (bar) bar.style.width = `${(uploaded / 5) * 100}%`;
}

function goStep(step) {
  document.querySelectorAll('.form-section').forEach((section, index) => {
    section.classList.toggle('active', index === step);
  });
  document.querySelectorAll('.step-pill').forEach((pill, index) => {
    pill.classList.toggle('active', index === step);
    pill.classList.toggle('done', index < step);
  });
  renderPreview();
}

function bindLivePreview() {
  const panel = document.querySelector('.form-panel');
  if (!panel) return;
  panel.addEventListener('input', () => {
    updateWishCount();
    renderPreview();
  });
  panel.addEventListener('change', renderPreview);
}

function buildPhotoSlots() {
  const grid = document.getElementById('photoGrid');
  const captions = document.getElementById('photoCaptions');
  if (!grid || !captions) return;

  grid.innerHTML = '';
  captions.innerHTML = '';

  for (let i = 0; i < 5; i += 1) {
    const slot = document.createElement('label');
    slot.className = 'photo-slot';
    slot.id = `slot-${i}`;
    slot.innerHTML = `<button class="photo-remove" type="button" onclick="removePhoto(event, ${i})">x</button><div class="photo-slot-label">Add photo ${i + 1}</div><input type="file" accept="image/*" id="file-${i}" onchange="uploadPhoto(${i}, this)"/><div class="photo-progress" id="progress-${i}"></div>`;
    slot.addEventListener('click', (event) => {
      if (event.target.closest('.photo-remove')) return;
      const input = document.getElementById(`file-${i}`);
      input?.click();
    });
    grid.appendChild(slot);

    const caption = document.createElement('input');
    caption.type = 'text';
    caption.id = `caption-${i}`;
    caption.maxLength = 50;
    caption.placeholder = `Caption for photo ${i + 1}`;
    captions.appendChild(caption);
  }
}

async function uploadPhoto(index, input) {
  const file = input.files?.[0];
  if (!file) return;

  const slot = document.getElementById(`slot-${index}`);
  const progress = document.getElementById(`progress-${index}`);

  try {
    const result = await API.Upload.uploadPhoto(file, (percent) => {
      if (progress) progress.style.width = `${percent}%`;
    });

    photos[index] = result.secure_url;
    slot?.classList.add('has-photo');

    let img = slot?.querySelector('img');
    if (!img && slot) {
      img = document.createElement('img');
      slot.prepend(img);
    }
    if (img) img.src = result.secure_url;

    if (progress) {
      progress.style.width = '100%';
      setTimeout(() => { progress.style.width = '0%'; }, 800);
    }

    updatePhotoProgress();
    renderPreview();
  } catch (error) {
    console.error('Upload failed:', error);
    alert(error.message || 'Photo upload failed. Please try again.');
  }
}

function removePhoto(event, index) {
  event.stopPropagation();
  photos[index] = null;
  const slot = document.getElementById(`slot-${index}`);
  const img = slot?.querySelector('img');
  if (img) img.remove();
  slot?.classList.remove('has-photo');
  const file = document.getElementById(`file-${index}`);
  if (file) file.value = '';
  updatePhotoProgress();
  renderPreview();
}

function buildDefaultMemories() {
  const group = document.getElementById('memoriesGroup');
  if (!group || group.children.length) return;
  addMemory({ emoji: '*', date: '', title: '', body: '' });
  addMemory({ emoji: '*', date: '', title: '', body: '' });
}

function addMemory(data = {}) {
  const group = document.getElementById('memoriesGroup');
  if (!group || group.children.length >= 4) return;
  const row = document.createElement('div');
  row.className = 'repeat-row memory-row';
  row.innerHTML = `<input type="text" placeholder="*" value="${escapeAttr(data.emoji || '')}" maxlength="2" style="text-align:center;font-size:1.2rem"/><div style="display:flex;flex-direction:column;gap:.4rem"><input type="text" placeholder="Date (e.g. June 2024)" value="${escapeAttr(data.date || '')}" maxlength="30"/><input type="text" placeholder="Memory title" value="${escapeAttr(data.title || '')}" maxlength="50"/><textarea placeholder="Tell the story...">${escapeHtml(data.body || '')}</textarea></div><button class="remove-btn" type="button" onclick="removeMemory(this)">x</button>`;
  group.appendChild(row);
  checkMemoryLimit();
  renderPreview();
}

function removeMemory(button) {
  button.closest('.repeat-row')?.remove();
  checkMemoryLimit();
  renderPreview();
}

function checkMemoryLimit() {
  const count = document.getElementById('memoriesGroup')?.children.length || 0;
  const btn = document.getElementById('addMemoryBtn');
  if (btn) btn.style.display = count >= 4 ? 'none' : 'block';
}

function buildDefaultReasons() {
  const group = document.getElementById('reasonsGroup');
  if (!group || group.children.length) return;
  addReason('The way you laugh with your whole face.');
  addReason('You make ordinary days feel special.');
}

function addReason(text = '') {
  const group = document.getElementById('reasonsGroup');
  if (!group || group.children.length >= 6) return;
  const row = document.createElement('div');
  row.className = 'repeat-row reason-row';
  row.innerHTML = `<input type="text" placeholder="A reason you love her..." value="${escapeAttr(text)}" maxlength="120"/><button class="remove-btn" type="button" onclick="removeReason(this)">x</button>`;
  group.appendChild(row);
  checkReasonLimit();
  renderPreview();
}

function removeReason(button) {
  button.closest('.repeat-row')?.remove();
  checkReasonLimit();
  renderPreview();
}

function checkReasonLimit() {
  const count = document.getElementById('reasonsGroup')?.children.length || 0;
  const btn = document.getElementById('addReasonBtn');
  if (btn) btn.style.display = count >= 6 ? 'none' : 'block';
}

function collectFormData() {
  const memories = Array.from(document.getElementById('memoriesGroup')?.children || []).map((row) => {
    const inputs = row.querySelectorAll('input, textarea');
    return {
      emoji: inputs[0].value.trim(),
      date: inputs[1].value.trim(),
      title: inputs[2].value.trim(),
      body: inputs[3].value.trim()
    };
  }).filter((memory) => memory.title || memory.body);

  const reasons = Array.from(document.getElementById('reasonsGroup')?.children || [])
    .map((row) => row.querySelector('input').value.trim())
    .filter(Boolean);

  const photoCaptions = Array.from({ length: 5 }, (_, index) => {
    const field = document.getElementById(`caption-${index}`);
    return field ? field.value.trim() : '';
  });

  return {
    templateNo,
    templateName,
    occasion: document.getElementById('occasion')?.value || 'birthday',
    gfName: document.getElementById('gfName')?.value.trim() || '',
    gfAge: parseInt(document.getElementById('gfAge')?.value || '', 10) || null,
    gfDob: document.getElementById('gfDob')?.value || null,
    bfName: document.getElementById('bfName')?.value.trim() || '',
    wishDate: document.getElementById('wishDate')?.value || null,
    wishMessage: document.getElementById('wishMessage')?.value.trim() || '',
    memories,
    reasons,
    tags: (document.getElementById('tags')?.value || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    photos: photos.filter(Boolean),
    photoCaptions,
    closingTitle: document.getElementById('closingTitle')?.value.trim() || '',
    closingSubtitle: document.getElementById('closingSubtitle')?.value.trim() || '',
    sectionTitles: {
      wish: document.getElementById('wishSectionTitle')?.value.trim() || '',
      memories: document.getElementById('memoriesSectionTitle')?.value.trim() || '',
      reasons: document.getElementById('reasonsSectionTitle')?.value.trim() || ''
    }
  };
}

function showShareLink(url) {
  document.getElementById('shareLinkInput').value = url;
  document.getElementById('shareBox')?.classList.add('show');
}

async function copyShareLink() {
  if (!currentShareUrl) {
    alert('Save the wish first to generate the share link.');
    return;
  }
  try {
    await navigator.clipboard.writeText(currentShareUrl);
    showStatus('saved', 'Share link copied.');
  } catch (error) {
    alert(currentShareUrl);
  }
}

async function loadWishData() {
  const { wish } = await API.Wishes.get(wishId);
  if (!wish) return;

  templateNo = wish.templateNo || templateNo;
  templateName = wish.templateName || templateName;
  document.getElementById('occasion').value = wish.occasion || 'birthday';
  document.getElementById('gfName').value = wish.gfName || '';
  document.getElementById('gfAge').value = wish.gfAge || '';
  document.getElementById('gfDob').value = wish.gfDob || '';
  document.getElementById('bfName').value = wish.bfName || '';
  document.getElementById('wishDate').value = wish.wishDate || '';
  document.getElementById('wishMessage').value = wish.wishMessage || '';
  document.getElementById('closingTitle').value = wish.closingTitle || '';
  document.getElementById('closingSubtitle').value = wish.closingSubtitle || '';
  document.getElementById('tags').value = (wish.tags || []).join(', ');
  document.getElementById('wishSectionTitle').value = wish.sectionTitles?.wish || '';
  document.getElementById('memoriesSectionTitle').value = wish.sectionTitles?.memories || '';
  document.getElementById('reasonsSectionTitle').value = wish.sectionTitles?.reasons || '';

  currentShareUrl = wish.shareUrl || '';
  if (currentShareUrl) showShareLink(currentShareUrl);

  photos = [null, null, null, null, null];
  (wish.photos || []).slice(0, 5).forEach((url, index) => {
    photos[index] = url;
    const slot = document.getElementById(`slot-${index}`);
    slot?.classList.add('has-photo');
    if (slot) {
      const img = document.createElement('img');
      img.src = url;
      slot.prepend(img);
    }
  });

  (wish.photoCaptions || []).slice(0, 5).forEach((caption, index) => {
    const field = document.getElementById(`caption-${index}`);
    if (field) field.value = caption || '';
  });

  document.getElementById('memoriesGroup').innerHTML = '';
  (wish.memories || []).length ? wish.memories.forEach((memory) => addMemory(memory)) : buildDefaultMemories();
  document.getElementById('reasonsGroup').innerHTML = '';
  (wish.reasons || []).length ? wish.reasons.forEach((reason) => addReason(reason)) : buildDefaultReasons();
  checkMemoryLimit();
  checkReasonLimit();
  updatePhotoProgress();
  updateWishCount();
  renderPreview();
}

async function saveWish() {
  const btn = document.getElementById('saveBtn');
  const text = document.getElementById('saveBtnText');
  const data = collectFormData();
  if (!data.gfName) {
    goStep(0);
    alert('Please enter her name first.');
    return;
  }

  btn.disabled = true;
  text.textContent = 'Saving...';
  showStatus('saving', 'Saving...');

  try {
    let result;
    if (wishId) {
      result = await API.Wishes.update(wishId, data);
    } else {
      result = await API.Wishes.create(data);
      wishId = result.wishId;
      window.history.replaceState({}, '', `?id=${encodeURIComponent(wishId)}&template=${templateNo}&name=${encodeURIComponent(templateName)}`);
    }
    if (result.shareUrl) {
      currentShareUrl = result.shareUrl;
      showShareLink(currentShareUrl);
    } else if (currentShareUrl) {
      showShareLink(currentShareUrl);
    }
    showStatus('saved', 'Saved successfully.');
    renderPreview();
  } catch (error) {
    console.error('Save error:', error);
    showStatus('error', error.message || 'Save failed. Try again.');
  } finally {
    btn.disabled = false;
    text.textContent = 'Save & Get Link';
  }
}

function openPreview() {
  if (!currentShareUrl) {
    alert('Save the wish first. The generated link opens the final page.');
    return;
  }
  window.open(currentShareUrl, '_blank');
}

function renderPreview() {
  const data = collectFormData();
  const iframe = document.getElementById('previewIframe');
  if (!iframe) return;

  const photosHtml = data.photos.length
    ? data.photos.map((url, index) => `<figure class="photo-card"><img src="${escapeAttr(url)}" alt="Photo ${index + 1}" style="display:block;width:100%;height:120px;object-fit:cover">${data.photoCaptions[index] ? `<figcaption style="padding:8px 10px 10px;font-size:12px;color:#725964">${escapeHtml(data.photoCaptions[index])}</figcaption>` : ''}</figure>`).join('')
    : '<div class="empty-block">Your uploaded photos will appear here.</div>';

  const memoriesHtml = data.memories.length
    ? data.memories.map((memory) => `<div class="memory-card" style="padding:12px"><div style="font-weight:700;font-size:13px;margin-bottom:4px">${escapeHtml(memory.emoji || '*')} ${escapeHtml(memory.title || 'Untitled memory')}</div><div style="font-size:11px;color:#8b6f79;margin-bottom:6px">${escapeHtml(memory.date || 'Add a date')}</div><p style="font-size:13px;line-height:1.6">${escapeHtml(memory.body || 'Write a memory to see it here.')}</p></div>`).join('')
    : '<div class="empty-block">Your memories will appear here.</div>';

  const reasonsHtml = data.reasons.length
    ? data.reasons.map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`).join('')
    : '<div class="empty-block">Your reasons will appear here.</div>';

  const tagsHtml = data.tags.map((tag) => `<span class="tag subtle">${escapeHtml(tag)}</span>`).join('');
  const accent = templateNo === 2 ? '#231942' : templateNo === 3 ? '#ff8fab' : '#e63070';
  const bg = templateNo === 2 ? '#f6f1ff' : templateNo === 3 ? '#fff7fb' : '#fff5f8';

  iframe.srcdoc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;font-family:'DM Sans',Arial,sans-serif;background:linear-gradient(180deg,${bg} 0%,#fff 100%);color:#23111a;padding:24px}.sheet{max-width:340px;margin:0 auto;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.06);border-radius:24px;padding:22px;box-shadow:0 18px 48px rgba(35,17,26,.08)}.eyebrow{display:inline-block;padding:6px 10px;border-radius:999px;background:${accent};color:#fff;font-size:11px;letter-spacing:.08em;text-transform:uppercase}h1{font-size:28px;line-height:1.15;margin:16px 0 8px}.sub{color:#725964;font-size:13px;margin-bottom:18px}.section{margin-top:20px}.section h2{font-size:15px;margin:0 0 10px;color:${accent}}.message{line-height:1.7;font-size:14px;white-space:pre-wrap}.grid{display:grid;gap:10px}.tags{display:flex;flex-wrap:wrap;gap:8px}.footer{margin-top:24px;padding-top:18px;border-top:1px solid rgba(0,0,0,.08)}.footer-title{font-size:18px;margin-bottom:6px}.footer-sub{color:#725964;font-size:12px}</style></head><body><div class="sheet"><span class="eyebrow">${escapeHtml(data.occasion || 'birthday')} for ${escapeHtml(data.gfName || 'her')}</span><h1>${escapeHtml(data.gfName || 'Her Name')}</h1><div class="sub">${escapeHtml(data.gfAge ? `${data.gfAge} years young` : 'Made with love')}${data.bfName ? ` from ${escapeHtml(data.bfName)}` : ''}</div><div class="section"><h2>${escapeHtml(data.sectionTitles.wish || 'Your Wish')}</h2><div class="message">${escapeHtml(data.wishMessage || 'Start typing your message and the preview will update here instantly.')}</div></div><div class="section"><h2>Photos</h2><div class="grid">${photosHtml}</div></div><div class="section"><h2>${escapeHtml(data.sectionTitles.memories || 'Memories')}</h2><div class="grid">${memoriesHtml}</div></div><div class="section"><h2>${escapeHtml(data.sectionTitles.reasons || 'Why I Love You')}</h2><div class="tags">${reasonsHtml}${tagsHtml}</div></div><div class="footer"><div class="footer-title">${escapeHtml(data.closingTitle || 'Made just for you')}</div><div class="footer-sub">${escapeHtml(data.closingSubtitle || 'Save this page and share the link when you are ready.')}</div></div></div></body></html>`;
}

window.goStep = goStep;
window.uploadPhoto = uploadPhoto;
window.removePhoto = removePhoto;
window.addMemory = addMemory;
window.removeMemory = removeMemory;
window.addReason = addReason;
window.removeReason = removeReason;
window.saveWish = saveWish;
window.openPreview = openPreview;
window.copyShareLink = copyShareLink;

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await new Promise((resolve) => {
      const existing = Auth.currentUser();
      if (existing) {
        resolve(existing);
        return;
      }
      const unsubscribe = Auth.onAuthChanged((currentUser) => {
        unsubscribe();
        resolve(currentUser);
      });
    });

    if (!user) {
      window.location.href = 'login.html?next=dashboard.html';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    wishId = params.get('id');
    templateNo = parseInt(params.get('template') || '1', 10);
    templateName = params.get('name') || templateNames[templateNo] || 'Rose Petal';

    buildPhotoSlots();
    buildDefaultMemories();
    buildDefaultReasons();
    bindLivePreview();
    goStep(0);
    if (wishId) await loadWishData();
    updateWishCount();
    renderPreview();
  } catch (error) {
    console.error('Edit page init error:', error);
    showStatus('error', error.message || 'Editor failed to load.');
  }
});
