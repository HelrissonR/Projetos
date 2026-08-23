(() => {
  const key = 'aura-recovery-preferences';
  const labels = ['Visão geral', 'Vendas / PDV', 'Pedidos', 'Produtos', 'Estoque', 'Clientes', 'Sincronização', 'Financeiro', 'Relatórios', 'Gestão de dados'];
  const defaults = { hidden: [], density: 'comfortable', catalogMotion: true };
  const load = () => ({ ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') });
  const save = (value) => localStorage.setItem(key, JSON.stringify(value));

  function menuButtons() {
    return [...document.querySelectorAll('button')].filter((button) =>
      labels.some((label) => button.textContent.replace(/\s+/g, ' ').includes(label))
    );
  }

  function apply() {
    const preferences = load();
    document.body.classList.toggle('recovery-compact', preferences.density === 'compact');
    document.body.classList.toggle('recovery-catalog-motion', preferences.catalogMotion);
    menuButtons().forEach((button) => {
      const label = labels.find((name) => button.textContent.replace(/\s+/g, ' ').includes(name));
      button.hidden = Boolean(label && preferences.hidden.includes(label));
    });
  }

  function injectSettings() {
    if (document.querySelector('.recovery-settings')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const preferences = load();
    const panel = document.createElement('section');
    panel.className = 'recovery-settings';
    panel.innerHTML = `
      <h2>Personalização da interface</h2>
      <p>Escolha quais atalhos aparecem no menu e como prefere usar o sistema.</p>
      <div class="recovery-settings__group">
        <span class="recovery-settings__title">Itens do menu</span>
        <div class="recovery-settings__choices">
          ${labels.map((label) => `<label><input type="checkbox" data-menu="${label}" ${preferences.hidden.includes(label) ? '' : 'checked'}> ${label}</label>`).join('')}
        </div>
      </div>
      <div class="recovery-settings__group">
        <span class="recovery-settings__title">Densidade</span>
        <button class="recovery-density" data-density="comfortable" aria-pressed="${preferences.density === 'comfortable'}">Confortável</button>
        <button class="recovery-density" data-density="compact" aria-pressed="${preferences.density === 'compact'}">Compacta</button>
      </div>
      <div class="recovery-settings__group">
        <label><input type="checkbox" data-motion ${preferences.catalogMotion ? 'checked' : ''}> Animações suaves no catálogo</label>
      </div>`;
    main.prepend(panel);
    panel.addEventListener('change', (event) => {
      const next = load();
      if (event.target.matches('[data-menu]')) {
        const name = event.target.dataset.menu;
        next.hidden = event.target.checked ? next.hidden.filter((item) => item !== name) : [...new Set([...next.hidden, name])];
      }
      if (event.target.matches('[data-motion]')) next.catalogMotion = event.target.checked;
      save(next); apply();
    });
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-density]');
      if (!button) return;
      const next = load(); next.density = button.dataset.density; save(next); apply();
      panel.querySelectorAll('[data-density]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    });
  }

  function bindSettingsNavigation() {
    const settingsButton = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Configurações'));
    if (!settingsButton || settingsButton.dataset.recoveryBound) return;
    settingsButton.dataset.recoveryBound = 'true';
    settingsButton.addEventListener('click', () => window.setTimeout(injectSettings, 120));
  }

  const observer = new MutationObserver(() => { apply(); bindSettingsNavigation(); });
  observer.observe(document.body, { childList: true, subtree: true });
  apply(); bindSettingsNavigation();
})();
