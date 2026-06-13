const state = {
  dataset: [],
  betHistory: [],
  playerPropWatchlist: [],
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
  'Asian Handicap': 'Asian handicap',
  'Draw No Bet': 'Draw no bet',
  'Double Chance': 'Double Chance',
  'Both Teams To Score': 'Both teams to score',
  BTTS: 'Both teams to score',
  'Team Totals': 'Team goals',
  'Half Time Full Time': 'Half time / full time',
  'Odd Even': 'Odd / even',
  'First Half Moneyline': 'First half result',
  'Second Half Moneyline': 'Second half result',
  'First Half Spread': 'First half handicap',
  'Second Half Spread': 'Second half handicap',
  'First Half Totals': 'First half goals',
  'Second Half Totals': 'Second half goals',
  'First Half Team Totals': 'First half team goals',
  'Second Half Team Totals': 'Second half team goals',
  'First Half Both Teams To Score': 'First half BTTS',
  'Second Half Both Teams To Score': 'Second half BTTS',
  'First Half Double Chance': 'First half double chance',
  'Second Half Double Chance': 'Second half double chance',
  'First Half Odd Even': 'First half odd / even',
  'Corners Spread': 'Corners handicap',
  'Corners Totals': 'Corners total',
  'First Half Corners Totals': 'First half corners',
  'Cards Spread': 'Cards handicap',
  'Cards Totals': 'Cards total',
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

async function loadPlayerPropWatchlist({ bustCache = false } = {}) {
  if (window.location.protocol === 'file:') {
    state.playerPropWatchlist = JSON.parse(JSON.stringify(window.embeddedPlayerProps || []));
    return;
  }

  try {
    const url = `./data/player_props_watchlist.json?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Player prop watchlist failed to load: ${response.status}`);
    }
    state.playerPropWatchlist = await response.json();
  } catch {
    state.playerPropWatchlist = JSON.parse(JSON.stringify(window.embeddedPlayerProps || []));
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
  const verifiedCount = (fixture.markets || []).filter((market) => {
    return ['checked_current', 'updated', 'added_from_oddsapi'].includes(market.odds_refresh_status);
  }).length;
  const checkedText = verifiedCount > 0
    ? `${verifiedCount} current prices checked.`
    : 'Prices checked.';

  if (minutes === null) {
    return {
      className: 'stale',
      label: 'Prices not checked',
      detail: 'Waiting for the next price refresh.'
    };
  }

  if (minutes <= 20) {
    return {
      className: 'fresh',
      label: `Prices fresh (${minutes} min ago)`,
      detail: checkedText
    };
  }

  if (minutes <= 45) {
    return {
      className: 'watch',
      label: `Prices checked ${minutes} min ago`,
      detail: checkedText
    };
  }

  return {
    className: 'stale',
    label: `STALE prices (${minutes} min old)`,
    detail: 'Needs a fresh price refresh.'
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
    if (state.sortMode === 'edge') return Number(b.quality?.edge || 0) - Number(a.quality?.edge || 0);
    if (state.sortMode === 'ev') return b.metrics.ev - a.metrics.ev;
    if (state.sortMode === 'odds') return Number.parseFloat(b.current_odds || 0) - Number.parseFloat(a.current_odds || 0);
    return compareBetQuality(a, b);
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

function hasMarketOdds(market) {
  return Number.isFinite(Number.parseFloat(market.current_odds)) && Number.parseFloat(market.current_odds) > 1;
}

function formatQi(market) {
  return hasModelPrice(market) && hasMarketOdds(market) ? market.metrics.qi : '-';
}

function formatModelPrice(market) {
  return hasModelPrice(market) ? `$${market.true_price.toFixed(2)}` : 'Not priced';
}

function formatModelProb(market) {
  if (!hasModelPrice(market)) return '-';
  return `${((1 / Number.parseFloat(market.true_price)) * 100).toFixed(1)}%`;
}

function formatOdds(market) {
  return hasMarketOdds(market) ? `$${Number.parseFloat(market.current_odds).toFixed(2)}` : 'Not priced';
}

function formatEv(market) {
  if (!hasModelPrice(market) || !hasMarketOdds(market)) return '-';
  const prefix = market.metrics.ev > 0 ? '+' : '';
  return `${prefix}${market.metrics.ev.toFixed(2)}%`;
}

function evClass(market) {
  if (!hasModelPrice(market) || !hasMarketOdds(market)) return '';
  return market.metrics.ev >= 0 ? 'positive' : 'negative';
}

function formatBookProb(market) {
  if (!market.quality || !Number.isFinite(Number(market.quality.book_probability))) return '-';
  return `${Number(market.quality.book_probability).toFixed(1)}%`;
}

function formatEdge(market) {
  if (!market.quality || !Number.isFinite(Number(market.quality.edge))) return '-';
  return `${Number(market.quality.edge) > 0 ? '+' : ''}${Number(market.quality.edge).toFixed(2)} pts`;
}

function edgeClass(market) {
  if (!market.quality || !Number.isFinite(Number(market.quality.edge))) return '';
  return Number(market.quality.edge) >= 0 ? 'positive' : 'negative';
}

function formatRisk(market) {
  return `<span class="risk-pill">${market.quality?.risk || 'Watch'}</span>`;
}

function formatBookCell(market) {
  return `<span class="pill">${market.au_bookie || 'Model only'}</span>`;
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
  const pricedRows = rows.filter((row) => hasModelPrice(row) && hasMarketOdds(row));
  const top = [...pricedRows].sort(compareBetQuality)[0];
  const bestEv = pricedRows.reduce((best, row) => row.metrics.ev > best.metrics.ev ? row : best, pricedRows[0]);

  document.querySelector('[data-summary-fixtures]').textContent = fixtures.length;
  document.querySelector('[data-summary-markets]').textContent = rows.length;
  document.querySelector('[data-summary-best]').textContent = top
    ? `${top.match_name}: ${top.target_selection} | QI ${top.metrics.qi} | Edge ${formatEdge(top)} | Risk ${top.quality.risk}`
    : '-';
  document.querySelector('[data-summary-ev]').textContent = bestEv
    ? `${bestEv.match_name}: ${bestEv.target_selection} | EV ${formatEv(bestEv)} | QI ${bestEv.metrics.qi}`
    : '-';
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
      <td>${formatOdds(market)}</td>
      <td>${formatModelPrice(market)}</td>
      <td>${formatModelProb(market)}</td>
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
    tableBody.innerHTML = '<tr><td colspan="10">No available games for selection. Started games are shown in the Completed tab.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((market) => `
    <tr>
      <td><span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQi(market)}</span></td>
      <td>
        <span class="primary-cell">${market.target_selection}</span>
        <span class="sub-cell">${market.match_name}</span>
      </td>
      <td>${formatOdds(market)}</td>
      <td>${formatModelPrice(market)}</td>
      <td>${formatModelProb(market)}</td>
      <td>${formatBookProb(market)}</td>
      <td class="${edgeClass(market)}">${formatEdge(market)}</td>
      <td class="${evClass(market)}">${formatEv(market)}</td>
      <td>${formatRisk(market)}</td>
      <td>${formatBookCell(market)}</td>
    </tr>
  `).join('');
}

function renderHighValueBets() {
  const container = document.querySelector('[data-high-value-bets]');
  const rows = flattenMarkets(getUpcomingFixtures())
    .filter(hasModelPrice)
    .filter(hasMarketOdds)
    .filter((market) => market.metrics.qi >= 80)
    .sort(compareBetQuality);

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
      <p class="match-name">${market.match_name}</p>
      <h3>${market.target_selection}</h3>
      <dl>
        <div><dt>QI</dt><dd><span class="qi-badge ${metricClass(market.metrics.qi)}">${market.metrics.qi}</span></dd></div>
        <div><dt>Odds</dt><dd>${formatOdds(market)}</dd></div>
        <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
        <div><dt>Model Prob</dt><dd>${formatModelProb(market)}</dd></div>
        <div><dt>Book Prob</dt><dd>${formatBookProb(market)}</dd></div>
        <div><dt>Edge</dt><dd class="${edgeClass(market)}">${formatEdge(market)}</dd></div>
        <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
        <div><dt>Risk</dt><dd>${market.quality.risk}</dd></div>
      </dl>
    </article>
  `).join('');
}

