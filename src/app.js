const state = {
  dataset: [],
  betHistory: [],
  marketFilter: 'All',
  sortMode: 'qi',
  lastRefresh: null,
  dataSource: 'Not loaded',
  selectedMatchName: null,
  activeView: 'matches'
};

const plainMarketNames = {
  'Player Prop': 'Player bet',
  'Exact Score': 'Exact score',
  Moneyline: 'Match result',
  Spread: 'Handicap',
  'Double Chance': 'Double Chance',
  'Market Watch': 'Market watch',
  'Market Baseline': 'Market baseline',
  'Full Match Model': 'Full match model',
  Totals: 'Goals total',
  All: 'All'
};

const plainGameNotes = {
  'USA vs Paraguay': 'USA are expected to have more of the ball. Paraguay may need to defend for long spells, so the card bet on Omar Alderete stands out.',
  'Australia vs Turkiye': 'Australia are expected to keep the game tight and physical. The pitch may make Turkiye less smooth in attack, which helps Australia avoid defeat.',
  'Brazil vs Morocco': 'Brazil should create pressure, but Morocco are set up to defend well. The handicap on Morocco gives protection if Brazil only win by one goal.',
  'Qatar vs Switzerland': 'Switzerland should control the tempo, while Qatar sit deep. That points toward a low-scoring game.',
  'Haiti vs Scotland': 'Scotland look better suited to control the match. Haiti rely on speed, but the surface may make those breakaway attacks harder.'
};

const playerPropBooks = ['Sportsbet', 'Neds', 'PointsBet', 'TAB', 'BetRight'];

const formatter = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

async function loadDataset({ bustCache = false } = {}) {
  if (window.location.protocol === 'file:') {
    state.dataset = JSON.parse(JSON.stringify(window.embeddedDataset));
    state.dataSource = 'Embedded local copy from data/weekend_payload.json';
    state.lastRefresh = new Date();
    return;
  }

  try {
    const url = `./data/weekend_payload.json?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Dataset failed to load: ${response.status}`);
    }
    state.dataset = await response.json();
    state.dataSource = 'data/weekend_payload.json';
  } catch (error) {
    state.dataset = JSON.parse(JSON.stringify(window.embeddedDataset));
    state.dataSource = 'Embedded local copy from data/weekend_payload.json';
    document.querySelector('[data-app-error]').textContent = '';
  }

  state.lastRefresh = new Date();
}

async function loadBetHistory({ bustCache = false } = {}) {
  if (window.location.protocol === 'file:') {
    state.betHistory = JSON.parse(JSON.stringify(window.embeddedBetHistory || []));
    return;
  }

  try {
    const url = `./data/bet_history.json?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Bet history failed to load: ${response.status}`);
    }
    state.betHistory = await response.json();
  } catch {
    state.betHistory = JSON.parse(JSON.stringify(window.embeddedBetHistory || []));
  }
}

function getReferenceDate() {
  const kickoffDates = state.dataset.map((fixture) => new Date(fixture.kickoff_time_aest));
  const earliestKickoff = new Date(Math.min(...kickoffDates));
  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  if (Math.abs(earliestKickoff - today) > 180 * oneDay) {
    return new Date('2026-06-12T00:00:00+10:00');
  }

  return today;
}

function parseKickoff(value) {
  return new Date(`${value}+10:00`);
}

function getFixturesInWindow() {
  const start = getReferenceDate();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return state.dataset
    .filter((fixture) => {
      const kickoff = parseKickoff(fixture.kickoff_time_aest);
      return kickoff >= start && kickoff <= end;
    })
    .sort((a, b) => parseKickoff(a.kickoff_time_aest) - parseKickoff(b.kickoff_time_aest));
}

function getUpcomingFixtures() {
  const now = new Date();
  return getFixturesInWindow().filter((fixture) => parseKickoff(fixture.kickoff_time_aest) > now);
}

function getCompletedFixtures() {
  const now = new Date();
  return getFixturesInWindow().filter((fixture) => parseKickoff(fixture.kickoff_time_aest) <= now);
}

function getSelectedFixture() {
  const fixtures = getUpcomingFixtures();
  const selected = fixtures.find((fixture) => fixture.match_name === state.selectedMatchName);

  if (selected) return selected;

  state.selectedMatchName = fixtures[0]?.match_name || null;
  return fixtures[0];
}

function formatKickoff(value) {
  return `${formatter.format(parseKickoff(value))} AEST`;
}

