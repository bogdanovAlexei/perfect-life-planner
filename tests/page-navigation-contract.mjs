import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const navigationStyles = fs.readFileSync(new URL('../dist/css/sidebar-navigation.css', import.meta.url), 'utf8');

assert.match(html, /id="accountPage"[^>]*hidden/);
assert.match(html, /id="healthPage"[^>]*hidden/);
assert.match(html, /id="plannerPage"/);
assert.match(html, /id="accountNav"[^>]*data-page-target="account"/);
assert.match(html, /id="mobileAccountNav"[^>]*data-page-target="account"/);
assert.match(html, /id="healthNav"[^>]*data-page-target="health"[^>]*aria-controls="healthPage"/);
assert.match(html, /id="mobileHealthNav"[^>]*data-page-target="health"[^>]*aria-controls="healthPage"/);
assert.equal(Array.from(html.matchAll(/data-page-target=/g)).length, 6, 'les trois pages ont des actions jumelées bureau et mobile');

const healthPageStart = html.indexOf('<section class="app-page health-page" id="healthPage"');
const healthPanelStart = html.indexOf('<section class="health-panel"');
const plannerPageStart = html.indexOf('<div class="app-page planner-page" id="plannerPage">');
assert.ok(healthPageStart >= 0 && healthPageStart < healthPanelStart && healthPanelStart < plannerPageStart, 'le panneau santé est contenu dans sa page dédiée, séparée du planning');
for (const id of ['garminFile', 'healthDemo', 'healthReset', 'stepsValue', 'healthPrivacy']) {
  assert.equal(Array.from(html.matchAll(new RegExp(`id="${id}"`, 'g'))).length, 1, `le contrôle santé ${id} reste unique après déplacement`);
}

assert.match(navigationStyles, /\.sidebar\s*\{[^}]*position:\s*fixed/s);
assert.match(navigationStyles, /\.app\s*>\s*\.content\s*\{\s*grid-column:\s*2;\s*min-width:\s*0;/);
assert.match(navigationStyles, /@media\s*\(max-width:\s*760px\)/);
assert.match(navigationStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.app\s*>\s*\.content\s*\{\s*grid-column:\s*auto;/);
assert.match(navigationStyles, /\.mobile-page-nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);

class Element {
  constructor(name, pageTarget = '') {
    this.name = name;
    this.dataset = pageTarget ? { pageTarget } : {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.active = false;
    this.heading = { focused: false, focus() { this.focused = true; } };
    this.classList = {
      toggle: (className, value) => {
        if (className === 'active') this.active = value;
      },
    };
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  querySelector() {
    return this.heading;
  }

  click() {
    this.listeners.get('click')({ currentTarget: this });
  }
}

const plannerPage = new Element('planner');
const healthPage = new Element('health');
const accountPage = new Element('account');
const buttons = [
  new Element('desktop planner', 'planner'),
  new Element('desktop health', 'health'),
  new Element('desktop account', 'account'),
  new Element('mobile planner', 'planner'),
  new Element('mobile health', 'health'),
  new Element('mobile account', 'account'),
];
const unknownButton = new Element('unknown page', 'missing-page');
buttons.push(unknownButton);
const document = {
  title: '',
  getElementById: (id) => ({ plannerPage, healthPage, accountPage })[id],
  querySelectorAll: () => buttons,
};
const scrolls = [];
const context = {
  document,
  window: { scrollTo: (options) => scrolls.push(options) },
};

vm.runInNewContext(
  fs.readFileSync(new URL('../dist/js/features/page-navigation.js', import.meta.url), 'utf8'),
  context,
);

assert.equal(plannerPage.hidden, false, 'le planning est la page initiale');
assert.equal(healthPage.hidden, true, 'la page santé est séparée au chargement');
assert.equal(accountPage.hidden, true, 'l’espace personnel est séparé au chargement');
assert.equal(buttons[0].active, true, 'la navigation desktop reflète la page active');
assert.equal(buttons[3].active, true, 'la navigation mobile reflète la page active');

buttons[1].click();
assert.equal(plannerPage.hidden, true, 'ouvrir Santé masque le planning');
assert.equal(healthPage.hidden, false, 'ouvrir Santé affiche sa page dédiée');
assert.equal(accountPage.hidden, true, 'ouvrir Santé laisse le compte masqué');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon espace santé');
assert.equal(buttons[1].attributes.get('aria-current'), 'page');
assert.equal(buttons[4].active, true, 'les navigations desktop et mobile restent synchronisées sur Santé');
assert.equal(healthPage.heading.focused, true, 'le titre Santé reçoit le focus à l’ouverture');

buttons[5].click();
assert.equal(plannerPage.hidden, true, 'ouvrir le compte masque le planning');
assert.equal(healthPage.hidden, true, 'ouvrir le compte masque Santé');
assert.equal(accountPage.hidden, false, 'ouvrir l’espace personnel affiche sa page');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon espace personnel');
assert.equal(buttons[2].attributes.get('aria-current'), 'page');
assert.equal(buttons[5].active, true, 'les deux barres de navigation restent synchronisées');
assert.equal(accountPage.heading.focused, true, 'le titre du nouvel écran reçoit le focus');

buttons[4].click();
assert.equal(healthPage.hidden, false, 'la navigation mobile ouvre également Santé');
assert.equal(accountPage.hidden, true, 'quitter le compte masque son écran');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon espace santé');
assert.equal(buttons[1].active, true, 'la navigation desktop suit le changement Santé depuis mobile');

buttons[3].click();
assert.equal(plannerPage.hidden, false, 'la navigation mobile revient au planning');
assert.equal(healthPage.hidden, true, 'revenir au planning masque Santé');
assert.equal(accountPage.hidden, true, 'quitter le compte masque son écran');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon planning');
assert.equal(buttons[0].attributes.get('aria-current'), 'page');

buttons[1].click();
unknownButton.click();
assert.equal(plannerPage.hidden, false, 'une destination inconnue revient au planning');
assert.equal(healthPage.hidden, true, 'une destination inconnue ne laisse pas une autre page visible');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon planning');
assert.equal(buttons[0].active, true, 'le repli restaure l’état actif du planning');
assert.equal(scrolls.length, 6, 'chaque changement de page ramène en haut');

console.log('Page navigation contract is internally consistent.');