function getMatchModelHighlights() {
  const pricedSelections = flattenMarkets(getUpcomingFixtures())
    .filter(hasModelPrice)
    .map((market) => ({
      match_name: market.match_name,
      selection: market.target_selection,
      market: plainMarketNames[market.market_matrix] || market.market_matrix,
      category: 'Priced selection',
      probability: Number(((1 / Number.parseFloat(market.true_price)) * 100).toFixed(1)),
      fair_price: Number.parseFloat(market.true_price),
      odds: hasMarketOdds(market) ? Number.parseFloat(market.current_odds) : null,
      book: market.au_bookie || 'Model only'
    }));

  const markovSelections = getUpcomingFixtures().flatMap((fixture) => {
    return (fixture.markov_market_model || []).map((item) => ({
      match_name: fixture.match_name,
      selection: item.selection,
      market: item.market,
      category: item.category,
      probability: Number(item.probability),
      fair_price: Number(item.fair_price),
      odds: null,
      book: 'Model only'
    }));
  });

  return [...pricedSelections, ...markovSelections]
    .filter((item) => Number.isFinite(item.probability) && item.probability >= 55)
    .sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      return a.match_name.localeCompare(b.match_name) || a.selection.localeCompare(b.selection);
    });
}

function renderMatchModelHighlights() {
  const container = document.querySelector('[data-match-model-highlights]');
  if (!container) return;

  const rows = getMatchModelHighlights();

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No model selections are 55% or higher right now.</p>';
    return;
  }

  container.innerHTML = `
    <div class="match-model-summary">${rows.length} selections at 55%+ model probability</div>
    <div class="match-model-scroll">
      ${rows.map((row) => `
        <article class="match-model-row">
          <div>
            <strong>${row.selection}</strong>
            <span>${row.match_name} | ${row.category} | ${row.market}</span>
          </div>
          <dl>
            <div><dt>Model Prob</dt><dd>${row.probability.toFixed(1)}%</dd></div>
            <div><dt>Fair Price</dt><dd>$${row.fair_price.toFixed(2)}</dd></div>
            <div><dt>Odds</dt><dd>${Number.isFinite(row.odds) ? `$${row.odds.toFixed(2)}` : '-'}</dd></div>
            <div><dt>Book</dt><dd>${row.book}</dd></div>
          </dl>
        </article>
      `).join('')}
    </div>
  `;
}

