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
const FIFA_REPORT_HUB_URL = 'https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php';
const MIN_TRACKED_QI = 70;
const BASELINE_STALE_MS = 30 * 60 * 1000;
const CLOSING_WINDOW_MS = 30 * 60 * 1000;
const RESULT_SETTLEMENT_BUFFER_MS = 3 * 60 * 60 * 1000;
const LINEUP_CHECK_WINDOW_MS = 60 * 60 * 1000;

const ODDS_API_MARKETS = [
  'h2h',
  'h2h_3_way',
  'h2h_lay',
  'h2h_3_way_lay',
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
  'h2h_h2',
  'h2h_3_way_h1',
  'h2h_3_way_h2',
  'h2h_3_way_h1_lay',
  'spreads_h1',
  'alternate_spreads_h1',
  'alternate_spreads_h2',
  'totals_h1',
  'totals_h2',
  'alternate_totals_h1',
  'alternate_totals_h2',
  'alternate_totals_h1_lay',
  'team_totals_h1',
  'alternate_team_totals_h1',
  'alternate_team_totals_h2',
  'btts_h1',
  'btts_h2',
  'double_chance_h1',
  'double_chance_h2',
  'odd_even_h1',
  'alternate_spreads_corners',
  'alternate_totals_corners',
  'alternate_totals_corners_h1',
  'alternate_totals_corners_lay',
  'alternate_spreads_cards',
  'alternate_totals_cards',
  'alternate_totals_cards_lay',
  'alternate_asian_handicap',
  'alternate_asian_handicap_lay',
  'alternate_totals_lay',
  'btts_lay',
  'double_chance_lay',
  'draw_no_bet_lay',
  'halftime_fulltime_lay',
  'player_goal_scorer_anytime',
  'player_goal_scorer_anytime_lay',
  'player_first_goal_scorer',
  'player_first_goal_scorer_lay',
  'player_last_goal_scorer',
  'player_to_score_or_assist',
  'player_goals',
  'player_goals_alternate',
  'player_assists',
  'player_assists_alternate',
  'player_shots',
  'player_shots_alternate',
  'player_shots_on_target',
  'player_shots_on_target_alternate',
  'player_shots_on_target_alternate_lay',
  'player_tackles_alternate',
  'player_fouls',
  'player_goalie_saves_alternate',
  'player_to_receive_card',
  'player_to_receive_card_lay',
  'player_to_receive_red_card'
];
const ODDS_API_BULK_MARKETS = [
  'h2h',
  'spreads',
  'totals'
];

