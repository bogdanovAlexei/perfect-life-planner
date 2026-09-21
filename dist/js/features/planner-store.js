(function () {
  const storageKeys = {
    events: 'plp-custom-plages',
    freshMode: 'plp-fresh-mode',
    hideFlexible: 'plp-flexible-hidden',
    legacyHidden: 'plp-custom-hidden',
  };
  const listeners = new Set();

  const createId = () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const currentWeekKey = () => window.PLPWeek?.currentKey?.() || '';

  function normalizeEvent(event) {
    const flex = event.flex === 'fixed' ? 'fixed' : 'flexible';
    return {
      id: event.id || createId(),
      name: String(event.name || 'Plage sans nom').trim(),
      description: String(event.description || '').trim(),
      day: event.day || 'Lundi',
      start: event.start || '09:00',
      end: event.end || '10:00',
      type: event.type || 'Personnel',
      flex,
      weekKey: flex === 'fixed' ? null : (event.weekKey || currentWeekKey()),
      important: Boolean(event.important),
      source: event.source || 'manual',
    };
  }

  function readState() {
    try {
      const events = JSON.parse(localStorage.getItem(storageKeys.events) || '[]');
      const freshValue = localStorage.getItem(storageKeys.freshMode);
      const flexibleValue = localStorage.getItem(storageKeys.hideFlexible);
      const legacyHidden = localStorage.getItem(storageKeys.legacyHidden) === 'true';
      return {
        events: Array.isArray(events) ? events.map(normalizeEvent) : [],
        freshMode: freshValue === null ? true : freshValue === 'true',
        hideFlexible: flexibleValue === null ? legacyHidden : flexibleValue === 'true',
      };
    } catch {
      return { events: [], freshMode: true, hideFlexible: false };
    }
  }

  let state = readState();

  function persist() {
    try {
      localStorage.setItem(storageKeys.events, JSON.stringify(state.events));
      localStorage.setItem(storageKeys.freshMode, String(state.freshMode));
      localStorage.setItem(storageKeys.hideFlexible, String(state.hideFlexible));
    } catch {
      // The planning remains usable even when local storage is unavailable.
    }
  }

  function emit() {
    const snapshot = api.getState();
    listeners.forEach((listener) => listener(snapshot));
  }

  function commit(change) {
    change();
    persist();
    emit();
  }

  function eventKey(event) {
    return [event.name.toLowerCase(), event.day, event.start, event.end, event.flex, event.weekKey || 'weekly'].join('|');
  }

  function eventsForWeek(week = window.PLPWeek?.current?.()) {
    return state.events.filter((event) => event.flex === 'fixed' || event.weekKey === week?.key || (!event.weekKey && week?.current));
  }

  function visibleEvents(week) {
    return eventsForWeek(week).filter((event) => !state.hideFlexible || event.flex === 'fixed');
  }

  function protectedMinutes(events) {
    const intervalsByDay = new Map();
    events.filter((event) => event.important).forEach((event) => {
      const [startHour, startMinute] = event.start.split(':').map(Number);
      const [endHour, endMinute] = event.end.split(':').map(Number);
      const start = startHour * 60 + startMinute;
      const end = Math.max(start, endHour * 60 + endMinute);
      const intervals = intervalsByDay.get(event.day) || [];
      intervals.push([start, end]);
      intervalsByDay.set(event.day, intervals);
    });

    return [...intervalsByDay.values()].reduce((total, intervals) => {
      const merged = intervals.sort((left, right) => left[0] - right[0]).reduce((result, interval) => {
        const previous = result.at(-1);
        if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
        else result.push([...interval]);
        return result;
      }, []);
      return total + merged.reduce((sum, [start, end]) => sum + end - start, 0);
    }, 0);
  }

  const api = {
    createId,
    getState: () => ({ ...state, events: state.events.map((event) => ({ ...event })) }),
    eventsForWeek,
    visibleEvents,
    protectedMinutes,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addEvent(event) {
      const normalized = normalizeEvent(event);
      commit(() => state.events.push(normalized));
      return normalized;
    },
    updateEvent(id, changes) {
      const index = state.events.findIndex((event) => event.id === id);
      if (index < 0) return null;
      const updated = normalizeEvent({ ...state.events[index], ...changes });
      commit(() => { state.events[index] = updated; });
      return updated;
    },
    removeEvent(id) {
      commit(() => { state.events = state.events.filter((event) => event.id !== id); });
    },
    clearEvents() {
      commit(() => { state.events = []; state.hideFlexible = false; });
    },
    setFreshMode(value) {
      commit(() => { state.freshMode = Boolean(value); });
    },
    setHideFlexible(value) {
      commit(() => { state.hideFlexible = Boolean(value); });
    },
    importEvents(events) {
      const imported = events.map((event) => normalizeEvent({ ...event, flex: 'fixed', important: false, source: 'photo' }));
      const unique = new Map();
      imported.forEach((event) => unique.set(eventKey(event), event));
      commit(() => {
        state.events = [...unique.values()];
        state.freshMode = true;
        state.hideFlexible = false;
      });
      return state.events.length;
    },
  };

  window.PLPPlanner = api;
}());
