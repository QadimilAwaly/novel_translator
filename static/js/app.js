document.addEventListener('DOMContentLoaded', function() {
  const modelSelect = document.getElementById('model');
  const savedSelect = document.getElementById('saved');
  const titleInput = document.getElementById('title');
  const refsArea = document.getElementById('refs');
  const translateBtn = document.getElementById('translateBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const inputArea = document.getElementById('input');
  const outputArea = document.getElementById('output');
  const recommendationsArea = document.getElementById('recommendations');
  const applyRecommendationBtn = document.getElementById('applyRecommendationBtn');
  let currentJob = null;
  const saveBtn = document.getElementById('saveBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const inputCharCount = document.getElementById('inputCharCount');
  const outputCharCount = document.getElementById('outputCharCount');
  // --- Toast Notification Helper ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      alert(message);
      return;
    }
    const bgMap = {
      success: 'text-bg-success',
      danger: 'text-bg-danger',
      warning: 'text-bg-warning',
      info: 'text-bg-info'
    };
    const iconMap = {
      success: 'fa-check-circle',
      danger: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    const toastId = 'toast_' + Date.now();
    const toastHtml = `
      <div id="${toastId}" class="toast align-items-center ${bgMap[type] || 'text-bg-info'} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body d-flex align-items-center">
            <i class="fas ${iconMap[type] || 'fa-info-circle'} me-2 fs-5"></i>
            <span>${message}</span>
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    if (window.bootstrap && window.bootstrap.Toast) {
      const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
      bsToast.show();
    }
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  }

  // Initialize Bootstrap tooltips
  if (window.bootstrap && window.bootstrap.Tooltip) {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].forEach(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  }
  // Helper function to deduplicate references
  // Deduplicates using the left-hand side (before '->') as the key when available
  // This treats lines with the same original name (and any bracketed metadata) as duplicates
  function deduplicateReferences(referencesText) {
    if (!referencesText || typeof referencesText !== 'string' || !referencesText.trim()) return '';

    // Normalize line endings then split into non-empty trimmed lines
    const normalizedText = referencesText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const entries = normalizedText.split(/\n+/).map(e => e.trim()).filter(Boolean);

    const seen = new Set();
    const deduped = [];

    for (const entry of entries) {
      // Try to extract the part before '->'. If not present, use the whole line.
      const arrowMatch = entry.match(/^(.+?)\s*->/);
      const keyPart = arrowMatch ? arrowMatch[1].trim() : entry;

      // Normalize comparison key (case-insensitive)
      const key = keyPart.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    }

    // Sort deduped entries by the LHS (before '->') to make duplicates/near-duplicates easier to spot
    const getSortKey = (line) => {
      const m = line.match(/^(.+?)\s*->/);
      return (m ? m[1].trim().toLowerCase() : line.toLowerCase());
    };

    deduped.sort((a, b) => {
      return getSortKey(a).localeCompare(getSortKey(b), undefined, {numeric: true});
    });

    return deduped.join('\n');
  }

  // Update character counters
  function updateCharCounts() {
    if(inputCharCount && inputArea) inputCharCount.textContent = inputArea.value.length.toLocaleString();
    if(outputCharCount && outputArea) outputCharCount.textContent = outputArea.value.length.toLocaleString();
  }

  // Listen for input changes
  if(inputArea) inputArea.addEventListener('input', updateCharCounts);
  if(outputArea) outputArea.addEventListener('input', updateCharCounts);

  // Initial count
  updateCharCounts();

  // Restore config from localStorage
  function restoreConfig(){
    const savedLang = localStorage.getItem('lastLanguage');
    const savedModel = localStorage.getItem('lastModel');
    const savedPrompt = localStorage.getItem('lastPrompt');
    if(savedLang && document.getElementById('lang')) document.getElementById('lang').value = savedLang;
    if(savedPrompt && document.getElementById('prompt')) document.getElementById('prompt').value = savedPrompt;
    if(savedModel && modelSelect) modelSelect.value = savedModel;
  }

  // Save config to localStorage whenever changed
  function saveConfig(){
    if(document.getElementById('lang')) localStorage.setItem('lastLanguage', document.getElementById('lang').value);
    if(modelSelect) localStorage.setItem('lastModel', modelSelect.value);
    if(document.getElementById('prompt')) localStorage.setItem('lastPrompt', document.getElementById('prompt').value);
  }

  // Load models
  let allModels = [];
  
  function populateModels(modelsList) {
    const currentSelection = modelSelect.value;
    modelSelect.innerHTML = '';
    modelsList.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      modelSelect.appendChild(o);
    });
    if (modelsList.includes(currentSelection)) {
      modelSelect.value = currentSelection;
    } else if (modelsList.length > 0) {
      modelSelect.value = modelsList[0];
    }
  }

  if(modelSelect) {
    axios.get('/models').then(res => {
      if(res.data.models) {
        allModels = res.data.models;
        populateModels(allModels);
        restoreConfig();
      }
    }).catch(()=>{ modelSelect.innerHTML = '<option>No models</option>'; });
  }

  const modelFilter = document.getElementById('modelFilter');
  if(modelFilter && modelSelect) {
    modelFilter.addEventListener('input', function() {
      const query = modelFilter.value.toLowerCase().trim();
      const filtered = allModels.filter(m => m.toLowerCase().includes(query));
      populateModels(filtered);
    });
  }

  // Populate saved titles from server
  refreshSavedTitles();
  restoreConfig();

  // Handle collapse state persistence for translation settings
  const collapseEl = document.getElementById('translationSettingsCollapse');
  if (collapseEl) {
    const savedState = localStorage.getItem('translationSettingsCollapsed');
    if (savedState === 'true') {
      collapseEl.classList.remove('show');
      const trigger = document.querySelector('[data-bs-target="#translationSettingsCollapse"]');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.add('collapsed');
      }
    }

    collapseEl.addEventListener('hidden.bs.collapse', function () {
      localStorage.setItem('translationSettingsCollapsed', 'true');
    });
    collapseEl.addEventListener('shown.bs.collapse', function () {
      localStorage.setItem('translationSettingsCollapsed', 'false');
    });
  }

  // bind selection
  if(savedSelect) {
    savedSelect.addEventListener('change', e=>{
      const v = e.target.value;
      if(!v) return;
      if(titleInput) titleInput.value = v;
      axios.get('/load_refs', {params:{title:v}}).then(r=>{ if(refsArea) refsArea.value = r.data.references || ''; });
    });
  }

  // Save config on dropdown changes
  if(document.getElementById('lang')) document.getElementById('lang').addEventListener('change', saveConfig);
  if(modelSelect) modelSelect.addEventListener('change', saveConfig);
  if(document.getElementById('prompt')) document.getElementById('prompt').addEventListener('change', saveConfig);

  if(translateBtn) {
    translateBtn.addEventListener('click', ()=>{
      if(currentJob) return;
      const title = titleInput ? titleInput.value.trim() : '';
      const input = inputArea ? inputArea.value.trim() : '';
      if(!title){
        showToast('Please enter a novel title before translating.', 'warning');
        return;
      }
      if(!input){
        showToast('Please paste source text before translating.', 'warning');
        return;
      }

      translateBtn.disabled = true; if(cancelBtn) cancelBtn.disabled = false;
      const payload = {
        title: title,
        input_text: input,
        target_lang: document.getElementById('lang') ? document.getElementById('lang').value : '',
        model: modelSelect ? modelSelect.value : '',
        references: refsArea ? refsArea.value : '',
        prompt_file: document.getElementById('prompt') ? document.getElementById('prompt').value : ''
      };
      showLoading('Translating novel chapter...');
      axios.post('/translate_async', payload).then(res=>{
        const jobId = res.data.job_id;
        currentJob = jobId;
        const poll = setInterval(()=>{
          axios.get(`/translate_status/${jobId}`).then(s=>{
            const status = s.data.status;
            if(status === 'completed' || status === 'cancelled' || status === 'error'){
              clearInterval(poll);
              axios.get(`/translate_result/${jobId}`).then(r=>{
                if(r.data.translated && outputArea) {
                  outputArea.value = r.data.translated;
                  updateCharCounts();
                }
                const recs = r.data.recommendations || '';
                if(recommendationsArea) recommendationsArea.value = recs;
                if(status === 'completed'){
                  showToast('Translation completed successfully!', 'success');
                  if(recs.trim()){
                    showToast('AI recommendations available below for review.', 'info');
                  }
                } else if(status === 'cancelled'){
                  showToast('Translation was cancelled.', 'warning');
                }
                hideLoading();
              }).catch(e=>{
                showToast('Result error: ' + (e.response?.data?.error || e.message), 'danger');
                hideLoading();
              });
              translateBtn.disabled = false; if(cancelBtn) cancelBtn.disabled = true; currentJob = null;
            }
          }).catch(statusErr=>{
            clearInterval(poll);
            showToast('Status error: ' + (statusErr.response?.data?.error || statusErr.message), 'danger');
            hideLoading();
            translateBtn.disabled = false; if(cancelBtn) cancelBtn.disabled = true; currentJob = null;
          });
        }, 1000);
      }).catch(err=>{
        showToast('Translation error: ' + (err.response?.data?.error || err.message), 'danger');
        hideLoading();
        translateBtn.disabled = false; if(cancelBtn) cancelBtn.disabled = true; currentJob = null;
      });
    });
  }

  if(cancelBtn) {
    cancelBtn.addEventListener('click', ()=>{
      if(!currentJob) return;
      cancelBtn.disabled = true;
      axios.post(`/cancel_translation/${currentJob}`).then(()=>{
        hideLoading();
      }).catch(()=>{ cancelBtn.disabled = false; });
    });
  }

  // Save references when refs area loses focus or title changes
  function saveRefsIfTitle(references){
    if(!titleInput) return;
    const title = titleInput.value.trim();
    if(!title) return;
    const refs = references !== undefined ? references : (refsArea ? refsArea.value : '');
    const dedupedRefs = deduplicateReferences(refs);
    axios.post('/save_refs', {title: title, references: dedupedRefs}).then(()=>{ refreshSavedTitles(); }).catch(()=>{});
  }

  // Bind to global window just in case your HTML calls this inline via onclick="..."
  window.saveRecommendedReferences = function(recommendedText) {
    if(!titleInput) return;
    const title = titleInput.value.trim();
    if(!title) {
      showToast('Please enter a title before saving recommendations.', 'warning');
      return;
    }
    const existing = refsArea ? refsArea.value.trim() : '';
    const combined = existing ? `${existing}\n${recommendedText.trim()}` : recommendedText.trim();
    const dedupedCombined = deduplicateReferences(combined);
    if(refsArea) refsArea.value = dedupedCombined;
    if(recommendationsArea) recommendationsArea.value = '';
    saveRefsIfTitle(dedupedCombined);
    showToast('Recommended references saved and merged.', 'success');
  };

  if(titleInput) {
    titleInput.addEventListener('blur', ()=>{
      const t = titleInput.value.trim();
      if(t) axios.get('/load_refs', {params:{title: t}}).then(r=>{ if(refsArea) refsArea.value = r.data.references || ''; }).catch(()=>{});
    });
  }

  if(refsArea) {
    refsArea.addEventListener('blur', ()=>{ 
      const dedupedRefs = deduplicateReferences(refsArea.value);
      refsArea.value = dedupedRefs;
      saveRefsIfTitle(dedupedRefs);
    });
  }

  if(applyRecommendationBtn) {
    applyRecommendationBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      if(!recommendationsArea || !refsArea) return;
      
      const recommendationText = recommendationsArea.value.trim();
      if(!recommendationText){
        showToast('No recommendation text available to add.', 'warning');
        return;
      }
      
      const currentRefs = refsArea.value.trim();
      const newRefs = currentRefs ? `${currentRefs}\n${recommendationText}` : recommendationText;
      const dedupedRefs = deduplicateReferences(newRefs);
      
      refsArea.value = dedupedRefs;
      recommendationsArea.value = '';
      
      saveRefsIfTitle(dedupedRefs);
      showToast('Recommendations merged into references.', 'success');
    });
  }

  // Save chapter
  // Source & Output Quick Controls
  const clearInputBtn = document.getElementById('clearInputBtn');
  if (clearInputBtn && inputArea) {
    clearInputBtn.addEventListener('click', () => {
      inputArea.value = '';
      updateCharCounts();
      showToast('Source text cleared', 'info');
    });
  }

  const copyOutputBtn = document.getElementById('copyOutputBtn');
  if (copyOutputBtn && outputArea) {
    copyOutputBtn.addEventListener('click', () => {
      if (!outputArea.value.trim()) {
        showToast('No translated text to copy', 'warning');
        return;
      }
      navigator.clipboard.writeText(outputArea.value).then(() => {
        showToast('Translated text copied to clipboard', 'success');
      }).catch(() => {
        showToast('Failed to copy text', 'danger');
      });
    });
  }

  const swapTextBtn = document.getElementById('swapTextBtn');
  if (swapTextBtn && inputArea && outputArea) {
    swapTextBtn.addEventListener('click', () => {
      if (!outputArea.value.trim()) {
        showToast('Output is empty', 'warning');
        return;
      }
      inputArea.value = outputArea.value;
      outputArea.value = '';
      updateCharCounts();
      showToast('Output moved to Source input', 'info');
    });
  }

  const clearRecommendationBtn = document.getElementById('clearRecommendationBtn');
  if (clearRecommendationBtn && recommendationsArea) {
    clearRecommendationBtn.addEventListener('click', () => {
      recommendationsArea.value = '';
      showToast('Recommendations cleared', 'info');
    });
  }

  const resetAllBtn = document.getElementById('resetAllBtn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      if (inputArea) inputArea.value = '';
      if (outputArea) outputArea.value = '';
      if (recommendationsArea) recommendationsArea.value = '';
      if (refsArea) refsArea.value = '';
      if (titleInput) titleInput.value = '';
      if (savedSelect) savedSelect.value = '';
      updateCharCounts();
      showToast('All fields reset', 'info');
    });
  }

  if (inputArea) {
    inputArea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (translateBtn && !translateBtn.disabled) {
          translateBtn.click();
        }
      }
    });
  }

  // Save chapter
  if(saveBtn) {
    saveBtn.addEventListener('click', ()=>{
      const title = titleInput ? titleInput.value.trim() : '';
      const content = outputArea ? outputArea.value : '';
      if(!title || !content){
        showToast('Title and translated content are required to save.', 'warning');
        return;
      }

      const doSave = (chapter, overwrite=false) => {
        axios.post('/save_chapter', {title: title, chapter: chapter, content: content, overwrite: overwrite})
          .then(res=>{
            if(res.data.path) showToast('Chapter saved successfully: ' + res.data.path, 'success');
            else showToast('Chapter saved successfully.', 'success');
            refreshSavedTitles();
          })
          .catch(err=>{
            if(err.response?.status === 409 && err.response?.data?.error === 'already_exists'){
              const confirmOverwrite = window.confirm(err.response.data.message + '\n\nOverwrite it?');
              if(confirmOverwrite) doSave(chapter, true);
              return;
            }
            showToast('Save failed: ' + (err.response?.data?.error || err.message), 'danger');
          });
      };

      axios.get('/latest_chapter', {params:{title: title}}).then(r=>{
        const suggestedChapter = r.data.next_chapter || '1';
        const chapter = window.prompt(`Enter chapter name/number to save:`, suggestedChapter);
        if(!chapter) return;
        doSave(chapter);
      }).catch(()=>{
        const chapter = window.prompt('Enter chapter name/number to save:', '1');
        if(!chapter) return;
        doSave(chapter);
      });
    });
  }

  function refreshSavedTitles(){
    if(!savedSelect) return;
    const currentSelection = savedSelect.value;
    axios.get('/titles').then(r=>{
      const list = r.data.titles || [];
      Array.from(savedSelect.options).slice(1).forEach(o=>o.remove());
      list.forEach(t=>{ const o=document.createElement('option'); o.value=t; o.textContent=t; savedSelect.appendChild(o); });
      savedSelect.value = currentSelection;
    }).catch(()=>{});
  }

  function showLoading(text){ if(loadingOverlay){ loadingText.textContent = text||''; loadingOverlay.classList.remove('d-none'); } }
  function hideLoading(){ if(loadingOverlay){ loadingOverlay.classList.add('d-none'); loadingText.textContent=''; } }

  // --- Compiler JS Logic ---
  const compilerFolder = document.getElementById('compilerFolder');
  const compilerChapterList = document.getElementById('compilerChapterList');
  const compilerTitle = document.getElementById('compilerTitle');
  const compilerAuthor = document.getElementById('compilerAuthor');
  const compileBtn = document.getElementById('compileBtn');
  const compilerSelectAll = document.getElementById('compilerSelectAll');
  const compilerDeselectAll = document.getElementById('compilerDeselectAll');
  const compilerDownloadSection = document.getElementById('compilerDownloadSection');
  const compilerDownloadBtn = document.getElementById('compilerDownloadBtn');
  const compilerCover = document.getElementById('compilerCover');

  function loadCompilerNovels() {
    if(!compilerFolder) return;
    axios.get('/compiler/novels').then(r => {
      const novels = r.data.novels || [];
      compilerFolder.innerHTML = '<option value="">-- Select Folder --</option>';
      novels.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        compilerFolder.appendChild(o);
      });
    }).catch(console.error);
  }
  
  // Load on start
  loadCompilerNovels();
  
  if (compilerFolder) {
    compilerFolder.addEventListener('change', e => {
      const novel = e.target.value;
      compilerDownloadSection.classList.add('d-none');
      
      if (!novel) {
        compilerChapterList.innerHTML = '<div class="text-center text-muted py-4">Select a novel folder first</div>';
        compilerTitle.value = '';
        return;
      }
      
      // Suggest title based on folder name
      let suggestedTitle = novel.replace(/[_-]/g, ' ');
      suggestedTitle = suggestedTitle.replace(/\b\w/g, l => l.toUpperCase());
      compilerTitle.value = suggestedTitle;
      
      compilerChapterList.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';
      
      axios.get('/compiler/chapters', { params: { novel: novel } }).then(r => {
        const chapters = r.data.chapters || [];
        if (chapters.length === 0) {
          compilerChapterList.innerHTML = '<div class="text-center text-warning py-4">No .txt chapters found in this folder</div>';
          return;
        }
        
        compilerChapterList.innerHTML = '';
        chapters.forEach(ch => {
          const id = 'chk_' + ch.replace(/[^a-zA-Z0-9]/g, '_');
          const div = document.createElement('div');
          div.className = 'form-check mb-2';
          div.innerHTML = `
            <input class="form-check-input chapter-checkbox" type="checkbox" value="${ch}" id="${id}" checked>
            <label class="form-check-label" for="${id}">${ch}</label>
          `;
          compilerChapterList.appendChild(div);
        });
      }).catch(err => {
        compilerChapterList.innerHTML = `<div class="text-center text-danger py-4">Error loading chapters: ${err.message}</div>`;
      });
    });
  }
  
  if (compilerSelectAll) {
    compilerSelectAll.addEventListener('click', () => {
      document.querySelectorAll('.chapter-checkbox').forEach(cb => cb.checked = true);
    });
  }
  
  if (compilerDeselectAll) {
    compilerDeselectAll.addEventListener('click', () => {
      document.querySelectorAll('.chapter-checkbox').forEach(cb => cb.checked = false);
    });
  }
  
  if (compileBtn) {
    compileBtn.addEventListener('click', () => {
      const folder = compilerFolder.value;
      const title = compilerTitle.value.trim();
      const author = compilerAuthor.value.trim() || 'Unknown';
      
      if (!folder || !title) {
        alert('Please select a novel folder and enter a title.');
        return;
      }
      
      const selectedCheckboxes = document.querySelectorAll('.chapter-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        alert('Please select at least one chapter to compile.');
        return;
      }
      
      const selectedFiles = Array.from(selectedCheckboxes).map(cb => cb.value);
      
      const formData = new FormData();
      formData.append('novel_dir', folder);
      formData.append('title', title);
      formData.append('author', author);
      formData.append('selected_files', JSON.stringify(selectedFiles));
      
      if (compilerCover && compilerCover.files.length > 0) {
        formData.append('cover_image', compilerCover.files[0]);
      }
      
      compileBtn.disabled = true;
      compileBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Compiling...';
      compilerDownloadSection.classList.add('d-none');
      
      axios.post('/compiler/compile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(r => {
        compileBtn.disabled = false;
        compileBtn.innerHTML = '<i class="fas fa-file-export me-2"></i>Compile EPUB';
        
        if (r.data.success) {
          compilerDownloadBtn.href = r.data.download_url;
          compilerDownloadSection.classList.remove('d-none');
        }
      }).catch(err => {
        compileBtn.disabled = false;
        compileBtn.innerHTML = '<i class="fas fa-file-export me-2"></i>Compile EPUB';
        alert('Compilation failed: ' + (err.response?.data?.error || err.message));
      });
    });
  }
});