function minutesSince(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function priceFreshness(fixture) {
  const minutes = minutesSince(fixture.odds_last_checked);
  if (minutes === null) {
    return {
      className: 'stale',
      label: 'Prices not checked',
      detail: 'No Odds API refresh timestamp is saved for this match.'
    };
  }

  if (minutes <= 20) {
    return {
      className: 'fresh',
      label: `Prices fresh (${minutes} min ago)`,
      detail: fixture.odds_refresh_note || 'Odds API checked recently.'
    };
  }

  if (minutes <= 45) {
    return {
      className: 'watch',
      label: `Prices checked ${minutes} min ago`,
      detail: fixture.odds_refresh_note || 'Odds API checked recently.'
    };
  }

  return {
    className: 'stale',
    label: `STALE prices (${minutes} min old)`,
    detail: fixture.odds_refresh_note || 'Needs a fresh Odds API check.'
  };
}

function getFilteredMarkets() {
  const fixture = getSelectedFixture();
  if (!fixture) return [];

  const rows = flattenMarkets([fixture]);
  const filtered = state.marketFilter === 'All'
    ? rows
    : rows.filter((market) => market.market_matrix === state.marketFilter);

  return filtered.sort((a, b) => {
    if (state.sortMode === 'ev') return b.metrics.ev - a.metrics.ev;
    if (state.sortMode === 'odds') return b.current_odds - a.current_odds;
    return b.metrics.qi - a.metrics.qi;
  });
}

function metricClass(qi) {
  if (!Number.isFinite(qi) || qi <= 0) return 'no-score';
  if (qi >= 90) return 'elite';
  if (qi >= 85) return 'strong';
  if (qi >= 70) return 'good';
  if (qi >= 50) return 'watch';
  return 'weak';
}

function hasModelPrice(market) {
  return Number.isFinite(Number.parseFloat(market.true_price)) && Number.parseFloat(market.true_price) > 1;
}

function formatQi(market) {
  return hasModelPrice(market) ? market.metrics.qi : '-';
}

function formatModelPrice(market) {
  return hasModelPrice(market) ? `$${market.true_price.toFixed(2)}` : 'Not priced';
}

function formatEv(market) {
  if (!hasModelPrice(market)) return '-';
  const prefix = market.metrics.ev > 0 ? '+' : '';
  return `${prefix}${market.metrics.ev.toFixed(2)}%`;
}

function evClass(market) {
  if (!hasModelPrice(market)) return '';
  return market.metrics.ev >= 0 ? 'positive' : 'negative';
}

function formatBookCell(market) {
  const book = `<span class="pill">${market.au_bookie}</span>`;
  if (market.market_matrix !== 'Player Prop') return book;

  return `${book}<span class="sub-cell">Prop books: ${playerPropBooks.join(', ')}</span>`;
}

function formatRefereeStatus(fixture) {
  const status = fixture.referee_status || (fixture.referee_name === 'Referee not verified' ? 'not_verified' : 'provided');
  const labels = {
    verified: 'Verified source',
    provided: 'Provided, not verified',
    not_verified: 'Not verified yet'
  };

  return labels[status] || labels.provided;
}

function refereeStatusClass(fixture) {
  const status = fixture.referee_status || (fixture.referee_name === 'Referee not verified' ? 'not_verified' : 'provided');
  return `ref-${status}`;
}

function renderSummary() {
  const fixtures = getUpcomingFixtures();
  const rows = flattenMarkets(fixtures);
  const pricedRows = rows.filter(hasModelPrice);
  const top = [...pricedRows].sort((a, b) => b.metrics.qi - a.metrics.qi)[0];
  const bestEv = pricedRows.reduce((best, row) => row.metrics.ev > best.metrics.ev ? row : best, pricedRows[0]);

  document.querySelector('[data-summary-fixtures]').textContent = fixtures.length;
  document.querySelector('[data-summary-markets]').textContent = rows.length;
  document.querySelector('[data-summary-best]').textContent = top ? `${top.target_selection} (QI = ${top.metrics.qi})` : '-';
  document.querySelector('[data-summary-ev]').textContent = bestEv ? `${bestEv.target_selection} ${formatEv(bestEv)}` : '-';
}

function renderDataPanel() {
  const refreshText = state.lastRefresh
    ? formatter.format(state.lastRefresh)
    : 'Not refreshed yet';
  const refreshElement = document.querySelector('[data-last-refresh]');
  const headerRefreshElement = document.querySelector('[data-header-refresh]');
  const noteElement = document.querySelector('[data-refresh-note]');

  if (refreshElement) {
    refreshElement.textContent = refreshText;
  }
  if (headerRefreshElement) {
    headerRefreshElement.textContent = `Last refresh: ${refreshText}`;
  }
  if (noteElement && !noteElement.dataset.userMessage) {
    noteElement.textContent = '';
  }
}

function renderViewTabs() {
  document.querySelectorAll('[data-view-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.viewTab === state.activeView);
  });

  document.querySelectorAll('[data-view-section]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.viewSection !== state.activeView);
  });

  document.querySelector('[data-history-count]').textContent = state.betHistory.length || flattenMarkets(getUpcomingFixtures()).length;
  document.querySelector('[data-completed-count]').textContent = getCompletedFixtures().length;
}