function getSportsbookScanRows() {
  return getUpcomingFixtures()
    .flatMap((fixture) => {
      const scan = fixture.market_scan || {};
      return (scan.rows || []).map((row) => ({
        ...row,
        match_name: fixture.match_name,
        kickoff_time_aest: fixture.kickoff_time_aest,
        bookmaker: row.au_bookie || scan.bookmaker || 'AU bookie',
        checked_at: scan.checked_at,
        offered_market_keys: scan.offered_market_keys || [],
        quality: buildBetQualityFromPrices(row.model_price, row.current_odds)
      }));
    })
    .filter((row) => Number.isFinite(Number(row.current_odds)) && Number.isFinite(Number(row.model_price)))
    .sort(compareBetQuality);
}

function renderSportsbookScan() {
  const container = document.querySelector('[data-sportsbook-scan]');
  if (!container) return;

  const rows = getSportsbookScanRows();

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No AU bookie rows are matched to the model right now.</p>';
    return;
  }

  const topRows = rows.slice(0, 36);
  const bookies = [...new Set(rows.map((row) => row.bookmaker).filter(Boolean))].sort();
  const livePlayerPropRows = rows.filter((row) => String(row.oddsapi_market || '').startsWith('player_')).length;
  const watchlistPropCount = getUpcomingPlayerProps().length;
  const playerPropNote = livePlayerPropRows > 0
    ? `${livePlayerPropRows} live player prop rows are included in this scan.`
    : `${watchlistPropCount} model-only player props are on the watchlist, but no live AU bookie player-prop odds were returned by OddsAPI in this scan.`;

  container.innerHTML = `
    <div class="sportsbook-scan-summary">${rows.length} AU bookie rows matched to model prices from ${bookies.join(', ')}. Sorted by combined QI first, then Edge/EV.</div>
    <p class="source-note">${playerPropNote}</p>
    <div class="sportsbook-scan-table">
      <table>
        <thead>
          <tr>
            <th>QI</th>
            <th>Match</th>
            <th>Selection</th>
            <th>Odds</th>
            <th>Model Price</th>
            <th>Model Prob</th>
            <th>Book Prob</th>
            <th>Edge</th>
            <th>EV</th>
            <th>Risk</th>
            <th>AU Bookie</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((row) => `
            <tr>
              <td><span class="qi-badge ${metricClass(Number(row.qi))}">${Number.isFinite(Number(row.qi)) ? row.qi : '-'}</span></td>
              <td><span class="primary-cell">${row.match_name}</span><span class="sub-cell">${formatKickoff(row.kickoff_time_aest)}</span></td>
              <td><span class="primary-cell">${row.selection}</span><span class="sub-cell">${row.market} | ${row.oddsapi_market}</span></td>
              <td>$${Number(row.current_odds).toFixed(2)}</td>
              <td>$${Number(row.model_price).toFixed(2)}</td>
              <td>${Number(row.model_probability).toFixed(1)}%</td>
              <td>${Number(row.quality.book_probability).toFixed(1)}%</td>
              <td class="${Number(row.quality.edge) >= 0 ? 'positive' : 'negative'}">${Number(row.quality.edge) > 0 ? '+' : ''}${Number(row.quality.edge).toFixed(2)} pts</td>
              <td class="${Number(row.ev) >= 0 ? 'positive' : 'negative'}">${Number(row.ev) > 0 ? '+' : ''}${Number(row.ev).toFixed(2)}%</td>
              <td><span class="risk-pill">${row.quality.risk}</span></td>
              <td><span class="pill">${row.bookmaker}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function formatModelOnlyPrice(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : 'Not priced';
}

