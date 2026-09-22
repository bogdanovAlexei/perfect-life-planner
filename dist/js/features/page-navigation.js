(function () {
  const pages = new Map([
    ['planner', document.getElementById('plannerPage')],
    ['account', document.getElementById('accountPage')],
  ]);
  const buttons = Array.from(document.querySelectorAll('[data-page-target]'));
  const pageTitles = {
    planner: 'Perfect Life Planner (PLP) — Mon planning',
    account: 'Perfect Life Planner (PLP) — Mon espace personnel',
  };

  function showPage(name, { focus = false } = {}) {
    const activePage = pages.get(name);
    if (!activePage) return;

    for (const [pageName, page] of pages) {
      page.hidden = pageName !== name;
    }

    for (const button of buttons) {
      const isCurrent = button.dataset.pageTarget === name;
      button.classList.toggle('active', isCurrent);
      button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
    }

    document.title = pageTitles[name];

    if (focus) {
      const heading = activePage.querySelector('h1, h2');
      if (heading) heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const destination = pages.get(button.dataset.pageTarget);
      showPage(button.dataset.pageTarget, { focus: Boolean(destination?.hidden) });
    });
  }

  showPage('planner');
})();