const MARKET_MAP = {
  h2h: ['Full Match Model', 'Moneyline'],
  h2h_3_way: ['Full Match Model', 'Moneyline'],
  h2h_lay: ['Full Match Model Lay', 'Moneyline Lay'],
  h2h_3_way_lay: ['Full Match Model Lay', 'Moneyline Lay'],
  spreads: ['Spread'],
  alternate_spreads: ['Spread', 'Asian Handicap'],
  alternate_asian_handicap: ['Spread', 'Asian Handicap'],
  alternate_asian_handicap_lay: ['Asian Handicap Lay'],
  totals: ['Totals'],
  alternate_totals: ['Totals'],
  alternate_totals_lay: ['Totals Lay'],
  team_totals: ['Team Totals'],
  alternate_team_totals: ['Team Totals'],
  draw_no_bet: ['Draw No Bet'],
  draw_no_bet_lay: ['Draw No Bet Lay'],
  double_chance: ['Double Chance'],
  double_chance_lay: ['Double Chance Lay'],
  btts: ['Both Teams To Score', 'BTTS'],
  btts_lay: ['Both Teams To Score Lay', 'BTTS Lay'],
  halftime_fulltime: ['Half Time Full Time'],
  halftime_fulltime_lay: ['Half Time Full Time Lay'],
  odd_even: ['Odd Even'],
  h2h_h1: ['First Half Moneyline'],
  h2h_h2: ['Second Half Moneyline'],
  h2h_3_way_h1: ['First Half Moneyline'],
  h2h_3_way_h2: ['Second Half Moneyline'],
  h2h_3_way_h1_lay: ['First Half Moneyline Lay'],
  spreads_h1: ['First Half Spread'],
  alternate_spreads_h1: ['First Half Spread'],
  alternate_spreads_h2: ['Second Half Spread'],
  totals_h1: ['First Half Totals'],
  totals_h2: ['Second Half Totals'],
  alternate_totals_h1: ['First Half Totals'],
  alternate_totals_h2: ['Second Half Totals'],
  alternate_totals_h1_lay: ['First Half Totals Lay'],
  team_totals_h1: ['First Half Team Totals'],
  alternate_team_totals_h1: ['First Half Team Totals'],
  alternate_team_totals_h2: ['Second Half Team Totals'],
  btts_h1: ['First Half Both Teams To Score', 'First Half BTTS'],
  btts_h2: ['Second Half Both Teams To Score', 'Second Half BTTS'],
  double_chance_h1: ['First Half Double Chance'],
  double_chance_h2: ['Second Half Double Chance'],
  odd_even_h1: ['First Half Odd Even'],
  alternate_spreads_corners: ['Corners Spread'],
  alternate_totals_corners: ['Corners Totals'],
  alternate_totals_corners_h1: ['First Half Corners Totals'],
  alternate_totals_corners_lay: ['Corners Totals Lay'],
  alternate_spreads_cards: ['Cards Spread'],
  alternate_totals_cards: ['Cards Totals'],
  alternate_totals_cards_lay: ['Cards Totals Lay'],
  player_goal_scorer_anytime: ['Player Prop'],
  player_goal_scorer_anytime_lay: ['Player Prop Lay'],
  player_first_goal_scorer: ['Player Prop'],
  player_first_goal_scorer_lay: ['Player Prop Lay'],
  player_last_goal_scorer: ['Player Prop'],
  player_to_score_or_assist: ['Player Prop'],
  player_goals: ['Player Prop'],
  player_goals_alternate: ['Player Prop'],
  player_assists: ['Player Prop'],
  player_assists_alternate: ['Player Prop'],
  player_shots: ['Player Prop'],
  player_shots_alternate: ['Player Prop'],
  player_shots_on_target: ['Player Prop'],
  player_shots_on_target_alternate: ['Player Prop'],
  player_shots_on_target_alternate_lay: ['Player Prop Lay'],
  player_tackles_alternate: ['Player Prop'],
  player_fouls: ['Player Prop'],
  player_goalie_saves_alternate: ['Player Prop'],
  player_to_receive_card: ['Player Prop'],
  player_to_receive_card_lay: ['Player Prop Lay'],
  player_to_receive_red_card: ['Player Prop']
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
    return { ev: 0, qi: 0, price_qi: 0 };
  }

  const ev = ((currentOdds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = currentOdds - 1;
  const betSize = Math.ceil((100 / Math.sqrt(b)) / 5) * 5;
  const fraction = betSize / 10000;
  const eg = (p * Math.log(1 + fraction * b) + (1 - p) * Math.log(1 - fraction)) * 100;
  const rawPriceQi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * Math.tanh(eg / 0.25) + 0.5 * Math.tanh(ev / 5))))));
  const quality = buildBetQualityFromPrices(truePrice, currentOdds);
  const edgeScore = clamp((Number(quality.edge) / 12) * 100, 0, 100);
  const probabilityScore = clamp(((Number(quality.model_probability) - 20) / 45) * 100, 0, 100);
  const riskScore = {
    Low: 100,
    Medium: 75,
    High: 45,
    'Very high': 20
  }[quality.risk] || 35;
  const qi = Math.round(clamp(
    (rawPriceQi * 0.35) +
    (edgeScore * 0.3) +
    (probabilityScore * 0.2) +
    (riskScore * 0.15),
    0,
    100
  ));

  return {
    ev: Number.parseFloat(ev.toFixed(2)),
    qi,
    price_qi: rawPriceQi
  };
}

