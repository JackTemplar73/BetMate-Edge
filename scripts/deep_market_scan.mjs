import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const EMBEDDED_PATH = new URL('../src/embeddedData.js', import.meta.url);
const COVERAGE_PATH = new URL('../data/oddsapi_au_market_coverage.json', import.meta.url);

const SPORT_KEY = 'soccer_fifa_world_cup';
const DEFAULT_SCAN_BOOKMAKERS = ['sportsbet', 'tab', 'pointsbetau', 'neds', 'bet365'];
const SCAN_BOOKMAKERS = (process.env.ODDS_API_TARGET_BOOKMAKERS || process.env.ODDS_API_TARGET_BOOKMAKER || DEFAULT_SCAN_BOOKMAKERS.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const AU_BOOKMAKERS = [...new Set([...SCAN_BOOKMAKERS, 'betright'])];
const CORE_MARKETS = ['h2h', 'spreads', 'totals'];
const EVENT_MARKETS = [
  'h2h',
  'h2h_3_way',
  'spreads',
  'alternate_spreads',
  'totals',
  'alternate_totals',
  'team_totals',
  'alternate_team_totals',
  'draw_no_bet',
  'double_chance',
  'btts',
  'halftime_fulltime',
  'odd_even',
  'h2h_h1',
  'h2h_3_way_h1',
  'totals_h1',
  'alternate_totals_h1',
  'team_totals_h1',
  'alternate_team_totals_h1',
  'btts_h1',
  'double_chance_h1',
  'odd_even_h1',
  'player_goal_scorer_anytime',
  'player_first_goal_scorer',
  'player_to_score_or_assist',
  'player_goals',
  'player_assists',
  'player_shots',
  'player_shots_on_target',
  'player_to_receive_card'
];

const TEAM_ALIASES = new Map([
  ['usa', 'united states'],
  ['us', 'united states'],
  ['turkiye', 'turkey'],
  ['türkiye', 'turkey'],
  ['bosnia & herzegovina', 'bosnia and herzegovina']
]);

function normalise(value) {
  const clean = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\band\b/g, '&')
    .replace(/[^a-z0-9&.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return TEAM_ALIASES.get(clean) || clean;
}

function parseAest(value) {
  return new Date(`${value}+10:00`);
}

function splitTeams(matchName) {
  const parts = matchName.split(/\s+vs\s+/i);
  if (parts.length !== 2) return null;
  return {
    home: normalise(parts[0]),
    away: normalise(parts[1])
  };
}

function findEvent(events, fixture) {
  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  const kickoff = parseAest(fixture.kickoff_time_aest).getTime();
  const maxDriftMs = 36 * 60 * 60 * 1000;

  return events.find((event) => {
    const eventTeams = [normalise(event.home_team), normalise(event.away_team)];
    const hasTeams = eventTeams.includes(teams.home) && eventTeams.includes(teams.away);
    const eventTime = new Date(event.commence_time).getTime();
    return hasTeams && Math.abs(eventTime - kickoff) <= maxDriftMs;
  }) || null;
}

function runVectorCalculations(fairPrice, currentOdds) {
  const truePrice = Number.parseFloat(fairPrice);
  const odds = Number.parseFloat(currentOdds);
  if (!Number.isFinite(truePrice) || !Number.isFinite(odds) || truePrice <= 1 || odds <= 1) {
    return { ev: 0, qi: 0 };
  }

  const ev = ((odds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = odds - 1;
  const betSize = Math.ceil((100 / Math.sqrt(b)) / 5) * 5;
  const fraction = betSize / 10000;
  const expectedGrowth = (p * Math.log(1 + fraction * b) + (1 - p) * Math.log(1 - fraction)) * 100;
  const qi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * Math.tanh(expectedGrowth / 0.25) + 0.5 * Math.tanh(ev / 5))))));

  return {
    ev: Number(ev.toFixed(2)),
    qi
  };
}