function formatModelOnlyProb(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 1 ? `${((1 / numeric) * 100).toFixed(1)}%` : '-';
}

function getUpcomingPlayerProps() {
  const upcomingMatches = new Set(getUpcomingFixtures().map((fixture) => fixture.match_name));
  const now = new Date();

  return state.playerPropWatchlist
    .filter((prop) => upcomingMatches.has(prop.match_name))
    .filter((prop) => parseKickoff(prop.kickoff_time_aest) > now)
    .sort((a, b) => {
      const timeDiff = parseKickoff(a.kickoff_time_aest) - parseKickoff(b.kickoff_time_aest);
      if (timeDiff !== 0) return timeDiff;
      return `${a.player} ${a.market}`.localeCompare(`${b.player} ${b.market}`);
    });
}

function getPlayerPropsForMatch(matchName) {
  return getUpcomingPlayerProps().filter((prop) => prop.match_name === matchName);
}

function renderPlayerPropCard(prop, { showMatch = true } = {}) {
  return `
    <article class="prop-watch-card">
      <div class="card-topline">
        <span class="pill model-only-pill">Model only</span>
        <span class="sub-cell">${formatKickoff(prop.kickoff_time_aest)}</span>
      </div>
      ${showMatch ? `<p class="match-name">${prop.match_name}</p>` : ''}
      <h3>${prop.player}: ${prop.market}</h3>
      <dl>
        <div><dt>Model Price</dt><dd>${formatModelOnlyPrice(prop.model_price)}</dd></div>
        <div><dt>Model Prob</dt><dd>${formatModelOnlyProb(prop.model_price)}</dd></div>
      </dl>
      <p class="source-note">${prop.model_note || 'Model-only player prop. It becomes a tracked bet only when a live bookmaker price is confirmed.'}</p>
    </article>
  `;
}

function renderPlayerPropWatchlist() {
  const container = document.querySelector('[data-player-prop-watchlist]');
  if (!container) return;

  const props = getUpcomingPlayerProps();

  if (props.length === 0) {
    container.innerHTML = '<p class="empty-note">No model-only player props are on the watchlist right now.</p>';
    return;
  }

  container.innerHTML = props.map((prop) => renderPlayerPropCard(prop)).join('');
}