function buildBetQualityFromPrices(truePriceValue, currentOddsValue) {
  const truePrice = Number.parseFloat(truePriceValue);
  const currentOdds = Number.parseFloat(currentOddsValue);

  if (!Number.isFinite(truePrice) || !Number.isFinite(currentOdds) || truePrice <= 1 || currentOdds <= 1) {
    return {
      model_probability: null,
      book_probability: null,
      edge: null,
      risk: 'No price'
    };
  }

  const modelProbability = 100 / truePrice;
  const bookProbability = 100 / currentOdds;
  const edge = modelProbability - bookProbability;
  let risk = 'Low';
  if (currentOdds >= 8) risk = 'Very high';
  else if (currentOdds >= 4) risk = 'High';
  else if (currentOdds >= 2.2) risk = 'Medium';

  return {
    model_probability: Number.parseFloat(modelProbability.toFixed(2)),
    book_probability: Number.parseFloat(bookProbability.toFixed(2)),
    edge: Number.parseFloat(edge.toFixed(2)),
    risk
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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}${lookup.month}${lookup.day}`;
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

async function fetchFotMobMatchesForDate(date) {
  const url = new URL('https://www.fotmob.com/api/data/matches');
  url.searchParams.set('date', date);
  url.searchParams.set('timezone', 'Australia/Melbourne');
  url.searchParams.set('ccode3', 'AUS');

  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`FotMob matches request failed: ${response.status}`);
  }

  return response.json();
}

function flattenFotMobMatches(payload) {
  return (payload.leagues || []).flatMap((league) => (
    (league.matches || []).map((match) => ({
      ...match,
      leagueName: league.name,
      parentLeagueName: league.parentLeagueName
    }))
  ));
}

function findFotMobMatch(matches, fixture) {
  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  const kickoff = parseAest(fixture.kickoff_time_aest).getTime();
  const maxDriftMs = 36 * 60 * 60 * 1000;

  return matches.find((match) => {
    const names = [
      match.home?.name,
      match.home?.longName,
      match.away?.name,
      match.away?.longName
    ].filter(Boolean).map(normalise);
    const eventTime = Number(match.timeTS) || Date.parse(match.status?.utcTime || '');
    const isWorldCup = normalise(match.parentLeagueName || match.leagueName).includes('world cup');
    return isWorldCup
      && names.includes(teams.home)
      && names.includes(teams.away)
      && Number.isFinite(eventTime)
      && Math.abs(eventTime - kickoff) <= maxDriftMs;
  }) || null;
}

async function fetchFotMobMatchDetails(matchId) {
  const url = new URL('https://www.fotmob.com/api/data/matchDetails');
  url.searchParams.set('matchId', String(matchId));

  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`FotMob match details request failed: ${response.status}`);
  }

  return response.json();
}

function applyFotMobLineups(fixture, details, nowIso) {
  const lineup = details?.content?.lineup;
  if (!lineup?.homeTeam?.starters?.length || !lineup?.awayTeam?.starters?.length) {
    return false;
  }

  const infoBox = details?.content?.matchFacts?.infoBox || {};
  fixture.confirmed_lineups = {
    status: 'confirmed',
    source: 'Confirmed match centre',
    source_url: null,
    checked_at: nowIso,
    referee: infoBox.Referee?.text || fixture.referee_name,
    venue: infoBox.Stadium?.name || '',
    surface: infoBox.Stadium?.surface || '',
    home_team: lineup.homeTeam.name,
    away_team: lineup.awayTeam.name,
    home_formation: lineup.homeTeam.formation,
    away_formation: lineup.awayTeam.formation,
    home_starting_xi: lineup.homeTeam.starters.map((player) => player.name),
    away_starting_xi: lineup.awayTeam.starters.map((player) => player.name),
    home_substitutes: (lineup.homeTeam.subs || []).map((player) => player.name),
    away_substitutes: (lineup.awayTeam.subs || []).map((player) => player.name),
    model_implication: `Confirmed starting XIs are now loaded for ${fixture.match_name}. Re-check player props against starters and bench players before treating any prop as a bet.`
  };

  if (infoBox.Referee?.text) {
    fixture.referee_name = `${infoBox.Referee.text}${infoBox.Referee.country ? ` (${infoBox.Referee.country})` : ''}`;
    fixture.referee_status = 'verified';
    fixture.referee_source = 'Confirmed match centre';
  }

  if (infoBox.Stadium?.surface) {
    fixture.pitch_type = infoBox.Stadium.surface;
    fixture.pitch_constraints = `${infoBox.Stadium.name || 'Venue'} is being treated as a ${infoBox.Stadium.surface}-surface match.`;
  }

  return true;
}

async function refreshLastHourLineups(dataset, now = getNow(), nowIso = new Date().toISOString()) {
  const today = dateKey(now);
  const fixtures = dataset.filter((fixture) => {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    const untilKickoff = kickoff - now;
    return dateKey(kickoff) === today || (untilKickoff >= 0 && untilKickoff <= LINEUP_CHECK_WINDOW_MS);
  });

  if (!fixtures.length) return 0;

  const matchCache = new Map();
  let updates = 0;

  for (const fixture of fixtures) {
    const date = dateKey(parseAest(fixture.kickoff_time_aest));
    if (!matchCache.has(date)) {
      matchCache.set(date, flattenFotMobMatches(await fetchFotMobMatchesForDate(date)));
    }

    const fotmobMatch = findFotMobMatch(matchCache.get(date), fixture);
    fixture.lineup_last_checked = nowIso;
    fixture.lineup_check_source = 'Confirmed match centre';

    if (!fotmobMatch?.id) {
      fixture.lineup_check_status = 'match_not_found';
      continue;
    }

    const details = await fetchFotMobMatchDetails(fotmobMatch.id);
    fixture.external_lineup_match_id = fotmobMatch.id;
    fixture.lineup_check_status = applyFotMobLineups(fixture, details, nowIso)
      ? 'confirmed'
      : 'not_available_yet';

    if (fixture.lineup_check_status === 'confirmed') {
      updates += 1;
    }
  }

  return updates;
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

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteFifaUrl(href) {
  try {
    return new URL(href, FIFA_REPORT_HUB_URL).toString();
  } catch {
    return FIFA_REPORT_HUB_URL;
  }
}

async function fetchFifaReportHub() {
  const response = await fetch(FIFA_REPORT_HUB_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`FIFA report hub request failed: ${response.status}`);
  }

  return response.text();
}

function parseFifaReportHub(html) {
  const reports = [];
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) !== null) {
    const text = stripHtml(match[3]);
    const score = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
    if (!score) continue;

    reports.push({
      text,
      normalisedText: normalise(text),
      homeScore: Number(score[1]),
      awayScore: Number(score[2]),
      source: absoluteFifaUrl(match[2])
    });
  }

  return reports;
}

function findFifaReport(reports, fixture) {
  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  return reports.find((report) => (
    report.normalisedText.includes(teams.home)
      && report.normalisedText.includes(teams.away)
  )) || null;
}

function fifaReportResult(report, fixture) {
  if (!report) return null;

  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  const homeIndex = report.normalisedText.indexOf(teams.home);
  const awayIndex = report.normalisedText.indexOf(teams.away);
  const homeFirst = homeIndex !== -1 && awayIndex !== -1 && homeIndex < awayIndex;

  return {
    homeName: fixture.match_name.split(/\s+vs\s+/i)[0] || 'Home',
    awayName: fixture.match_name.split(/\s+vs\s+/i)[1] || 'Away',
    homeScore: homeFirst ? report.homeScore : report.awayScore,
    awayScore: homeFirst ? report.awayScore : report.homeScore,
    details: [],
    source: report.source,
    sourceLabel: 'FIFA'
  };
}

async function fetchFifaReportsForDataset(dataset, nowIso) {
  try {
    const reports = parseFifaReportHub(await fetchFifaReportHub());
    for (const fixture of dataset) {
      fixture.fifa_report_last_checked = nowIso;
      const report = findFifaReport(reports, fixture);
      fixture.fifa_report_status = report ? 'found' : 'not_found_yet';
      if (report) {
        fixture.fifa_report_source = report.source;
        const result = fifaReportResult(report, fixture);
        if (result) {
          fixture.final_score = resultLine(result);
        }
      }
    }
    return reports;
  } catch (error) {
    console.warn(error.message);
    for (const fixture of dataset) {
      fixture.fifa_report_last_checked = nowIso;
      fixture.fifa_report_status = 'check_failed';
    }
    return [];
  }
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

function playerTeamFromFixture(playerName, fixture) {
  const player = normalise(playerName);
  if (!player || !fixture?.confirmed_lineups) return null;

  const homePlayers = [
    ...(fixture.confirmed_lineups.home_starting_xi || []),
    ...(fixture.confirmed_lineups.home_substitutes || [])
  ].map(normalise);
  const awayPlayers = [
    ...(fixture.confirmed_lineups.away_starting_xi || []),
    ...(fixture.confirmed_lineups.away_substitutes || [])
  ].map(normalise);

  if (homePlayers.includes(player)) return 'home';
  if (awayPlayers.includes(player)) return 'away';
  return null;
}

function settleTotalSelection(selectionText, result) {
  const point = numberFromSelection(selectionText);
  if (!Number.isFinite(point)) return null;

  const selection = normalise(selectionText);
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

  return null;
}

function settleTeamTotalSelection(entry, selection, result) {
  const point = numberFromSelection(entry.target_selection);
  if (!Number.isFinite(point)) return null;

  const home = normalise(result.homeName);
  const away = normalise(result.awayName);
  const team = normalise(String(entry.target_selection)
    .replace(/\bover\b/gi, '')
    .replace(/\bunder\b/gi, '')
    .replace(/\bgoals?\b/gi, '')
    .replace(/[()+-]?\d+(?:\.\d+)?/g, '')
    .trim());
  const goals = team === home ? result.homeScore : team === away ? result.awayScore : null;
  if (!Number.isFinite(goals)) return null;

  if (selection.includes('under')) {
    if (goals < point) return 'won';
    if (goals > point) return 'lost';
    return 'push';
  }

  if (selection.includes('over')) {
    if (goals > point) return 'won';
    if (goals < point) return 'lost';
    return 'push';
  }

  return null;
}

function settleAgainstScore(entry, result, fixture = null) {
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

  if (entry.market_matrix === 'Totals' || entry.market_matrix === 'Goal Totals') {
    return settleTotalSelection(entry.target_selection, result);
  }

  if (entry.market_matrix === 'Team Totals') {
    return settleTeamTotalSelection(entry, selection, result);
  }

  if (entry.market_matrix === 'Player Prop' && selection.includes('card')) {
    const player = normalise(String(entry.target_selection).split(':')[0]);
    if (!player) return null;

    const cards = cardedPlayers(result);
    return cards.includes(player) ? 'won' : 'lost';
  }

  if (entry.market_matrix === 'Player Prop' && (selection.includes('goal or assist') || selection.includes('score or assist'))) {
    const playerName = String(entry.target_selection).split(':')[0];
    const playerTeam = playerTeamFromFixture(playerName, fixture);
    if (playerTeam === 'home' && result.homeScore === 0) return 'lost';
    if (playerTeam === 'away' && result.awayScore === 0) return 'lost';
    return null;
  }

  return null;
}

function settleHistoryResults(entries, dataset, espnEvents, fifaReports = [], now = getNow()) {
  let settled = 0;
  const fixtureByName = new Map(dataset.map((fixture) => [normalise(fixture.match_name), fixture]));

  for (const entry of entries) {
    const previousStatus = entry.result_status || 'pending';

    const fixture = fixtureByName.get(normalise(entry.match_name));
    if (!fixture) continue;

    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (now - kickoff < RESULT_SETTLEMENT_BUFFER_MS) continue;

    const fifaReport = findFifaReport(fifaReports, fixture);
    const fifaResult = fifaReportResult(fifaReport, fixture);
    const event = findEspnEvent(espnEvents, fixture);
    const result = fifaResult || (event ? eventResult(event) : null);

    if (!result) {
      if (previousStatus === 'pending') {
        entry.result_status = 'pending';
        entry.result_detail = 'Result not verified yet. Will check again on the next automatic refresh.';
      }
      continue;
    }

    const status = settleAgainstScore(entry, result, fixture);
    if (!status) {
      if (previousStatus === 'pending') {
        entry.result_status = 'pending';
        entry.result_detail = `Final score verified: ${resultLine(result)}. This market needs a more detailed settlement feed.`;
        entry.settlement_source = result.source;
      }
      continue;
    }

    entry.result_status = status;
    entry.result_detail = `${result.sourceLabel || 'ESPN'} final: ${resultLine(result)}.`;
    entry.settlement_source = result.source;
    if (previousStatus !== status || !entry.settled_at) {
      entry.settled_at = now.toISOString();
      settled += 1;
    }
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

function scanRowToMarketItem(row, fixture) {
  return {
    market_matrix: row.category || row.market || 'AU Bookie Market Scan',
    target_selection: row.selection,
    true_price: Number(row.model_price),
    current_odds: Number(row.current_odds),
    au_bookie: row.au_bookie || row.bookmaker || row.bookmaker_key || 'AU bookie',
    odds_checked_at: row.checked_at || fixture.market_scan?.checked_at || fixture.odds_last_checked,
    odds_refresh_status: Number.isFinite(Number(row.current_odds)) ? 'checked_current' : 'selection_missing',
    odds_refresh_note: row.source || 'AU bookie market scan'
  };
}

function trackedMarketsForFixture(fixture) {
  const fixtureMarkets = fixture.markets || [];
  const scanMarkets = (fixture.market_scan?.rows || [])
    .filter((row) => Number(row.qi) >= MIN_TRACKED_QI)
    .map((row) => scanRowToMarketItem(row, fixture));

  return [...fixtureMarkets, ...scanMarkets];
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

function hasVerifiedPrice(marketItem) {
  return [
    'checked_current',
    'updated',
    'added_from_oddsapi',
    'confirmed_rendered_site',
    'model_only'
  ].includes(marketItem.odds_refresh_status);
}

function pruneUnverifiedFutureMarkets(dataset, now = getNow()) {
  let removed = 0;

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (kickoff <= now) continue;

    const before = (fixture.markets || []).length;
    fixture.markets = (fixture.markets || []).filter(hasVerifiedPrice);
    removed += before - fixture.markets.length;
  }

  return removed;
}

async function syncBetHistory(dataset, now = getNow(), espnEvents = [], fifaReports = []) {
  const history = await readHistory();
  const byId = new Map(history
    .filter((entry) => Number(entry.opening_qi) >= MIN_TRACKED_QI)
    .map((entry) => [entry.bet_id, entry]));
  const activeBetIds = new Set();
  const nowIso = now.toISOString();

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);

    for (const marketItem of trackedMarketsForFixture(fixture)) {
      const id = betId(fixture, marketItem);
      const existing = byId.get(id);
      if (kickoff > now && !hasVerifiedPrice(marketItem)) {
        continue;
      }

      activeBetIds.add(id);
      const metrics = runVectorCalculations(marketItem);
      const currentOdds = Number.parseFloat(marketItem.current_odds);
      const modelPrice = Number.parseFloat(marketItem.true_price);

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
      if (freshClose) {
        entry.closing_odds = currentOdds;
        entry.closing_captured_at = freshClose.checkedAt.toISOString();
        entry.closing_source = `Confirmed live check ${freshClose.minutesBeforeKickoff} min before kickoff`;
        entry.closing_status = 'confirmed';
        entry.clv_percent = clvPercent(entry.opening_odds, entry.closing_odds);
        entry.estimated_closing_odds = null;
        entry.estimated_clv_percent = null;
        entry.estimated_closing_source = null;
      } else if (now >= kickoff && entry.closing_odds === null) {
        entry.closing_status = 'missing_fresh_close';
        entry.closing_source = 'No confirmed live check in the final 30 minutes before kickoff';
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
    .filter((entry) => Number(entry.current_qi) >= MIN_TRACKED_QI)
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

  const settledResults = settleHistoryResults(nextHistory, dataset, espnEvents, fifaReports, now);

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

function isMarketKey(marketKey, prefixes) {
  return prefixes.some((prefix) => marketKey === prefix || marketKey.startsWith(`${prefix}_`) || marketKey.startsWith(`alternate_${prefix}`));
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
  const marketKey = oddsMarket.key || '';

  if (isMarketKey(marketKey, ['h2h']) || MARKET_MAP.h2h.includes(marketItem.market_matrix)) {
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

  if (isMarketKey(marketKey, ['spreads', 'asian_handicap']) || MARKET_MAP.spreads.includes(marketItem.market_matrix)) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    if (!Number.isFinite(targetPoint)) return null;

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      const selectionTeam = selection.replace(String(targetPoint), '').replace(/[+-]/g, '').trim();
      return Math.abs(Number(outcome.point) - targetPoint) < 0.001
        && (selection.includes(outcomeName) || outcomeName.includes(selectionTeam));
    });
  }

  if (isMarketKey(marketKey, ['totals', 'team_totals'])) {
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

  if (marketKey.includes('double_chance')) {
    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return selection.includes(outcomeName) || outcomeName.includes(selection);
    });
  }

  if (marketKey.includes('draw_no_bet')) {
    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return selection.includes(outcomeName) || outcomeName.includes(selection.replace('draw no bet', '').trim());
    });
  }

  if (marketKey.includes('btts')) {
    const wantsYes = selection.includes('yes') || selection.includes('both teams to score');
    const wantsNo = selection.includes('no') || selection.includes('both teams not to score');
    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return (wantsYes && outcomeName === 'yes') || (wantsNo && outcomeName === 'no');
    });
  }

  if (marketKey.includes('odd_even')) {
    const wantsOdd = selection.includes('odd');
    const wantsEven = selection.includes('even');
    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return (wantsOdd && outcomeName === 'odd') || (wantsEven && outcomeName === 'even');
    });
  }

  if (marketKey.includes('player_')) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      const description = normalise(outcome.description || '');
      const hasPlayer = selection.includes(outcomeName) || selection.includes(description);
      const pointMatches = !Number.isFinite(targetPoint)
        || !Number.isFinite(Number(outcome.point))
        || Math.abs(Number(outcome.point) - targetPoint) < 0.001;
      return hasPlayer && pointMatches;
    });
  }

  return oddsMarket.outcomes.find((outcome) => {
    const outcomeName = normalise(outcome.name);
    const description = normalise(outcome.description || '');
    return selection.includes(outcomeName) || outcomeName.includes(selection) || (description && selection.includes(description));
  }) || null;

  return null;
}

function poissonProbability(lambda, goals) {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, goals)) / factorial;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function modelProbabilityFromPrice(price) {
  const numeric = Number.parseFloat(price);
  return Number.isFinite(numeric) && numeric > 1 ? 1 / numeric : null;
}

function fairPriceFromProbability(probability) {
  return probability > 0 ? Number((1 / probability).toFixed(2)) : null;
}

function overProbability(lambda, line) {
  const maxUnderGoals = Math.floor(line);
  let underOrEqual = 0;
  for (let goals = 0; goals <= maxUnderGoals; goals += 1) {
    underOrEqual += poissonProbability(lambda, goals);
  }
  return 1 - underOrEqual;
}

function resultProbabilitiesFromLambdas(homeLambda, awayLambda) {
  let home = 0;
  let draw = 0;
  let away = 0;

  for (let homeGoals = 0; homeGoals <= 8; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 8; awayGoals += 1) {
      const probability = poissonProbability(homeLambda, homeGoals) * poissonProbability(awayLambda, awayGoals);
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;
    }
  }

  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

function addMarkovMarket(markets, category, market, selection, probability) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return;
  markets.push({
    category,
    market,
    selection,
    probability: Number((probability * 100).toFixed(1)),
    fair_price: fairPriceFromProbability(probability)
  });
}

function h2hModelProbabilities(fixture) {
  const teams = splitTeams(fixture.match_name);
  if (!teams) return null;

  const result = { home: null, draw: null, away: null };

  for (const marketItem of fixture.markets || []) {
    if (marketItem.market_matrix !== 'Full Match Model') continue;
    const probability = modelProbabilityFromPrice(marketItem.true_price);
    if (!Number.isFinite(probability)) continue;

    const selection = normalise(marketItem.target_selection);
    if (selection.includes('draw')) {
      result.draw ??= probability;
      continue;
    }

    const selectionTeam = normalise(selection.replace('to win', '').trim());
    if (comparableName(selectionTeam) === comparableName(teams.home) || selectionTeam.includes(teams.home) || teams.home.includes(selectionTeam)) {
      result.home ??= probability;
    } else if (comparableName(selectionTeam) === comparableName(teams.away) || selectionTeam.includes(teams.away) || teams.away.includes(selectionTeam)) {
      result.away ??= probability;
    }
  }

  if (Number.isFinite(result.draw)) {
    if (!Number.isFinite(result.home) && Number.isFinite(result.away)) {
      result.home = Math.max(0.01, 1 - result.draw - result.away);
    }
    if (!Number.isFinite(result.away) && Number.isFinite(result.home)) {
      result.away = Math.max(0.01, 1 - result.draw - result.home);
    }
  }

  if (![result.home, result.draw, result.away].every(Number.isFinite)) return null;
  const total = result.home + result.draw + result.away;
  if (total <= 0) return null;

  return {
    home: result.home / total,
    draw: result.draw / total,
    away: result.away / total
  };
}

function deriveFixtureGoalModel(fixture) {
  const probabilities = h2hModelProbabilities(fixture);
  const teams = splitTeams(fixture.match_name);
  if (!probabilities || !teams) return;
  const displayTeams = fixture.match_name.split(/\s+vs\s+/i);
  const displayHome = displayTeams[0] || teams.home;
  const displayAway = displayTeams[1] || teams.away;

  const resultGap = Math.abs(probabilities.home - probabilities.away);
  const totalGoalsMean = clamp(2.72 - ((probabilities.draw - 0.25) * 3.1) + (resultGap * 0.55), 1.75, 3.65);
  const homeShare = clamp(0.5 + ((probabilities.home - probabilities.away) * 0.46), 0.23, 0.77);
  const homeLambda = totalGoalsMean * homeShare;
  const awayLambda = totalGoalsMean - homeLambda;

  const underProbability = [0, 1, 2]
    .reduce((sum, goals) => sum + poissonProbability(totalGoalsMean, goals), 0);
  const over25Probability = 1 - underProbability;

  const scores = [];
  for (let homeGoals = 0; homeGoals <= 5; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 5; awayGoals += 1) {
      const probability = poissonProbability(homeLambda, homeGoals) * poissonProbability(awayLambda, awayGoals);
      scores.push({
        score: `${displayHome} ${homeGoals}-${awayGoals} ${displayAway}`,
        probability: Number((probability * 100).toFixed(1)),
        fair_price: fairPriceFromProbability(probability)
      });
    }
  }

  fixture.model_totals_25 = {
    line: 2.5,
    over_probability: Number((over25Probability * 100).toFixed(1)),
    over_fair_price: fairPriceFromProbability(over25Probability),
    under_probability: Number((underProbability * 100).toFixed(1)),
    under_fair_price: fairPriceFromProbability(underProbability),
    total_goals_mean: Number(totalGoalsMean.toFixed(2))
  };
  fixture.exact_score_model = scores
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  const markovMarkets = [];
  const bothTeamsScore = (1 - poissonProbability(homeLambda, 0)) * (1 - poissonProbability(awayLambda, 0));
  const evenGoals = Array.from({ length: 7 }, (_, index) => index * 2)
    .reduce((sum, goals) => sum + poissonProbability(totalGoalsMean, goals), 0);
  const firstHalfHomeLambda = homeLambda * 0.45;
  const firstHalfAwayLambda = awayLambda * 0.45;
  const firstHalfTotalMean = firstHalfHomeLambda + firstHalfAwayLambda;
  const firstHalfResult = resultProbabilitiesFromLambdas(firstHalfHomeLambda, firstHalfAwayLambda);
  const firstHalfBtts = (1 - poissonProbability(firstHalfHomeLambda, 0)) * (1 - poissonProbability(firstHalfAwayLambda, 0));

  addMarkovMarket(markovMarkets, 'Main Match', 'Double Chance', `${displayHome} or Draw`, probabilities.home + probabilities.draw);
  addMarkovMarket(markovMarkets, 'Main Match', 'Double Chance', `${displayAway} or Draw`, probabilities.away + probabilities.draw);
  addMarkovMarket(markovMarkets, 'Main Match', 'Double Chance', `${displayHome} or ${displayAway}`, probabilities.home + probabilities.away);
  addMarkovMarket(markovMarkets, 'Main Match', 'Draw No Bet', `${displayHome} Draw No Bet`, probabilities.home / (probabilities.home + probabilities.away));
  addMarkovMarket(markovMarkets, 'Main Match', 'Draw No Bet', `${displayAway} Draw No Bet`, probabilities.away / (probabilities.home + probabilities.away));
  addMarkovMarket(markovMarkets, 'Main Match', 'Both Teams To Score', 'BTTS Yes', bothTeamsScore);
  addMarkovMarket(markovMarkets, 'Main Match', 'Both Teams To Score', 'BTTS No', 1 - bothTeamsScore);
  addMarkovMarket(markovMarkets, 'Main Match', 'Odd / Even Goals', 'Odd Goals', 1 - evenGoals);
  addMarkovMarket(markovMarkets, 'Main Match', 'Odd / Even Goals', 'Even Goals', evenGoals);

  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const over = overProbability(totalGoalsMean, line);
    addMarkovMarket(markovMarkets, 'Goal Totals', 'Alternate Totals', `Over ${line} Goals`, over);
    addMarkovMarket(markovMarkets, 'Goal Totals', 'Alternate Totals', `Under ${line} Goals`, 1 - over);
  }

  for (const [teamName, lambda] of [[displayHome, homeLambda], [displayAway, awayLambda]]) {
    for (const line of [0.5, 1.5, 2.5]) {
      const over = overProbability(lambda, line);
      addMarkovMarket(markovMarkets, 'Team Totals', 'Team Totals', `${teamName} Over ${line} Goals`, over);
      addMarkovMarket(markovMarkets, 'Team Totals', 'Team Totals', `${teamName} Under ${line} Goals`, 1 - over);
    }
  }

  addMarkovMarket(markovMarkets, 'First Half', 'First Half Result', `${displayHome} 1H Win`, firstHalfResult.home);
  addMarkovMarket(markovMarkets, 'First Half', 'First Half Result', '1H Draw', firstHalfResult.draw);
  addMarkovMarket(markovMarkets, 'First Half', 'First Half Result', `${displayAway} 1H Win`, firstHalfResult.away);
  for (const line of [0.5, 1.5]) {
    const over = overProbability(firstHalfTotalMean, line);
    addMarkovMarket(markovMarkets, 'First Half', 'First Half Totals', `1H Over ${line} Goals`, over);
    addMarkovMarket(markovMarkets, 'First Half', 'First Half Totals', `1H Under ${line} Goals`, 1 - over);
  }
  addMarkovMarket(markovMarkets, 'First Half', 'First Half BTTS', '1H BTTS Yes', firstHalfBtts);
  addMarkovMarket(markovMarkets, 'First Half', 'First Half BTTS', '1H BTTS No', 1 - firstHalfBtts);

  fixture.markov_market_model = markovMarkets;
}

function deriveFixtureModels(dataset) {
  for (const fixture of dataset) {
    deriveFixtureGoalModel(fixture);
  }
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
  url.searchParams.set('markets', ODDS_API_BULK_MARKETS.join(','));
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
  const fifaReports = await fetchFifaReportsForDataset(dataset, nowIso);
  const refereeUpdates = await refreshRefereeData(dataset, nowIso, espnEvents);
  const lineupUpdates = await refreshLastHourLineups(dataset, getNow(), nowIso);

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
      if (marketItem.odds_refresh_status === 'model_only') {
        marketItem.odds_checked_at = nowIso;
        marketItem.odds_refresh_note = marketItem.odds_refresh_note || 'Model-only selection; no live book price confirmed yet.';
        continue;
      }

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

  const prunedMarkets = pruneUnverifiedFutureMarkets(dataset);
  deriveFixtureModels(dataset);

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(EMBEDDED_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  const { historyCount, settledResults } = await syncBetHistory(dataset, getNow(), espnEvents, fifaReports);

  console.log(`Odds refresh complete (${timing.cadence}). Updated ${updates} market prices. Removed ${prunedMarkets} unverified future markets. Checked ${fifaReports.length} FIFA report rows. Verified ${refereeUpdates} referee assignments. Confirmed ${lineupUpdates} last-hour lineups. Settled ${settledResults} results. Tracking ${historyCount} history rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
