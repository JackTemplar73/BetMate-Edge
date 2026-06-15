import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const EMBEDDED_PATH = new URL('../src/embeddedData.js', import.meta.url);
const COVERAGE_PATH = new URL('../data/oddsapi_au_market_coverage.json', import.meta.url);
const PLAYER_PROPS_PATH = new URL('../data/player_props_watchlist.json', import.meta.url);
const EMBEDDED_PLAYER_PROPS_PATH = new URL('../src/embeddedPlayerProps.js', import.meta.url);

const SPORT_KEY = 'soccer_fifa_world_cup';
const DEFAULT_SCAN_BOOKMAKERS = ['sportsbet', 'tab', 'pointsbetau', 'neds', 'bet365', 'betfair_ex_au'];
const SCAN_BOOKMAKERS = (process.env.ODDS_API_TARGET_BOOKMAKERS || process.env.ODDS_API_TARGET_BOOKMAKER || DEFAULT_SCAN_BOOKMAKERS.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const AU_BOOKMAKERS = [...new Set([...SCAN_BOOKMAKERS, 'betright'])];
const PLAYER_PROP_BOOKMAKERS = ['sportsbet', 'tab', 'pointsbetau', 'neds'];
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
  'player_goals_alternate',
  'player_assists',
  'player_assists_alternate',
  'player_shots',
  'player_shots_alternate',
  'player_shots_on_target',
  'player_shots_on_target_alternate',
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
  const priceQi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * Math.tanh(expectedGrowth / 0.25) + 0.5 * Math.tanh(ev / 5))))));
  const modelProbability = 100 / truePrice;
  const bookProbability = 100 / odds;
  const edge = modelProbability - bookProbability;
  let risk = 'Low';
  if (odds >= 8) risk = 'Very high';
  else if (odds >= 4) risk = 'High';
  else if (odds >= 2.2) risk = 'Medium';
  const edgeScore = Math.max(0, Math.min(100, (edge / 12) * 100));
  const probabilityScore = Math.max(0, Math.min(100, ((modelProbability - 20) / 45) * 100));
  const riskScore = {
    Low: 100,
    Medium: 75,
    High: 45,
    'Very high': 20
  }[risk] || 35;
  const qi = Math.round(Math.max(0, Math.min(100, (priceQi * 0.35) + (edgeScore * 0.3) + (probabilityScore * 0.2) + (riskScore * 0.15))));

  return {
    ev: Number(ev.toFixed(2)),
    qi,
    price_qi: priceQi
  };
}

