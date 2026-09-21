(function () {
  const planner = window.PLPPlanner;
  const toast = document.getElementById('toast');
  let toastTimeout;

  window.notice = function notice(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
  };

  function paintControls(state = planner.getState()) {
    const freshButton = document.getElementById('startFresh');
    const hideButton = document.getElementById('hideCustom');
    if (freshButton) freshButton.textContent = state.freshMode ? 'Afficher l’exemple' : 'Partir de zéro';
    if (hideButton) hideButton.textContent = state.hideFlexible ? 'Afficher flexible' : 'Masquer flexible';
  }

  document.getElementById('startFresh')?.addEventListener('click', () => {
    const nextValue = !planner.getState().freshMode;
    planner.setFreshMode(nextValue);
    notice(nextValue ? 'Le planning exemple est masqué.' : 'Le planning exemple est affiché.');
  });

  document.getElementById('hideCustom')?.addEventListener('click', () => {
    const nextValue = !planner.getState().hideFlexible;
    planner.setHideFlexible(nextValue);
    notice(nextValue ? 'Les plages flexibles sont masquées.' : 'Les plages flexibles sont affichées.');
  });

  document.getElementById('clearCustom')?.addEventListener('click', () => {
    if (!planner.getState().events.length) {
      notice('Aucune plage à vider.');
      return;
    }
    planner.clearEvents();
    notice('Toutes vos plages ajoutées ont été retirées.');
  });

  document.getElementById('optimize')?.addEventListener('click', () => {
    const flexible = planner.visibleEvents().filter((event) => event.flex === 'flexible').length;
    notice(flexible ? `${flexible} plage${flexible > 1 ? 's' : ''} flexible${flexible > 1 ? 's' : ''} prête${flexible > 1 ? 's' : ''} à être déplacée.` : 'Ajoutez une plage flexible pour laisser PLP réorganiser votre semaine.');
  });

  document.getElementById('addEvent')?.addEventListener('click', () => {
    const nameInput = document.getElementById('eventName');
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      notice('Donnez un nom à cette plage.');
      return;
    }
    if (!start || !end || end <= start) {
      notice('Vérifiez les heures de début et de fin.');
      return;
    }
    planner.addEvent({
      name,
      start,
      end,
      day: document.getElementById('eventDay').value,
      flex: document.getElementById('eventFlex').value,
      type: document.getElementById('eventType').value,
      source: 'manual',
    });
    nameInput.value = '';
    notice(`« ${name} » a été ajouté à votre planning.`);
  });

  document.getElementById('connectZimbra')?.addEventListener('click', () => {
    window.open('https://webmail.unicaen.fr', '_blank', 'noopener,noreferrer');
    notice('Zimbra Unicaen s’ouvre dans un nouvel onglet.');
  });

  const imageInput = document.getElementById('scheduleImage');
  const preview = document.getElementById('photoPreview');
  const photoState = document.getElementById('photoState');
  const progress = document.getElementById('ocrProgress');
  const progressBar = document.getElementById('ocrProgressBar');
  let ocrLoader;

  function loadOcr() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (ocrLoader) return ocrLoader;
    ocrLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error('OCR indisponible'));
      document.head.appendChild(script);
    });
    return ocrLoader;
  }

  async function recognizeSchedule(file, onProgress) {
    const Tesseract = await loadOcr();
    if (!Tesseract.createWorker) return { result: await Tesseract.recognize(file, 'fra', { logger: onProgress }), worker: null, Tesseract };
    const worker = await Tesseract.createWorker('fra', Tesseract.OEM?.LSTM_ONLY ?? 1, { logger: onProgress });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM?.SPARSE_TEXT || '11', preserve_interword_spaces: '1' });
      return { result: await worker.recognize(file, {}, { text: true, blocks: true, tsv: true }), worker, Tesseract };
    } catch (error) {
      await worker.terminate();
      throw error;
    }
  }

  function toTime(minutes) {
    const hour = Math.floor(minutes / 60) % 24;
    return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function parseScheduleText(text) {
    const days = [['Lundi', 'lundi', 'lun'], ['Mardi', 'mardi', 'mar'], ['Mercredi', 'mercredi', 'mer'], ['Jeudi', 'jeudi', 'jeu'], ['Vendredi', 'vendredi', 'ven'], ['Samedi', 'samedi', 'sam'], ['Dimanche', 'dimanche', 'dim']];
    let currentDay = 'Mardi';
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
      const day = days.find((entry) => line.toLowerCase().includes(entry[1]) || line.toLowerCase().includes(entry[2]));
      if (day) currentDay = day[0];
      const match = line.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})\s*(?:-|–|—|à|a)\s*(\d{1,2})\s*[:hH.]\s*(\d{2})/);
      if (!match) return [];
      const start = Number(match[1]) * 60 + Number(match[2]);
      const end = Number(match[3]) * 60 + Number(match[4]);
      const rawName = line.replace(match[0], '').replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\.?\b/ig, '').replace(/^[-–—:|\s]+|[-–—:|\s]+$/g, '').trim();
      const name = (window.cleanOcrWords?.([{ text: rawName, confidence: 100 }]) || rawName || 'Cours importé').slice(0, 70);
      return end > start ? [{ name, day: currentDay, start: toTime(start), end: toTime(end), type: 'Travail' }] : [];
    });
  }

  async function importPhoto(file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    progress.style.display = 'block';
    progressBar.style.width = '4%';
    photoState.textContent = 'Lecture de la photo en cours…';
    let recognition;
    try {
      recognition = await recognizeSchedule(file, (message) => {
        if (message.status === 'recognizing text' && message.progress) progressBar.style.width = `${Math.max(4, Math.round(message.progress * 100))}%`;
      });
      const pixels = window.parseSchedulePixels ? await window.parseSchedulePixels(file, recognition.result.data, recognition.worker, recognition.Tesseract) : [];
      const layout = window.parseScheduleLayout?.(recognition.result.data) || [];
      const detected = pixels.length >= 3 ? pixels : layout;
      const parsed = detected.length ? detected : parseScheduleText(recognition.result.data.text);
      if (!parsed.length) {
        photoState.textContent = 'Aucun horaire clair détecté. Essayez une photo plus nette ou ajoutez les plages manuellement.';
        notice('Photo lue, mais aucun horaire identifiable.');
        return;
      }
      const importedCount = planner.importEvents(parsed);
      progressBar.style.width = '100%';
      photoState.textContent = `${importedCount} créneau${importedCount > 1 ? 'x' : ''} ajouté${importedCount > 1 ? 's' : ''} à l’EDT. Cliquez sur un créneau pour le corriger.`;
      notice('Le planning issu de la photo a été ajouté à l’EDT.');
    } catch {
      progress.style.display = 'none';
      photoState.textContent = 'La lecture automatique n’a pas pu démarrer. Vos plages restent disponibles en saisie manuelle.';
      notice('Import photo indisponible pour le moment.');
    } finally {
      await recognition?.worker?.terminate();
    }
  }

  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (file) importPhoto(file);
  });

  document.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items || [])].find((candidate) => candidate.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    importPhoto(file);
    notice('Capture collée : lecture du planning en cours.');
  });

  planner.subscribe(paintControls);
  paintControls();
}());
