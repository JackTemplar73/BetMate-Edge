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
  'soccer_fifa_world_cup'
];
const ODDS_API_BOOKMAKERS = [
  'sportsbet',
  'tab',
  'neds',
  'ladbrokes',
  'pointsbetau',
  'betright'
];
const BEST_PRICE_BOOKS = new Set([
  'sportsbet',
  'tab',
  'neds',
  'pointsbet',
  'pointsbetau',
  'betright'
]);
const ESPN_LEAGUES = [
  'fifa.world',
  'fifa.friendly'
];
const MIN_TRACKED_QI = 70;
const BASELINE_STALE_MS = 30 * 60 * 1000;
const CLOSING_WINDOW_MS = 2 * 60 * 1000;
const RESULT_SETTLEMENT_BUFFER_MS = 3 * 60 * 60 * 1000;

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
  const fourHoursMs = 4 * 60 * 60 * 1000;
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
    return { refresh: true, cadence: 'final-hour-live-5-minute' };
  }

  const insideFourHours = upcoming.some((fixture) => {
    const untilKickoff = fixture.kickoff - now;
    return untilKickoff > oneHourMs && untilKickoff <= fourHoursMs;
  });

  if (insideFourHours) {
    return { refresh: true, cadence: 'four-to-one-hours-5-minute' };
  }

  if (pricesAreStale) {
    return { refresh: true, cadence: 'stale-baseline-30-minute' };
  }

  if (now.getMinutes() % 30 === 0) {
    return { refresh: true, cadence: 'baseline-30-minute' };
  }

  return { refresh: false, cadence: 'skip-between-30-minute-refreshes' };
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

async function fetchEspnEventsForDataset(dataset) {
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

  return allEvents;
}

async function refreshRefereeData(dataset, nowIso, espnEvents = []) {
  const allEvents = espnEvents.length ? espnEvents : await fetchEspnEventsForDataset(dataset);
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

function eventSourceUrl(event) {
  const summaryLink = event.links?.find((link) => (link.rel || []).includes('summary'))?.href;
  return summaryLink || `https://www.espn.com/soccer/match/_/gameId/${event.id}`;
}

function eventResult(event) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  const completed = Boolean(competition?.status?.type?.completed || event.status?.type?.completed);

  if (!home || !away || !completed) return null;

  return {
    homeName: home.team?.displayName || home.team?.shortDisplayName || 'Home',
    awayName: away.team?.displayName || away.team?.shortDisplayName || 'Away',
    homeScore: Number(home.score),
    awayScore: Number(away.score),
    details: competition.details || [],
    source: eventSourceUrl(event)
  };
}

function resultLine(result) {
  return `${result.homeName} ${result.homeScore}-${result.awayScore} ${result.awayName}`;
}

function selectedTeam(selection) {
  return normalise(String(selection || '')
    .replace(/\bto win\b/i, '')
    .replace(/\bdouble chance\b/i, '')
    .replace(/[()+-]?\d+(?:\.\d+)?/g, '')
    .trim());
}

function exactScoreSelection(selection) {
  const match = String(selection || '').match(/(.+?)\s+(\d+)\s*[-–]\s*(\d+)$/);
  if (!match) return null;

  return {
    team: normalise(match[1]),
    firstScore: Number(match[2]),
    secondScore: Number(match[3])
  };
}

function cardedPlayers(result) {
  return result.details
    .filter((detail) => detail.yellowCard || detail.redCard || normalise(detail.type?.text).includes('card'))
    .flatMap((detail) => detail.athletesInvolved || [])
    .map((athlete) => normalise(athlete.displayName || athlete.fullName || athlete.shortName));
}

