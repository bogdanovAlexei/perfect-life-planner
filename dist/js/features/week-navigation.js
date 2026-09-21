(function () {
  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const shortDayNames = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];
  const monthNames = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  const listeners = new Set();
  let weekOffset = 0;

  function startOfWeek(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function currentWeekStart() {
    return startOfWeek(new Date());
  }

  function selectedWeekStart() {
    return addDays(currentWeekStart(), weekOffset * 7);
  }

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function sameDay(left, right) {
    return dateKey(left) === dateKey(right);
  }

  function formatRange(start, end) {
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.getDate()} — ${end.getDate()} ${monthNames[start.getMonth()]} ${end.getFullYear()}`;
    }
    return `${start.getDate()} ${monthNames[start.getMonth()]} — ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
  }

  function state() {
    const start = selectedWeekStart();
    const end = addDays(start, dayNames.length - 1);
    const today = new Date();
    const current = sameDay(start, currentWeekStart());
    const currentDayIndex = current ? Math.min(Math.max(today.getDay() - 1, 0), dayNames.length - 1) : 0;
    return {
      offset: weekOffset,
      start,
      end,
      key: dateKey(start),
      current,
      currentDayIndex,
      labels: dayNames.map((name, index) => `${shortDayNames[index]} ${addDays(start, index).getDate()}`),
      dates: dayNames.map((_, index) => addDays(start, index)),
      range: formatRange(start, end),
      agendaDay: dayNames[currentDayIndex],
    };
  }

  function updateChrome(currentState) {
    const range = document.getElementById('weekRange');
    if (range) range.textContent = currentState.range;

    const title = document.getElementById('agendaTitle');
    if (title) {
      const agendaDate = currentState.dates[currentState.currentDayIndex];
      title.textContent = currentState.current
        ? `Aujourd’hui, ${dayNames[currentState.currentDayIndex].toLowerCase()} ${agendaDate.getDate()}`
        : `${dayNames[currentState.currentDayIndex]}, ${agendaDate.getDate()} ${monthNames[agendaDate.getMonth()]}`;
    }

    const grid = document.querySelector('.grid');
    if (grid) {
      grid.dataset.weekKey = currentState.key;
      grid.querySelectorAll('.day').forEach((cell, index) => {
        if (index === 0) return;
        const dayIndex = index - 1;
        cell.textContent = currentState.labels[dayIndex];
        cell.classList.toggle('today', currentState.current && dayIndex === currentState.currentDayIndex);
        cell.classList.toggle('mobile-visible', dayIndex === currentState.currentDayIndex);
        cell.classList.toggle('mobile-hidden', dayIndex !== currentState.currentDayIndex);
      });
      grid.querySelectorAll('.slot[data-day-index]').forEach((slot) => {
        const visible = Number(slot.dataset.dayIndex) === currentState.currentDayIndex;
        slot.classList.toggle('mobile-visible', visible);
        slot.classList.toggle('mobile-hidden', !visible);
      });
    }
  }

  function notify() {
    const currentState = state();
    updateChrome(currentState);
    listeners.forEach((listener) => listener(currentState));
  }

  function move(delta) {
    weekOffset += delta;
    notify();
  }

  window.PLPWeek = {
    dayNames,
    current: state,
    currentKey: () => state().key,
    isCurrent: () => state().current,
    getAgendaDayName: () => state().agendaDay,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: notify,
    move,
  };

  document.getElementById('previousWeek')?.addEventListener('click', () => move(-1));
  document.getElementById('nextWeek')?.addEventListener('click', () => move(1));
  notify();
}());
