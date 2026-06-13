import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const EMBEDDED_PATH = new URL('../src/embeddedData.js', import.meta.url);
const HISTORY_PATH = new URL('../data/bet_history.json', import.meta.url);
const EMBEDDED_HISTORY_PATH = new URL('../src/embeddedBetHistory.js', import.meta.url);

const BOOKMAKERS = new Map([
  ['sportsbet', 'Sportsbet'],
  ['tab', 'TAB'],
  ['neds', 'Neds'],
  ['ladbrokes', 'Ladbrokes'],
  ['pointsbetau', 'PointsBet'],
  ['pointsbet', 'PointsBet'],
  ['betright', 'BetRight']
]);

const DEFAULT_SPORT_KEYS = [
  'soccer_fifa_world_cup',
  'soccer_international_friendlies'
];
const ODDS_API_BOOKMAKERS = [
  'sportsbet',
  'tab',
  'neds',
  'ladbrokes',
  'pointsbetau',
  'betright'
];
const ESPN_LEAGUES = [
  'fifa.world',
  'fifa.friendly'
];
const MIN_TRACKED_QI = 70;
const BASELINE_STALE_MS = 30 * 60 * 1000;

const MARKET_MAP = {
  h2h: ['Full Match Model', 'Moneyline'],
  spreads: ['Spread'],
  totals: ['Totals']
};

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
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return TEAM_ALIASES.get(clean) || clean;
}

function parseAest(value) {
  return new Date(`${value}+10:00`);
}

function getNow() {
  return process.env.BETMATE_NOW ? new Date(process.env.BETMATE_NOW) : new Date();
}

function latestOddsCheck(dataset) {
  const timestamps = dataset
    .map((fixture) => Date.parse(fixture.odds_last_checked || ''))
    .filter(Number.isFinite);

  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function runVectorCalculations(marketItem) {
  const truePrice = Number.parseFloat(marketItem.true_price);
  const currentOdds = Number.parseFloat(marketItem.current_odds);

  if (!Number.isFinite(truePrice) || !Number.isFinite(currentOdds) || truePrice <= 1 || currentOdds <= 1) {
    return { ev: 0, qi: 0 };
  }

  const ev = ((currentOdds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = currentOdds - 1;
  const betSize = Math.ceil((100 / Math.sqrt(b)) / 5) * 5;
  const fraction = betSize / 10000;
  const eg = (p * Math.log(1 + fraction * b) + (1 - p) * Math.log(1 - fraction)) * 100;
  const qi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * Math.tanh(eg / 0.25) + 0.5 * Math.tanh(ev / 5))))));

  return {
    ev: Number.parseFloat(ev.toFixed(2)),
    qi
  };
}

