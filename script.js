// LAGS UNBLOCKED - Main Application Script
// Handles game library rendering, search, favourites, settings, background integration,
// PocketBase authentication, social features, game voting, and collections.
// All existing functionality is preserved; social features are layered on top.

(function() {
  'use strict';

  // --- State ---
  let games = [];
  let categories = [];
  let favourites = new Set(JSON.parse(localStorage.getItem('lags_favourites') || '[]'));
  let recentlyPlayed = new Set(JSON.parse(localStorage.getItem('lags_recently_played') || '[]'));
  let bg = null;
  let userVoteState = {}; // gameId -> boolean

  // --- DOM Elements ---
  const els = {
    gameSearch: document.getElementById('game-search'),
    searchClear: document.getElementById('search-clear'),
    searchHints: document.getElementById('search-hints'),
    gridPopular: document.getElementById('grid-popular'),
    gridRecent: document.getElementById('grid-recent'),
    gridCategories: document.getElementById('grid-categories'),
    gridFavorites: document.getElementById('grid-favorites'),
    favEmpty: document.getElementById('fav-empty'),
    memeToggle: document.getElementById('meme-toggle'),
    memeToggleState: document.getElementById('meme-toggle-state'),
    navRandom: document.getElementById('nav-random'),
    heroRandom: document.getElementById('hero-random'),
    openSettings: document.getElementById('open-settings'),
    settingsModal: document.getElementById('settings-modal'),
    settingsBackdrop: document.getElementById('settings-backdrop'),
    settingsClose: document.getElementById('settings-close'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    nav: document.getElementById('main-nav')
  };

  // --- Init ---
  document.addEventListener('DOMContentLoaded', async () => {
    await loadGames();
    initBackground();
    initAuth();
    renderHomepage();
    initSettings();
    initSearch();
    initFavourites();
    initRandom();
    initMobileMenu();
    initNavigation();
    updateMemeToggleUI();
    updateFavouriteGrid();
    updateYear();
    renderVoteRankings();
  });

  // --- Games Data ---
  async function loadGames() {
    try {
      const res = await fetch('games.json');
      if (!res.ok) throw new Error('Failed to load games.json');
      const data = await res.json();
      games = data.games || [];
      categories = data.categories || [];
    } catch (err) {
      console.error('Error loading games:', err);
      games = [];
      categories = [];
    }
  }

  // --- Authentication ---
  async function initAuth() {
    window.LAGS_AUTH.onAuthChange((user) => {
      updateAuthUI(user);
      if (user) {
        loadUserVoteState();
      } else {
        userVoteState = {};
      }
    });
  }

  async function loadUserVoteState() {
    if (!window.LAGS_AUTH.isAuthenticated()) return;
    try {
      for (const game of games) {
        const vote = await window.LAGS_AUTH.getGameVotes(game.id);
        userVoteState[game.id] = vote.userVoted;
      }
    } catch (e) {
      console.warn('Failed to load vote state', e);
    }
  }

  function updateAuthUI(user) {
    // Update any auth-dependent UI elements on the current page
    const loginLinks = document.querySelectorAll('.js-auth-login');
    const logoutLinks = document.querySelectorAll('.js-auth-logout');
    const profileLinks = document.querySelectorAll('.js-auth-profile');
    const userNameEls = document.querySelectorAll('.js-username');
    const userAvatarEls = document.querySelectorAll('.js-user-avatar');

    if (user) {
      loginLinks.forEach(el => el.style.display = 'none');
      logoutLinks.forEach(el => el.style.display = 'inline-flex');
      profileLinks.forEach(el => el.style.display = 'inline-flex');
      userNameEls.forEach(el => { el.textContent = user.username || user.display_name || 'User'; });
      if (user.avatar) {
        userAvatarEls.forEach(el => { el.src = getAvatarUrl(user.avatar); });
      }
    } else {
      loginLinks.forEach(el => el.style.display = 'inline-flex');
      logoutLinks.forEach(el => el.style.display = 'none');
      profileLinks.forEach(el => el.style.display = 'none');
    }
  }

  function getAvatarUrl(avatarId) {
    if (!window.LAGS_CONFIG || !window.LAGS_CONFIG.POCKETBASE_URL) return '';
    return `${window.LAGS_CONFIG.POCKETBASE_URL}/api/files/users/${avatarId}`;
  }

  // --- Background System ---
  function initBackground() {
    bg = new window.BackgroundSystem();
    bg.init();
  }

  // --- Render Homepage ---
  function renderHomepage() {
    renderGameGrid(els.gridPopular, games.filter(g => g.popular));
    renderGameGrid(els.gridRecent, games.filter(g => g.recent));
    renderCategories();
  }

  function renderGameGrid(container, gameList) {
    if (!container) return;
    container.innerHTML = '';
    if (gameList.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;">No games found.</p>';
      return;
    }
    gameList.forEach(game => {
      const card = createGameCard(game);
      container.appendChild(card);
    });
  }

  function createGameCard(game) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Play ${game.title}`);

    const isFav = favourites.has(game.id);
    const isRecent = recentlyPlayed.has(game.id);
    const voted = userVoteState[game.id] || false;

    card.innerHTML = `
      <div class="game-card-thumb">
        <img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title)}" loading="lazy">
        <div class="game-card-badge">${isRecent ? 'Recent' : isFav ? 'Favourite' : game.category}</div>
        ${window.LAGS_AUTH.isAuthenticated() ? `
        <button class="game-vote-btn ${voted ? 'voted' : ''}" data-game-id="${escapeHtml(game.id)}" aria-label="${voted ? 'Remove vote' : 'Upvote'} ${escapeHtml(game.title)}">
          <span class="vote-icon">▲</span><span class="vote-count">0</span>
        </button>` : ''}
      </div>
      <div class="game-card-info">
        <div class="game-card-title">${escapeHtml(game.title)}</div>
        <div class="game-card-category">${escapeHtml(game.category)}</div>
      </div>
      <button class="fav-btn" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}">
        ${isFav ? '★' : '☆'}
      </button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      if (e.target.closest('.game-vote-btn')) return;
      playGame(game);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.target.closest('.game-vote-btn')) return;
        playGame(game);
      }
    });

    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavourite(game.id, favBtn, card);
    });

    const voteBtn = card.querySelector('.game-vote-btn');
    if (voteBtn) {
      voteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await handleVote(game.id, voteBtn);
      });
      voteBtn.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          await handleVote(game.id, voteBtn);
        }
      });
    }

    return card;
  }

  async function handleVote(gameId, btn) {
    if (!window.LAGS_AUTH.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }
    try {
      const result = await window.LAGS_AUTH.upvoteGame(gameId);
      const wasVoted = userVoteState[gameId] || false;
      const nowVoted = result.voted === undefined ? !wasVoted : result.voted;
      userVoteState[gameId] = nowVoted;
      updateVoteButton(btn, nowVoted);
      // Refresh vote count
      const voteInfo = await window.LAGS_AUTH.getGameVotes(gameId);
      const countEl = btn.querySelector('.vote-count');
      if (countEl) countEl.textContent = voteInfo.count;
      // Re-render rankings if on homepage
      renderVoteRankings();
    } catch (err) {
      console.error('Vote failed', err);
      alert(err.message || 'Failed to vote. Please try again.');
    }
  }

  function updateVoteButton(btn, voted) {
    if (voted) {
      btn.classList.add('voted');
      btn.setAttribute('aria-label', 'Remove vote');
    } else {
      btn.classList.remove('voted');
      btn.setAttribute('aria-label', 'Upvote');
    }
  }

  function toggleFavourite(id, btn, card) {
    if (favourites.has(id)) {
      favourites.delete(id);
      btn.textContent = '☆';
      btn.setAttribute('aria-label', 'Add to favourites');
    } else {
      favourites.add(id);
      btn.textContent = '★';
      btn.setAttribute('aria-label', 'Remove from favourites');
    }
    localStorage.setItem('lags_favourites', JSON.stringify([...favourites]));
    updateFavouriteGrid();
  }

  function updateFavouriteGrid() {
    if (!els.gridFavorites) return;
    const favGames = games.filter(g => favourites.has(g.id));
    if (favGames.length === 0) {
      els.gridFavorites.innerHTML = '';
      if (els.favEmpty) els.favEmpty.style.display = 'block';
      return;
    }
    if (els.favEmpty) els.favEmpty.style.display = 'none';
    renderGameGrid(els.gridFavorites, favGames);
  }

  function playGame(game) {
    recentlyPlayed.add(game.id);
    localStorage.setItem('lags_recently_played', JSON.stringify([...recentlyPlayed]));
    window.location.href = game.path;
  }

  // --- Categories ---
  function renderCategories() {
    if (!els.gridCategories) return;
    els.gridCategories.innerHTML = '';
    const categoryIcons = {
      Arcade: '🎮',
      Action: '⚡',
      Shooter: '🔫',
      Racing: '🏎️',
      Adventure: '🗺️',
      Puzzle: '🧩'
    };
    categories.forEach(cat => {
      const count = games.filter(g => g.category === cat).length;
      const card = document.createElement('div');
      card.className = 'category-card';
      card.innerHTML = `
        <em>${categoryIcons[cat] || '🎯'}</em>
        <h3>${escapeHtml(cat)}</h3>
        <p>${count} game${count !== 1 ? 's' : ''}</p>
      `;
      card.addEventListener('click', () => {
        window.location.href = `library.html?category=${encodeURIComponent(cat)}`;
      });
      els.gridCategories.appendChild(card);
    });
  }

  // --- Vote Rankings on Homepage ---
  async function renderVoteRankings() {
    const container = document.getElementById('grid-most-upvoted');
    const trendingContainer = document.getElementById('grid-trending');
    if (!container && !trendingContainer) return;

    try {
      const topGames = await window.LAGS_AUTH.getTopVotedGames(8);
      const rankedGames = topGames.map(entry => games.find(g => g.id === entry.gameId)).filter(Boolean);

      if (container) {
        container.innerHTML = '';
        if (rankedGames.length === 0) {
          container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;">No votes yet. Be the first to upvote!</p>';
        } else {
          rankedGames.forEach((game, idx) => {
            container.appendChild(createRankedGameCard(game, idx + 1));
          });
        }
      }

      // Trending: same data for now (real trending uses time-weighted queries on backend)
      if (trendingContainer) {
        trendingContainer.innerHTML = '';
        if (rankedGames.length === 0) {
          trendingContainer.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;">No trending games yet.</p>';
        } else {
          rankedGames.slice(0, 6).forEach(game => {
            trendingContainer.appendChild(createGameCard(game));
          });
        }
      }
    } catch (e) {
      // Backend not configured or error - silently skip rankings
      console.warn('Could not load vote rankings', e);
    }
  }

  function createRankedGameCard(game, rank) {
    const card = document.createElement('article');
    card.className = 'game-card ranked-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Play ${game.title}`);

    const isFav = favourites.has(game.id);
    const isRecent = recentlyPlayed.has(game.id);
    const voted = userVoteState[game.id] || false;

    card.innerHTML = `
      <div class="game-card-rank">#{rank}</div>
      <div class="game-card-thumb">
        <img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title)}" loading="lazy">
        <div class="game-card-badge">${isRecent ? 'Recent' : isFav ? 'Favourite' : game.category}</div>
        ${window.LAGS_AUTH.isAuthenticated() ? `
        <button class="game-vote-btn ${voted ? 'voted' : ''}" data-game-id="${escapeHtml(game.id)}" aria-label="${voted ? 'Remove vote' : 'Upvote'} ${escapeHtml(game.title)}">
          <span class="vote-icon">▲</span><span class="vote-count">0</span>
        </button>` : ''}
      </div>
      <div class="game-card-info">
        <div class="game-card-title">${escapeHtml(game.title)}</div>
        <div class="game-card-category">${escapeHtml(game.category)}</div>
      </div>
      <button class="fav-btn" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}">
        ${isFav ? '★' : '☆'}
      </button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      if (e.target.closest('.game-vote-btn')) return;
      playGame(game);
    });

    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavourite(game.id, favBtn, card);
    });

    const voteBtn = card.querySelector('.game-vote-btn');
    if (voteBtn) {
      voteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); e.preventDefault();
        await handleVote(game.id, voteBtn);
      });
    }

    return card;
  }

  // --- Search ---
  function initSearch() {
    if (!els.gameSearch) return;

    els.gameSearch.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        els.searchClear.style.display = 'block';
        showSearchHints(val);
      } else {
        els.searchClear.style.display = 'none';
        els.searchHints.innerHTML = '';
      }
    });

    els.gameSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch(els.gameSearch.value.trim());
      }
    });

    els.searchClear.addEventListener('click', () => {
      els.gameSearch.value = '';
      els.searchClear.style.display = 'none';
      els.searchHints.innerHTML = '';
      els.gameSearch.focus();
    });
  }

  function showSearchHints(query) {
    if (!els.searchHints) return;
    const matches = games.filter(g =>
      g.title.toLowerCase().includes(query.toLowerCase()) ||
      g.category.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 6);

    if (matches.length === 0) {
      els.searchHints.innerHTML = '<div style="color:var(--text-muted);padding:6px 10px;">No matching games</div>';
      return;
    }

    els.searchHints.innerHTML = matches.map(g => `
      <div class="search-hint-item" data-path="${escapeHtml(g.path)}" data-title="${escapeHtml(g.title)}">
        <strong>${escapeHtml(g.title)}</strong>
        <span style="color:var(--text-muted);font-size:0.75rem;margin-left:8px;">${escapeHtml(g.category)}</span>
      </div>
    `).join('');

    els.searchHints.querySelectorAll('.search-hint-item').forEach(item => {
      item.addEventListener('click', () => {
        els.gameSearch.value = '';
        els.searchClear.style.display = 'none';
        els.searchHints.innerHTML = '';
        const path = item.getAttribute('data-path');
        if (path) window.location.href = path;
      });
    });
  }

  function performSearch(query) {
    if (!query) return;
    window.location.href = `library.html?search=${encodeURIComponent(query)}`;
  }

  // --- Favourites ---
  function initFavourites() {
    // already handled via toggleFavourite & updateFavouriteGrid
  }

  // --- Random Game ---
  function initRandom() {
    const goRandom = () => {
      if (games.length === 0) return;
      const random = games[Math.floor(Math.random() * games.length)];
      playGame(random);
    };
    if (els.navRandom) els.navRandom.addEventListener('click', (e) => { e.preventDefault(); goRandom(); });
    if (els.heroRandom) els.heroRandom.addEventListener('click', goRandom);
  }

  // --- Settings Modal ---
  function initSettings() {
    const modal = els.settingsModal;
    const close = () => { modal.classList.remove('open'); };
    if (els.openSettings) els.openSettings.addEventListener('click', () => { syncSettingsUI(); modal.classList.add('open'); });
    if (els.settingsClose) els.settingsClose.addEventListener('click', close);
    if (els.settingsBackdrop) els.settingsBackdrop.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });

    bindSetting('setting-meme-bg', 'change', (cb) => {
      const on = bg.toggleMemeBackground();
      updateMuteHint('meme-bg-hint', on);
      updateMemeToggleUI();
    });

    bindSetting('setting-overlay', 'input', (cb) => {
      const val = cb.target.value;
      document.getElementById('overlay-val').textContent = val + '%';
      bg.updateSetting('overlayOpacity', val / 100);
      document.getElementById('lags-bg-overlay').style.backgroundColor = `rgba(5,5,7,${val / 100})`;
    });

    bindSetting('setting-brightness', 'input', (cb) => {
      const val = cb.target.value;
      document.getElementById('brightness-val').textContent = val + '%';
      bg.updateSetting('brightness', parseInt(val, 10));
    });

    bindSetting('setting-blur', 'input', (cb) => {
      const val = cb.target.value;
      document.getElementById('blur-val').textContent = val + 'px';
      bg.updateSetting('blur', parseInt(val, 10));
    });

    bindSetting('setting-particles', 'change', (cb) => {
      const on = cb.target.checked;
      bg.updateSetting('particles', on);
      updateMuteHint('particles-hint', on);
    });

    bindSetting('setting-mouse', 'change', (cb) => {
      const on = cb.target.checked;
      bg.updateSetting('mouseInteraction', on);
      updateMuteHint('mouse-hint', on);
    });

    bindSetting('setting-intensity', 'input', (cb) => {
      const val = cb.target.value;
      document.getElementById('intensity-val').textContent = val + '%';
      bg.updateSetting('animationIntensity', parseInt(val, 10) / 100);
    });

    const applyBtn = document.getElementById('setting-meme-apply');
    const urlInput = document.getElementById('setting-meme-url');
    if (applyBtn && urlInput) {
      applyBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        bg.setMemeImage(url, 'both');
        urlInput.value = '';
      });
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
      });
    }

    const resetBtn = document.getElementById('settings-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        localStorage.removeItem('lags_background_settings');
        location.reload();
      });
    }

    const footerSettings = document.getElementById('footer-settings');
    if (footerSettings) footerSettings.addEventListener('click', (e) => { e.preventDefault(); els.openSettings.click(); });
  }

  function bindSetting(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(event, (e) => handler(e.target));
  }

  function syncSettingsUI() {
    if (!bg) return;
    const s = bg.settings;
    setChecked('setting-meme-bg', s.memeBackground);
    setChecked('setting-particles', s.particles);
    setChecked('setting-mouse', s.mouseInteraction);
    setVal('setting-overlay', Math.round(s.overlayOpacity * 100), 'overlay-val', '%');
    setVal('setting-brightness', s.brightness, 'brightness-val', '%');
    setVal('setting-blur', s.blur, 'blur-val', 'px');
    setVal('setting-intensity', Math.round(s.animationIntensity * 100), 'intensity-val', '%');
    const urlInput = document.getElementById('setting-meme-url');
    if (urlInput) urlInput.value = s.memeImage || '';
    updateMuteHint('meme-bg-hint', s.memeBackground);
    updateMuteHint('particles-hint', s.particles);
    updateMuteHint('mouse-hint', s.mouseInteraction);
    updateMemeToggleUI();
  }

  function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  }

  function setVal(id, val, labelId, suffix) {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (el) el.value = val;
    if (label) label.textContent = val + suffix;
  }

  function updateMuteHint(id, on) {
    const el = document.getElementById(id);
    if (el) el.textContent = on ? 'ON' : 'OFF';
  }

  function updateMemeToggleUI() {
    if (!els.memeToggle || !els.memeToggleState || !bg) return;
    const on = bg.settings.memeBackground;
    if (on) {
      els.memeToggle.classList.add('on');
      els.memeToggleState.textContent = 'ON';
    } else {
      els.memeToggle.classList.remove('on');
      els.memeToggleState.textContent = 'OFF';
    }
  }

  // --- Mobile Menu ---
  function initMobileMenu() {
    if (!els.mobileMenuBtn || !els.nav) return;
    els.mobileMenuBtn.addEventListener('click', () => {
      const open = els.nav.classList.toggle('open');
      els.mobileMenuBtn.setAttribute('aria-expanded', open);
    });
  }

  // --- Navigation Highlight ---
  function initNavigation() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    els.nav.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#') && href === path) {
        link.classList.add('active');
      }
    });
  }

  // --- Helpers ---
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  }

  // Expose for inline usage
  window.LAGS = { games, favourites, recentlyPlayed, toggleFavourite, playGame, userVoteState };

})();