function renderFixtureModelBlock(fixture) {
  const totals = fixture.model_totals_25;
  const exactScores = fixture.exact_score_model || [];
  const markovMarkets = fixture.markov_market_model || [];
  const scan = fixture.market_scan || {};
  const scanRows = (scan.rows || [])
    .filter((row) => Number.isFinite(Number(row.current_odds)) && Number.isFinite(Number(row.model_price)))
    .map((row) => ({
      ...row,
      quality: buildBetQualityFromPrices(row.model_price, row.current_odds)
    }))
    .sort(compareBetQuality);

  if (!totals && exactScores.length === 0 && markovMarkets.length === 0 && scanRows.length === 0) return '';

  const totalsHtml = totals
    ? `
        <article class="model-insight-card">
          <h3>Over / Under 2.5 Goals</h3>
          <dl>
            <div><dt>Over 2.5 Prob</dt><dd>${totals.over_probability}%</dd></div>
            <div><dt>Over Fair Price</dt><dd>$${Number(totals.over_fair_price).toFixed(2)}</dd></div>
            <div><dt>Under 2.5 Prob</dt><dd>${totals.under_probability}%</dd></div>
            <div><dt>Under Fair Price</dt><dd>$${Number(totals.under_fair_price).toFixed(2)}</dd></div>
          </dl>
          <p class="source-note">Model total goals mean: ${Number(totals.total_goals_mean).toFixed(2)}</p>
        </article>
      `
    : '';

  const exactHtml = exactScores.length > 0
    ? `
        <article class="model-insight-card">
          <h3>Exact Score Model</h3>
          <div class="score-model-list">
            ${exactScores.map((score) => `
              <div>
                <strong>${score.score}</strong>
                <span>${score.probability}% | Fair $${Number(score.fair_price).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </article>
      `
    : '';

  const markovHtml = markovMarkets.length > 0
    ? `
        <article class="model-insight-card markov-market-card">
          <h3>Markov Market Model</h3>
          <div class="markov-market-list">
            ${markovMarkets.map((item) => `
              <div>
                <span>
                  <strong>${item.selection}</strong>
                  <em>${item.category} | ${item.market}</em>
                </span>
                <b>${item.probability}% | Fair $${Number(item.fair_price).toFixed(2)}</b>
              </div>
            `).join('')}
          </div>
        </article>
      `
    : '';

  const bookieScanHtml = scanRows.length > 0
    ? `
        <article class="model-insight-card sportsbet-scan-card">
          <h3>AU Bookie Market Scan</h3>
          <p class="source-note">Live AU bookie markets found through the OddsAPI event scan and matched to our model prices.</p>
          <div class="fixture-scan-list">
            ${scanRows.map((row) => `
              <div>
                <span>
                  <strong>${row.selection}</strong>
                  <em>${row.au_bookie || 'AU bookie'} | ${row.market} | ${row.oddsapi_market}</em>
                </span>
                <span>
                  <b><span class="qi-badge ${metricClass(Number(row.qi))}">${Number.isFinite(Number(row.qi)) ? row.qi : '-'}</span></b>
                  <em>${row.au_bookie || 'AU bookie'} | $${Number(row.current_odds).toFixed(2)} | Model $${Number(row.model_price).toFixed(2)} | Edge ${Number(row.quality.edge) > 0 ? '+' : ''}${Number(row.quality.edge).toFixed(2)} pts | ${row.quality.risk} risk</em>
                </span>
              </div>
            `).join('')}
          </div>
        </article>
      `
    : '';

  return `
    <div class="fixture-model-block">
      <div class="inline-section-heading">
        <h3>Game Model</h3>
        <p>Model projections plus AU bookie markets that were found and matched to our model prices.</p>
      </div>
      <div class="model-insight-grid">
        ${totalsHtml}
        ${exactHtml}
        ${bookieScanHtml}
        ${markovHtml}
      </div>
    </div>
  `;
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
  const fixtureModelHtml = renderFixtureModelBlock(fixture);
  const playerProps = getPlayerPropsForMatch(fixture.match_name);
  const playerPropsHtml = playerProps.length > 0
    ? `
        <div class="match-props-block">
          <div class="inline-section-heading">
            <h3>Player Props - Model Price Only</h3>
            <p>Shown for this match only. These are not treated as bets until live market odds are confirmed.</p>
          </div>
          <div class="prop-watchlist-grid">
            ${playerProps.map((prop) => renderPlayerPropCard(prop, { showMatch: false })).join('')}
          </div>
        </div>
      `
    : '';

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
              <dl>
                <div><dt>QI</dt><dd><span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQi(market)}</span></dd></div>
                <div><dt>Odds</dt><dd>${formatOdds(market)}</dd></div>
                <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
                <div><dt>Model Prob</dt><dd>${formatModelProb(market)}</dd></div>
                <div><dt>Book Prob</dt><dd>${formatBookProb(market)}</dd></div>
                <div><dt>Edge</dt><dd class="${edgeClass(market)}">${formatEdge(market)}</dd></div>
                <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
                <div><dt>Risk</dt><dd>${market.quality.risk}</dd></div>
              </dl>
            </article>
          `).join('')}
        </div>
        ${fixtureModelHtml}
        ${playerPropsHtml}
      </section>
    `;
}

function renderBetHistory() {
  const tableBody = document.querySelector('[data-history-table]');
  const rows = state.betHistory.length > 0
    ? [...state.betHistory]
      .filter((bet) => Number(bet.opening_qi) >= 70)
      .sort(sortHistoryRows)
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
          estimated_closing_odds: null,
          estimated_clv_percent: null,
          opening_qi: market.metrics.qi,
          current_qi: market.metrics.qi
        }))
      .sort((a, b) => b.current_qi - a.current_qi);

  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="11">No QI 70+ bets available right now.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((bet) => `
    <tr>
      <td>${bet.match_name}</td>
      <td><span class="primary-cell">${bet.target_selection}</span><span class="sub-cell">${plainMarketNames[bet.market_matrix] || bet.market_matrix}</span></td>
      <td><span class="pill">${bet.au_bookie}</span></td>
      <td>${formatHistoryPrice(bet.opening_odds)}</td>
      <td>${formatHistoryPrice(bet.current_odds)}</td>
      <td>${formatDirection(bet)}</td>
      <td>${formatClosingPrice(bet)}${formatClosingDetail(bet)}</td>
      <td class="${clvClass(bet)}">${formatHistoryClv(bet)}</td>
      <td>${formatBetResult(bet)}</td>
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
        <td><span class="primary-cell">${freshness.label}</span><span class="sub-cell">${freshness.detail}</span></td>
        <td>${bestOption ? `<span class="primary-cell">${bestOption.target_selection}</span><span class="sub-cell">${plainMarketNames[bestOption.market_matrix] || bestOption.market_matrix} | ${bestOption.au_bookie} | ${formatOdds(bestOption)}</span>` : '-'}</td>
        <td>${bestOption ? `<span class="qi-badge ${metricClass(bestOption.metrics.qi)}">${bestOption.metrics.qi}</span>` : '-'}</td>
      </tr>
    `;
  }).join('');
}

function formatHistoryPrice(value, fallback = '-') {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : fallback;
}

function sortHistoryRows(a, b) {
  const now = new Date();
  const aKickoff = parseKickoff(a.kickoff_time_aest);
  const bKickoff = parseKickoff(b.kickoff_time_aest);
  const aCompleted = aKickoff <= now;
  const bCompleted = bKickoff <= now;

  if (aCompleted !== bCompleted) {
    return aCompleted ? 1 : -1;
  }

  const timeDiff = aKickoff - bKickoff;
  if (timeDiff !== 0) return timeDiff;

  return Number(b.current_qi || 0) - Number(a.current_qi || 0);
}

function formatClv(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatClosingPrice(bet) {
  if (Number.isFinite(Number(bet.closing_odds))) {
    return formatHistoryPrice(bet.closing_odds);
  }

  if (Number.isFinite(Number(bet.estimated_closing_odds))) {
    return `Est. ${formatHistoryPrice(bet.estimated_closing_odds)}`;
  }

  return 'Pending';
}

function formatHistoryClv(bet) {
  if (Number.isFinite(Number(bet.clv_percent))) {
    return `<span class="primary-cell">${formatClv(bet.clv_percent)}</span><span class="sub-cell confirmed-text">Confirmed closing line</span>`;
  }

  if (Number.isFinite(Number(bet.estimated_clv_percent))) {
    return `<span class="primary-cell">Estimated CLV ${formatClv(bet.estimated_clv_percent)}</span><span class="sub-cell warning-text">Using latest saved price before kickoff</span>`;
  }

  return '<span class="primary-cell">Pending</span><span class="sub-cell">Waiting for closing line</span>';
}

function priceDirection(bet) {
  const opening = Number.parseFloat(bet.opening_odds);
  const current = Number.parseFloat(bet.current_odds);

  if (!Number.isFinite(opening) || !Number.isFinite(current)) {
    return {
      className: '',
      label: '-',
      detail: 'No price comparison available.'
    };
  }

  if (opening > current) {
    return {
      className: 'positive',
      label: 'Positive',
      detail: 'Opening higher than current odds.'
    };
  }

  if (opening < current) {
    return {
      className: 'negative',
      label: 'Negative',
      detail: 'Opening lower than current odds.'
    };
  }

  return {
    className: 'neutral-text',
    label: 'Neutral',
    detail: 'Opening equals current odds.'
  };
}

function formatDirection(bet) {
  const direction = priceDirection(bet);
  return `<span class="primary-cell ${direction.className}">${direction.label}</span><span class="sub-cell">${direction.detail}</span>`;
}

function clvClass(bet) {
  const value = Number.isFinite(Number(bet.clv_percent))
    ? Number(bet.clv_percent)
    : Number(bet.estimated_clv_percent);

  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'positive' : 'negative';
}

function formatClosingDetail(bet) {
  if (bet.closing_status === 'missing_fresh_close') {
    return '<span class="sub-cell warning-text">No confirmed live price was captured in the final 30 minutes before kickoff.</span>';
  }

  if (!bet.closing_captured_at) return '<span class="sub-cell">Will capture a live price in the final 30 minutes before kickoff</span>';

  return `<span class="sub-cell confirmed-text">${formatter.format(new Date(bet.closing_captured_at))} AEST | Confirmed live price before kickoff</span>`;
}

function formatBetResult(bet) {
  const status = String(bet.result_status || '').toLowerCase();
  const resultClass = {
    won: 'positive',
    win: 'positive',
    lost: 'negative',
    loss: 'negative',
    push: 'neutral-text',
    void: 'neutral-text',
    pending: 'neutral-text'
  }[status] || 'neutral-text';

  const label = {
    won: 'Won',
    win: 'Won',
    lost: 'Lost',
    loss: 'Lost',
    push: 'Push',
    void: 'Void',
    pending: 'Pending'
  }[status] || 'Pending';

  const detail = bet.result_detail || bet.settlement_source || 'Awaiting final result check.';
  return `<span class="primary-cell ${resultClass}">${label}</span><span class="sub-cell">${detail}</span>`;
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
    button.textContent = window.location.protocol === 'file:' ? 'Reloading...' : 'Refreshing...';
    document.querySelector('[data-app-error]').textContent = '';
    await loadDataset({ bustCache: true });
    await loadBetHistory({ bustCache: true });
    await loadPlayerPropWatchlist({ bustCache: true });

    render();

    button.disabled = false;
    button.textContent = 'Refresh odds';
    const noteElement = document.querySelector('[data-refresh-note]');
    if (noteElement) {
      noteElement.dataset.userMessage = 'true';
      noteElement.textContent = window.location.protocol === 'file:'
        ? 'Local file reloaded saved data.'
        : 'Latest saved odds data was reloaded.';
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
  renderMatchModelHighlights();
  renderSportsbookScan();
  renderPlayerPropWatchlist();
  renderMatchTabs();
  renderFilters();
  renderSelectedMarketTitle();
  renderMarketsTable();
  renderFixturePanels();
  renderCompletedGames();
  renderBetHistory();
}

Promise.all([loadDataset(), loadBetHistory(), loadPlayerPropWatchlist()])
  .then(() => {
    window.betmateAppReady = true;
    document.documentElement.dataset.betmateAppReady = 'true';
    document.querySelector('[data-app-error]').textContent = '';
    bindSortControls();
    bindRefreshOdds();
    bindViewTabs();
    render();
    setInterval(render, 30000);
  })
  .catch((error) => {
    console.error(error);
    document.querySelector('[data-app-error]').textContent = '';
  });