function settleAgainstScore(entry, result) {
  const selection = normalise(entry.target_selection);
  const home = normalise(result.homeName);
  const away = normalise(result.awayName);
  const homeWon = result.homeScore > result.awayScore;
  const awayWon = result.awayScore > result.homeScore;
  const draw = result.homeScore === result.awayScore;

  if (entry.market_matrix === 'Exact Score') {
    const exact = exactScoreSelection(entry.target_selection);
    if (!exact) return null;

    const expectedHome = exact.team === home ? exact.firstScore : exact.team === away ? exact.secondScore : null;
    const expectedAway = exact.team === home ? exact.secondScore : exact.team === away ? exact.firstScore : null;
    if (!Number.isFinite(expectedHome) || !Number.isFinite(expectedAway)) return null;

    return result.homeScore === expectedHome && result.awayScore === expectedAway ? 'won' : 'lost';
  }

  if (entry.market_matrix === 'Moneyline' || entry.market_matrix === 'Full Match Model') {
    if (selection.includes('draw') || selection.includes('end in a draw')) {
      return draw ? 'won' : 'lost';
    }

    const team = selectedTeam(entry.target_selection);
    if (team === home) return homeWon ? 'won' : 'lost';
    if (team === away) return awayWon ? 'won' : 'lost';
  }

  if (entry.market_matrix === 'Spread') {
    const point = numberFromSelection(entry.target_selection);
    const team = selectedTeam(entry.target_selection);
    if (!Number.isFinite(point)) return null;

    const selectedScore = team === home ? result.homeScore : team === away ? result.awayScore : null;
    const otherScore = team === home ? result.awayScore : team === away ? result.homeScore : null;
    if (!Number.isFinite(selectedScore) || !Number.isFinite(otherScore)) return null;

    const adjusted = selectedScore + point;
    if (adjusted > otherScore) return 'won';
    if (adjusted < otherScore) return 'lost';
    return 'push';
  }

  if (entry.market_matrix === 'Totals') {
    const point = numberFromSelection(entry.target_selection);
    if (!Number.isFinite(point)) return null;

    const total = result.homeScore + result.awayScore;
    if (selection.includes('under')) {
      if (total < point) return 'won';
      if (total > point) return 'lost';
      return 'push';
    }

    if (selection.includes('over')) {
      if (total > point) return 'won';
      if (total < point) return 'lost';
      return 'push';
    }
  }

  if (entry.market_matrix === 'Player Prop' && selection.includes('card')) {
    const player = normalise(String(entry.target_selection).split(':')[0]);
    if (!player) return null;

    const cards = cardedPlayers(result);
    return cards.includes(player) ? 'won' : 'lost';
  }

  return null;
}

