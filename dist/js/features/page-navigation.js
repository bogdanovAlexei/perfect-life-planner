(function () {
  const pages = new Map([
    ['planner', document.getElementById('plannerPage')],
    ['health', document.getElementById('healthPage')],
    ['account', document.getElementById('accountPage')],
  ]);
  const buttons = Array.from(document.querySelectorAll('[data-page-target]'));
  const pageTitles = {
    planner: 'Perfect Life Planner (PLP) — Mon planning',
    health: 'Perfect Life Planner (PLP) — Mon espace santé',
    account: 'Perfect Life Planner (PLP) — Mon espace personnel',
  };

  function showPage(name, { focus = false } = {}) {
    const selectedPage = pages.has(name) ? name : 'planner';
    const activePage = pages.get(selectedPage);
    if (!activePage) return;

    for (const [nameInMap, page] of pages) {
      page.hidden = nameInMap !== selectedPage;
    }

    for (const button of buttons) {
      const isCurrent = button.dataset.pageTarget === selectedPage;
      button.classList.toggle('active', isCurrent);
      button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
    }

    document.title = pageTitles[selectedPage];

    if (focus) {
      const heading = activePage.querySelector('h1, h2');
      if (heading) heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const requestedPage = button.dataset.pageTarget;
      const destination = pages.get(pages.has(requestedPage) ? requestedPage : 'planner');
      showPage(requestedPage, { focus: Boolean(destination?.hidden) });
    });
  }

  showPage('planner');
})();