function renderSourceTable() {
  const tableBody = document.querySelector('[data-source-table]');
  if (!tableBody) return;

  const rows = flattenMarkets(getUpcomingFixtures())
    .sort((a, b) => new Date(a.kickoff_time_aest) - new Date(b.kickoff_time_aest));

  tableBody.innerHTML = rows.map((market) => `
    <tr>
      <td>${market.match_name}</td>
      <td>${formatKickoff(market.kickoff_time_aest)}</td>
      <td><span class="primary-cell">${market.target_selection}</span><span class="sub-cell">${plainMarketNames[market.market_matrix] || market.market_matrix}</span></td>
      <td>$${market.current_odds.toFixed(2)}</td>
      <td>${formatModelPrice(market)}</td>
      <td><span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQi(market)}</span></td>
      <td>${formatBookCell(market)}</td>
    </tr>
  `).join('');
}

function renderFilters() {
  const fixture = getSelectedFixture();
  const filters = ['All', ...new Set(flattenMarkets(fixture ? [fixture] : []).map((market) => market.market_matrix))];
  const container = document.querySelector('[data-market-filters]');

  if (!fixture) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = filters.map((filter) => `
    <button class="segmented-button ${state.marketFilter === filter ? 'active' : ''}" data-filter="${filter}">
      ${plainMarketNames[filter] || filter}
    </button>
  `).join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.marketFilter = button.dataset.filter;
      render();
    });
  });
}

function renderSelectedMarketTitle() {
  const fixture = getSelectedFixture();
  document.querySelector('[data-selected-market-title]').textContent = fixture
    ? `${fixture.match_name} Bet Options`
    : 'Bet Options';
}