function numberFromSelection(value) {
  const match = String(value || '').match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function preferredMarketKeys(item) {
  const market = normalise(item.market || item.market_matrix);
  const category = normalise(item.category);
  const selection = normalise(item.selection || item.target_selection);

  if (market.includes('team totals')) return category.includes('first half') ? ['alternate_team_totals_h1', 'team_totals_h1'] : ['alternate_team_totals', 'team_totals'];
  if (market.includes('alternate totals')) return category.includes('first half') ? ['alternate_totals_h1', 'totals_h1'] : ['alternate_totals', 'totals'];
  if (market.includes('moneyline') || market.includes('match result') || market.includes('full match model')) return ['h2h_3_way', 'h2h'];
  if (market.includes('spread') || market.includes('handicap')) return ['alternate_spreads', 'spreads'];
  if (market.includes('totals') || market.includes('goals total') || market === 'total') return ['alternate_totals', 'totals'];
  if (market.includes('double chance')) return ['double_chance'];
  if (market.includes('draw no bet')) return ['draw_no_bet'];
  if (market.includes('both teams') || market.includes('btts')) return category.includes('first half') ? ['btts_h1'] : ['btts'];
  if (selection.includes('over') || selection.includes('under')) return category.includes('first half') ? ['alternate_totals_h1', 'totals_h1'] : ['alternate_totals', 'totals'];
  if (market.includes('odd')) return category.includes('first half') ? ['odd_even_h1'] : ['odd_even'];
  if (market.includes('first half result')) return ['h2h_3_way_h1', 'h2h_h1'];
  if (market.includes('first half totals')) return ['alternate_totals_h1', 'totals_h1'];
  return [];
}

function findOutcome(bookmaker, item) {
  const keys = preferredMarketKeys(item);
  const rawSelection = item.selection || item.target_selection;
  const selection = normalise(rawSelection);
  const targetPoint = numberFromSelection(rawSelection);

  for (const key of keys) {
    const market = (bookmaker.markets || []).find((candidate) => candidate.key === key);
    if (!market) continue;

    const outcome = (market.outcomes || []).find((candidate) => {
      const name = normalise(candidate.name);
      const description = normalise(candidate.description || '');
      const point = Number(candidate.point);
      const pointMatches = !Number.isFinite(targetPoint) || !Number.isFinite(point) || Math.abs(point - targetPoint) < 0.001;

      if (!pointMatches) return false;
      if (selection.includes(name) || name.includes(selection)) return true;
      if (description && (selection.includes(description) || description.includes(selection))) return true;

      if (selection.includes('btts yes') && name === 'yes') return true;
      if (selection.includes('btts no') && name === 'no') return true;
      if (selection.includes('odd goals') && name === 'odd') return true;
      if (selection.includes('even goals') && name === 'even') return true;
      if (selection.includes('over') && name === 'over') return true;
      if (selection.includes('under') && name === 'under') return true;
      if (selection.includes('draw') && name === 'draw') return true;
      if (selection.includes('win') && selection.includes(name)) return true;

      return false;
    });

    if (outcome && Number.isFinite(Number(outcome.price))) {
      return { marketKey: key, outcome };
    }
  }

  return null;
}

function scanItemsForFixture(fixture) {
  const pricedItems = (fixture.markets || [])
    .filter((item) => Number.isFinite(Number(item.true_price)) && Number(item.true_price) > 1)
    .map((item) => ({
      selection: item.target_selection,
      category: item.market_matrix,
      market: item.market_matrix,
      probability: Number(((1 / Number(item.true_price)) * 100).toFixed(1)),
      fair_price: Number(item.true_price),
      source: 'Priced model'
    }));

  const modelItems = (fixture.markov_market_model || []).map((item) => ({
    ...item,
    source: 'Markov model'
  }));

  const seen = new Set();
  return [...pricedItems, ...modelItems].filter((item) => {
    const key = `${normalise(item.selection)}|${normalise(item.market)}|${Number(item.fair_price).toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return preferredMarketKeys(item).length > 0;
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body.slice(0, 240)}`);
  }
  return response.json();
}

async function fetchCoreEvents(apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('bookmakers', AU_BOOKMAKERS.join(','));
  url.searchParams.set('markets', CORE_MARKETS.join(','));
  url.searchParams.set('oddsFormat', 'decimal');
  url.searchParams.set('dateFormat', 'iso');
  return fetchJson(url);
}

async function fetchEventOdds(apiKey, eventId, bookmakerKeys = SCAN_BOOKMAKERS) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/events/${eventId}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('bookmakers', bookmakerKeys.join(','));
  url.searchParams.set('markets', EVENT_MARKETS.join(','));
  url.searchParams.set('oddsFormat', 'decimal');
  url.searchParams.set('dateFormat', 'iso');
  return fetchJson(url);
}

