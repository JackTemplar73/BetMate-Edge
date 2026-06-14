const state = {
  dataset: [],
  betHistory: [],
  playerPropWatchlist: [],
  marketFilter: 'All',
  sortMode: 'qi',
  highValueSortMode: 'qi',
  scanSortMode: 'qi',
  playerPropSortMode: 'qi',
  historyResultFilter: 'all',
  resultsResultFilter: 'all',
  markovMinProbability: 0,
  markovMaxFairPrice: Infinity,
  lastRefresh: null,
  dataSource: 'Not loaded',
  selectedMatchName: null,
  activeView: 'matches',
  matchDetailTab: 'bets'
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
  'Full Match Model': '',
  Totals: 'Goals total',
  All: 'All'
};

function formatMarketLabel(value, fallback = '') {
  const mapped = plainMarketNames[value];
  if (mapped === '') return fallback;
  return mapped || value || fallback;
}

function normaliseForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bturkiye\b/g, 'turkey')
    .replace(/\bunited states\b/g, 'usa')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderMarketSubCell(value) {
  const label = formatMarketLabel(value);
  return label ? `<span class="sub-cell">${label}</span>` : '';
}

const plainGameNotes = {
  'USA vs Paraguay': 'USA are expected to have more of the ball. Paraguay may need to defend for long spells, so the card bet on Omar Alderete stands out.',
  'Australia vs Turkiye': 'Confirmed teams give Turkey the stronger attacking setup. At current prices, the model prefers the goals angle over the winner market: Over 2.5 Goals is the main value read.',
  'Brazil vs Morocco': 'Brazil should create pressure, but Morocco are set up to defend well. The handicap on Morocco gives protection if Brazil only win by one goal.',
  'Qatar vs Switzerland': 'Switzerland should control the tempo, while Qatar sit deep. That points toward a low-scoring game.',
  'Haiti vs Scotland': 'Scotland look better suited to control the match. Haiti rely on speed, but the surface may make those breakaway attacks harder.'
};

const formatter = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
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

function estimatedFullTime(fixture) {
  const kickoff = parseKickoff(fixture.kickoff_time_aest);
  return new Date(kickoff.getTime() + (2 * 60 * 60 * 1000));
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
  return getFixturesInWindow().filter((fixture) => estimatedFullTime(fixture) <= now);
}

function getStartedFixtures() {
  const now = new Date();
  return getFixturesInWindow()
    .filter((fixture) => parseKickoff(fixture.kickoff_time_aest) <= now)
    .filter((fixture) => estimatedFullTime(fixture) > now);
}

function getSelectedFixture() {
  const fixtures = getUpcomingFixtures();
  const selected = fixtures.find((fixture) => fixture.match_name === state.selectedMatchName);

  if (selected) return selected;

  state.selectedMatchName = fixtures[0]?.match_name || null;
  return fixtures[0];
}

function formatKickoff(value) {
  return formatter.format(parseKickoff(value));
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
    if (state.sortMode === 'ev') return b.metrics.ev - a.metrics.ev;
    if (state.sortMode === 'edge') return Number(getEdgeValue(b) || 0) - Number(getEdgeValue(a) || 0);
    if (state.sortMode === 'date') return dateSort(a, b) || compareBetQuality(a, b);
    return compareBetQuality(a, b);
  });
}

function sortValue(row, mode) {
  if (mode === 'date') return -parseKickoff(row.kickoff_time_aest).getTime();
  if (mode === 'edge') return Number(getEdgeValue(row) || 0);
  if (mode === 'ev') return Number(row.metrics?.ev ?? row.ev ?? 0);
  return Number(row.metrics?.qi ?? row.qi ?? 0);
}

function compareSelectionRows(mode) {
  if (mode === 'date') {
    return (a, b) => dateSort(a, b) || compareBetQuality(a, b);
  }

  return (a, b) => {
    const primary = sortValue(b, mode) - sortValue(a, mode);
    if (primary !== 0) return primary;
    return compareBetQuality(a, b);
  };
}

function dateSort(a, b) {
  return parseKickoff(a.kickoff_time_aest) - parseKickoff(b.kickoff_time_aest);
}