function numberFromSelection(value) {
  const match = String(value || '').match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function pointMatches(targetPoint, outcomePoint) {
  return Number.isFinite(targetPoint)
    && Number.isFinite(outcomePoint)
    && Math.abs(outcomePoint - targetPoint) < 0.001;
}

function teamTotalTeamMatches(selection, description) {
  if (!description) return false;
  return selection.includes(description) || description.includes(selection.replace(/\b(over|under)\b.*$/i, '').trim());
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
  const itemMarket = normalise(item.market || item.market_matrix);
  const targetPoint = numberFromSelection(rawSelection);

  for (const key of keys) {
    const market = (bookmaker.markets || []).find((candidate) => candidate.key === key);
    if (!market) continue;
    const isTotalsMarket = key.includes('totals');
    const isTeamTotalsMarket = key.includes('team_totals') || itemMarket.includes('team totals');

    const outcome = (market.outcomes || []).find((candidate) => {
      const name = normalise(candidate.name);
      const description = normalise(candidate.description || '');
      const point = Number(candidate.point);

      if (isTotalsMarket && !pointMatches(targetPoint, point)) return false;
      if (isTeamTotalsMarket && !teamTotalTeamMatches(selection, description)) return false;
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

function matchingDevigOutcomes(market, outcome) {
  const outcomePoint = Number(outcome.point);
  const outcomeDescription = normalise(outcome.description || '');
  const outcomeName = normalise(outcome.name || '');
  const isPlayerMarket = String(market.key || '').startsWith('player_');

  return (market.outcomes || []).filter((candidate) => {
    if (!Number.isFinite(Number(candidate.price)) || Number(candidate.price) <= 1) return false;

    const candidatePoint = Number(candidate.point);
    const pointMatches = Number.isFinite(outcomePoint)
      ? Number.isFinite(candidatePoint) && Math.abs(candidatePoint - outcomePoint) < 0.001
      : !Number.isFinite(candidatePoint);

    if (!pointMatches) return false;

    if (isPlayerMarket) {
      const candidateDescription = normalise(candidate.description || '');
      return candidateDescription && candidateDescription === outcomeDescription;
    }

    if (['over', 'under'].includes(outcomeName)) {
      const candidateName = normalise(candidate.name || '');
      return ['over', 'under'].includes(candidateName);
    }

    return true;
  });
}

function devigBookProbability(bookmaker, marketKey, outcome) {
  const market = (bookmaker.markets || []).find((candidate) => candidate.key === marketKey);
  if (!market || !outcome || !Number.isFinite(Number(outcome.price)) || Number(outcome.price) <= 1) return null;

  const comparableOutcomes = matchingDevigOutcomes(market, outcome);
  if (comparableOutcomes.length < 2) return null;

  const impliedTotal = comparableOutcomes.reduce((total, candidate) => total + (1 / Number(candidate.price)), 0);
  if (!Number.isFinite(impliedTotal) || impliedTotal <= 0) return null;

  return Number((((1 / Number(outcome.price)) / impliedTotal) * 100).toFixed(2));
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

  const modelItems = (fixture.model_market_view || []).map((item) => ({
    ...item,
    source: 'Model'
  }));

  const seen = new Set();
  return [...pricedItems, ...modelItems].filter((item) => {
    const key = `${normalise(item.selection)}|${normalise(item.market)}|${Number(item.fair_price).toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return preferredMarketKeys(item).length > 0;
  });
}

function isConfirmedBenchPlayer(fixture, playerName) {
  const lineups = fixture.confirmed_lineups;
  if (!lineups || !playerName) return false;

  const player = String(playerName).toLowerCase();
  const starters = [
    ...(lineups.home_starting_xi || []),
    ...(lineups.away_starting_xi || [])
  ].map((name) => String(name).toLowerCase());
  const subs = [
    ...(lineups.home_substitutes || []),
    ...(lineups.away_substitutes || [])
  ].map((name) => String(name).toLowerCase());

  return subs.includes(player) && !starters.includes(player);
}

function playerLineupStatus(fixture, playerName) {
  const lineups = fixture.confirmed_lineups;
  if (!lineups || lineups.status !== 'confirmed' || !playerName) return 'unconfirmed';

  const player = String(playerName).toLowerCase();
  const starters = [
    ...(lineups.home_starting_xi || []),
    ...(lineups.away_starting_xi || [])
  ].map((name) => String(name).toLowerCase());
  const subs = [
    ...(lineups.home_substitutes || []),
    ...(lineups.away_substitutes || [])
  ].map((name) => String(name).toLowerCase());

  if (starters.includes(player)) return 'starter';
  if (subs.includes(player)) return 'bench';
  return 'not_listed';
}

function playerPropMarketKeys(prop) {
  const market = normalise(prop.market);
  if (market.includes('shots on target')) return ['player_shots_on_target_alternate', 'player_shots_on_target'];
  if (market.includes('total shots') || market.includes('shots')) return ['player_shots_alternate', 'player_shots'];
  if (market.includes('goal or assist') || market.includes('score or assist')) return ['player_to_score_or_assist'];
  if (market.includes('card')) return ['player_to_receive_card'];
  if (market.includes('assist')) return ['player_assists_alternate', 'player_assists'];
  if (market.includes('goal')) return ['player_goals_alternate', 'player_goals', 'player_goal_scorer_anytime'];
  return [];
}

function playerPropTargetPoint(prop) {
  const threshold = numberFromSelection(prop.market);
  if (!Number.isFinite(threshold)) return null;
  return Math.max(0.5, threshold - 0.5);
}

function findPlayerPropOutcome(bookmaker, prop) {
  const keys = playerPropMarketKeys(prop);
  const player = normalise(prop.player);
  const marketText = normalise(prop.market);
  const targetPoint = playerPropTargetPoint(prop);

  for (const key of keys) {
    const market = (bookmaker.markets || []).find((candidate) => candidate.key === key);
    if (!market) continue;

    const outcome = (market.outcomes || []).find((candidate) => {
      const name = normalise(candidate.name);
      const description = normalise(candidate.description || '');
      const participant = `${name} ${description}`.trim();
      const playerMatches = participant.includes(player) || player.includes(participant);
      const point = Number(candidate.point);
      const pointMatches = !Number.isFinite(targetPoint) || !Number.isFinite(point) || Math.abs(point - targetPoint) < 0.001;

      if (!playerMatches || !pointMatches) return false;
      if (marketText.includes('shot') && name && name !== 'over') return false;
      if (marketText.includes('assist') && key.includes('alternate') && name && name !== 'over') return false;
      if (marketText.includes('goal') && key.includes('alternate') && name && name !== 'over') return false;
      return true;
    });

    if (outcome && Number.isFinite(Number(outcome.price))) {
      return { marketKey: key, outcome };
    }
  }

  return null;
}

function playerPropsForFixture(playerProps, fixture) {
  return playerProps.filter((prop) => prop.match_name === fixture.match_name);
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
  const playerProps = JSON.parse(await readFile(PLAYER_PROPS_PATH, 'utf8'));
  const coreEvents = await fetchCoreEvents(apiKey);
  const nowIso = new Date().toISOString();
  const now = new Date();
  const coverageRows = [];

  for (const fixture of dataset) {
    if (parseAest(fixture.kickoff_time_aest) <= now) {
      continue;
    }

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
    const fixturePlayerProps = playerPropsForFixture(playerProps, fixture);
    fixturePlayerProps.forEach((prop) => {
      prop.live_prices = [];
      prop.last_checked = nowIso;
    });

    for (const bookmaker of bookmakers) {
      for (const item of scanItemsForFixture(fixture)) {
        const found = findOutcome(bookmaker, item);
        if (!found) continue;

        const odds = Number(Number(found.outcome.price).toFixed(2));
        const metrics = runVectorCalculations(item.fair_price, odds);
        const noVigProbability = devigBookProbability(bookmaker, found.marketKey, found.outcome);
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
          devig_book_probability: noVigProbability,
          ev: metrics.ev,
          qi: metrics.qi,
          price_qi: metrics.price_qi
        });
      }

      if (PLAYER_PROP_BOOKMAKERS.includes(bookmaker.key)) {
        for (const prop of fixturePlayerProps) {
          const lineupStatus = playerLineupStatus(fixture, prop.player);
          prop.lineup_role = lineupStatus;
          if (lineupStatus === 'bench' || lineupStatus === 'not_listed') {
            prop.status = 'watch_only';
            prop.model_note = `${prop.player} is not confirmed in the starting XI. Keep this as watch-only unless team news changes.`;
            continue;
          }

          const found = findPlayerPropOutcome(bookmaker, prop);
          if (!found) continue;

          const odds = Number(Number(found.outcome.price).toFixed(2));
          const metrics = runVectorCalculations(prop.model_price, odds);
          const modelProbability = Number(((1 / Number(prop.model_price)) * 100).toFixed(1));
          const noVigProbability = devigBookProbability(bookmaker, found.marketKey, found.outcome);
          const row = {
            selection: `${prop.player}: ${prop.market}`,
            category: 'Player Prop',
            market: prop.market,
            source: 'Player prop model',
            oddsapi_market: found.marketKey,
            model_probability: modelProbability,
            model_price: Number(prop.model_price),
            current_odds: odds,
            au_bookie: bookmaker.title || bookmaker.key,
            bookmaker_key: bookmaker.key,
            devig_book_probability: noVigProbability,
            ev: metrics.ev,
            qi: metrics.qi,
            price_qi: metrics.price_qi
          };
          rows.push(row);
          prop.live_prices.push({
            au_bookie: row.au_bookie,
            bookmaker_key: row.bookmaker_key,
            oddsapi_market: row.oddsapi_market,
            current_odds: row.current_odds,
            devig_book_probability: row.devig_book_probability,
            ev: row.ev,
            qi: row.qi,
            price_qi: row.price_qi,
            checked_at: nowIso
          });
        }
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
  await writeFile(PLAYER_PROPS_PATH, `${JSON.stringify(playerProps, null, 2)}\n`);
  await writeFile(EMBEDDED_PLAYER_PROPS_PATH, `window.embeddedPlayerProps = ${JSON.stringify(playerProps, null, 2)};\n`);
  await writeFile(COVERAGE_PATH, `${JSON.stringify(coverage, null, 2)}\n`);

  console.log(JSON.stringify({
    target_bookmakers: SCAN_BOOKMAKERS,
    events_checked: coverage.events_checked,
    matched_rows: dataset.reduce((sum, fixture) => sum + (fixture.market_scan?.matched_rows || 0), 0),
    player_prop_rows: playerProps.reduce((sum, prop) => sum + (prop.live_prices?.length || 0), 0),
    market_counts: coverage.market_counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