function renderMarketsTable() {
  const tableBody = document.querySelector('[data-market-table]');
  const rows = getFilteredMarkets();

  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7">No available games for selection. Started games are shown in the Completed tab.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((market) => `
    <tr>
      <td><span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQi(market)}</span></td>
      <td>
        <span class="primary-cell">${market.target_selection}</span>
        <span class="sub-cell">${market.match_name}</span>
      </td>
      <td>${plainMarketNames[market.market_matrix] || market.market_matrix}</td>
      <td>$${market.current_odds.toFixed(2)}</td>
      <td>${formatModelPrice(market)}</td>
      <td class="${evClass(market)}">${formatEv(market)}</td>
      <td>${formatBookCell(market)}</td>
    </tr>
  `).join('');
}

function renderHighValueBets() {
  const container = document.querySelector('[data-high-value-bets]');
  const rows = flattenMarkets(getUpcomingFixtures())
    .filter(hasModelPrice)
    .filter((market) => market.metrics.qi >= 80)
    .sort((a, b) => b.metrics.qi - a.metrics.qi);

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No QI 80+ options are available right now.</p>';
    return;
  }

  container.innerHTML = rows.map((market) => `
    <article class="high-value-card">
      <div class="card-topline">
        <span class="qi-badge ${metricClass(market.metrics.qi)}">QI ${market.metrics.qi}</span>
        <span class="pill">${market.au_bookie}</span>
      </div>
      <h3>${market.target_selection}</h3>
      <p>${market.match_name}</p>
      ${market.market_matrix === 'Player Prop' ? `<p class="source-note">Checked books: ${playerPropBooks.join(', ')}</p>` : ''}
      <dl>
        <div><dt>Type</dt><dd>${plainMarketNames[market.market_matrix] || market.market_matrix}</dd></div>
        <div><dt>Odds</dt><dd>$${market.current_odds.toFixed(2)}</dd></div>
        <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
        <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
      </dl>
    </article>
  `).join('');
}

function renderMatchTabs() {
  const container = document.querySelector('[data-match-tabs]');
  const fixtures = getUpcomingFixtures();

  if (state.selectedMatchName && !fixtures.some((fixture) => fixture.match_name === state.selectedMatchName)) {
    state.selectedMatchName = null;
  }

  if (!state.selectedMatchName && fixtures.length > 0) {
    state.selectedMatchName = fixtures[0].match_name;
  }

  if (fixtures.length === 0) {
    container.innerHTML = '<p class="empty-note">No available games for selection right now. Started games are in the Completed tab.</p>';
    return;
  }

  container.innerHTML = fixtures.map((fixture) => {
    const bestOption = fixture.markets
      .filter(hasModelPrice)
      .map((market) => ({ ...market, metrics: runVectorCalculations(market) }))
      .sort((a, b) => b.metrics.qi - a.metrics.qi)[0];
    const isActive = fixture.match_name === state.selectedMatchName;

    return `
      <button class="match-tab ${isActive ? 'active' : ''}" data-match-name="${fixture.match_name}" type="button">
        <span>${fixture.match_name}</span>
        <small>${formatKickoff(fixture.kickoff_time_aest)} | ${bestOption ? `Top QI ${bestOption.metrics.qi}` : 'Market watch'} | ${priceFreshness(fixture).label}</small>
      </button>
    `;
  }).join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedMatchName = button.dataset.matchName;
      state.marketFilter = 'All';
      render();
    });
  });
}

function renderFixturePanels() {
  const container = document.querySelector('[data-fixtures]');
  const fixture = getSelectedFixture();

  if (!fixture) {
    container.innerHTML = '';
    return;
  }

  const markets = fixture.markets.map((market) => ({
      ...market,
      metrics: runVectorCalculations(market)
    })).sort((a, b) => b.metrics.qi - a.metrics.qi);
  const freshness = priceFreshness(fixture);

  container.innerHTML = `
      <section class="fixture-panel">
        <div class="fixture-heading">
          <div>
            <h2>${fixture.match_name}</h2>
            <p>${fixture.pitch_type} | ${formatKickoff(fixture.kickoff_time_aest)}</p>
          </div>
          <span class="official ${refereeStatusClass(fixture)}">
            ${fixture.referee_name}
            <small>${formatRefereeStatus(fixture)}</small>
          </span>
        </div>
        <p class="tactical-summary">${plainGameNotes[fixture.match_name] || fixture.tactical_summary}</p>
        <div class="fixture-meta">
          <span class="price-freshness ${freshness.className}"><strong>Price check:</strong> ${freshness.label}<em>${freshness.detail}</em></span>
          <span><strong>Pitch note:</strong> ${fixture.pitch_constraints}</span>
          <span><strong>Referee implication:</strong> ${fixture.referee_tendencies} ${fixture.referee_source ? `<em>${fixture.referee_source}</em>` : ''}</span>
        </div>
        <div class="market-grid">
          ${markets.map((market) => `
            <article class="market-card">
              <div class="card-topline">
                <span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQi(market)}</span>
                <span class="pill">${market.au_bookie}</span>
              </div>
              <h3>${market.target_selection}</h3>
              ${market.market_matrix === 'Player Prop' ? `<p class="source-note">Checked books: ${playerPropBooks.join(', ')}</p>` : ''}
              <dl>
                <div><dt>Type</dt><dd>${plainMarketNames[market.market_matrix] || market.market_matrix}</dd></div>
                <div><dt>Odds</dt><dd>$${market.current_odds.toFixed(2)}</dd></div>
                <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
                <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
              </dl>
            </article>
          `).join('')}
        </div>
      </section>
    `;
}

function renderBetHistory() {
  const tableBody = document.querySelector('[data-history-table]');
  const rows = state.betHistory.length > 0
    ? [...state.betHistory]
      .filter((bet) => Number(bet.opening_qi) >= 70)
      .sort((a, b) => new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0))
    : flattenMarkets(getUpcomingFixtures())
      .filter((market) => market.metrics.qi >= 70)
      .map((market) => ({
          match_name: market.match_name,
          target_selection: market.target_selection,
          market_matrix: market.market_matrix,
          au_bookie: market.au_bookie,
          opening_odds: market.current_odds,
          current_odds: market.current_odds,
          closing_odds: null,
          clv_percent: null,
          opening_qi: market.metrics.qi,
          current_qi: market.metrics.qi
        }))
      .sort((a, b) => b.current_qi - a.current_qi);

  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9">No QI 70+ bets available right now.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((bet) => `
    <tr>
      <td>${bet.match_name}</td>
      <td><span class="primary-cell">${bet.target_selection}</span><span class="sub-cell">${plainMarketNames[bet.market_matrix] || bet.market_matrix}</span></td>
      <td><span class="pill">${bet.au_bookie}</span></td>
      <td>${formatHistoryPrice(bet.opening_odds)}</td>
      <td>${formatHistoryPrice(bet.current_odds)}</td>
      <td>${formatHistoryPrice(bet.closing_odds, 'Pending')}${formatClosingDetail(bet)}</td>
      <td class="${Number(bet.clv_percent) >= 0 ? 'positive' : Number.isFinite(Number(bet.clv_percent)) ? 'negative' : ''}">${formatClv(bet.clv_percent)}</td>
      <td><span class="qi-badge ${metricClass(Number(bet.opening_qi))}">${Number.isFinite(Number(bet.opening_qi)) ? bet.opening_qi : '-'}</span></td>
      <td><span class="qi-badge ${metricClass(bet.current_qi)}">${Number.isFinite(Number(bet.current_qi)) ? bet.current_qi : '-'}</span></td>
    </tr>
  `).join('');
}

function renderCompletedGames() {
  const tableBody = document.querySelector('[data-completed-table]');
  const fixtures = getCompletedFixtures();

  if (!tableBody) return;

  if (fixtures.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5">No games have started yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = fixtures.map((fixture) => {
    const bestOption = (fixture.markets || [])
      .filter(hasModelPrice)
      .map((market) => ({ ...market, metrics: runVectorCalculations(market) }))
      .sort((a, b) => b.metrics.qi - a.metrics.qi)[0];
    const freshness = priceFreshness(fixture);

    return `
      <tr>
        <td>${fixture.match_name}</td>
        <td>${formatKickoff(fixture.kickoff_time_aest)}</td>
        <td><span class="primary-cell">${freshness.label}</span><span class="sub-cell">${fixture.odds_refresh_note || 'No refresh note saved.'}</span></td>
        <td>${bestOption ? `<span class="primary-cell">${bestOption.target_selection}</span><span class="sub-cell">${plainMarketNames[bestOption.market_matrix] || bestOption.market_matrix} | ${bestOption.au_bookie} | $${bestOption.current_odds.toFixed(2)}</span>` : '-'}</td>
        <td>${bestOption ? `<span class="qi-badge ${metricClass(bestOption.metrics.qi)}">${bestOption.metrics.qi}</span>` : '-'}</td>
      </tr>
    `;
  }).join('');
}

function formatHistoryPrice(value, fallback = '-') {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : fallback;
}

function formatClv(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatClosingDetail(bet) {
  if (!bet.closing_captured_at) return '<span class="sub-cell">Captures at kickoff</span>';

  return `<span class="sub-cell">${formatter.format(new Date(bet.closing_captured_at))} AEST${bet.closing_source ? ` | ${bet.closing_source}` : ''}</span>`;
}

function bindSortControls() {
  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      state.sortMode = button.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach((item) => item.classList.toggle('active', item === button));
      renderMarketsTable();
    });
  });
}

function bindRefreshOdds() {
  const button = document.querySelector('[data-refresh-odds]');
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Refreshing...';
    document.querySelector('[data-app-error]').textContent = '';

    await loadDataset({ bustCache: true });
    await loadBetHistory({ bustCache: true });
    render();

    button.disabled = false;
    button.textContent = 'Refresh odds';
    const noteElement = document.querySelector('[data-refresh-note]');
    if (noteElement) {
      noteElement.dataset.userMessage = 'true';
      noteElement.textContent = 'Odds refreshed and QI was recalculated.';
    }
  });
}

function bindViewTabs() {
  document.querySelectorAll('[data-view-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.viewTab;
      render();
    });
  });
}

function render() {
  renderViewTabs();
  renderDataPanel();
  renderSourceTable();
  renderSummary();
  renderHighValueBets();
  renderMatchTabs();
  renderFilters();
  renderSelectedMarketTitle();
  renderMarketsTable();
  renderFixturePanels();
  renderCompletedGames();
  renderBetHistory();
}

Promise.all([loadDataset(), loadBetHistory()])
  .then(() => {
    window.betmateAppReady = true;
    document.documentElement.dataset.betmateAppReady = 'true';
    document.querySelector('[data-app-error]').textContent = '';
    bindSortControls();
    bindRefreshOdds();
    bindViewTabs();
    render();
  })
  .catch((error) => {
    console.error(error);
    document.querySelector('[data-app-error]').textContent = '';
  });