function metricClass(qi) {
  if (!Number.isFinite(qi) || qi <= 0) return 'no-score';
  if (qi >= 90) return 'elite';
  if (qi >= 80) return 'strong';
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

function formatQiBadge(value, label = 'QI') {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${label} ${numeric}` : '-';
}

function formatOldQi(market) {
  const oldQi = market.metrics?.price_qi ?? market.price_qi;
  return Number.isFinite(Number(oldQi)) ? Number(oldQi) : '-';
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
  const probability = getBookProbability(market);
  if (Number.isFinite(probability)) return `${probability.toFixed(1)}%`;
  return '-';
}

function getBookProbability(market) {
  const devigProbability = market.devig_book_probability
    ?? market.no_vig_book_probability
    ?? market.quality?.devig_book_probability;
  if (Number.isFinite(Number(devigProbability))) return Number(devigProbability);
  if (!market.quality || !Number.isFinite(Number(market.quality.book_probability))) return null;
  return Number(market.quality.book_probability);
}

function getModelProbability(market) {
  if (market.quality && Number.isFinite(Number(market.quality.model_probability))) {
    return Number(market.quality.model_probability);
  }

  if (!hasModelPrice(market)) return null;
  return (1 / Number.parseFloat(market.true_price)) * 100;
}

function getEdgeValue(market) {
  const modelProbability = getModelProbability(market);
  const bookProbability = getBookProbability(market);
  if (!Number.isFinite(modelProbability) || !Number.isFinite(bookProbability)) return null;
  return modelProbability - bookProbability;
}

function formatEdge(market) {
  const edge = getEdgeValue(market);
  if (!Number.isFinite(edge)) return '-';
  return `${edge > 0 ? '+' : ''}${edge.toFixed(2)} pts`;
}

function edgeClass(market) {
  const edge = getEdgeValue(market);
  if (!Number.isFinite(edge)) return '';
  return edge >= 0 ? 'positive' : 'negative';
}

function riskClass(value) {
  const risk = String(value || '').toLowerCase();
  if (risk.includes('low')) return 'risk-low';
  if (risk.includes('medium')) return 'risk-medium';
  if (risk.includes('high')) return 'risk-high';
  return 'risk-watch';
}

function formatRiskValue(value, label = '') {
  const risk = value || 'Watch';
  return `<span class="risk-pill ${riskClass(risk)}">${label}${risk}</span>`;
}

function formatRisk(market) {
  return formatRiskValue(market.quality?.risk);
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
  const pricedRows = getHighValueCandidateRows();
  const top = [...pricedRows].sort(compareBetQuality)[0];
  const bestEv = pricedRows.length
    ? pricedRows.reduce((best, row) => row.metrics.ev > best.metrics.ev ? row : best, pricedRows[0])
    : null;

  document.querySelector('[data-summary-fixtures]').textContent = fixtures.length;
  document.querySelector('[data-summary-markets]').textContent = rows.length;
  document.querySelector('[data-summary-best]').innerHTML = top
    ? renderSummaryBet(top, renderSummaryBestMetrics(top))
    : '-';
  document.querySelector('[data-summary-ev]').innerHTML = bestEv
    ? renderSummaryBet(bestEv, renderSummaryEvMetrics(bestEv))
    : '-';
}

function renderSummaryBet(market, metricsHtml) {
  return `
    <span class="summary-match">${market.match_name}</span>
    <span class="summary-selection">${market.target_selection}</span>
    <span class="summary-meta">${metricsHtml}</span>
  `;
}

function formatBookName(market) {
  return market.au_bookie || market.bookmaker || 'Model only';
}

function renderSummaryBestMetrics(market) {
  return [
    `<span class="pill">${formatBookName(market)}</span>`,
    `<span class="qi-badge ${metricClass(Number(market.metrics?.qi))}">QI ${market.metrics.qi}</span>`,
    `<span class="${edgeClass(market)}">Edge ${formatEdge(market)}</span>`,
    formatRiskValue(market.quality?.risk, 'Risk ')
  ].join('');
}

function renderSummaryEvMetrics(market) {
  return [
    `<span class="pill">${formatBookName(market)}</span>`,
    `<span class="qi-badge ${metricClass(Number(market.metrics?.qi))}">QI ${market.metrics.qi}</span>`,
    `<span class="${edgeClass(market)}">Edge ${formatEdge(market)}</span>`,
    formatRiskValue(market.quality?.risk, 'Risk ')
  ].join('');
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
  document.body.classList.toggle('owner-results-enabled', isOwnerResultsMode());

  document.querySelectorAll('[data-view-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.viewTab === state.activeView);
  });

  document.querySelectorAll('[data-view-section]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.viewSection !== state.activeView);
  });

  const historyCount = document.querySelector('[data-history-count]');
  const completedCount = document.querySelector('[data-completed-count]');
  const resultsCount = document.querySelector('[data-results-count]');

  if (historyCount) historyCount.textContent = getQualifiedHistoryBets().length || flattenMarkets(getUpcomingFixtures()).length;
  if (completedCount) completedCount.textContent = getCompletedFixtures().length;
  if (resultsCount) resultsCount.textContent = getSettledBets().length;
}

function renderSectionSortControls() {
  document.querySelectorAll('[data-section-sort]').forEach((button) => {
    const target = button.dataset.sectionSort;
    const mode = target === 'scan'
      ? state.scanSortMode
      : target === 'props'
        ? state.playerPropSortMode
        : state.highValueSortMode;
    button.classList.toggle('active', button.dataset.sortValue === mode);
  });
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
      <td><span class="primary-cell">${market.target_selection}</span>${renderMarketSubCell(market.market_matrix)}</td>
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
      ${formatMarketLabel(filter, 'Match result')}
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
      <td><span class="qi-badge ${metricClass(market.metrics.qi)}">${formatQiBadge(formatQi(market))}</span></td>
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
  const rows = getHighValueCandidateRows()
    .filter((market) => Number(market.metrics?.qi) >= 80)
    .sort(compareSelectionRows(state.highValueSortMode));

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No QI 80+ options are available right now.</p>';
    return;
  }

  container.innerHTML = rows.map((market) => `
    <article class="high-value-card">
      <div class="card-topline">
        <span class="qi-badge card-grade ${metricClass(market.metrics.qi)}">QI ${market.metrics.qi}</span>
        <span class="sub-cell date-one-line">${formatKickoff(market.kickoff_time_aest)}</span>
      </div>
      <p class="match-name">${market.match_name}</p>
      <h3>${market.target_selection}</h3>
      <dl>
        <div class="book-stat-row"><dt>Book</dt><dd>${formatBookCell(market)}</dd></div>
        <div><dt>Odds</dt><dd>${formatOdds(market)}</dd></div>
        <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
        <div><dt>Model Prob</dt><dd>${formatModelProb(market)}</dd></div>
        <div><dt>Book Prob</dt><dd>${formatBookProb(market)}</dd></div>
        <div><dt>Edge</dt><dd class="${edgeClass(market)}">${formatEdge(market)}</dd></div>
        <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
        <div><dt>Risk</dt><dd>${formatRisk(market)}</dd></div>
      </dl>
    </article>
  `).join('');
}

function getHighValueCandidateRows() {
  return getCandidateRowsForFixtures(getUpcomingFixtures());
}

function getCandidateRowsForFixtures(fixtures) {
  const fixtureNames = new Set(fixtures.map((fixture) => fixture.match_name));
  const fixtureRows = flattenMarkets(fixtures)
    .filter(hasModelPrice)
    .filter(hasMarketOdds)
    .map((market) => ({ ...market, source_label: 'Fixture model' }));
  const scanRows = getSportsbookScanRowsForFixtures(fixtures)
    .filter((row) => fixtureNames.has(row.match_name))
    .map((row) => ({
      match_name: row.match_name,
      kickoff_time_aest: row.kickoff_time_aest,
      target_selection: row.selection,
      market_matrix: row.category || row.market || 'Market Scan',
      true_price: Number(row.model_price),
      current_odds: Number(row.current_odds),
      au_bookie: row.au_bookie || row.bookmaker,
      metrics: {
        qi: Number(row.qi),
        price_qi: Number(row.price_qi),
        ev: Number(row.ev)
      },
      devig_book_probability: row.devig_book_probability,
      quality: row.quality,
      source_label: row.source || 'AU bookie scan'
    }));
  const seen = new Set();
  return [...fixtureRows, ...scanRows]
    .filter((market) => hasModelPrice(market) && hasMarketOdds(market))
    .filter((market) => {
      const key = `${market.match_name}|${market.target_selection}|${market.au_bookie}|${market.current_odds}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getMatchModelHighlights() {
  const pricedSelections = flattenMarkets(getUpcomingFixtures())
    .filter(hasModelPrice)
    .map((market) => ({
      match_name: market.match_name,
      selection: market.target_selection,
      market: formatMarketLabel(market.market_matrix, 'Match result'),
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
  return getSportsbookScanRowsForFixtures(getUpcomingFixtures());
}

function getSportsbookScanRowsForFixtures(fixtures) {
  return fixtures
    .flatMap((fixture) => {
      const scan = fixture.market_scan || {};
      return (scan.rows || [])
      .filter((row) => !isConfirmedBenchPlayerPropRow(fixture, row))
      .map((row) => ({
        ...row,
        match_name: fixture.match_name,
        kickoff_time_aest: fixture.kickoff_time_aest,
        bookmaker: row.au_bookie || scan.bookmaker || 'AU bookie',
        checked_at: scan.checked_at,
        offered_market_keys: scan.offered_market_keys || [],
        quality: {
          ...buildBetQualityFromPrices(row.model_price, row.current_odds),
          devig_book_probability: row.devig_book_probability
        }
      }));
    })
    .filter((row) => Number.isFinite(Number(row.current_odds)) && Number.isFinite(Number(row.model_price)))
    .sort(compareBetQuality);
}

function isConfirmedBenchPlayerPropRow(fixture, row) {
  if (!fixture.confirmed_lineups || String(row.category || '').toLowerCase() !== 'player prop') return false;
  const player = String(row.selection || '').split(':')[0].trim().toLowerCase();
  if (!player) return false;

  const starters = [
    ...(fixture.confirmed_lineups.home_starting_xi || []),
    ...(fixture.confirmed_lineups.away_starting_xi || [])
  ].map((name) => String(name).toLowerCase());
  const subs = [
    ...(fixture.confirmed_lineups.home_substitutes || []),
    ...(fixture.confirmed_lineups.away_substitutes || [])
  ].map((name) => String(name).toLowerCase());

  return subs.includes(player) && !starters.includes(player);
}

function renderSportsbookScan() {
  const container = document.querySelector('[data-sportsbook-scan]');
  if (!container) return;

  if (state.scanSortMode === 'edge') {
    state.scanSortMode = 'qi';
  }

  const rows = getSportsbookScanRows().sort(compareSelectionRows(state.scanSortMode));

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No AU bookie rows are matched to the model right now.</p>';
    return;
  }

  const topRows = rows.slice(0, 36);
  container.innerHTML = `
    <div class="sportsbook-scan-table">
      <table>
        <thead>
          <tr>
            <th>QI</th>
            <th>Match</th>
            <th>Selection</th>
            <th>Bookie</th>
            <th>Odds</th>
            <th>Model Price</th>
            <th>Model Prob</th>
            <th>Book Prob</th>
            <th>EV</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((row) => `
            <tr>
              <td><span class="qi-badge ${metricClass(Number(row.qi))}">${formatQiBadge(row.qi)}</span></td>
              <td><span class="primary-cell">${row.match_name}</span><span class="sub-cell">${formatKickoff(row.kickoff_time_aest)}</span></td>
              <td><span class="primary-cell">${row.selection}</span><span class="sub-cell">${row.market} | ${row.oddsapi_market}</span></td>
              <td><span class="pill">${row.bookmaker}</span></td>
              <td>$${Number(row.current_odds).toFixed(2)}</td>
              <td>$${Number(row.model_price).toFixed(2)}</td>
              <td>${Number(row.model_probability).toFixed(1)}%</td>
              <td>${formatBookProb(row)}</td>
              <td class="${Number(row.ev) >= 0 ? 'positive' : 'negative'}">${Number(row.ev) > 0 ? '+' : ''}${Number(row.ev).toFixed(2)}%</td>
              <td>${formatRiskValue(row.quality.risk)}</td>
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

function formatPlayerPropNote(prop) {
  return String(prop.model_note || 'Model-rated player prop.')
    .replace(/\s*Check Sportsbet\/TAB before showing as a bet\./gi, '')
    .trim();
}

function getPlayerPropPrices(prop) {
  const directPrices = Object.entries(prop.direct_checks || {})
    .filter(([, check]) => check && check.comparable_for_qi && Number.isFinite(Number(check.current_odds)) && Number.isFinite(Number(check.qi)))
    .map(([bookie, check]) => ({
      au_bookie: bookie === 'sportsbet' ? 'Sportsbet' : bookie.toUpperCase(),
      current_odds: Number(check.current_odds),
      ev: Number(check.ev),
      qi: Number(check.qi)
    }));

  const seen = new Set();

  return [...(prop.live_prices || []), ...directPrices]
    .filter((price) => Number(price.qi || 0) >= 60)
    .filter((price) => {
      const key = [
        String(price.au_bookie || '').toLowerCase(),
        Number(price.current_odds || 0).toFixed(3),
        Number(price.qi || 0).toFixed(0)
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.qi || 0) - Number(a.qi || 0));
}

function getBestPlayerPropPrice(prop) {
  return getPlayerPropPrices(prop)[0] || {};
}

function comparePlayerProps(a, b) {
  if (state.playerPropSortMode === 'date') {
    return dateSort(a, b) || comparePlayerPropsByQi(a, b);
  }

  if (state.playerPropSortMode === 'ev') {
    const evDiff = Number(getBestPlayerPropPrice(b).ev || 0) - Number(getBestPlayerPropPrice(a).ev || 0);
    if (evDiff !== 0) return evDiff;
  }

  if (state.playerPropSortMode === 'edge') {
    const priceA = getBestPlayerPropPrice(a);
    const priceB = getBestPlayerPropPrice(b);
    const edgeA = Number(a.model_probability || 0) - Number(priceA.devig_book_probability || (100 / Number(priceA.current_odds || Infinity)));
    const edgeB = Number(b.model_probability || 0) - Number(priceB.devig_book_probability || (100 / Number(priceB.current_odds || Infinity)));
    const edgeDiff = edgeB - edgeA;
    if (edgeDiff !== 0) return edgeDiff;
  }

  return comparePlayerPropsByQi(a, b);
}

function comparePlayerPropsByQi(a, b) {
  const qiDiff = Number(getBestPlayerPropPrice(b).qi || 0) - Number(getBestPlayerPropPrice(a).qi || 0);
  if (qiDiff !== 0) return qiDiff;
  const probDiff = Number(b.model_probability || 0) - Number(a.model_probability || 0);
  if (probDiff !== 0) return probDiff;
  return parseKickoff(a.kickoff_time_aest) - parseKickoff(b.kickoff_time_aest);
}

function getUpcomingPlayerProps() {
  const upcomingMatches = new Set(getUpcomingFixtures().map((fixture) => fixture.match_name));
  const now = new Date();

  return state.playerPropWatchlist
    .filter((prop) => upcomingMatches.has(prop.match_name))
    .filter((prop) => parseKickoff(prop.kickoff_time_aest) > now)
    .filter((prop) => getPlayerPropPrices(prop).length > 0)
    .sort(comparePlayerProps);
}

function getPlayerPropsForMatch(matchName) {
  return getUpcomingPlayerProps().filter((prop) => prop.match_name === matchName);
}

function renderPlayerPropCard(prop, { showMatch = true } = {}) {
  const livePrices = getPlayerPropPrices(prop);
  const hasLivePrice = livePrices.length > 0;

  return `
    <article class="prop-watch-card">
      <div class="card-topline">
        ${hasLivePrice
          ? `<span class="qi-badge card-grade ${metricClass(Number(livePrices[0].qi))}">QI ${Number(livePrices[0].qi)}</span>`
          : '<span class="pill model-only-pill">Model only</span>'}
        <span class="sub-cell date-one-line">${formatKickoff(prop.kickoff_time_aest)}</span>
      </div>
      ${showMatch ? `<p class="match-name">${prop.match_name}</p>` : ''}
      <h3>${prop.player}: ${prop.market}</h3>
      <dl>
        <div><dt>Category</dt><dd>${prop.category || 'Player Prop'}</dd></div>
        <div><dt>Model Price</dt><dd>${formatModelOnlyPrice(prop.model_price)}</dd></div>
        <div><dt>Model Prob</dt><dd>${Number.isFinite(Number(prop.model_probability)) ? `${Number(prop.model_probability).toFixed(1)}%` : formatModelOnlyProb(prop.model_price)}</dd></div>
      </dl>
      ${hasLivePrice ? `
        <div class="prop-price-list">
          ${livePrices.map((price) => `
            <div>
              <span>
                <strong>${price.au_bookie}</strong>
                <em>$${Number(price.current_odds).toFixed(2)} | EV ${Number(price.ev) > 0 ? '+' : ''}${Number(price.ev).toFixed(2)}%</em>
              </span>
              <b class="qi-badge ${metricClass(Number(price.qi))}">QI ${Number(price.qi)}</b>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <p class="source-note">${formatPlayerPropNote(prop)}</p>
    </article>
  `;
}

function renderPlayerPropWatchlist() {
  const container = document.querySelector('[data-player-prop-watchlist]');
  if (!container) return;

  const props = getUpcomingPlayerProps();

  if (props.length === 0) {
    container.innerHTML = '<p class="empty-note">No player props with QI 60+ are available right now.</p>';
    return;
  }

  const categoryCounts = props.reduce((acc, prop) => {
    const category = prop.category || 'Player Prop';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  container.innerHTML = `
    <div class="prop-summary-card">
      <strong>${props.length} player props shown</strong>
      <span>${Object.entries(categoryCounts).map(([category, count]) => `${category}: ${count}`).join(' | ')}</span>
    </div>
    ${props.map((prop) => renderPlayerPropCard(prop)).join('')}
  `;
}

function getFilteredMarkovMarkets(markovMarkets) {
  return markovMarkets.filter((item) => {
    const probability = Number(item.probability);
    const fairPrice = Number(item.fair_price);
    const probabilityOk = !Number.isFinite(state.markovMinProbability) || probability >= state.markovMinProbability;
    const fairPriceOk = !Number.isFinite(state.markovMaxFairPrice) || fairPrice <= state.markovMaxFairPrice;
    return probabilityOk && fairPriceOk;
  });
}

function renderMarkovFilterOption(value, label, currentValue) {
  const selected = String(value) === String(currentValue) || (value === 'all' && !Number.isFinite(currentValue));
  return `<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
}

function renderFixtureModelBlock(fixture) {
  const totals = fixture.model_totals_25;
  const exactScores = fixture.exact_score_model || [];
  const markovMarkets = fixture.markov_market_model || [];
  const filteredMarkovMarkets = getFilteredMarkovMarkets(markovMarkets);
  const scan = fixture.market_scan || {};
  const scanRows = (scan.rows || [])
    .filter((row) => !isConfirmedBenchPlayerPropRow(fixture, row))
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
          <div class="markov-filter-row">
            <label>
              <span>Prob %</span>
              <select data-markov-prob-filter>
                ${renderMarkovFilterOption('0', 'All', state.markovMinProbability)}
                ${renderMarkovFilterOption('50', '50%+', state.markovMinProbability)}
                ${renderMarkovFilterOption('55', '55%+', state.markovMinProbability)}
                ${renderMarkovFilterOption('60', '60%+', state.markovMinProbability)}
                ${renderMarkovFilterOption('70', '70%+', state.markovMinProbability)}
              </select>
            </label>
            <label>
              <span>Fair Price</span>
              <select data-markov-fair-filter>
                ${renderMarkovFilterOption('all', 'All', state.markovMaxFairPrice)}
                ${renderMarkovFilterOption('1.50', '$1.50 or shorter', state.markovMaxFairPrice)}
                ${renderMarkovFilterOption('2.00', '$2.00 or shorter', state.markovMaxFairPrice)}
                ${renderMarkovFilterOption('3.00', '$3.00 or shorter', state.markovMaxFairPrice)}
                ${renderMarkovFilterOption('5.00', '$5.00 or shorter', state.markovMaxFairPrice)}
              </select>
            </label>
          </div>
          <div class="markov-market-list">
            ${filteredMarkovMarkets.length === 0 ? '<p class="empty-note markov-empty">No Markov selections match these filters.</p>' : filteredMarkovMarkets.map((item) => `
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
          <h3>Market Summary</h3>
          <div class="fixture-scan-list">
            ${scanRows.map((row) => `
              <div>
                <span>
                  <strong>${row.selection}</strong>
                  <em>${row.au_bookie || 'AU bookie'} | ${row.market} | ${row.oddsapi_market}</em>
                </span>
                <span>
                  <b><span class="qi-badge ${metricClass(Number(row.qi))}">${formatQiBadge(row.qi)}</span></b>
                  <em>${row.au_bookie || 'AU bookie'} | $${Number(row.current_odds).toFixed(2)} | Model $${Number(row.model_price).toFixed(2)} | ${row.quality.risk} risk</em>
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

function renderConfirmedLineupsBlock(fixture) {
  const lineups = fixture.confirmed_lineups;
  if (!lineups || lineups.status !== 'confirmed') return '';

  const renderList = (players = [], teamName = '', isSub = false) => players.map((player, index) => `
    <li>
      <span>${player}</span>
      <b>${calculatePlayerMarkovRating(fixture, teamName, index, isSub)}</b>
    </li>
  `).join('');
  const renderTeamLineup = (team, formation, starters = [], substitutes = []) => `
    <article class="lineup-card">
      <h4>${team} <span>${formation || ''}</span></h4>
      <h5>Starting XI</h5>
      <ol class="rated-player-list">${renderList(starters, team, false)}</ol>
      <h5>Substitutes</h5>
      ${substitutes.length
        ? `<ol class="rated-player-list">${renderList(substitutes, team, true)}</ol>`
        : '<p class="lineup-empty">Substitutes not listed by the source yet.</p>'}
    </article>
  `;

  return `
    <section class="lineups-block">
      <div class="inline-section-heading">
        <h3>Confirmed Lineups</h3>
        <p>Lineups confirmed${lineups.checked_at ? ` | Checked ${new Date(lineups.checked_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p>
      </div>
      <div class="lineup-note">${lineups.model_implication || 'Lineups are confirmed and included in the model view.'}</div>
      <div class="lineup-grid">
        ${renderTeamLineup(lineups.home_team, lineups.home_formation, lineups.home_starting_xi, lineups.home_substitutes)}
        ${renderTeamLineup(lineups.away_team, lineups.away_formation, lineups.away_starting_xi, lineups.away_substitutes)}
      </div>
    </section>
  `;
}

function getTeamMarkovProbability(fixture, teamName) {
  const team = normaliseForMatch(teamName);
  const rows = fixture.markov_market_model || [];
  const winRow = rows.find((row) => {
    const selection = normaliseForMatch(row.selection);
    return selection.includes(team) && /win|to win/.test(selection);
  });
  if (winRow && Number.isFinite(Number(winRow.probability))) return Number(winRow.probability);

  const market = (fixture.markets || []).find((item) => {
    const selection = normaliseForMatch(item.target_selection);
    return selection.includes(team) && selection.includes('win');
  });
  if (market && Number.isFinite(Number(market.true_price))) return (1 / Number(market.true_price)) * 100;

  return 50;
}

function calculatePlayerMarkovRating(fixture, teamName, index, isSub = false) {
  const teamProb = getTeamMarkovProbability(fixture, teamName);
  const slotWeight = isSub ? Math.max(0, 8 - (index * 0.4)) : Math.max(0, 10 - (index * 0.55));
  const starterBoost = isSub ? -5 : 7;
  const rating = Math.round(44 + (teamProb * 0.42) + slotWeight + starterBoost);
  return Math.max(45, Math.min(92, rating));
}

function getTopMarkovRows(fixture, limit = 8) {
  return [...(fixture.markov_market_model || [])]
    .filter((item) => Number.isFinite(Number(item.probability)) && Number.isFinite(Number(item.fair_price)))
    .sort((a, b) => Number(b.probability) - Number(a.probability))
    .slice(0, limit);
}

function getMarkovCoefficientCards(fixture) {
  const totals = fixture.model_totals_25 || {};
  const rows = fixture.markov_market_model || [];
  const findSelection = (pattern) => rows.find((row) => pattern.test(row.selection || ''));
  const under = findSelection(/Under 2\.5/i);
  const over = findSelection(/Over 2\.5/i);
  const draw = findSelection(/draw$/i) || (fixture.markets || []).find((item) => /draw/i.test(item.target_selection || ''));
  const topExact = (fixture.exact_score_model || [])[0];

  return [
    {
      label: 'Goal Mean',
      value: Number.isFinite(Number(totals.total_goals_mean)) ? Number(totals.total_goals_mean).toFixed(2) : '-',
      detail: 'Expected total goals'
    },
    {
      label: 'Under 2.5',
      value: `${Number(under?.probability || totals.under_probability || 0).toFixed(1)}%`,
      detail: `Fair ${formatModelOnlyPrice(under?.fair_price || totals.under_fair_price)}`
    },
    {
      label: 'Over 2.5',
      value: `${Number(over?.probability || totals.over_probability || 0).toFixed(1)}%`,
      detail: `Fair ${formatModelOnlyPrice(over?.fair_price || totals.over_fair_price)}`
    },
    {
      label: 'Draw',
      value: draw?.probability ? `${Number(draw.probability).toFixed(1)}%` : formatModelProb({ true_price: draw?.true_price }),
      detail: draw?.fair_price ? `Fair ${formatModelOnlyPrice(draw.fair_price)}` : `Fair ${formatModelPrice({ true_price: draw?.true_price })}`
    },
    {
      label: 'Top Score',
      value: topExact?.score || '-',
      detail: topExact ? `${topExact.probability}% | Fair ${formatModelOnlyPrice(topExact.fair_price)}` : 'Exact score model pending'
    }
  ];
}

function renderMarkovSummaryTab(fixture) {
  const coefficients = getMarkovCoefficientCards(fixture);
  const topRows = getTopMarkovRows(fixture);

  return `
    <section class="match-detail-panel">
      <div class="inline-section-heading">
        <h3>Markov Summary</h3>
      </div>
      <p class="lineup-note">${plainGameNotes[fixture.match_name] || fixture.tactical_summary}</p>
      <div class="coefficient-grid">
        ${coefficients.map((item) => `
          <article>
            <span>${item.label}</span>
            <strong>${item.value}</strong>
            <small>${item.detail}</small>
          </article>
        `).join('')}
      </div>
      ${topRows.length ? `
        <div class="markov-summary-list">
          ${topRows.map((row) => `
            <div>
              <span>
                <strong>${row.selection}</strong>
                <em>${row.category} | ${row.market}</em>
              </span>
              <b>${Number(row.probability).toFixed(1)}% | Fair ${formatModelOnlyPrice(row.fair_price)}</b>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-note">Markov market rows are not loaded for this match yet.</p>'}
    </section>
  `;
}

function renderFormationRatingsTab(fixture, lineupsHtml) {
  if (!lineupsHtml) {
    return `
      <section class="match-detail-panel">
        <div class="inline-section-heading">
          <h3>Formation & Ratings</h3>
          <p>Starting XI and substitutes will appear here once confirmed by the lineup checks.</p>
        </div>
        <p class="empty-note">Confirmed lineups are not loaded for this match yet.</p>
      </section>
    `;
  }

  return `
    <section class="match-detail-panel formation-ratings-panel">
      ${lineupsHtml}
    </section>
  `;
}

function renderMarketCards(markets, fixture) {
  if (markets.length === 0) {
    return '<p class="empty-note">No priced bet options are loaded for this match.</p>';
  }

  return `
    <div class="market-grid">
      ${markets.map((market) => `
        <article class="market-card">
          <div class="card-topline">
            <span class="qi-badge card-grade ${metricClass(market.metrics.qi)}">QI ${formatQi(market)}</span>
            <span class="sub-cell date-one-line">${formatKickoff(fixture.kickoff_time_aest)}</span>
          </div>
          <h3>${market.target_selection}</h3>
          <dl>
            <div class="book-stat-row"><dt>Book</dt><dd>${formatBookCell(market)}</dd></div>
            <div><dt>Odds</dt><dd>${formatOdds(market)}</dd></div>
            <div><dt>Model Price</dt><dd>${formatModelPrice(market)}</dd></div>
            <div><dt>Model Prob</dt><dd>${formatModelProb(market)}</dd></div>
            <div><dt>Book Prob</dt><dd>${formatBookProb(market)}</dd></div>
            <div><dt>Edge</dt><dd class="${edgeClass(market)}">${formatEdge(market)}</dd></div>
            <div><dt>EV</dt><dd class="${evClass(market)}">${formatEv(market)}</dd></div>
            <div><dt>Risk</dt><dd>${formatRisk(market)}</dd></div>
          </dl>
        </article>
      `).join('')}
    </div>
  `;
}

function renderMatchDetailTabs(fixture, markets, fixtureModelHtml, lineupsHtml, playerPropsHtml) {
  const tabs = [
    ['bets', 'Bet Options'],
    ['summary', 'Markov Summary'],
    ['formation', 'Formation & Ratings'],
    ['markets', 'Market Summary']
  ];
  const activeTab = tabs.some(([key]) => key === state.matchDetailTab) ? state.matchDetailTab : 'bets';
  const panels = {
    bets: `
      <section class="match-detail-panel">
        ${renderMarketCards(markets, fixture)}
        ${playerPropsHtml}
      </section>
    `,
    summary: renderMarkovSummaryTab(fixture),
    formation: renderFormationRatingsTab(fixture, lineupsHtml),
    markets: fixtureModelHtml || '<section class="match-detail-panel"><p class="empty-note">No market summary is loaded for this match yet.</p></section>'
  };

  return `
    <div class="match-detail-tabs">
      ${tabs.map(([key, label]) => `
        <button type="button" class="match-detail-tab ${activeTab === key ? 'active' : ''}" data-match-detail-tab="${key}">${label}</button>
      `).join('')}
    </div>
    ${panels[activeTab]}
  `;
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
  const lineupsHtml = renderConfirmedLineupsBlock(fixture);
  const playerProps = getPlayerPropsForMatch(fixture.match_name);
  const playerPropsHtml = playerProps.length > 0
    ? `
        <div class="match-props-block">
          <div class="inline-section-heading">
            <h3>Player Props - QI 60+</h3>
            <p>Shown for this match only when a live bookmaker price creates a QI rating of 60 or higher.</p>
          </div>
          <div class="prop-watchlist-grid">
            ${playerProps.map((prop) => renderPlayerPropCard(prop, { showMatch: false })).join('')}
          </div>
        </div>
      `
    : '';
  const matchDetailHtml = renderMatchDetailTabs(fixture, markets, fixtureModelHtml, lineupsHtml, playerPropsHtml);

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
          <span><strong>Referee implication:</strong> ${fixture.referee_tendencies}</span>
        </div>
        ${matchDetailHtml}
      </section>
    `;
}

function renderBetHistory() {
  const tableBody = document.querySelector('[data-history-table]');
  const allRows = state.betHistory.length > 0
    ? getDedupedHistoryBets(getQualifiedHistoryBets()).sort(sortHistoryRows)
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
  const rows = filterHistoryRowsByResult(allRows);
  renderHistoryResultSummary(rows);
  renderHistoryResultFilterControls();

  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9">No bets match this history filter.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((bet) => `
    <tr>
      <td><span class="primary-cell">${bet.match_name}</span><span class="sub-cell">${formatKickoff(bet.kickoff_time_aest)}</span></td>
      <td><span class="primary-cell">${bet.target_selection}</span>${renderMarketSubCell(bet.market_matrix)}</td>
      <td><span class="pill">${bet.au_bookie}</span></td>
      <td>${formatOpeningClvCell(bet)}</td>
      <td>${formatLatestOrClosingPrice(bet)}</td>
      <td>${formatDirection(bet)}</td>
      <td class="${clvClass(bet)}">${formatLineGap(bet)}</td>
      <td>${formatQiMove(bet)}</td>
      <td class="${profitClass(bet)}">${formatBetResultProfit(bet)}</td>
    </tr>
  `).join('');
}

function getQualifiedHistoryBets() {
  return state.betHistory.filter((bet) => Number(bet.opening_qi) >= 70 && Number(bet.current_qi) >= 70);
}

function filterHistoryRowsByResult(rows) {
  if (state.historyResultFilter === 'won') {
    return rows.filter((bet) => ['won', 'win'].includes(String(bet.result_status || '').toLowerCase()));
  }

  if (state.historyResultFilter === 'lost') {
    return rows.filter((bet) => ['lost', 'loss'].includes(String(bet.result_status || '').toLowerCase()));
  }

  if (state.historyResultFilter === 'pending') {
    return rows.filter((bet) => !isSettledResult(bet));
  }

  return rows;
}

function renderHistoryResultFilterControls() {
  document.querySelectorAll('[data-history-result-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.historyResultFilter === state.historyResultFilter);
  });
}

function filterResultsRowsByResult(rows) {
  if (state.resultsResultFilter === 'won') {
    return rows.filter((bet) => ['won', 'win'].includes(String(bet.result_status || '').toLowerCase()));
  }

  if (state.resultsResultFilter === 'lost') {
    return rows.filter((bet) => ['lost', 'loss'].includes(String(bet.result_status || '').toLowerCase()));
  }

  if (state.resultsResultFilter === 'pending') {
    return rows.filter((bet) => !isSettledResult(bet));
  }

  return rows;
}

function renderResultsResultFilterControls() {
  document.querySelectorAll('[data-results-result-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.resultsResultFilter === state.resultsResultFilter);
  });
}

function getDedupedHistoryBets(rows) {
  const seen = new Map();

  rows.forEach((bet) => {
    const key = [
      bet.match_name,
      bet.market_matrix,
      bet.target_selection,
      bet.au_bookie,
      Number(bet.opening_odds || bet.current_odds || 0).toFixed(4)
    ].join('|');
    const existing = seen.get(key);
    if (!existing || Date.parse(bet.last_seen_at || bet.first_seen_at || '') > Date.parse(existing.last_seen_at || existing.first_seen_at || '')) {
      seen.set(key, bet);
    }
  });

  return [...seen.values()];
}

function renderHistoryResultSummary(rows) {
  const container = document.querySelector('[data-history-result-summary]');
  if (!container) return;

  const settled = rows.filter((bet) => {
    const status = String(bet.result_status || '').toLowerCase();
    return ['won', 'win', 'lost', 'loss', 'push', 'void'].includes(status);
  });
  const won = settled.filter((bet) => ['won', 'win'].includes(String(bet.result_status || '').toLowerCase())).length;
  const lost = settled.filter((bet) => ['lost', 'loss'].includes(String(bet.result_status || '').toLowerCase())).length;
  const pending = rows.length - settled.length;
  const profitUnits = settled.reduce((total, bet) => total + calculateProfitUnits(bet), 0);
  const confirmedClvRows = rows.filter((bet) => Number.isFinite(Number(bet.clv_percent)));
  const positiveClv = confirmedClvRows.filter((bet) => Number(bet.clv_percent) > 0).length;
  const negativeClv = confirmedClvRows.filter((bet) => Number(bet.clv_percent) < 0).length;
  const averageClv = confirmedClvRows.length
    ? confirmedClvRows.reduce((total, bet) => total + Number(bet.clv_percent), 0) / confirmedClvRows.length
    : null;
  const latestOnlyRows = rows.filter((bet) => !Number.isFinite(Number(bet.clv_percent))).length;
  container.innerHTML = `
    <article>
      <span>Settled</span>
      <strong>${settled.length}</strong>
      <small>${won} won / ${lost} lost${pending ? ` / ${pending} pending` : ''} / ${formatProfitUnits(profitUnits)}</small>
    </article>
    <article>
      <span>Confirmed CLV</span>
      <strong>${confirmedClvRows.length}</strong>
      <small>${positiveClv} positive / ${negativeClv} negative${averageClv === null ? '' : ` / avg ${formatClv(averageClv)}`}</small>
    </article>
    <article>
      <span>Latest Price Rows</span>
      <strong>${latestOnlyRows}</strong>
      <small>Not locked as a closing line yet</small>
    </article>
    <article>
      <span>Profit Units</span>
      <strong>${formatProfitUnits(profitUnits)}</strong>
      <small>Flat 1 unit per tracked bet</small>
    </article>
  `;
}

function calculateProfitUnits(bet) {
  const status = String(bet.result_status || '').toLowerCase();
  if (['lost', 'loss'].includes(status)) return -1;
  if (['push', 'void'].includes(status)) return 0;
  if (!['won', 'win'].includes(status)) return 0;

  const settledOdds = Number(bet.closing_odds || bet.current_odds || bet.opening_odds);
  return Number.isFinite(settledOdds) && settledOdds > 1 ? settledOdds - 1 : 0;
}

function formatProfitUnits(value) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)} units`;
}

function formatBetProfit(bet) {
  if (!isSettledResult(bet)) return '<span class="primary-cell">-</span>';
  return `<span class="primary-cell">${formatProfitUnits(calculateProfitUnits(bet))}</span>`;
}

function formatBetResultProfit(bet) {
  return `${formatBetResult(bet)}<span class="sub-cell ${profitClass(bet)}">Profit: ${isSettledResult(bet) ? formatProfitUnits(calculateProfitUnits(bet)) : 'Pending'}</span>`;
}

function profitClass(bet) {
  if (!isSettledResult(bet)) return '';
  const profit = calculateProfitUnits(bet);
  if (profit > 0) return 'positive';
  if (profit < 0) return 'negative';
  return 'neutral-text';
}

function getSettledBets() {
  return getQualifiedHistoryBets()
    .filter((bet) => isSettledResult(bet))
    .sort((a, b) => {
      const settledDiff = Date.parse(b.settled_at || '') - Date.parse(a.settled_at || '');
      if (Number.isFinite(settledDiff) && settledDiff !== 0) return settledDiff;
      return parseKickoff(b.kickoff_time_aest) - parseKickoff(a.kickoff_time_aest);
    });
}

function isSettledResult(bet) {
  const status = String(bet.result_status || '').toLowerCase();
  return ['won', 'win', 'lost', 'loss', 'push', 'void'].includes(status);
}

function renderResults() {
  const tableBody = document.querySelector('[data-results-table]');
  if (!tableBody) return;

  const rows = filterResultsRowsByResult(getQualifiedHistoryBets().sort(sortHistoryRows));
  renderResultsResultFilterControls();
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="10">No QI 70+ bets match this results filter.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((bet) => `
    <tr>
      <td>${bet.match_name}</td>
      <td><span class="primary-cell">${bet.target_selection}</span>${renderMarketSubCell(bet.market_matrix)}</td>
      <td><span class="pill">${bet.au_bookie}</span></td>
      <td>${formatBetSavedCell(bet)}</td>
      <td>${formatOpeningLineOnly(bet)}</td>
      <td>${formatLatestOrClosingPrice(bet)}</td>
      <td class="${clvClass(bet)}">${formatLineGap(bet)}</td>
      <td>${formatBetResultBadge(bet)}</td>
      <td><span class="sub-cell">${bet.result_detail || bet.settlement_source || 'Result settled.'}</span></td>
      <td>${formatSettledAt(bet)}</td>
    </tr>
  `).join('');
}

function formatBetSavedCell(bet) {
  const savedAt = Date.parse(bet.first_seen_at || '');
  const savedText = Number.isFinite(savedAt)
    ? formatter.format(new Date(savedAt))
    : 'Saved by agent';

  return `
    <span class="primary-cell">${savedText}</span>
  `;
}

function renderCompletedGames() {
  const tableBody = document.querySelector('[data-completed-table]');
  const fixtures = getCompletedFixtures();

  if (!tableBody) return;

  if (fixtures.length === 0) {
    const startedCount = getStartedFixtures().length;
    tableBody.innerHTML = `<tr><td colspan="5">${startedCount > 0 ? `${startedCount} game${startedCount === 1 ? ' is' : 's are'} in progress. Completed games appear here after the estimated full-time window.` : 'No games are completed yet.'}</td></tr>`;
    return;
  }

  tableBody.innerHTML = fixtures.map((fixture) => {
    const bestOption = getCandidateRowsForFixtures([fixture]).sort(compareBetQuality)[0];

    return `
      <tr>
        <td>${fixture.match_name}</td>
        <td>${formatKickoff(fixture.kickoff_time_aest)}</td>
        <td>${formatCompletedStatus(fixture)}</td>
        <td>${bestOption ? `<span class="primary-cell">${bestOption.target_selection}</span><span class="sub-cell">${[formatMarketLabel(bestOption.market_matrix), bestOption.au_bookie, formatOdds(bestOption)].filter(Boolean).join(' | ')}</span>` : '-'}</td>
        <td>${bestOption ? `<span class="qi-badge ${metricClass(bestOption.metrics.qi)}">${formatQiBadge(bestOption.metrics.qi)}</span>` : '-'}</td>
      </tr>
    `;
  }).join('');
}

function formatCompletedStatus(fixture) {
  const result = fixture.result || fixture.final_score || fixture.score;
  if (result) {
    return `<span class="primary-cell">Result recorded</span><span class="sub-cell">${result}</span>`;
  }

  return '<span class="primary-cell">Completed</span><span class="sub-cell">Result pending</span>';
}

function formatHistoryPrice(value, fallback = '-') {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : fallback;
}

function formatTrackedPrice(bet) {
  const firstSeen = Date.parse(bet.first_seen_at || '');
  const detail = Number.isFinite(firstSeen)
    ? `First saved ${formatter.format(new Date(firstSeen))}`
    : 'First saved by agent';

  return `<span class="primary-cell">${formatHistoryPrice(bet.opening_odds)}</span><span class="sub-cell">${detail}</span>`;
}

function formatOpeningClvCell(bet) {
  const openingQi = Number(bet.opening_qi);
  const ev = Number(bet.opening_ev);
  const modelPrice = Number(bet.opening_model_price);
  const details = [
    Number.isFinite(modelPrice) ? `Model ${formatHistoryPrice(modelPrice)}` : null,
    Number.isFinite(ev) ? `EV ${formatClv(ev)}` : null
  ].filter(Boolean).join(' | ');

  return `
    <span class="primary-cell">${formatHistoryPrice(bet.opening_odds)}</span>
    <span class="sub-cell">${formatFirstSeenLabel(bet)}</span>
    <span class="sub-cell line-price-with-qi"><span>Opening line</span><span class="qi-badge compact ${metricClass(openingQi)}">${formatQiBadge(openingQi, 'Opening QI')}</span></span>
    ${details ? `<span class="sub-cell">${details}</span>` : ''}
  `;
}

function formatOpeningLineOnly(bet) {
  const openingQi = Number(bet.opening_qi);

  return `
    <span class="primary-cell line-price-with-qi">
      <span>${formatHistoryPrice(bet.opening_odds)}</span>
      <span class="qi-badge compact ${metricClass(openingQi)}">${formatQiBadge(openingQi, 'Opening QI')}</span>
    </span>
    <span class="sub-cell">Opening line</span>
  `;
}

function formatFirstSeenLabel(bet) {
  const firstSeen = Date.parse(bet.first_seen_at || '');
  if (!Number.isFinite(firstSeen)) return 'First saved by agent';
  return `First saved ${formatter.format(new Date(firstSeen))}`;
}

function formatLatestOrClosingPrice(bet) {
  if (Number.isFinite(Number(bet.closing_odds))) {
    return `
      ${formatLinePriceWithQi(bet.closing_odds, bet)}
      <span class="sub-cell confirmed-text">Closing price${bet.closing_bookie ? ` | ${bet.closing_bookie}` : ''}</span>
      ${formatCapturedAt(bet.closing_captured_at)}
      ${formatCurrentSignal(bet)}
    `;
  }

  if (Number.isFinite(Number(bet.estimated_closing_odds))) {
    return `
      ${formatLinePriceWithQi(bet.estimated_closing_odds, bet)}
      <span class="sub-cell warning-text">Latest price${estimatedSourceLabel(bet)}</span>
      ${formatCapturedAt(bet.last_seen_at)}
      ${formatCurrentSignal(bet)}
    `;
  }

  return `
    ${formatLinePriceWithQi(bet.current_odds, bet)}
    <span class="sub-cell">${formatLatestPriceLabel(bet)}</span>
    ${formatCurrentSignal(bet)}
  `;
}

function estimatedSourceLabel(bet) {
  const source = String(bet.estimated_closing_source || '');
  if (source.includes('Betfair')) return ' | Betfair';
  if (source.includes('Sportsbet')) return ' | Sportsbet';
  if (source.includes('TAB')) return ' | TAB';
  if (source.includes('Neds')) return ' | Neds';
  if (source.includes('PointsBet')) return ' | PointsBet';
  return '';
}

function formatLinePriceWithQi(price, bet) {
  return `
    <span class="primary-cell line-price-with-qi">
      <span>${formatHistoryPrice(price)}</span>
      <span class="qi-badge compact ${metricClass(getClosingQi(bet))}">${formatClosingQiLabel(bet)}</span>
    </span>
  `;
}

function formatClosingQiLabel(bet) {
  const label = Number.isFinite(Number(bet.closing_odds)) ? 'Closing QI' : 'Latest QI';
  return formatQiBadge(getClosingQi(bet), label);
}

function formatLatestPriceLabel(bet) {
  const lastSeen = Date.parse(bet.last_seen_at || '');
  if (!Number.isFinite(lastSeen)) return 'Latest price';
  return `Latest price | ${formatter.format(new Date(lastSeen))}`;
}

function formatCapturedAt(value) {
  const capturedAt = Date.parse(value || '');
  if (!Number.isFinite(capturedAt)) return '';
  return `<span class="sub-cell">${formatter.format(new Date(capturedAt))}</span>`;
}

function formatCurrentSignal(bet) {
  const modelPrice = Number(bet.current_model_price);
  const ev = Number(bet.current_ev);
  const details = [
    Number.isFinite(modelPrice) ? `Model ${formatHistoryPrice(modelPrice)}` : null,
    Number.isFinite(ev) ? `EV ${formatClv(ev)}` : null
  ].filter(Boolean).join(' | ');

  return details ? `<span class="sub-cell">${details}</span>` : '';
}

function getClosingQi(bet) {
  const closingQi = Number(bet.closing_qi);
  if (Number.isFinite(closingQi)) return closingQi;
  const estimatedQi = Number(bet.estimated_qi);
  if (Number.isFinite(Number(bet.estimated_closing_odds)) && Number.isFinite(estimatedQi)) return estimatedQi;
  return Number(bet.current_qi);
}

function formatQiMove(bet) {
  const openingQi = Number(bet.opening_qi);
  const closingQi = getClosingQi(bet);
  const delta = Number.isFinite(openingQi) && Number.isFinite(closingQi) ? closingQi - openingQi : null;
  const deltaClass = delta === null ? 'neutral-text' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral-text';
  const deltaText = delta === null ? '-' : `${delta > 0 ? '+' : ''}${delta}`;
  const closeLabel = Number.isFinite(Number(bet.closing_odds)) ? 'Closing QI' : 'Latest QI';

  return `
    <span class="history-qi-line">
      <span class="qi-badge compact ${metricClass(openingQi)}">${formatQiBadge(openingQi)}</span>
      <span class="history-arrow">to</span>
      <span class="qi-badge compact ${metricClass(closingQi)}">${formatQiBadge(closingQi)}</span>
    </span>
    <span class="sub-cell">${closeLabel} | <span class="${deltaClass}">${deltaText}</span></span>
  `;
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
    const detailClass = Number(bet.clv_percent) >= 0 ? 'confirmed-text' : 'negative';
    if (!hasReliableClvBaseline(bet)) {
      return `<span class="primary-cell">Line move ${formatClv(bet.clv_percent)}</span><span class="sub-cell warning-text">First tracked price was too close to kickoff for true opening-to-close CLV</span>`;
    }
    return `<span class="primary-cell">${formatClv(bet.clv_percent)}</span><span class="sub-cell ${detailClass}">Confirmed closing line</span>`;
  }

  if (Number.isFinite(Number(bet.estimated_clv_percent))) {
    return `<span class="primary-cell">Estimated move ${formatClv(bet.estimated_clv_percent)}</span><span class="sub-cell warning-text">No confirmed closing line captured</span>`;
  }

  return '<span class="primary-cell">Pending</span><span class="sub-cell">Waiting for closing line</span>';
}

function formatLineGap(bet) {
  const opening = Number.parseFloat(bet.opening_odds);
  const latest = getLatestComparableOdds(bet);

  if (!Number.isFinite(opening) || !Number.isFinite(latest)) {
    return '<span class="primary-cell">Pending</span><span class="sub-cell">Waiting for closing/latest line</span>';
  }

  const gap = opening - latest;
  const label = Number.isFinite(Number(bet.closing_odds)) ? 'Opening minus closing' : 'Opening minus latest';
  const gapText = `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`;
  const clvValue = Number.isFinite(Number(bet.clv_percent))
    ? Number(bet.clv_percent)
    : Number(bet.estimated_clv_percent);
  const clvText = Number.isFinite(clvValue) ? `CLV ${formatClv(clvValue)}` : 'CLV pending';

  return `<span class="primary-cell">${gapText}</span><span class="sub-cell">${label}</span><span class="sub-cell">${clvText}</span>`;
}

function hasReliableClvBaseline(bet) {
  const firstSeen = Date.parse(bet.first_seen_at || '');
  const closingSeen = Date.parse(bet.closing_captured_at || '');
  const kickoff = parseKickoff(bet.kickoff_time_aest);
  const oneHour = 60 * 60 * 1000;

  return Number.isFinite(firstSeen)
    && Number.isFinite(closingSeen)
    && Number.isFinite(kickoff.getTime())
    && firstSeen < closingSeen
    && kickoff - firstSeen >= oneHour;
}

function priceDirection(bet) {
  const opening = Number.parseFloat(bet.opening_odds);
  const current = getLatestComparableOdds(bet);
  const comparisonLabel = Number.isFinite(Number(bet.closing_odds)) ? 'closing price' : 'latest price';

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
      detail: `Opening price is higher than ${comparisonLabel}.`
    };
  }

  if (opening < current) {
    return {
      className: 'negative',
      label: 'Negative',
      detail: `Opening price is lower than ${comparisonLabel}.`
    };
  }

  return {
      className: 'neutral-text',
      label: 'Neutral',
      detail: `Opening price equals ${comparisonLabel}.`
    };
}

function getLatestComparableOdds(bet) {
  if (Number.isFinite(Number(bet.closing_odds))) return Number(bet.closing_odds);
  if (Number.isFinite(Number(bet.estimated_closing_odds))) return Number(bet.estimated_closing_odds);
  return Number(bet.current_odds);
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
    return '<span class="sub-cell warning-text">No confirmed live price was captured in the final 5 minutes before kickoff.</span>';
  }

  if (!bet.closing_captured_at) return '<span class="sub-cell">Will capture a live price in the final 5 minutes before kickoff</span>';

  return `<span class="sub-cell confirmed-text">${formatter.format(new Date(bet.closing_captured_at))} | ${bet.closing_bookie || 'Confirmed'} live price before kickoff</span>`;
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

function formatBetResultBadge(bet) {
  const status = String(bet.result_status || '').toLowerCase();
  const resultClass = {
    won: 'positive',
    win: 'positive',
    lost: 'negative',
    loss: 'negative',
    push: 'neutral-text',
    void: 'neutral-text'
  }[status] || 'neutral-text';

  return `<span class="primary-cell ${resultClass}">${formatResultLabel(status)}</span>`;
}

function formatResultLabel(statusValue) {
  const status = String(statusValue || '').toLowerCase();
  return {
    won: 'Won',
    win: 'Won',
    lost: 'Lost',
    loss: 'Lost',
    push: 'Push',
    void: 'Void',
    pending: 'Pending'
  }[status] || 'Pending';
}

function formatSettledAt(bet) {
  const settled = Date.parse(bet.settled_at || '');
  if (!Number.isFinite(settled)) return '<span class="sub-cell">-</span>';
  return `<span class="primary-cell">${formatter.format(new Date(settled))}</span>`;
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

function bindSectionSortControls() {
  document.querySelectorAll('[data-section-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.sectionSort;
      if (target === 'props') {
        state.playerPropSortMode = button.dataset.sortValue;
        renderSectionSortControls();
        renderPlayerPropWatchlist();
        return;
      }

      if (target === 'scan') {
        state.scanSortMode = button.dataset.sortValue;
        renderSectionSortControls();
        renderSportsbookScan();
        return;
      }

      state.highValueSortMode = button.dataset.sortValue;
      renderSectionSortControls();
      renderHighValueBets();
    });
  });
}

function bindMarkovFilters() {
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-markov-prob-filter]')) {
      state.markovMinProbability = Number(event.target.value) || 0;
      renderFixturePanels();
      return;
    }

    if (event.target.matches('[data-markov-fair-filter]')) {
      state.markovMaxFairPrice = event.target.value === 'all' ? Infinity : Number(event.target.value);
      renderFixturePanels();
    }
  });
}

function bindHistoryResultFilters() {
  document.querySelectorAll('[data-history-result-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.historyResultFilter = button.dataset.historyResultFilter;
      renderBetHistory();
    });
  });
}

function bindResultsResultFilters() {
  document.querySelectorAll('[data-results-result-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.resultsResultFilter = button.dataset.resultsResultFilter;
      renderResults();
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

function bindMatchDetailTabs() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-match-detail-tab]');
    if (!button) return;
    state.matchDetailTab = button.dataset.matchDetailTab;
    renderFixturePanels();
  });
}

function isOwnerResultsMode() {
  const params = new URLSearchParams(window.location.search);
  return window.location.hash === '#results'
    || params.get('view') === 'results'
    || params.get('admin') === 'results';
}

function applyInitialViewFromUrl() {
  if (isOwnerResultsMode()) {
    state.activeView = 'results';
  }
}

function render() {
  renderViewTabs();
  renderSectionSortControls();
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
  renderResults();
  renderBetHistory();
}

Promise.all([loadDataset(), loadBetHistory(), loadPlayerPropWatchlist()])
  .then(() => {
    applyInitialViewFromUrl();
    window.betmateAppReady = true;
    document.documentElement.dataset.betmateAppReady = 'true';
    document.querySelector('[data-app-error]').textContent = '';
    bindSortControls();
    bindSectionSortControls();
    bindMarkovFilters();
    bindHistoryResultFilters();
    bindResultsResultFilters();
    bindRefreshOdds();
    bindViewTabs();
    bindMatchDetailTabs();
    render();
    setInterval(render, 30000);
  })
  .catch((error) => {
    console.error(error);
    document.querySelector('[data-app-error]').textContent = '';
  });