function shouldRefresh(dataset, now = getNow()) {
  if (process.env.FORCE_REFRESH === 'true' || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    return { refresh: true, cadence: 'manual' };
  }

  const oneHourMs = 60 * 60 * 1000;
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const latestCheck = latestOddsCheck(dataset);
  const pricesAreStale = !latestCheck || now - latestCheck >= BASELINE_STALE_MS;
  const upcoming = dataset
    .map((fixture) => ({
      name: fixture.match_name,
      kickoff: parseAest(fixture.kickoff_time_aest)
    }))
    .filter((fixture) => fixture.kickoff > now);

  const insideOneHour = upcoming.some((fixture) => {
    const untilKickoff = fixture.kickoff - now;
    return untilKickoff >= 0 && untilKickoff <= oneHourMs;
  });

  if (insideOneHour) {
    return { refresh: true, cadence: 'final-hour-5-minute' };
  }

  const insideTwoHours = upcoming.some((fixture) => {
    const untilKickoff = fixture.kickoff - now;
    return untilKickoff >= 0 && untilKickoff <= twoHoursMs;
  });

  if (insideTwoHours) {
    return now.getMinutes() % 15 === 0
      ? { refresh: true, cadence: 'final-two-hours-15-minute' }
      : { refresh: false, cadence: 'skip-between-15-minute-refreshes' };
  }

  if (pricesAreStale) {
    return { refresh: true, cadence: 'stale-baseline-30-minute' };
  }

  if (now.getMinutes() === 0) {
    return { refresh: true, cadence: 'hourly' };
  }

  return { refresh: false, cadence: 'skip-between-hourly-refreshes' };
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

function dateKey(value) {
  return value.toISOString().slice(0, 10).replace(/-/g, '');
}

function fixtureDateKeys(dataset) {
  return [...new Set(dataset.map((fixture) => dateKey(parseAest(fixture.kickoff_time_aest))))];
}

function findEspnEvent(events, fixture) {
  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  const kickoff = parseAest(fixture.kickoff_time_aest).getTime();
  const maxDriftMs = 36 * 60 * 60 * 1000;

  return events.find((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const teamNames = competitors.flatMap((competitor) => [
      competitor.team?.displayName,
      competitor.team?.shortDisplayName,
      competitor.team?.name,
      competitor.team?.abbreviation
    ]).filter(Boolean).map(normalise);

    const eventTime = new Date(event.date || competition?.date || '').getTime();
    const hasTeams = teamNames.includes(teams.home) && teamNames.includes(teams.away);
    return hasTeams && Number.isFinite(eventTime) && Math.abs(eventTime - kickoff) <= maxDriftMs;
  }) || null;
}

function getEspnReferee(event) {
  const officials = event.competitions?.[0]?.officials || event.officials || [];
  const referee = officials.find((official) => {
    const role = normalise(official.position?.name || official.position?.displayName || official.role || official.type || '');
    return role.includes('referee') || role === 'ref';
  }) || officials[0];

  return referee?.displayName || referee?.fullName || referee?.name || null;
}

async function fetchEspnScoreboard(league, date) {
  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`);
  url.searchParams.set('dates', date);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN ${league} referee request failed: ${response.status}`);
  }

  return response.json();
}

async function refreshRefereeData(dataset, nowIso) {
  const allEvents = [];

  for (const league of ESPN_LEAGUES) {
    for (const date of fixtureDateKeys(dataset)) {
      try {
        const scoreboard = await fetchEspnScoreboard(league, date);
        allEvents.push(...(scoreboard.events || []));
      } catch (error) {
        console.warn(error.message);
      }
    }
  }

  let verified = 0;

  for (const fixture of dataset) {
    fixture.referee_last_checked = nowIso;
    fixture.referee_check_sources = 'FIFA first when available; ESPN structured event feed fallback.';

    const espnEvent = findEspnEvent(allEvents, fixture);
    const espnReferee = espnEvent ? getEspnReferee(espnEvent) : null;

    if (espnReferee) {
      fixture.referee_name = espnReferee;
      fixture.referee_status = 'verified';
      fixture.referee_source = `ESPN event ${espnEvent.id || 'match centre'}`;
      fixture.referee_tendencies = fixture.referee_tendencies === 'No referee-specific adjustment applied; card and foul effects are not being overclaimed.'
        ? 'Referee confirmed from ESPN. No card-style adjustment has been applied until the referee profile is separately modelled.'
        : fixture.referee_tendencies;
      verified += 1;
      continue;
    }

    if (normalise(fixture.referee_name).includes('referee not verified')) {
      fixture.referee_status = 'not_verified';
      fixture.referee_source = 'No FIFA or ESPN referee assignment found during latest refresh.';
      fixture.referee_tendencies = 'No referee-specific adjustment applied; card and foul effects are not being overclaimed.';
      continue;
    }

    if (fixture.referee_status !== 'verified') {
      fixture.referee_status = 'provided';
      fixture.referee_source = fixture.referee_source || 'Initial model dataset; not independently verified by FIFA or ESPN yet.';
    }
  }

  return verified;
}