function settleHistoryResults(entries, dataset, espnEvents, now = getNow()) {
  let settled = 0;
  const fixtureByName = new Map(dataset.map((fixture) => [normalise(fixture.match_name), fixture]));

  for (const entry of entries) {
    if (entry.result_status && entry.result_status !== 'pending') continue;

    const fixture = fixtureByName.get(normalise(entry.match_name));
    if (!fixture) continue;

    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (now - kickoff < RESULT_SETTLEMENT_BUFFER_MS) continue;

    const event = findEspnEvent(espnEvents, fixture);
    const result = event ? eventResult(event) : null;

    if (!result) {
      entry.result_status = 'pending';
      entry.result_detail = 'Result not verified yet. Will check again on the next automatic refresh.';
      continue;
    }

    const status = settleAgainstScore(entry, result);
    if (!status) {
      entry.result_status = 'pending';
      entry.result_detail = `Final score verified: ${resultLine(result)}. This market needs a more detailed settlement feed.`;
      entry.settlement_source = result.source;
      continue;
    }

    entry.result_status = status;
    entry.result_detail = `ESPN final: ${resultLine(result)}.`;
    entry.settlement_source = result.source;
    entry.settled_at = now.toISOString();
    settled += 1;
  }

  return settled;
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

function hasFreshClosingPrice(marketItem, kickoff) {
  const checkedAt = Date.parse(marketItem.odds_checked_at || '');
  const status = marketItem.odds_refresh_status;
  const wasChecked = status === 'checked_current' || status === 'updated';

  if (!Number.isFinite(checkedAt) || !wasChecked) {
    return null;
  }

  const delta = kickoff.getTime() - checkedAt;
  if (delta < 0 || delta > CLOSING_WINDOW_MS) {
    return null;
  }

  return {
    checkedAt: new Date(checkedAt),
    minutesBeforeKickoff: Math.round(delta / 60000)
  };
}

function shouldDropCorrectedOutlier(existing, metrics, currentOdds) {
  const openingOdds = Number.parseFloat(existing?.opening_odds);

  return Boolean(existing)
    && metrics.qi < MIN_TRACKED_QI
    && Number(existing.opening_qi) >= MIN_TRACKED_QI
    && Number.isFinite(openingOdds)
    && Number.isFinite(currentOdds)
    && Math.max(openingOdds, currentOdds) / Math.min(openingOdds, currentOdds) >= 3;
}

async function syncBetHistory(dataset, now = getNow(), espnEvents = []) {
  const history = await readHistory();
  const byId = new Map(history
    .filter((entry) => Number(entry.opening_qi) >= MIN_TRACKED_QI)
    .map((entry) => [entry.bet_id, entry]));
  const activeBetIds = new Set();
  const nowIso = now.toISOString();

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);

    for (const marketItem of fixture.markets || []) {
      const id = betId(fixture, marketItem);
      activeBetIds.add(id);
      const metrics = runVectorCalculations(marketItem);
      const currentOdds = Number.parseFloat(marketItem.current_odds);
      const modelPrice = Number.parseFloat(marketItem.true_price);
      const existing = byId.get(id);

      if (!existing && metrics.qi < MIN_TRACKED_QI) {
        continue;
      }

      if (shouldDropCorrectedOutlier(existing, metrics, currentOdds)) {
        byId.delete(id);
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
        clv_percent: null,
        estimated_closing_odds: null,
        estimated_clv_percent: null,
        estimated_closing_source: null,
        result_status: 'pending',
        result_detail: 'Awaiting final result check.',
        settlement_source: null
      };

      entry.result_status = entry.result_status || 'pending';
      entry.result_detail = entry.result_detail || 'Awaiting final result check.';
      entry.settlement_source = entry.settlement_source || null;
      entry.current_odds = currentOdds;
      entry.current_model_price = modelPrice;
      entry.current_ev = metrics.ev;
      entry.current_qi = metrics.qi;
      entry.last_seen_at = nowIso;

      const freshClose = hasFreshClosingPrice(marketItem, kickoff);
      if (freshClose && entry.closing_odds === null) {
        entry.closing_odds = currentOdds;
        entry.closing_captured_at = freshClose.checkedAt.toISOString();
        entry.closing_source = `Confirmed Odds API check ${freshClose.minutesBeforeKickoff} min before kickoff`;
        entry.closing_status = 'confirmed';
        entry.clv_percent = clvPercent(entry.opening_odds, entry.closing_odds);
        entry.estimated_closing_odds = null;
        entry.estimated_clv_percent = null;
        entry.estimated_closing_source = null;
      } else if (now >= kickoff && entry.closing_odds === null) {
        entry.closing_status = 'missing_fresh_close';
        entry.closing_source = 'No confirmed Odds API check inside 2 minutes before kickoff';
        entry.clv_percent = null;
        entry.estimated_closing_odds = currentOdds;
        entry.estimated_clv_percent = clvPercent(entry.opening_odds, currentOdds);
        entry.estimated_closing_source = 'Estimated from nearest saved price; not an official closing line.';
      }

      byId.set(id, entry);
    }
  }

  const nextHistory = [...byId.values()]
    .filter((entry) => Number(entry.opening_qi) >= MIN_TRACKED_QI)
    .filter((entry) => activeBetIds.has(entry.bet_id))
    .sort((a, b) => {
      const aKickoff = parseAest(a.kickoff_time_aest);
      const bKickoff = parseAest(b.kickoff_time_aest);
      const aCompleted = aKickoff <= now;
      const bCompleted = bKickoff <= now;
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

      const timeDiff = aKickoff - bKickoff;
      if (timeDiff !== 0) return timeDiff;
      return b.current_qi - a.current_qi;
    });

  const settledResults = settleHistoryResults(nextHistory, dataset, espnEvents, now);

  await writeFile(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`);
  await writeFile(EMBEDDED_HISTORY_PATH, `window.embeddedBetHistory = ${JSON.stringify(nextHistory, null, 2)};\n`);

  return { historyCount: nextHistory.length, settledResults };
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

function comparableName(value) {
  return String(value || '').replace(/\s*&\s*/g, ' and ');
}

function outcomeForMarket(marketItem, oddsMarket) {
  const selection = normalise(marketItem.target_selection);

  if (MARKET_MAP.h2h.includes(marketItem.market_matrix)) {
    if (selection.includes('draw') || selection.includes('end in a draw')) {
      return oddsMarket.outcomes.find((outcome) => normalise(outcome.name) === 'draw');
    }

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      const selectionTeam = selection.replace('to win', '').trim();
      return selection.includes(outcomeName)
        || outcomeName.includes(selectionTeam)
        || comparableName(selectionTeam) === comparableName(outcomeName);
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

function targetSelectionForH2hOutcome(outcome) {
  return normalise(outcome.name) === 'draw'
    ? 'Match to end in a Draw'
    : `${outcome.name} to Win`;
}

function findModelPriceForH2h(fixture, targetSelection) {
  const target = normalise(targetSelection);
  const match = (fixture.markets || []).find((marketItem) => {
    return marketItem.market_matrix === 'Full Match Model'
      && normalise(marketItem.target_selection) === target
      && Number.isFinite(Number(marketItem.true_price));
  });

  return match ? Number(match.true_price) : null;
}

function addMissingH2hRowsFromOddsApi(fixture, event, nowIso) {
  let added = 0;
  fixture.markets = fixture.markets || [];

  for (const bookmaker of event.bookmakers || []) {
    const bookName = BOOKMAKERS.get(bookmaker.key) || bookmaker.title || bookmaker.key;
    const h2hMarket = findMarket(bookmaker, ['h2h']);
    if (!h2hMarket) continue;

    for (const outcome of h2hMarket.outcomes || []) {
      if (!Number.isFinite(Number(outcome.price))) continue;

      const targetSelection = targetSelectionForH2hOutcome(outcome);
      const exists = fixture.markets.some((marketItem) => {
        return marketItem.market_matrix === 'Full Match Model'
          && normalise(marketItem.target_selection) === normalise(targetSelection)
          && normalise(marketItem.au_bookie) === normalise(bookName);
      });

      if (exists) continue;

      const modelPrice = findModelPriceForH2h(fixture, targetSelection);
      if (!Number.isFinite(modelPrice)) continue;

      fixture.markets.push({
        market_matrix: 'Full Match Model',
        target_selection: targetSelection,
        true_price: modelPrice,
        current_odds: Number(Number(outcome.price).toFixed(2)),
        au_bookie: bookName,
        odds_checked_at: nowIso,
        odds_updated_at: nowIso,
        odds_refresh_status: 'added_from_oddsapi',
        odds_refresh_note: `Added ${bookName} h2h price from Odds API.`
      });
      added += 1;
    }
  }

  return added;
}

function collapseToBestAvailableH2h(fixture) {
  const markets = fixture.markets || [];
  const bestBySelection = new Map();

  for (const marketItem of markets) {
    if (!MARKET_MAP.h2h.includes(marketItem.market_matrix)) continue;
    if (!BEST_PRICE_BOOKS.has(normalise(marketItem.au_bookie))) continue;

    const key = normalise(marketItem.target_selection);
    const current = bestBySelection.get(key);
    const price = Number(marketItem.current_odds);
    const currentPrice = Number(current?.current_odds);

    if (!current || price > currentPrice) {
      bestBySelection.set(key, {
        ...marketItem,
        odds_refresh_note: `${marketItem.odds_refresh_note || 'Checked via Odds API.'} Best available AU book price selected.`,
        best_price_tied_books: null
      });
    } else if (current && price === currentPrice) {
      const tiedBooks = new Set([
        ...(String(current.best_price_tied_books || current.au_bookie).split(/\s*\/\s*/).filter(Boolean)),
        marketItem.au_bookie
      ]);
      current.best_price_tied_books = [...tiedBooks].join(' / ');
    }
  }

  const seenBest = new Set();
  fixture.markets = markets.filter((marketItem) => {
    if (!MARKET_MAP.h2h.includes(marketItem.market_matrix)) return true;
    if (!BEST_PRICE_BOOKS.has(normalise(marketItem.au_bookie))) return true;

    const key = normalise(marketItem.target_selection);
    const best = bestBySelection.get(key);
    const isBest = best
      && normalise(best.au_bookie) === normalise(marketItem.au_bookie)
      && Number(best.current_odds) === Number(marketItem.current_odds)
      && !seenBest.has(key);

    if (isBest) {
      Object.assign(marketItem, best);
      marketItem.best_price_checked_books = 'Sportsbet, Neds, TAB, PointsBet, BetRight';
      marketItem.au_bookie = marketItem.best_price_tied_books || marketItem.au_bookie;
      seenBest.add(key);
      return true;
    }

    return false;
  });
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
  const espnEvents = await fetchEspnEventsForDataset(dataset);
  const refereeUpdates = await refreshRefereeData(dataset, nowIso, espnEvents);

  for (const fixture of dataset) {
    const event = findEvent(allEvents, fixture);
    fixture.odds_last_checked = nowIso;
    fixture.odds_refresh_cadence = timing.cadence;

    if (!event) {
      fixture.odds_refresh_note = 'No matching Odds API event found.';
      continue;
    }

    fixture.odds_refresh_note = `Matched Odds API event ${event.id || event.commence_time}.`;
    updates += addMissingH2hRowsFromOddsApi(fixture, event, nowIso);

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

    collapseToBestAvailableH2h(fixture);
  }

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(EMBEDDED_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  const { historyCount, settledResults } = await syncBetHistory(dataset, getNow(), espnEvents);

  console.log(`Odds refresh complete (${timing.cadence}). Updated ${updates} market prices. Verified ${refereeUpdates} referee assignments. Settled ${settledResults} results. Tracking ${historyCount} history rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
