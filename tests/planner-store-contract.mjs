import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values = new Map();
const context = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  },
};
context.window = {
  PLPWeek: {
    currentKey: () => '2026-09-21',
    current: () => ({ key: '2026-09-21', current: true, currentDayIndex: 0 }),
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../dist/js/features/planner-store.js', import.meta.url), 'utf8'), context);

const planner = context.window.PLPPlanner;
planner.addEvent({ name: 'Fixe', day: 'Lundi', start: '09:00', end: '10:00', flex: 'fixed', important: true });
planner.addEvent({ name: 'Flexible', day: 'Lundi', start: '09:30', end: '11:00', flex: 'flexible', important: true });

assert.equal(planner.visibleEvents().length, 2, 'les événements de la semaine doivent être visibles');
assert.equal(planner.protectedMinutes(planner.visibleEvents()), 120, 'les créneaux importants chevauchants doivent être fusionnés');
planner.setHideFlexible(true);
assert.deepEqual(Array.from(planner.visibleEvents(), (event) => event.name), ['Fixe'], 'masquer flexible ne doit pas masquer une plage fixe');

planner.importEvents([
  { name: 'Cours', day: 'Mardi', start: '08:00', end: '10:00', type: 'Travail' },
  { name: 'Cours', day: 'Mardi', start: '08:00', end: '10:00', type: 'Travail' },
]);
assert.equal(planner.getState().events.length, 1, 'un import doit dédupliquer les créneaux identiques');
assert.equal(planner.getState().events[0].flex, 'fixed', 'un cours importé doit rester visible chaque semaine');

console.log('Planner store contract is internally consistent.');
