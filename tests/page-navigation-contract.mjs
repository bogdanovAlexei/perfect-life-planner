import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const navigationStyles = fs.readFileSync(new URL('../dist/css/sidebar-navigation.css', import.meta.url), 'utf8');

assert.match(html, /id="accountPage"[^>]*hidden/);
assert.match(html, /id="plannerPage"/);
assert.match(html, /id="accountNav"[^>]*data-page-target="account"/);
assert.match(html, /id="mobileAccountNav"[^>]*data-page-target="account"/);
assert.equal(Array.from(html.matchAll(/data-page-target=/g)).length, 4, 'les navigations bureau et mobile ont des actions jumelées');
assert.match(navigationStyles, /\.sidebar\s*\{[^}]*position:\s*fixed/s);
assert.match(navigationStyles, /\.app\s*>\s*\.content\s*\{\s*grid-column:\s*2;\s*min-width:\s*0;/);
assert.match(navigationStyles, /@media\s*\(max-width:\s*760px\)/);
assert.match(navigationStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.app\s*>\s*\.content\s*\{\s*grid-column:\s*auto;/);

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
const accountPage = new Element('account');
const buttons = [
  new Element('desktop planner', 'planner'),
  new Element('desktop account', 'account'),
  new Element('mobile planner', 'planner'),
  new Element('mobile account', 'account'),
];
const document = {
  title: '',
  getElementById: (id) => ({ plannerPage, accountPage })[id],
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
assert.equal(accountPage.hidden, true, 'l’espace personnel est séparé au chargement');
assert.equal(buttons[0].active, true, 'la navigation desktop reflète la page active');
assert.equal(buttons[2].active, true, 'la navigation mobile reflète la page active');

buttons[1].click();
assert.equal(plannerPage.hidden, true, 'ouvrir le compte masque le planning');
assert.equal(accountPage.hidden, false, 'ouvrir le compte affiche l’espace personnel');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon espace personnel');
assert.equal(buttons[1].attributes.get('aria-current'), 'page');
assert.equal(buttons[3].active, true, 'les deux barres de navigation restent synchronisées');
assert.equal(accountPage.heading.focused, true, 'le titre du nouvel écran reçoit le focus');

buttons[2].click();
assert.equal(plannerPage.hidden, false, 'la navigation mobile revient au planning');
assert.equal(accountPage.hidden, true, 'quitter le compte masque son écran');
assert.equal(document.title, 'Perfect Life Planner (PLP) — Mon planning');
assert.equal(buttons[0].attributes.get('aria-current'), 'page');
assert.equal(scrolls.length, 2, 'un changement de page ramène en haut');

console.log('Page navigation contract is internally consistent.');