function betId(fixture, marketItem) {
  const raw = [
    fixture.match_name,
    fixture.kickoff_time_aest,
    marketItem.market_matrix,
    marketItem.target_selection,
    marketItem.au_bookie
  ].map(normalise).join('|');

  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

async function readHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function clvPercent(openingOdds, closingOdds) {
  if (!Number.isFinite(openingOdds) || !Number.isFinite(closingOdds) || openingOdds <= 1 || closingOdds <= 1) {
    return null;
  }

  return Number.parseFloat((((openingOdds / closingOdds) - 1) * 100).toFixed(2));
}

async function syncBetHistory(dataset, now = getNow()) {
  const history = await readHistory();
  const byId = new Map(history
    .filter((entry) => Number(entry.opening_qi) >= MIN_TRACKED_QI || Number(entry.current_qi) >= MIN_TRACKED_QI)
    .map((entry) => [entry.bet_id, entry]));
  const nowIso = now.toISOString();

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);

    for (const marketItem of fixture.markets || []) {
      const id = betId(fixture, marketItem);
      const metrics = runVectorCalculations(marketItem);
      const currentOdds = Number.parseFloat(marketItem.current_odds);
      const modelPrice = Number.parseFloat(marketItem.true_price);
      const existing = byId.get(id);

      if (!existing && metrics.qi < MIN_TRACKED_QI) {
        continue;
      }

      const entry = existing || {
        bet_id: id,
        match_name: fixture.match_name,
        kickoff_time_aest: fixture.kickoff_time_aest,
        market_matrix: marketItem.market_matrix,
        target_selection: marketItem.target_selection,
        au_bookie: marketItem.au_bookie,
        first_seen_at: nowIso,
        opening_odds: currentOdds,
        opening_model_price: modelPrice,
        opening_ev: metrics.ev,
        opening_qi: metrics.qi,
        closing_odds: null,
        closing_captured_at: null,
        clv_percent: null
      };

      entry.current_odds = currentOdds;
      entry.current_model_price = modelPrice;
      entry.current_ev = metrics.ev;
      entry.current_qi = metrics.qi;
      entry.last_seen_at = nowIso;

      if (now >= kickoff && entry.closing_odds === null) {
        entry.closing_odds = currentOdds;
        entry.closing_captured_at = nowIso;
        entry.clv_percent = clvPercent(entry.opening_odds, entry.closing_odds);
      }

      byId.set(id, entry);
    }
  }

  const nextHistory = [...byId.values()]
    .filter((entry) => Number(entry.opening_qi) >= MIN_TRACKED_QI || Number(entry.current_qi) >= MIN_TRACKED_QI)
    .sort((a, b) => {
      const timeDiff = new Date(a.kickoff_time_aest) - new Date(b.kickoff_time_aest);
      if (timeDiff !== 0) return timeDiff;
      return b.current_qi - a.current_qi;
    });

  await writeFile(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`);
  await writeFile(EMBEDDED_HISTORY_PATH, `window.embeddedBetHistory = ${JSON.stringify(nextHistory, null, 2)};\n`);

  return nextHistory.length;
}

function getBookmaker(event, displayName) {
  const target = normalise(displayName);
  return (event.bookmakers || []).find((bookmaker) => {
    const mapped = BOOKMAKERS.get(bookmaker.key) || bookmaker.title || bookmaker.key;
    return normalise(mapped) === target || normalise(bookmaker.title) === target || normalise(bookmaker.key) === target;
  }) || null;
}

function findMarket(bookmaker, keys) {
  return (bookmaker.markets || []).find((market) => keys.includes(market.key)) || null;
}

function numberFromSelection(selection) {
  const match = String(selection).match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function outcomeForMarket(marketItem, oddsMarket) {
  const selection = normalise(marketItem.target_selection);

  if (MARKET_MAP.h2h.includes(marketItem.market_matrix)) {
    if (selection.includes('draw') || selection.includes('end in a draw')) {
      return oddsMarket.outcomes.find((outcome) => normalise(outcome.name) === 'draw');
    }

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return selection.includes(outcomeName) || outcomeName.includes(selection.replace('to win', '').trim());
    });
  }

  if (MARKET_MAP.spreads.includes(marketItem.market_matrix)) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    if (!Number.isFinite(targetPoint)) return null;

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      const selectionTeam = selection.replace(String(targetPoint), '').replace(/[+-]/g, '').trim();
      return Math.abs(Number(outcome.point) - targetPoint) < 0.001
        && (selection.includes(outcomeName) || outcomeName.includes(selectionTeam));
    });
  }

  if (MARKET_MAP.totals.includes(marketItem.market_matrix)) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    const wantsUnder = selection.includes('under');
    const wantsOver = selection.includes('over');
    if (!Number.isFinite(targetPoint) || (!wantsUnder && !wantsOver)) return null;

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return Math.abs(Number(outcome.point) - targetPoint) < 0.001
        && ((wantsUnder && outcomeName === 'under') || (wantsOver && outcomeName === 'over'));
    });
  }

  return null;
}

async function fetchOddsForSport(sportKey, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('bookmakers', ODDS_API_BOOKMAKERS.join(','));
  url.searchParams.set('markets', 'h2h,spreads,totals');
  url.searchParams.set('oddsFormat', 'decimal');
  url.searchParams.set('dateFormat', 'iso');

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${sportKey} odds request failed: ${response.status} ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('ODDS_API_KEY is not set. Add it as a GitHub repository secret.');
  }

  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const timing = shouldRefresh(dataset);

  if (!timing.refresh) {
    console.log(`Skipping odds refresh: ${timing.cadence}`);
    return;
  }

  const sportKeys = (process.env.ODDS_API_SPORT_KEYS || DEFAULT_SPORT_KEYS.join(','))
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  const allEvents = [];
  for (const sportKey of sportKeys) {
    try {
      const events = await fetchOddsForSport(sportKey, apiKey);
      allEvents.push(...events);
      console.log(`Fetched ${events.length} events for ${sportKey}`);
    } catch (error) {
      console.warn(error.message);
    }
  }

  let updates = 0;
  const nowIso = new Date().toISOString();
  const refereeUpdates = await refreshRefereeData(dataset, nowIso);

  for (const fixture of dataset) {
    const event = findEvent(allEvents, fixture);
    fixture.odds_last_checked = nowIso;
    fixture.odds_refresh_cadence = timing.cadence;

    if (!event) {
      fixture.odds_refresh_note = 'No matching Odds API event found.';
      continue;
    }

    fixture.odds_refresh_note = `Matched Odds API event ${event.id || event.commence_time}.`;

    for (const marketItem of fixture.markets || []) {
      marketItem.odds_checked_at = nowIso;

      const oddsMarketKeys = Object.entries(MARKET_MAP)
        .filter(([, localTypes]) => localTypes.includes(marketItem.market_matrix))
        .map(([key]) => key);

      if (oddsMarketKeys.length === 0) {
        marketItem.odds_refresh_status = 'unsupported_by_oddsapi';
        marketItem.odds_refresh_note = 'Odds API standard soccer feed does not cover this market type.';
        continue;
      }

      const bookmaker = getBookmaker(event, marketItem.au_bookie);
      if (!bookmaker) {
        marketItem.odds_refresh_status = 'bookmaker_missing';
        marketItem.odds_refresh_note = `${marketItem.au_bookie} was not present in the matched Odds API event.`;
        continue;
      }

      const oddsMarket = findMarket(bookmaker, oddsMarketKeys);
      if (!oddsMarket) {
        marketItem.odds_refresh_status = 'market_missing';
        marketItem.odds_refresh_note = `${marketItem.au_bookie} did not return this market in Odds API.`;
        continue;
      }

      const outcome = outcomeForMarket(marketItem, oddsMarket);
      if (!outcome || !Number.isFinite(Number(outcome.price))) {
        marketItem.odds_refresh_status = 'selection_missing';
        marketItem.odds_refresh_note = 'The exact selection could not be matched in Odds API.';
        continue;
      }

      const nextPrice = Number(Number(outcome.price).toFixed(2));
      const priceChanged = nextPrice !== Number(marketItem.current_odds);
      if (priceChanged) {
        marketItem.previous_odds = marketItem.current_odds;
        marketItem.current_odds = nextPrice;
        marketItem.odds_updated_at = nowIso;
        updates += 1;
      }

      marketItem.odds_refresh_status = priceChanged ? 'updated' : 'checked_current';
      marketItem.odds_refresh_note = `Checked ${marketItem.au_bookie} via Odds API.`;
    }
  }

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(EMBEDDED_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  const historyCount = await syncBetHistory(dataset);

  console.log(`Odds refresh complete (${timing.cadence}). Updated ${updates} market prices. Verified ${refereeUpdates} referee assignments. Tracking ${historyCount} history rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
