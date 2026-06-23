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

  // Helper function to deduplicate references
  // Deduplicates using the right-hand side (after '->') as the key when available
  // This treats lines with the same translated name (and any bracketed metadata) as duplicates
  function deduplicateReferences(referencesText) {
    if (!referencesText || typeof referencesText !== 'string' || !referencesText.trim()) return '';

    // Normalize line endings then split into non-empty trimmed lines
    const normalizedText = referencesText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const entries = normalizedText.split(/\n+/).map(e => e.trim()).filter(Boolean);

    const seen = new Set();
    const deduped = [];

    for (const entry of entries) {
      // Try to extract the translated part after '->'. If not present, use the whole line.
      const arrowMatch = entry.match(/->\s*(.+)$/);
      const keyPart = arrowMatch ? arrowMatch[1].trim() : entry;

      // Normalize comparison key (case-insensitive)
      const key = keyPart.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    }

    // Sort deduped entries by the RHS (after '->') to make duplicates/near-duplicates easier to spot
    const getSortKey = (line) => {
      const m = line.match(/->\s*(.+)$/);
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
  if(modelSelect) {
    axios.get('/models').then(res => {
      if(res.data.models) {
        modelSelect.innerHTML = '';
        res.data.models.forEach(m => {
          const o = document.createElement('option'); o.value = m; o.textContent = m; modelSelect.appendChild(o);
        });
        restoreConfig();
      }
    }).catch(()=>{ modelSelect.innerHTML = '<option>No models</option>'; });
  }

  // Populate saved titles from server
  refreshSavedTitles();
  restoreConfig();

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
      translateBtn.disabled = true; if(cancelBtn) cancelBtn.disabled = false;
      const payload = {
        title: titleInput ? titleInput.value : '',
        input_text: inputArea ? inputArea.value : '',
        target_lang: document.getElementById('lang') ? document.getElementById('lang').value : '',
        model: modelSelect ? modelSelect.value : '',
        references: refsArea ? refsArea.value : '',
        prompt_file: document.getElementById('prompt') ? document.getElementById('prompt').value : ''
      };
      showLoading('Translating...');
      axios.post('/translate_async', payload).then(res=>{
        const jobId = res.data.job_id;
        currentJob = jobId;
        const poll = setInterval(()=>{
          axios.get(`/translate_status/${jobId}`).then(s=>{
            const status = s.data.status;
            if(status === 'completed' || status === 'cancelled' || status === 'error'){
              clearInterval(poll);
              axios.get(`/translate_result/${jobId}`).then(r=>{
                if(r.data.translated && outputArea) outputArea.value = r.data.translated;
                const recs = r.data.recommendations || '';
                if(recommendationsArea) recommendationsArea.value = recs;
                if(recs.trim()){
                  alert('Recommended references were found. Review and edit them before adding to the references field.');
                }
                hideLoading();
              }).catch(e=>{ alert('Result error: ' + (e.response?.data?.error||e.message)); });
              translateBtn.disabled = false; if(cancelBtn) cancelBtn.disabled = true; currentJob = null;
            }
          }).catch(()=>{});
        }, 1000);
      }).catch(err=>{ alert('Error: ' + (err.response?.data?.error || err.message)); translateBtn.disabled = false; if(cancelBtn) cancelBtn.disabled = true; currentJob = null; });
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
      alert('Please enter a title before saving recommendations.');
      return;
    }
    const existing = refsArea ? refsArea.value.trim() : '';
    const combined = existing ? `${existing}\n${recommendedText.trim()}` : recommendedText.trim();
    const dedupedCombined = deduplicateReferences(combined);
    if(refsArea) refsArea.value = dedupedCombined;
    if(recommendationsArea) recommendationsArea.value = ''; // Clear recommendations box after successful addition
    saveRefsIfTitle(dedupedCombined);
    alert('Recommended references saved and duplicates removed.');
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
      e.preventDefault(); // Prevents page reload if button accidentally acts as a form submit
      if(!recommendationsArea || !refsArea) return;
      
      const recommendationText = recommendationsArea.value.trim();
      if(!recommendationText){
        alert('No recommendation text available to add.');
        return;
      }
      
      const currentRefs = refsArea.value.trim();
      const newRefs = currentRefs ? `${currentRefs}\n${recommendationText}` : recommendationText;
      const dedupedRefs = deduplicateReferences(newRefs);
      
      refsArea.value = dedupedRefs;
      recommendationsArea.value = ''; // Clear out applied recommendations to provide feedback it successfully worked
      
      saveRefsIfTitle(dedupedRefs);
      alert('Recommendation text has been merged into novel references. Duplicates have been removed.');
    });
  }

  // Save chapter
  if(saveBtn) {
    saveBtn.addEventListener('click', ()=>{
      const title = titleInput ? titleInput.value.trim() : '';
      const content = outputArea ? outputArea.value : '';
      if(!title || !content){ alert('Title and translated content are required to save.'); return; }

      const doSave = (chapter, overwrite=false) => {
        axios.post('/save_chapter', {title: title, chapter: chapter, content: content, overwrite: overwrite})
          .then(res=>{
            if(res.data.path) alert('Saved: ' + res.data.path);
            else alert('Saved.');
            refreshSavedTitles();
          })
          .catch(err=>{
            if(err.response?.status === 409 && err.response?.data?.error === 'already_exists'){
              const confirmOverwrite = window.confirm(err.response.data.message + '\n\nOverwrite it?');
              if(confirmOverwrite) doSave(chapter, true);
              return;
            }
            alert('Save failed: ' + (err.response?.data?.error || err.message));
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
});
