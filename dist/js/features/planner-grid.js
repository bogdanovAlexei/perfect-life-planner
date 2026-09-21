const grid24 = document.querySelector('.grid');
const gridDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const gridLabels = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];

function extractOcrWords(data) {
  if (Array.isArray(data?.words) && data.words.length) return data.words;
  const fromBlocks = (data?.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => (paragraph.lines || []).flatMap((line) => line.words || [])));
  if (fromBlocks.length) return fromBlocks;
  if (typeof data?.tsv !== 'string') return [];
  return data.tsv.split(/\r?\n/).slice(1).map((line) => {
    const cells = line.split('\t');
    if (cells.length < 12 || cells[0] !== '5' || !cells.slice(11).join('\t').trim()) return null;
    const left = Number(cells[6]);
    const top = Number(cells[7]);
    const width = Number(cells[8]);
    const height = Number(cells[9]);
    return { text: cells.slice(11).join('\t').trim(), confidence: Number(cells[10]), bbox: { x0: left, y0: top, x1: left + width, y1: top + height } };
  }).filter(Boolean);
}

function orderOcrWords(words) {
  const lines = [];
  [...words].sort((left, right) => left.y - right.y || left.x - right.x).forEach((word) => {
    const tolerance = Math.max(5, ((word.y1 || word.y) - (word.y0 || word.y)) * 0.7);
    let line = lines.find((candidate) => Math.abs(candidate.y - word.y) <= tolerance);
    if (!line) {
      line = { y: word.y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + item.y, 0) / line.words.length;
  });
  return lines.sort((left, right) => left.y - right.y).flatMap((line) => line.words.sort((left, right) => left.x - right.x));
}

function cleanOcrWords(words, minConfidence = 30) {
  const output = [];
  const keepSmall = new Set(['de', 'du', 'le', 'la', 'et', 'au', 'un', 'une', 'en', 'des', 'les', 'pro', 'web', 'cm', 'td', 'tp', 'tdp', 'sql']);
  for (const word of words) {
    if (Number.isFinite(Number(word.confidence)) && Number(word.confidence) < minConfidence) continue;
    for (const raw of String(word.text || '').split(/\s+/)) {
      const token = raw.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9_]+$/gu, '');
      if (!token || /^\d+$/.test(token) || /^(.)\1{2,}$/u.test(token)) continue;
      const letters = (token.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      const keepCode = /^(?:R\d{1,2}[.]\d{1,2}|T(?:D|P)|TDP|CM|TP)(?:[_-]?\w*)?$/i.test(token);
      if (letters < 3 && !keepCode && !keepSmall.has(token.toLowerCase())) continue;
      if (/[æœ]{2,}/i.test(token)) continue;
      const weird = (token.match(/[^A-Za-zÀ-ÿ0-9._'’/()-]/g) || []).length;
      if (weird > token.length * 0.25 || output.at(-1)?.toLowerCase() === token.toLowerCase()) continue;
      output.push(token);
    }
  }
  return output.join(' ').replace(/\s+([,:;])/g, '$1').trim();
}

window.cleanOcrWords = cleanOcrWords;

function normalizeOcrName(name) {
  let value = String(name || '').replace(/_5(\d{2})\b/g, '_s$1').replace(/\bProbalités\b/gi, 'Probabilités').trim();
  const orphanLink = value.match(/^et\s+(R\d{1,2}[.]\d{1,2})\s+(.+?)\s+((?:TD|TDP|TP|CM)[_-]?\w+)$/i);
  if (orphanLink) {
    const titleWords = orphanLink[2].split(/\s+/);
    value = titleWords.length >= 2 ? `${orphanLink[1]} ${titleWords.slice(0, -1).join(' ')} et ${titleWords.at(-1)} ${orphanLink[3]}` : `${orphanLink[1]} ${orphanLink[2]} ${orphanLink[3]}`;
  }
  return value.replace(/^(?:de|du|le|la)\s+(?=R\d{1,2}[.]\d{1,2}\b)/i, '').trim();
}

const ocrNameScore = (name) => (name === 'Cours à vérifier' ? 0 : name.length) + (/\bR\d{1,2}[.]\d{1,2}\b/i.test(name) ? 50 : 0) + (/\b(?:TD|TDP|TP|CM)[_-]?\w*/i.test(name) ? 25 : 0);
const minuteValue = (time) => {
  const [hour, minute] = String(time).split(':').map(Number);
  return hour * 60 + minute;
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const demoEvents = [
  { name: 'Marche matinale', day: 'Lundi', start: '08:00', end: '08:30', type: 'Personnel' },
  { name: 'Projet Atlas', day: 'Lundi', start: '09:00', end: '10:30', type: 'Travail' },
  { name: 'Projet Atlas', day: 'Mardi', start: '09:00', end: '10:30', type: 'Travail' },
  { name: 'Réunion équipe', day: 'Mercredi', start: '09:30', end: '10:15', type: 'Travail' },
  { name: 'Café avec Ana', day: 'Lundi', start: '11:15', end: '11:45', type: 'Énergie' },
  { name: 'Répondre aux emails', day: 'Mardi', start: '11:15', end: '11:45', type: 'Travail' },
  { name: 'Déjeuner', day: 'Mardi', start: '12:30', end: '13:15', type: 'Énergie' },
  { name: 'Session création', day: 'Mardi', start: '14:00', end: '15:00', type: 'Travail' },
];

(function () {
  const planner = window.PLPPlanner;
  const eventDialog = document.getElementById('eventDialog');
  const editName = document.getElementById('editEventName');
  const editDescription = document.getElementById('editEventDescription');
  const editWhen = document.getElementById('editEventWhen');
  const editImportant = document.getElementById('editImportant');
  const editFlexToggle = document.getElementById('editFlexToggle');
  const viewButton = document.getElementById('viewAll');
  let editingEventId = null;
  let editingFlex = 'flexible';
  let dayMode = false;
  let selectedDayIndex = window.PLPWeek?.current?.().currentDayIndex || 0;

  function eventColor(type) {
    return type === 'Travail' ? 'violet' : type === 'Énergie' ? 'coral' : 'mint';
  }

  function selectedWeek() {
    return window.PLPWeek?.current?.() || { current: true, key: '', currentDayIndex: 0, agendaDay: 'Lundi' };
  }

  function shownEvents() {
    const customEvents = planner.visibleEvents(selectedWeek());
    return planner.getState().freshMode ? customEvents : demoEvents.concat(customEvents);
  }

  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} h ${String(remainder).padStart(2, '0')}` : `${hours} h`;
  }

  function applyDaySelection() {
    if (!grid24) return;
    const mobileDay = dayMode ? selectedDayIndex : selectedWeek().currentDayIndex;
    grid24.classList.toggle('day-view', dayMode);
    grid24.querySelectorAll('[data-day-index]').forEach((item) => {
      const visible = Number(item.dataset.dayIndex) === mobileDay;
      item.classList.toggle('mobile-visible', visible);
      item.classList.toggle('mobile-hidden', !visible);
      item.classList.toggle('view-visible', dayMode && visible);
      item.classList.toggle('view-hidden', dayMode && !visible);
    });
    if (viewButton) {
      viewButton.textContent = dayMode ? 'Voir la semaine' : 'Voir la journée';
      viewButton.setAttribute('aria-pressed', String(dayMode));
    }
  }

  function renderAgenda() {
    const agenda = document.getElementById('agendaList');
    const title = document.getElementById('agendaTitle');
    if (!agenda) return;
    const day = gridDays[selectedDayIndex];
    const events = planner.visibleEvents(selectedWeek()).filter((event) => event.day === day).sort((left, right) => minuteValue(left.start) - minuteValue(right.start));
    if (title) title.textContent = dayMode ? day : (selectedWeek().current ? `Aujourd’hui, ${day.toLowerCase()}` : day);
    if (!events.length) {
      agenda.innerHTML = '<p class="empty-custom">Aucune plage pour cette journée.</p>';
      return;
    }
    agenda.innerHTML = events.map((event) => `<div class="agenda-row"><time>${escapeHtml(event.start)}</time><span class="agenda-dot"></span><div class="agenda-name">${escapeHtml(event.name)}<small>${escapeHtml(event.type)} · ${escapeHtml(event.start)}–${escapeHtml(event.end)}</small></div></div>`).join('');
  }

  function renderProtectedTime(events) {
    const target = document.getElementById('protectedTime');
    if (target) target.textContent = `Créneaux protégés : ${formatDuration(planner.protectedMinutes(events))}`;
  }

  function renderCurrentTimeLine() {
    if (!grid24) return;
    let line = grid24.querySelector('.current-time-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'current-time-line';
      grid24.appendChild(line);
    }
    if (!selectedWeek().current) {
      line.hidden = true;
      return;
    }
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    line.hidden = false;
    line.style.top = `${42 + minutes / 60 * 68}px`;
    line.innerHTML = `<span class="current-time-label">${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}</span>`;
  }

  function openEventEditor(id) {
    const event = planner.getState().events.find((item) => item.id === id);
    if (!event) return;
    editingEventId = id;
    editingFlex = event.flex;
    editName.value = event.name;
    editDescription.value = event.description;
    editImportant.checked = event.important;
    editWhen.textContent = `${event.day} · ${event.start}–${event.end} · ${event.type}`;
    paintEditorFlex();
    eventDialog.showModal();
  }

  function paintEditorFlex() {
    editFlexToggle.textContent = editingFlex === 'fixed' ? 'Fixe · chaque semaine' : 'Flexible · cette semaine';
  }

  function renderGridEvents() {
    if (!grid24) return;
    grid24.querySelectorAll('.event').forEach((event) => event.remove());
    const events = shownEvents();
    events.forEach((event) => {
      const dayIndex = gridDays.indexOf(event.day);
      if (dayIndex < 0) return;
      const start = minuteValue(event.start);
      const end = Math.max(start + 15, minuteValue(event.end));
      const slot = grid24.querySelector(`[data-day-index="${dayIndex}"][data-hour="${Math.floor(start / 60)}"]`);
      if (!slot) return;
      const chip = document.createElement(event.id ? 'button' : 'div');
      chip.className = `event ${eventColor(event.type)}${event.important ? ' important' : ''}`;
      chip.style.top = `${5 + (start % 60) / 60 * 68}px`;
      chip.style.height = `${Math.max(30, (end - start) / 60 * 68 - 10)}px`;
      chip.innerHTML = `${escapeHtml(event.name)}<span>${escapeHtml(event.start)} · ${escapeHtml(event.end)}</span>${event.description ? `<span>${escapeHtml(event.description)}</span>` : ''}`;
      if (event.id) {
        chip.type = 'button';
        chip.dataset.eventId = event.id;
        chip.title = event.description || 'Cliquer pour modifier cette plage';
        chip.setAttribute('aria-label', `${event.name}, ${event.start} à ${event.end}${event.important ? ', important' : ''}. Modifier.`);
        chip.addEventListener('click', () => openEventEditor(event.id));
      }
      slot.appendChild(chip);
    });
    renderProtectedTime(planner.visibleEvents(selectedWeek()));
    renderCurrentTimeLine();
  }

  function build24HourGrid() {
    if (!grid24) return;
    let html = '<div class="day day-gutter"></div>';
    html += gridDays.map((day, index) => `<button class="day day-select" data-day-index="${index}" type="button" aria-label="Afficher ${day}">${gridLabels[index]}</button>`).join('');
    for (let hour = 0; hour < 24; hour += 1) {
      html += `<div class="time">${String(hour).padStart(2, '0')}:00</div>`;
      gridDays.forEach((day, index) => {
        html += `<div class="slot" data-day-index="${index}" data-hour="${hour}" aria-label="${day} ${String(hour).padStart(2, '0')} heures"></div>`;
      });
    }
    grid24.innerHTML = html;
    grid24.querySelectorAll('.day-select').forEach((button) => button.addEventListener('click', () => {
      selectedDayIndex = Number(button.dataset.dayIndex);
      dayMode = true;
      applyDaySelection();
      renderAgenda();
    }));
  }

  viewButton?.addEventListener('click', () => {
    dayMode = !dayMode;
    if (dayMode) selectedDayIndex = selectedWeek().currentDayIndex;
    applyDaySelection();
    renderAgenda();
  });

  editFlexToggle?.addEventListener('click', () => {
    editingFlex = editingFlex === 'fixed' ? 'flexible' : 'fixed';
    paintEditorFlex();
  });
  document.getElementById('closeEvent')?.addEventListener('click', () => eventDialog.close());
  document.getElementById('saveEdited')?.addEventListener('click', () => {
    const name = editName.value.trim();
    if (!name) {
      editName.focus();
      return;
    }
    planner.updateEvent(editingEventId, { name, description: editDescription.value.trim(), flex: editingFlex, important: editImportant.checked });
    eventDialog.close();
    notice('La plage a été mise à jour.');
  });
  document.getElementById('deleteEdited')?.addEventListener('click', () => {
    planner.removeEvent(editingEventId);
    eventDialog.close();
    notice('La plage a été supprimée.');
  });

  function render() {
    applyDaySelection();
    renderGridEvents();
    renderAgenda();
  }

  build24HourGrid();
  window.PLPWeek?.subscribe((week) => {
    if (!dayMode) selectedDayIndex = week.currentDayIndex;
    render();
  });
  planner.subscribe(render);
  window.PLPWeek?.refresh?.();
  render();
  setInterval(renderCurrentTimeLine, 60000);
}());