function coverageForEvent(event) {
  const rows = [];
  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      rows.push({
        bookmaker: bookmaker.key,
        market: market.key,
        outcomes: market.outcomes?.length || 0
      });
    }
  }
  return rows;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY is not set.');

  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const coreEvents = await fetchCoreEvents(apiKey);
  const nowIso = new Date().toISOString();
  const coverageRows = [];

  for (const fixture of dataset) {
    const event = findEvent(coreEvents, fixture);
    if (!event) {
      fixture.market_scan = {
        bookmakers: SCAN_BOOKMAKERS,
        checked_at: nowIso,
        status: 'no_oddsapi_event',
        rows: []
      };
      continue;
    }

    const eventOdds = await fetchEventOdds(apiKey, event.id, SCAN_BOOKMAKERS);
    coverageRows.push(...coverageForEvent(eventOdds).map((row) => ({ ...row, match_name: fixture.match_name })));
    const bookmakers = (eventOdds.bookmakers || []).filter((item) => SCAN_BOOKMAKERS.includes(item.key));

    if (bookmakers.length === 0) {
      fixture.market_scan = {
        bookmakers: SCAN_BOOKMAKERS,
        checked_at: nowIso,
        status: 'bookmakers_missing',
        oddsapi_event_id: event.id,
        rows: []
      };
      continue;
    }

    const rows = [];
    for (const bookmaker of bookmakers) {
      for (const item of scanItemsForFixture(fixture)) {
        const found = findOutcome(bookmaker, item);
        if (!found) continue;

        const odds = Number(Number(found.outcome.price).toFixed(2));
        const metrics = runVectorCalculations(item.fair_price, odds);
        rows.push({
          selection: item.selection,
          category: item.category,
          market: item.market,
          source: item.source,
          oddsapi_market: found.marketKey,
          model_probability: item.probability,
          model_price: item.fair_price,
          current_odds: odds,
          au_bookie: bookmaker.title || bookmaker.key,
          bookmaker_key: bookmaker.key,
          ev: metrics.ev,
          qi: metrics.qi
        });
      }
    }

    fixture.market_scan = {
      bookmakers: bookmakers.map((bookmaker) => bookmaker.title || bookmaker.key),
      checked_at: nowIso,
      status: 'checked',
      oddsapi_event_id: event.id,
      offered_market_keys: [...new Set(bookmakers.flatMap((bookmaker) => (bookmaker.markets || []).map((market) => market.key)))].sort(),
      matched_rows: rows.length,
      rows: rows.sort((a, b) => b.qi - a.qi || b.ev - a.ev)
    };
  }

  const coverage = {
    checked_at: nowIso,
    target_bookmakers: SCAN_BOOKMAKERS,
    events_checked: dataset.filter((fixture) => fixture.market_scan?.status === 'checked').length,
    market_counts: coverageRows.reduce((acc, row) => {
      acc[row.market] = (acc[row.market] || 0) + 1;
      return acc;
    }, {}),
    matches: dataset.map((fixture) => ({
      match_name: fixture.match_name,
      status: fixture.market_scan?.status,
      bookmakers: fixture.market_scan?.bookmakers || [],
      offered_market_keys: fixture.market_scan?.offered_market_keys || [],
      matched_rows: fixture.market_scan?.matched_rows || 0
    }))
  };

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(EMBEDDED_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  await writeFile(COVERAGE_PATH, `${JSON.stringify(coverage, null, 2)}\n`);

  console.log(JSON.stringify({
    target_bookmakers: SCAN_BOOKMAKERS,
    events_checked: coverage.events_checked,
    matched_rows: dataset.reduce((sum, fixture) => sum + (fixture.market_scan?.matched_rows || 0), 0),
    market_counts: coverage.market_counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
