import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const EMBEDDED_PATH = new URL('../src/embeddedData.js', import.meta.url);
const HISTORY_PATH = new URL('../data/bet_history.json', import.meta.url);
const EMBEDDED_HISTORY_PATH = new URL('../src/embeddedBetHistory.js', import.meta.url);
const LEARNING_COEFFICIENTS_PATH = new URL('../data/learning_coefficients.json', import.meta.url);

const BOOKMAKERS = new Map([
  ['sportsbet', 'Sportsbet'],
  ['tab', 'TAB'],
  ['neds', 'Neds'],
  ['ladbrokes', 'Ladbrokes'],
  ['pinnacle', 'Pinnacle'],
  ['pointsbetau', 'PointsBet'],
  ['pointsbet', 'PointsBet'],
  ['betright', 'BetRight'],
  ['betfair_ex_au', 'Betfair'],
  ['betfair', 'Betfair']
]);

const DEFAULT_SPORT_KEYS = [
  'soccer_fifa_world_cup'
];
const ODDS_API_BOOKMAKERS = [
  'sportsbet',
  'tab',
  'neds',
  'ladbrokes',
  'pinnacle',
  'pointsbetau',
  'betright',
  'betfair_ex_au'
];
const BEST_PRICE_BOOKS = new Set([
  'sportsbet',
  'tab',
  'neds',
  'pointsbet',
  'pointsbetau',
  'betright',
  'pinnacle',
  'betfair',
  'betfair_ex_au'
]);
const SHARP_CLOSING_BOOKS = new Set([
  'betfair',
  'betfair_ex_au',
  'pinnacle'
]);
const ESPN_LEAGUES = [
  'fifa.world',
  'fifa.friendly'
];
const FIFA_REPORT_HUB_URL = 'https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php';
const MIN_TRACKED_QI = 70;
const BASELINE_STALE_MS = 30 * 60 * 1000;
const CLOSING_WINDOW_MS = 5 * 60 * 1000;
const LATEST_PRE_KICKOFF_WINDOW_MS = 4 * 60 * 60 * 1000;
const MAX_CLV_PRICE_RATIO = 3;
const RESULT_SETTLEMENT_BUFFER_MS = 3 * 60 * 60 * 1000;
const LINEUP_CHECK_WINDOW_MS = 60 * 60 * 1000;

const DEFAULT_LEARNING_COEFFICIENTS = {
  version: 1,
  updated_at: null,
  sample_size: 0,
  confidence: 'none',
  adjustments: {
    draw_lift: 0,
    favourite_compression: 0,
    goal_suppression: 0,
    break_open_risk: 0,
    chance_quality_penalty: 0
  },
  flags: {},
  note: 'Automatically updated from settled match results, stats and xG where reliable feeds expose it.'
};

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
  return [...new Set(dataset.flatMap((fixture) => {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    return [
      dateKey(kickoff),
      kickoff.toISOString().slice(0, 10).replace(/-/g, '')
    ];
  }))];
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

function lineupHasSubstitutes(fixture) {
  const lineups = fixture.confirmed_lineups;
  return Boolean((lineups?.home_substitutes || []).length || (lineups?.away_substitutes || []).length);
}

async function refreshLastHourLineups(dataset, now = getNow(), nowIso = new Date().toISOString(), espnEvents = []) {
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
    fixture.lineup_check_sources = 'FotMob match centre first; ESPN summary fallback; FIFA Training Centre report hub checked separately for official post-match reports.';
    fixture.lineup_check_source = 'FotMob match centre';

    if (!fotmobMatch?.id) {
      fixture.lineup_check_status = 'match_not_found';
    } else {
      const details = await fetchFotMobMatchDetails(fotmobMatch.id);
      fixture.external_lineup_match_id = fotmobMatch.id;
      fixture.lineup_check_status = applyFotMobLineups(fixture, details, nowIso)
        ? 'confirmed'
        : 'not_available_yet';
    }

    if (fixture.lineup_check_status !== 'confirmed' || !lineupHasSubstitutes(fixture)) {
      const espnEvent = findEspnEvent(espnEvents, fixture);
      if (espnEvent?.id) {
        try {
          const summary = await fetchEspnSummary('fifa.world', espnEvent.id);
          if (applyEspnLineups(fixture, summary, nowIso, espnEvent)) {
            fixture.lineup_check_status = 'confirmed';
            fixture.lineup_check_source = fixture.external_lineup_match_id
              ? 'FotMob match centre; ESPN summary fallback for roster/subs'
              : 'ESPN summary';
            fixture.external_espn_match_id = espnEvent.id;
          }
        } catch (error) {
          console.warn(error.message);
        }
      }
    }

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

async function fetchEspnSummary(league, eventId) {
  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary`);
  url.searchParams.set('event', String(eventId));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN ${league} summary request failed: ${response.status}`);
  }

  return response.json();
}

function playerDisplayName(player) {
  return player?.athlete?.displayName
    || player?.athlete?.fullName
    || player?.displayName
    || player?.fullName
    || player?.name
    || null;
}

function applyEspnLineups(fixture, summary, nowIso, event) {
  const rosters = summary?.rosters || [];
  if (rosters.length < 2) return false;

  const homeRoster = rosters.find((roster) => roster.homeAway === 'home') || rosters[0];
  const awayRoster = rosters.find((roster) => roster.homeAway === 'away') || rosters[1];
  const starterNames = (roster) => (roster?.roster || [])
    .filter((player) => player.starter)
    .map(playerDisplayName)
    .filter(Boolean);
  const substituteNames = (roster) => (roster?.roster || [])
    .filter((player) => !player.starter)
    .map(playerDisplayName)
    .filter(Boolean);
  const homeStarters = starterNames(homeRoster);
  const awayStarters = starterNames(awayRoster);

  if (homeStarters.length < 11 || awayStarters.length < 11) return false;

  fixture.confirmed_lineups = {
    status: 'confirmed',
    source: 'ESPN match centre',
    source_url: event?.links?.find((link) => (link.rel || []).includes('summary'))?.href || null,
    checked_at: nowIso,
    referee: fixture.referee_name,
    venue: summary?.gameInfo?.venue?.fullName || '',
    surface: '',
    home_team: homeRoster.team?.displayName || homeRoster.team?.name || splitTeams(fixture.match_name)?.home || '',
    away_team: awayRoster.team?.displayName || awayRoster.team?.name || splitTeams(fixture.match_name)?.away || '',
    home_formation: homeRoster.formation || '',
    away_formation: awayRoster.formation || '',
    home_starting_xi: homeStarters,
    away_starting_xi: awayStarters,
    home_substitutes: substituteNames(homeRoster),
    away_substitutes: substituteNames(awayRoster),
    model_implication: `Confirmed starting XIs and substitutes are loaded for ${fixture.match_name}. Player-prop ratings now check selected starters and bench players before showing value.`
  };

  return true;
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

function normaliseStatName(name) {
  return normalise(name)
    .replace(/\bpct\b/g, 'percent')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericStatValue(value) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

function extractTeamStatsFromEspnSummary(summary) {
  const teams = summary?.boxscore?.teams || summary?.boxscore?.statistics || [];
  if (!Array.isArray(teams) || teams.length < 2) return null;

  const parseTeam = (teamBlock) => {
    const stats = {};
    for (const stat of teamBlock.statistics || teamBlock.stats || []) {
      const key = normaliseStatName(stat.name || stat.label || stat.displayName || stat.abbreviation);
      const value = numericStatValue(stat.displayValue ?? stat.value ?? stat.display_value);
      if (key && Number.isFinite(value)) stats[key] = value;
    }
    return {
      team: teamBlock.team?.displayName || teamBlock.team?.shortDisplayName || teamBlock.displayName || '',
      stats
    };
  };

  const home = teams.find((team) => team.homeAway === 'home') || teams[0];
  const away = teams.find((team) => team.homeAway === 'away') || teams[1];
  const parsedHome = parseTeam(home);
  const parsedAway = parseTeam(away);
  if (!Object.keys(parsedHome.stats).length && !Object.keys(parsedAway.stats).length) return null;

  return {
    source: 'ESPN structured match summary',
    home: parsedHome,
    away: parsedAway
  };
}

function statValue(teamStats, names) {
  if (!teamStats) return null;
  const compactStats = new Map(Object.entries(teamStats).map(([key, value]) => [normaliseStatName(key).replace(/\s+/g, ''), value]));
  for (const name of names) {
    const value = teamStats[normaliseStatName(name)];
    if (Number.isFinite(value)) return value;
    const compactValue = compactStats.get(normaliseStatName(name).replace(/\s+/g, ''));
    if (Number.isFinite(compactValue)) return compactValue;
  }
  return null;
}

function directXgFromStats(teamStats) {
  return statValue(teamStats, [
    'expected goals',
    'expected goals for',
    'expected goal',
    'xg',
    'x goals',
    'npxg',
    'non penalty expected goals'
  ]);
}

function xgProxyFromStats(teamStats) {
  if (!teamStats) return null;
  const shots = statValue(teamStats, ['shots', 'total shots']);
  const shotsOnTarget = statValue(teamStats, ['shots on target', 'shots on goal']);
  const corners = statValue(teamStats, ['corner kicks', 'corners']);
  const bigChances = statValue(teamStats, ['big chances', 'big chances created']);
  if (![shots, shotsOnTarget, corners, bigChances].some(Number.isFinite)) return null;

  const estimate = clamp(
    (Number.isFinite(shots) ? shots * 0.055 : 0)
      + (Number.isFinite(shotsOnTarget) ? shotsOnTarget * 0.16 : 0)
      + (Number.isFinite(bigChances) ? bigChances * 0.32 : 0)
      + (Number.isFinite(corners) ? corners * 0.025 : 0),
    0.05,
    4.6
  );

  return Number(estimate.toFixed(2));
}

function directXgPairFromStats(stats) {
  const home = directXgFromStats(stats?.home?.stats);
  const away = directXgFromStats(stats?.away?.stats);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return {
    home: Number(home.toFixed(2)),
    away: Number(away.toFixed(2)),
    source: 'ESPN structured xG'
  };
}

function proxyXgPairFromStats(stats) {
  const home = xgProxyFromStats(stats?.home?.stats);
  const away = xgProxyFromStats(stats?.away?.stats);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return {
    home,
    away,
    source: 'ESPN shot-quality proxy'
  };
}

function extractFotMobExpectedGoals(details) {
  const allStats = details?.content?.stats?.Periods?.All?.stats || [];
  const sections = Array.isArray(allStats) ? allStats : [];
  const rows = sections.flatMap((section) => Array.isArray(section.stats) ? section.stats : []);
  const row = rows.find((stat) => (
    normalise(stat?.key) === 'expected goals'
      || normalise(stat?.title) === 'expected goals xg'
  ) && Array.isArray(stat.stats) && stat.stats.length >= 2 && stat.stats.some((value) => value !== null));

  if (!row) return null;
  const values = row.stats.slice(0, 2).map((value) => numericStatValue(value));
  if (!values.every(Number.isFinite)) return null;
  return {
    home: values[0],
    away: values[1],
    source: 'FotMob structured xG'
  };
}

async function refreshPostMatchStats(dataset, espnEvents, nowIso, now = getNow()) {
  let updated = 0;
  const fotMobMatchCache = new Map();

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (now - kickoff < RESULT_SETTLEMENT_BUFFER_MS) continue;

    const event = findEspnEvent(espnEvents, fixture);
    if (!event?.id) continue;

    try {
      let summary = null;
      let lastError = null;
      for (const league of ESPN_LEAGUES) {
        try {
          summary = await fetchEspnSummary(league, event.id);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!summary && lastError) throw lastError;
      const stats = extractTeamStatsFromEspnSummary(summary);
      fixture.post_match_stats_last_checked = nowIso;
      if (!stats) {
        fixture.post_match_stats_status = 'not_available';
        continue;
      }
      fixture.post_match_stats = stats;
      delete fixture.post_match_xg;
      const directXg = directXgPairFromStats(stats);
      if (directXg) {
        fixture.post_match_xg = {
          ...directXg,
          checked_at: nowIso
        };
      } else {
        const date = dateKey(parseAest(fixture.kickoff_time_aest));
        if (!fotMobMatchCache.has(date)) {
          fotMobMatchCache.set(date, flattenFotMobMatches(await fetchFotMobMatchesForDate(date)));
        }
        const fotMobMatch = findFotMobMatch(fotMobMatchCache.get(date), fixture);
        if (fotMobMatch?.id) {
          const fotMobDetails = await fetchFotMobMatchDetails(fotMobMatch.id);
          const fotMobXg = extractFotMobExpectedGoals(fotMobDetails);
          if (fotMobXg) {
            fixture.post_match_xg = {
              ...fotMobXg,
              checked_at: nowIso
            };
          }
        }
        if (!fixture.post_match_xg) {
          const proxyXg = proxyXgPairFromStats(stats);
          if (proxyXg) {
            fixture.post_match_xg = {
              ...proxyXg,
              checked_at: nowIso
            };
          }
        }
      }
      fixture.post_match_stats_status = 'found';
      updated += 1;
    } catch (error) {
      fixture.post_match_stats_last_checked = nowIso;
      fixture.post_match_stats_status = `check_failed: ${error.message}`;
    }
  }

  return updated;
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

function fixtureVerifiedResult(fixture, espnEvents, fifaReports) {
  const fifaReport = findFifaReport(fifaReports, fixture);
  const fifaResult = fifaReportResult(fifaReport, fixture);
  if (fifaResult) return fifaResult;

  const event = findEspnEvent(espnEvents, fixture);
  return event ? eventResult(event) : null;
}

function predictedResultFromCalibration(fixture) {
  const calibration = fixture.model_calibration || {};
  const teams = fixture.match_name.split(/\s+vs\s+/i);
  const home = Number(calibration.calibrated_home_probability);
  const draw = Number(calibration.calibrated_draw_probability);
  const away = Number(calibration.calibrated_away_probability);
  if (![home, draw, away].every(Number.isFinite)) return null;

  const max = Math.max(home, draw, away);
  if (max === draw) return { label: 'Draw', probability: draw };
  if (max === home) return { label: `${teams[0] || 'Home'} win`, probability: home };
  return { label: `${teams[1] || 'Away'} win`, probability: away };
}

function actualResultLabel(result) {
  if (result.homeScore === result.awayScore) return 'Draw';
  return result.homeScore > result.awayScore
    ? `${result.homeName} win`
    : `${result.awayName} win`;
}

function applyPostMatchLearning(dataset, espnEvents, fifaReports, now = getNow()) {
  let learned = 0;

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (now - kickoff < RESULT_SETTLEMENT_BUFFER_MS) continue;

    const result = fixtureVerifiedResult(fixture, espnEvents, fifaReports);
    if (!result) continue;

    const predicted = predictedResultFromCalibration(fixture);
    const actualTotal = result.homeScore + result.awayScore;
    const expectedTotal = Number(fixture.model_totals_25?.total_goals_mean);
    const actual = actualResultLabel(result);
    const flags = [];
    const stats = fixture.post_match_stats || null;
    const homeShots = statValue(stats?.home?.stats, ['shots', 'total shots']);
    const awayShots = statValue(stats?.away?.stats, ['shots', 'total shots']);
    const homeSot = statValue(stats?.home?.stats, ['shots on target', 'shots on goal']);
    const awaySot = statValue(stats?.away?.stats, ['shots on target', 'shots on goal']);
    const xg = fixture.post_match_xg || null;
    const homeXg = Number(xg?.home);
    const awayXg = Number(xg?.away);
    const totalXg = homeXg + awayXg;

    if (predicted && actual === 'Draw' && !String(predicted.label).includes('Draw')) {
      flags.push('draw-risk-underestimated');
    }
    if (predicted && !String(actual).includes(String(predicted.label).replace(' win', '')) && predicted.probability >= 65) {
      flags.push('favourite-confidence-too-high');
    }
    if (Number.isFinite(expectedTotal) && actualTotal <= 1 && expectedTotal >= 2.45) {
      flags.push('goal-suppression-underweighted');
    }
    if (Number.isFinite(expectedTotal) && actualTotal >= 5 && expectedTotal <= 2.65) {
      flags.push('break-open-risk-underweighted');
    }
    if (Number.isFinite(homeShots) && Number.isFinite(awayShots) && predicted?.label?.includes(result.homeName) && homeShots <= awayShots) {
      flags.push('territory-did-not-become-shot-volume');
    }
    if (Number.isFinite(homeSot) && Number.isFinite(awaySot) && predicted?.label?.includes(result.homeName) && homeSot <= awaySot) {
      flags.push('chance-quality-overstated');
    }
    if (Number.isFinite(homeXg) && Number.isFinite(awayXg) && predicted?.label?.includes(result.homeName) && homeXg <= awayXg) {
      flags.push('xg-did-not-support-favourite');
    }
    if (Number.isFinite(totalXg) && actualTotal <= 1 && totalXg >= 2.4) {
      flags.push('finishing-variance-low');
    }
    if (Number.isFinite(totalXg) && actualTotal >= 5 && totalXg <= 2.3) {
      flags.push('finishing-variance-high');
    }

    fixture.post_match_learning = {
      checked_at: now.toISOString(),
      result: resultLine(result),
      source: result.sourceLabel || 'ESPN',
      source_url: result.source,
      predicted_result: predicted?.label || 'Unavailable',
      predicted_probability: predicted?.probability || null,
      actual_result: actual,
      expected_total_goals: Number.isFinite(expectedTotal) ? Number(expectedTotal.toFixed(2)) : null,
      actual_total_goals: actualTotal,
      stats_used: Boolean(stats),
      shot_count: Number.isFinite(homeShots) && Number.isFinite(awayShots) ? `${homeShots}-${awayShots}` : null,
      shots_on_target: Number.isFinite(homeSot) && Number.isFinite(awaySot) ? `${homeSot}-${awaySot}` : null,
      xg: Number.isFinite(homeXg) && Number.isFinite(awayXg)
        ? {
          home: Number(homeXg.toFixed(2)),
          away: Number(awayXg.toFixed(2)),
          total: Number(totalXg.toFixed(2)),
          source: xg.source || 'structured feed'
        }
        : null,
      flags,
      summary: flags.length
        ? `Learning flags: ${flags.join(', ')}.`
        : 'Result was broadly inside the expected model shape.'
    };
    learned += 1;
  }

  return learned;
}

function cloneDefaultLearningCoefficients() {
  return JSON.parse(JSON.stringify(DEFAULT_LEARNING_COEFFICIENTS));
}

async function readLearningCoefficients() {
  try {
    const parsed = JSON.parse(await readFile(LEARNING_COEFFICIENTS_PATH, 'utf8'));
    return {
      ...cloneDefaultLearningCoefficients(),
      ...parsed,
      adjustments: {
        ...DEFAULT_LEARNING_COEFFICIENTS.adjustments,
        ...(parsed.adjustments || {})
      },
      flags: parsed.flags || {}
    };
  } catch {
    return cloneDefaultLearningCoefficients();
  }
}

function learningConfidence(sampleSize) {
  if (sampleSize <= 0) return 'none';
  if (sampleSize < 10) return 'early';
  if (sampleSize < 30) return 'developing';
  if (sampleSize < 75) return 'moderate';
  return 'strong';
}

function countLearningFlags(dataset) {
  const flags = {};
  let sampleSize = 0;
  let xgSamples = 0;

  for (const fixture of dataset) {
    const learning = fixture.post_match_learning;
    if (!learning) continue;
    sampleSize += 1;
    if (learning.xg) xgSamples += 1;
    for (const flag of learning.flags || []) {
      flags[flag] = (flags[flag] || 0) + 1;
    }
  }

  return { flags, sampleSize, xgSamples };
}

function learnedAdjustment(flagCount, sampleSize, weight, cap) {
  if (!sampleSize || !flagCount) return 0;
  const sampleDampener = Math.min(1, sampleSize / 40);
  const rate = flagCount / sampleSize;
  return Number(clamp(rate * weight * sampleDampener, 0, cap).toFixed(4));
}

function buildLearningCoefficients(dataset, previous, now = getNow()) {
  const { flags, sampleSize, xgSamples } = countLearningFlags(dataset);
  const drawFlags = (flags['draw-risk-underestimated'] || 0) + (flags['favourite-confidence-too-high'] || 0);
  const suppressionFlags = (flags['goal-suppression-underweighted'] || 0) + (flags['chance-quality-overstated'] || 0);
  const breakOpenFlags = flags['break-open-risk-underweighted'] || 0;
  const chanceQualityFlags = (flags['chance-quality-overstated'] || 0) + (flags['xg-did-not-support-favourite'] || 0);
  const finishingHighFlags = flags['finishing-variance-high'] || 0;
  const finishingLowFlags = flags['finishing-variance-low'] || 0;

  return {
    ...cloneDefaultLearningCoefficients(),
    updated_at: now.toISOString(),
    sample_size: sampleSize,
    xg_sample_size: xgSamples,
    confidence: learningConfidence(sampleSize),
    previous_updated_at: previous?.updated_at || null,
    adjustments: {
      draw_lift: learnedAdjustment(drawFlags, sampleSize, 0.085, 0.035),
      favourite_compression: learnedAdjustment(drawFlags + chanceQualityFlags, sampleSize, 0.095, 0.04),
      goal_suppression: learnedAdjustment(suppressionFlags + finishingLowFlags, sampleSize, 0.42, 0.18),
      break_open_risk: learnedAdjustment(breakOpenFlags + finishingHighFlags, sampleSize, 0.36, 0.16),
      chance_quality_penalty: learnedAdjustment(chanceQualityFlags, sampleSize, 0.12, 0.05)
    },
    flags,
    note: sampleSize
      ? 'Automatically updated from settled match outcomes, post-match stats and xG where available. Early samples are deliberately damped.'
      : DEFAULT_LEARNING_COEFFICIENTS.note
  };
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
    bookmaker_key: row.bookmaker_key,
    oddsapi_market: row.oddsapi_market,
    devig_book_probability: row.devig_book_probability,
    odds_checked_at: row.checked_at || fixture.market_scan?.checked_at || fixture.odds_last_checked,
    odds_refresh_status: Number.isFinite(Number(row.current_odds)) ? 'checked_current' : 'selection_missing',
    odds_refresh_note: row.source || 'AU bookie market scan'
  };
}

function sameClosingMarket(a, b) {
  return normalise(a.target_selection) === normalise(b.target_selection)
    && normalise(a.market_matrix) === normalise(b.market_matrix);
}

function isBetfairMarket(row) {
  const book = normalise(row.bookmaker_key || row.au_bookie || row.bookmaker);
  return book === 'betfair ex au' || book === 'betfair';
}

function isSharpClosingMarket(row) {
  const book = normalise(row.bookmaker_key || row.au_bookie || row.bookmaker);
  return SHARP_CLOSING_BOOKS.has(book.replace(/\s+/g, '_')) || SHARP_CLOSING_BOOKS.has(book);
}

function referencePriority(candidate, sourceMarketItem) {
  if (isSharpClosingMarket(candidate)) return 0;
  if (normalise(candidate.au_bookie) === normalise(sourceMarketItem.au_bookie)) return 1;
  return 2;
}

function checkedAtTime(marketItem) {
  const checkedAt = Date.parse(marketItem.odds_checked_at || marketItem.checked_at || '');
  return Number.isFinite(checkedAt) ? checkedAt : null;
}

function wasPriceChecked(marketItem) {
  return ['checked_current', 'updated', 'added_from_oddsapi', 'confirmed_rendered_site'].includes(marketItem.odds_refresh_status);
}

function preKickoffSnapshot(marketItem, kickoff, maxWindowMs) {
  const checkedAt = checkedAtTime(marketItem);
  if (!Number.isFinite(checkedAt) || !wasPriceChecked(marketItem)) return null;

  const delta = kickoff.getTime() - checkedAt;
  if (delta < 0 || delta > maxWindowMs) return null;

  return {
    checkedAt: new Date(checkedAt),
    minutesBeforeKickoff: Math.round(delta / 60000)
  };
}

function saneClvReference(openingOdds, referenceOdds) {
  if (!Number.isFinite(openingOdds) || !Number.isFinite(referenceOdds) || openingOdds <= 1 || referenceOdds <= 1) {
    return false;
  }

  const ratio = Math.max(openingOdds, referenceOdds) / Math.min(openingOdds, referenceOdds);
  return ratio <= MAX_CLV_PRICE_RATIO;
}

function referenceMarketCandidates(fixture, marketItem) {
  const ownBook = {
    marketItem,
    reference: marketItem.au_bookie || 'Own book',
    priority: referencePriority(marketItem, marketItem),
    isSharp: isSharpClosingMarket(marketItem)
  };
  const scanCandidates = (fixture.market_scan?.rows || [])
    .map((row) => scanRowToMarketItem(row, fixture))
    .filter((candidate) => sameClosingMarket(candidate, marketItem))
    .map((candidate) => ({
      marketItem: candidate,
      reference: candidate.au_bookie || 'Market scan',
      priority: referencePriority(candidate, marketItem),
      isSharp: isSharpClosingMarket(candidate)
    }));

  const candidates = [ownBook, ...scanCandidates]
    .filter((candidate) => Number.isFinite(Number(candidate.marketItem.current_odds)));
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = [
      normalise(candidate.reference),
      Number(candidate.marketItem.current_odds).toFixed(4),
      checkedAtTime(candidate.marketItem) || ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function preferredPreKickoffReferenceMarket(fixture, marketItem, kickoff, maxWindowMs, openingOdds, options = {}) {
  const targetMinute = Number.isFinite(options.targetMinute) ? options.targetMinute : null;
  return referenceMarketCandidates(fixture, marketItem)
    .map((candidate) => ({
      ...candidate,
      snapshot: preKickoffSnapshot(candidate.marketItem, kickoff, maxWindowMs),
      odds: Number.parseFloat(candidate.marketItem.current_odds)
    }))
    .filter((candidate) => !options.sharpOnly || candidate.isSharp)
    .filter((candidate) => candidate.snapshot && saneClvReference(openingOdds, candidate.odds))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (targetMinute !== null) {
        const aDistance = Math.abs(a.snapshot.minutesBeforeKickoff - targetMinute);
        const bDistance = Math.abs(b.snapshot.minutesBeforeKickoff - targetMinute);
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      return b.snapshot.checkedAt - a.snapshot.checkedAt;
    })[0] || null;
}

function preferredClosingMarket(fixture, marketItem, kickoff, openingOdds) {
  return preferredPreKickoffReferenceMarket(fixture, marketItem, kickoff, CLOSING_WINDOW_MS, openingOdds, {
    sharpOnly: true,
    targetMinute: 5
  });
}

function preferredSoftClosingMarket(fixture, marketItem, kickoff, openingOdds) {
  return preferredPreKickoffReferenceMarket(fixture, marketItem, kickoff, CLOSING_WINDOW_MS, openingOdds, {
    sharpOnly: false,
    targetMinute: 5
  });
}

function preferredLatestReferenceMarket(fixture, marketItem, kickoff, openingOdds) {
  return preferredPreKickoffReferenceMarket(fixture, marketItem, kickoff, LATEST_PRE_KICKOFF_WINDOW_MS, openingOdds);
}

function wasCheckedBeforeKickoff(marketItem, kickoff) {
  const checkedAt = checkedAtTime(marketItem);
  return Number.isFinite(checkedAt) && checkedAt <= kickoff.getTime();
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

function capturedInsideClosingWindow(entry, kickoff) {
  const capturedAt = Date.parse(entry.closing_captured_at || '');
  if (!Number.isFinite(capturedAt)) return false;

  const delta = kickoff.getTime() - capturedAt;
  return delta >= 0 && delta <= CLOSING_WINDOW_MS;
}

function downgradeLegacyClosingOutsideWindow(entry, kickoff) {
  if (!Number.isFinite(Number(entry.closing_odds)) || capturedInsideClosingWindow(entry, kickoff)) return;

  entry.estimated_closing_odds = entry.closing_odds;
  entry.estimated_clv_percent = entry.clv_percent;
  entry.estimated_closing_source = 'Estimated from nearest saved price; previous closing capture was outside the final 5-minute window.';
  entry.closing_odds = null;
  entry.closing_qi = null;
  entry.closing_bookie = null;
  entry.closing_captured_at = null;
  entry.closing_source = 'No Betfair/Pinnacle close captured around 5 minutes before game time';
  entry.closing_status = 'missing_sharp_close';
  entry.closing_reference_type = 'missing_sharp_market';
  entry.clv_percent = null;
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

function sanitizePostKickoffMarketPrices(dataset, now = getNow()) {
  let corrected = 0;

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);
    if (kickoff > now) continue;

    for (const marketItem of fixture.markets || []) {
      const currentOdds = Number.parseFloat(marketItem.current_odds);
      const previousOdds = Number.parseFloat(marketItem.previous_odds);
      if (!saneClvReference(previousOdds, currentOdds) && Number.isFinite(previousOdds) && previousOdds > 1) {
        marketItem.rejected_post_start_odds = currentOdds;
        marketItem.current_odds = previousOdds;
        marketItem.odds_refresh_status = 'frozen_post_kickoff';
        marketItem.odds_refresh_note = 'Post-kickoff or stale outlier rejected; restored last sane pre-match price.';
        corrected += 1;
      }
    }
  }

  return corrected;
}

function sanitizeHistoryCurrentPrice(entry) {
  const openingOdds = Number.parseFloat(entry.opening_odds);
  const currentOdds = Number.parseFloat(entry.current_odds);
  if (saneClvReference(openingOdds, currentOdds)) return;

  entry.rejected_current_odds = currentOdds;
  entry.current_odds = openingOdds;
  entry.current_model_price = entry.opening_model_price;
  entry.current_ev = entry.opening_ev;
  entry.current_qi = entry.opening_qi;
  entry.current_price_note = 'Post-start or stale outlier rejected; restored opening price for clean history display.';
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
        save_rule: 'Saved immediately when the selection first cleared QI 70+ before kickoff.',
        opening_source: `${marketItem.au_bookie || 'Book'} price when the agent first saved the qualified selection.`,
        clv_benchmark_rule: 'Official CLV uses Betfair or Pinnacle around 5 minutes before game time; soft-book closes are estimates only.',
        opening_odds: currentOdds,
        opening_model_price: modelPrice,
        opening_ev: metrics.ev,
        opening_qi: metrics.qi,
        closing_odds: null,
        closing_captured_at: null,
        clv_percent: null,
        latest_pre_kickoff_odds: null,
        latest_pre_kickoff_at: null,
        latest_pre_kickoff_bookie: null,
        latest_pre_kickoff_clv_percent: null,
        latest_pre_kickoff_qi: null,
        latest_pre_kickoff_source: null,
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
      entry.save_rule = entry.save_rule || 'Saved immediately when the selection first cleared QI 70+ before kickoff.';
      entry.opening_source = entry.opening_source || `${entry.au_bookie || marketItem.au_bookie || 'Book'} price when the agent first saved the qualified selection.`;
      entry.clv_benchmark_rule = entry.clv_benchmark_rule || 'Official CLV uses Betfair or Pinnacle around 5 minutes before game time; soft-book closes are estimates only.';
      if (entry.closing_status === 'missing_fresh_close') {
        entry.closing_status = 'missing_sharp_close';
        entry.closing_reference_type = 'missing_sharp_market';
        entry.closing_source = 'No Betfair/Pinnacle close captured around 5 minutes before game time';
      }
      entry.latest_pre_kickoff_odds = entry.latest_pre_kickoff_odds ?? null;
      entry.latest_pre_kickoff_at = entry.latest_pre_kickoff_at ?? null;
      entry.latest_pre_kickoff_bookie = entry.latest_pre_kickoff_bookie ?? null;
      entry.latest_pre_kickoff_clv_percent = entry.latest_pre_kickoff_clv_percent ?? null;
      entry.latest_pre_kickoff_qi = entry.latest_pre_kickoff_qi ?? null;
      entry.latest_pre_kickoff_source = entry.latest_pre_kickoff_source ?? null;
      if (!Number.isFinite(Number.parseFloat(entry.estimated_closing_odds))) {
        entry.estimated_closing_odds = null;
        entry.estimated_clv_percent = null;
        entry.estimated_qi = null;
        entry.estimated_closing_source = null;
      }
      const marketSnapshot = preKickoffSnapshot(marketItem, kickoff, LATEST_PRE_KICKOFF_WINDOW_MS);
      const canUpdateCurrent = kickoff > now || Boolean(marketSnapshot);
      if (canUpdateCurrent) {
        entry.current_odds = currentOdds;
        entry.current_model_price = modelPrice;
        entry.current_ev = metrics.ev;
        entry.current_qi = metrics.qi;
        entry.last_seen_at = nowIso;
      }
      sanitizeHistoryCurrentPrice(entry);
      downgradeLegacyClosingOutsideWindow(entry, kickoff);

      const latestReference = preferredLatestReferenceMarket(fixture, marketItem, kickoff, entry.opening_odds);
      if (latestReference) {
        const latestOdds = Number.parseFloat(latestReference.marketItem.current_odds);
        const latestMetrics = runVectorCalculations({
          ...marketItem,
          current_odds: latestOdds
        });
        const latestCheckedAt = latestReference.snapshot.checkedAt.toISOString();
        if (!entry.latest_pre_kickoff_at || Date.parse(latestCheckedAt) >= Date.parse(entry.latest_pre_kickoff_at)) {
          entry.latest_pre_kickoff_odds = latestOdds;
          entry.latest_pre_kickoff_at = latestCheckedAt;
          entry.latest_pre_kickoff_bookie = latestReference.reference;
          entry.latest_pre_kickoff_qi = latestMetrics.qi;
          entry.latest_pre_kickoff_clv_percent = clvPercent(entry.opening_odds, latestOdds);
          entry.latest_pre_kickoff_source = `${latestReference.reference} pre-game check ${latestReference.snapshot.minutesBeforeKickoff} min before game time`;
        }
      }

      const closingMarket = preferredClosingMarket(fixture, marketItem, kickoff, entry.opening_odds);
      if (closingMarket) {
        const closingOdds = Number.parseFloat(closingMarket.marketItem.current_odds);
        const closingMetrics = runVectorCalculations(closingMarket.marketItem);
        entry.closing_odds = closingOdds;
        entry.closing_bookie = closingMarket.reference;
        entry.closing_qi = closingMetrics.qi;
        entry.closing_captured_at = closingMarket.snapshot.checkedAt.toISOString();
        entry.closing_source = `${closingMarket.reference} sharp-market check ${closingMarket.snapshot.minutesBeforeKickoff} min before game time`;
        entry.closing_status = 'confirmed_sharp_close';
        entry.closing_reference_type = 'sharp_market';
        entry.clv_percent = clvPercent(entry.opening_odds, entry.closing_odds);
        entry.estimated_closing_odds = null;
        entry.estimated_clv_percent = null;
        entry.estimated_closing_source = null;
        entry.latest_pre_kickoff_odds = closingOdds;
        entry.latest_pre_kickoff_at = entry.closing_captured_at;
        entry.latest_pre_kickoff_bookie = closingMarket.reference;
        entry.latest_pre_kickoff_qi = closingMetrics.qi;
        entry.latest_pre_kickoff_clv_percent = entry.clv_percent;
        entry.latest_pre_kickoff_source = entry.closing_source;
      } else {
        const softClosingMarket = preferredSoftClosingMarket(fixture, marketItem, kickoff, entry.opening_odds);
        if (softClosingMarket) {
          const softClosingOdds = Number.parseFloat(softClosingMarket.marketItem.current_odds);
          const softClosingMetrics = runVectorCalculations({
            ...marketItem,
            current_odds: softClosingOdds
          });
          entry.latest_pre_kickoff_odds = softClosingOdds;
          entry.latest_pre_kickoff_at = softClosingMarket.snapshot.checkedAt.toISOString();
          entry.latest_pre_kickoff_bookie = softClosingMarket.reference;
          entry.latest_pre_kickoff_qi = softClosingMetrics.qi;
          entry.latest_pre_kickoff_clv_percent = clvPercent(entry.opening_odds, softClosingOdds);
          entry.latest_pre_kickoff_source = `${softClosingMarket.reference} soft-book check ${softClosingMarket.snapshot.minutesBeforeKickoff} min before game time`;
          if (now >= kickoff && entry.closing_odds === null) {
            entry.closing_status = 'soft_close_estimate';
            entry.closing_source = 'No Betfair/Pinnacle close captured around 5 minutes before game time';
            entry.closing_reference_type = 'soft_book_estimate';
            entry.clv_percent = null;
            entry.estimated_closing_odds = softClosingOdds;
            entry.estimated_clv_percent = clvPercent(entry.opening_odds, softClosingOdds);
            entry.estimated_qi = softClosingMetrics.qi;
            entry.estimated_closing_source = `${softClosingMarket.reference} final-5-minute soft-book estimate; official CLV waits for Betfair/Pinnacle.`;
          }
        } else if (now >= kickoff && entry.closing_odds === null) {
          const latestReferenceOdds = Number.parseFloat(entry.latest_pre_kickoff_odds);
          const latestReferenceBook = entry.latest_pre_kickoff_bookie || marketItem.au_bookie || 'own book';
          const existingEstimate = Number.parseFloat(entry.estimated_closing_odds);
          const estimatedOdds = Number.isFinite(latestReferenceOdds)
            ? latestReferenceOdds
            : Number.isFinite(existingEstimate) && saneClvReference(entry.opening_odds, existingEstimate)
              ? existingEstimate
              : null;
          if (!Number.isFinite(estimatedOdds)) {
            entry.closing_status = 'missing_sharp_close';
            entry.closing_source = 'No Betfair/Pinnacle close captured around 5 minutes before game time';
            entry.closing_reference_type = 'missing_sharp_market';
            entry.clv_percent = null;
            byId.set(id, entry);
            continue;
          }
          entry.closing_status = 'latest_pre_kickoff_estimate';
          entry.closing_source = 'No Betfair/Pinnacle close captured around 5 minutes before game time';
          entry.closing_reference_type = 'latest_estimate';
          entry.clv_percent = null;
          entry.estimated_closing_odds = estimatedOdds;
          entry.estimated_clv_percent = clvPercent(entry.opening_odds, estimatedOdds);
          const estimatedMetrics = runVectorCalculations({
            ...marketItem,
            current_odds: estimatedOdds
          });
          entry.estimated_qi = estimatedMetrics.qi;
          entry.current_odds = estimatedOdds;
          entry.current_ev = estimatedMetrics.ev;
          entry.current_qi = estimatedMetrics.qi;
          entry.estimated_closing_source = entry.estimated_closing_source
            || `Latest saved ${latestReferenceBook} price before game time; not official CLV.`;
        }
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

function pointsMatch(targetPoint, outcomePoint) {
  return Number.isFinite(targetPoint)
    && Number.isFinite(outcomePoint)
    && Math.abs(outcomePoint - targetPoint) < 0.001;
}

function teamTotalTeamMatches(selection, description) {
  if (!description) return false;
  const teamPart = selection.replace(/\b(over|under)\b.*$/i, '').trim();
  return selection.includes(description) || description.includes(teamPart);
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

  if (isMarketKey(marketKey, ['team_totals']) || MARKET_MAP.team_totals.includes(marketItem.market_matrix)) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    const wantsUnder = selection.includes('under');
    const wantsOver = selection.includes('over');
    if (!Number.isFinite(targetPoint) || (!wantsUnder && !wantsOver)) return null;

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      const description = normalise(outcome.description || '');
      return pointsMatch(targetPoint, Number(outcome.point))
        && teamTotalTeamMatches(selection, description)
        && ((wantsUnder && outcomeName === 'under') || (wantsOver && outcomeName === 'over'));
    });
  }

  if (isMarketKey(marketKey, ['totals'])) {
    const targetPoint = numberFromSelection(marketItem.target_selection);
    const wantsUnder = selection.includes('under');
    const wantsOver = selection.includes('over');
    if (!Number.isFinite(targetPoint) || (!wantsUnder && !wantsOver)) return null;

    return oddsMarket.outcomes.find((outcome) => {
      const outcomeName = normalise(outcome.name);
      return pointsMatch(targetPoint, Number(outcome.point))
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

function matchingDevigOutcomes(oddsMarket, outcome) {
  const outcomePoint = Number(outcome.point);
  const outcomeName = normalise(outcome.name);
  const outcomeDescription = normalise(outcome.description || '');
  const isPlayerMarket = String(oddsMarket.key || '').startsWith('player_');

  return (oddsMarket.outcomes || []).filter((candidate) => {
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

function devigBookProbability(oddsMarket, outcome) {
  if (!oddsMarket || !outcome || !Number.isFinite(Number(outcome.price)) || Number(outcome.price) <= 1) return null;

  const comparableOutcomes = matchingDevigOutcomes(oddsMarket, outcome);
  if (comparableOutcomes.length < 2) return null;

  const impliedTotal = comparableOutcomes.reduce((total, candidate) => total + (1 / Number(candidate.price)), 0);
  if (!Number.isFinite(impliedTotal) || impliedTotal <= 0) return null;

  return Number((((1 / Number(outcome.price)) / impliedTotal) * 100).toFixed(2));
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

function addModelMarket(markets, category, market, selection, probability) {
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

function calibratedResultProbabilities(probabilities) {
  const raw = { ...probabilities };
  const favorite = Math.max(raw.home, raw.away);
  const underdog = Math.min(raw.home, raw.away);
  const gap = favorite - underdog;

  let drawLift = 0;
  if (raw.draw < 0.24 && gap < 0.28) drawLift += 0.035;
  if (raw.draw < 0.20 && gap >= 0.28) drawLift += 0.025;
  if (raw.draw < 0.16) drawLift += 0.02;

  const favouriteCompression = favorite > 0.62 ? Math.min(0.055, (favorite - 0.62) * 0.45) : 0;
  drawLift += favouriteCompression * 0.55;

  let home = raw.home;
  let away = raw.away;
  let draw = raw.draw + drawLift;

  if (raw.home >= raw.away) {
    home -= drawLift * 0.72 + favouriteCompression * 0.28;
    away += favouriteCompression * 0.28;
  } else {
    away -= drawLift * 0.72 + favouriteCompression * 0.28;
    home += favouriteCompression * 0.28;
  }

  home = clamp(home, 0.03, 0.92);
  away = clamp(away, 0.03, 0.92);
  draw = clamp(draw, 0.08, 0.38);

  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
    calibration: {
      draw_lift_points: Number((drawLift * 100).toFixed(1)),
      favourite_compression_points: Number((favouriteCompression * 100).toFixed(1)),
      note: 'Settled-match learning applied: favourites are compressed slightly, draw paths are lifted, and totals are made more conservative for international-match variance.'
    }
  };
}

function fixtureSignalText(fixture) {
  return [
    fixture.tactical_summary,
    fixture.pitch_constraints,
    fixture.referee_tendencies,
    fixture.lineup_model_note,
    fixture.confirmed_lineups?.model_implication
  ].filter(Boolean).join(' ').toLowerCase();
}

function countSignals(text, signals) {
  return signals.filter((signal) => text.includes(signal)).length;
}

function fixtureLearningProfile(fixture) {
  const text = fixtureSignalText(fixture);
  const lowBlockSignals = [
    'low block',
    'deep defensive',
    'defensive compression',
    'compact',
    'containment',
    'park',
    'slow possession',
    'low-risk possession',
    'disciplined structure'
  ];
  const chanceCreationSignals = [
    'box entries',
    'shots on target',
    'chance creation',
    'final-third pressure',
    'set-piece pressure',
    'aerial pressure',
    'overloads',
    'individual creation'
  ];
  const breakOpenSignals = [
    'high-tempo',
    'pressing',
    'transition',
    'fast attacks',
    'wide overloads',
    'attacking width',
    'pace',
    'direct forward threat',
    'counter pressure'
  ];
  const fatigueSignals = [
    'fatigue',
    'synthetic',
    'fast turf',
    'high rebound',
    'heavy physical',
    'late tackles'
  ];

  const lowBlock = countSignals(text, lowBlockSignals);
  const chanceCreation = countSignals(text, chanceCreationSignals);
  const breakOpen = countSignals(text, breakOpenSignals);
  const fatigue = countSignals(text, fatigueSignals);

  return {
    lowBlock,
    chanceCreation,
    breakOpen,
    fatigue,
    drawRisk: clamp((lowBlock * 0.014) - (chanceCreation * 0.006), 0, 0.055),
    goalSuppression: clamp((lowBlock * 0.07) - (chanceCreation * 0.035), 0, 0.26),
    breakOpenRisk: clamp((breakOpen * 0.045) + (fatigue * 0.025) - (lowBlock * 0.025), 0, 0.28)
  };
}

function calibratedResultProbabilitiesForFixture(probabilities, fixture, learningCoefficients = DEFAULT_LEARNING_COEFFICIENTS) {
  const profile = fixtureLearningProfile(fixture);
  const adjustments = learningCoefficients.adjustments || DEFAULT_LEARNING_COEFFICIENTS.adjustments;
  const raw = { ...probabilities };
  const favorite = Math.max(raw.home, raw.away);
  const underdog = Math.min(raw.home, raw.away);
  const gap = favorite - underdog;

  let drawLift = profile.drawRisk;
  if (raw.draw < 0.24 && gap < 0.28) drawLift += 0.035;
  if (raw.draw < 0.20 && gap >= 0.28) drawLift += 0.025;
  if (raw.draw < 0.16) drawLift += 0.02;

  let favouriteCompression = favorite > 0.62 ? Math.min(0.075, (favorite - 0.62) * 0.52) : 0;
  if (favorite > 0.78 && profile.lowBlock > profile.chanceCreation) {
    favouriteCompression += 0.025;
  }
  drawLift += Number(adjustments.draw_lift || 0);
  favouriteCompression += Number(adjustments.favourite_compression || 0);

  drawLift += favouriteCompression * 0.55;

  let home = raw.home;
  let away = raw.away;
  let draw = raw.draw + drawLift;

  if (raw.home >= raw.away) {
    home -= drawLift * 0.72 + favouriteCompression * 0.28;
    away += favouriteCompression * 0.28;
  } else {
    away -= drawLift * 0.72 + favouriteCompression * 0.28;
    home += favouriteCompression * 0.28;
  }

  home = clamp(home, 0.03, 0.92);
  away = clamp(away, 0.03, 0.92);
  draw = clamp(draw, 0.08, 0.38);

  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
    profile,
    calibration: {
      draw_lift_points: Number((drawLift * 100).toFixed(1)),
      favourite_compression_points: Number((favouriteCompression * 100).toFixed(1)),
      low_block_draw_risk_points: Number((profile.drawRisk * 100).toFixed(1)),
      goal_suppression_points: Number(profile.goalSuppression.toFixed(2)),
      break_open_risk_points: Number(profile.breakOpenRisk.toFixed(2)),
      learned_draw_lift_points: Number((Number(adjustments.draw_lift || 0) * 100).toFixed(1)),
      learned_favourite_compression_points: Number((Number(adjustments.favourite_compression || 0) * 100).toFixed(1)),
      learning_confidence: learningCoefficients.confidence || 'none',
      note: 'Settled-match learning applied: favourites are compressed, draw paths are lifted when deep-defence risk is present, and totals balance goal suppression against break-open risk.'
    }
  };
}

function fixtureTempoAdjustment(fixture) {
  const text = [
    fixture.tactical_summary,
    fixture.pitch_constraints,
    fixture.referee_tendencies
  ].filter(Boolean).join(' ').toLowerCase();

  const highEventSignals = [
    'high-tempo',
    'pressing',
    'transition',
    'fast attacks',
    'wide overloads',
    'attacking width',
    'final-third pressure',
    'box entries',
    'counter pressure',
    'pace',
    'direct forward threat'
  ];
  const lowEventSignals = [
    'deep defensive',
    'low-risk possession',
    'low block',
    'compact',
    'controlled midfield',
    'disciplined structure',
    'defensive compression',
    'slow tempo',
    'low-possession',
    'defensive numbers'
  ];

  const highCount = highEventSignals.filter((signal) => text.includes(signal)).length;
  const lowCount = lowEventSignals.filter((signal) => text.includes(signal)).length;
  return clamp((highCount * 0.11) - (lowCount * 0.09), -0.28, 0.32);
}

function deriveFixtureGoalModel(fixture, learningCoefficients = DEFAULT_LEARNING_COEFFICIENTS) {
  const baseProbabilities = h2hModelProbabilities(fixture);
  const teams = splitTeams(fixture.match_name);
  if (!baseProbabilities || !teams) return;
  const probabilities = calibratedResultProbabilitiesForFixture(baseProbabilities, fixture, learningCoefficients);
  const learningAdjustments = learningCoefficients.adjustments || DEFAULT_LEARNING_COEFFICIENTS.adjustments;
  const displayTeams = fixture.match_name.split(/\s+vs\s+/i);
  const displayHome = displayTeams[0] || teams.home;
  const displayAway = displayTeams[1] || teams.away;

  const resultGap = Math.abs(probabilities.home - probabilities.away);
  const favorite = Math.max(probabilities.home, probabilities.away);
  const drawBrake = Math.max(0, probabilities.draw - 0.22) * 2.35;
  const favouriteEventBoost = Math.max(0, favorite - 0.62) * 0.55;
  const tempoAdjustment = fixtureTempoAdjustment(fixture);
  const goalSuppression = clamp(
    (probabilities.profile?.goalSuppression || 0)
      + Number(learningAdjustments.goal_suppression || 0)
      + Number(learningAdjustments.chance_quality_penalty || 0),
    0,
    0.42
  );
  const breakOpenRisk = clamp(
    (probabilities.profile?.breakOpenRisk || 0) + Number(learningAdjustments.break_open_risk || 0),
    0,
    0.42
  );
  const totalGoalsMean = clamp(2.46 - drawBrake + (resultGap * 0.32) + favouriteEventBoost + tempoAdjustment - goalSuppression + breakOpenRisk, 1.55, 3.55);
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
    total_goals_mean: Number(totalGoalsMean.toFixed(2)),
    tempo_adjustment: Number(tempoAdjustment.toFixed(2)),
    goal_suppression: Number(goalSuppression.toFixed(2)),
    break_open_risk: Number(breakOpenRisk.toFixed(2)),
    calibration_note: probabilities.calibration.note
  };
  fixture.model_calibration = {
    base_home_probability: Number((baseProbabilities.home * 100).toFixed(1)),
    base_draw_probability: Number((baseProbabilities.draw * 100).toFixed(1)),
    base_away_probability: Number((baseProbabilities.away * 100).toFixed(1)),
    calibrated_home_probability: Number((probabilities.home * 100).toFixed(1)),
    calibrated_draw_probability: Number((probabilities.draw * 100).toFixed(1)),
    calibrated_away_probability: Number((probabilities.away * 100).toFixed(1)),
    total_goals_mean: Number(totalGoalsMean.toFixed(2)),
    tempo_adjustment: Number(tempoAdjustment.toFixed(2)),
    goal_suppression: Number(goalSuppression.toFixed(2)),
    break_open_risk: Number(breakOpenRisk.toFixed(2)),
    learning_adjustments: {
      confidence: learningCoefficients.confidence || 'none',
      sample_size: learningCoefficients.sample_size || 0,
      draw_lift: Number(Number(learningAdjustments.draw_lift || 0).toFixed(4)),
      favourite_compression: Number(Number(learningAdjustments.favourite_compression || 0).toFixed(4)),
      goal_suppression: Number(Number(learningAdjustments.goal_suppression || 0).toFixed(4)),
      break_open_risk: Number(Number(learningAdjustments.break_open_risk || 0).toFixed(4)),
      chance_quality_penalty: Number(Number(learningAdjustments.chance_quality_penalty || 0).toFixed(4))
    },
    ...probabilities.calibration
  };
  fixture.exact_score_model = scores
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  const modelMarkets = [];
  const bothTeamsScore = (1 - poissonProbability(homeLambda, 0)) * (1 - poissonProbability(awayLambda, 0));
  const evenGoals = Array.from({ length: 7 }, (_, index) => index * 2)
    .reduce((sum, goals) => sum + poissonProbability(totalGoalsMean, goals), 0);
  const firstHalfHomeLambda = homeLambda * 0.45;
  const firstHalfAwayLambda = awayLambda * 0.45;
  const firstHalfTotalMean = firstHalfHomeLambda + firstHalfAwayLambda;
  const firstHalfResult = resultProbabilitiesFromLambdas(firstHalfHomeLambda, firstHalfAwayLambda);
  const firstHalfBtts = (1 - poissonProbability(firstHalfHomeLambda, 0)) * (1 - poissonProbability(firstHalfAwayLambda, 0));

  addModelMarket(modelMarkets, 'Main Match', 'Double Chance', `${displayHome} or Draw`, probabilities.home + probabilities.draw);
  addModelMarket(modelMarkets, 'Main Match', 'Double Chance', `${displayAway} or Draw`, probabilities.away + probabilities.draw);
  addModelMarket(modelMarkets, 'Main Match', 'Double Chance', `${displayHome} or ${displayAway}`, probabilities.home + probabilities.away);
  addModelMarket(modelMarkets, 'Main Match', 'Draw No Bet', `${displayHome} Draw No Bet`, probabilities.home / (probabilities.home + probabilities.away));
  addModelMarket(modelMarkets, 'Main Match', 'Draw No Bet', `${displayAway} Draw No Bet`, probabilities.away / (probabilities.home + probabilities.away));
  addModelMarket(modelMarkets, 'Main Match', 'Both Teams To Score', 'BTTS Yes', bothTeamsScore);
  addModelMarket(modelMarkets, 'Main Match', 'Both Teams To Score', 'BTTS No', 1 - bothTeamsScore);
  addModelMarket(modelMarkets, 'Main Match', 'Odd / Even Goals', 'Odd Goals', 1 - evenGoals);
  addModelMarket(modelMarkets, 'Main Match', 'Odd / Even Goals', 'Even Goals', evenGoals);

  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const over = overProbability(totalGoalsMean, line);
    addModelMarket(modelMarkets, 'Goal Totals', 'Alternate Totals', `Over ${line} Goals`, over);
    addModelMarket(modelMarkets, 'Goal Totals', 'Alternate Totals', `Under ${line} Goals`, 1 - over);
  }

  for (const [teamName, lambda] of [[displayHome, homeLambda], [displayAway, awayLambda]]) {
    for (const line of [0.5, 1.5, 2.5]) {
      const over = overProbability(lambda, line);
      addModelMarket(modelMarkets, 'Team Totals', 'Team Totals', `${teamName} Over ${line} Goals`, over);
      addModelMarket(modelMarkets, 'Team Totals', 'Team Totals', `${teamName} Under ${line} Goals`, 1 - over);
    }
  }

  addModelMarket(modelMarkets, 'First Half', 'First Half Result', `${displayHome} 1H Win`, firstHalfResult.home);
  addModelMarket(modelMarkets, 'First Half', 'First Half Result', '1H Draw', firstHalfResult.draw);
  addModelMarket(modelMarkets, 'First Half', 'First Half Result', `${displayAway} 1H Win`, firstHalfResult.away);
  for (const line of [0.5, 1.5]) {
    const over = overProbability(firstHalfTotalMean, line);
    addModelMarket(modelMarkets, 'First Half', 'First Half Totals', `1H Over ${line} Goals`, over);
    addModelMarket(modelMarkets, 'First Half', 'First Half Totals', `1H Under ${line} Goals`, 1 - over);
  }
  addModelMarket(modelMarkets, 'First Half', 'First Half BTTS', '1H BTTS Yes', firstHalfBtts);
  addModelMarket(modelMarkets, 'First Half', 'First Half BTTS', '1H BTTS No', 1 - firstHalfBtts);

  fixture.model_market_view = modelMarkets;
}

function deriveFixtureModels(dataset, learningCoefficients = DEFAULT_LEARNING_COEFFICIENTS) {
  for (const fixture of dataset) {
    deriveFixtureGoalModel(fixture, learningCoefficients);
  }
}

function reconcileMarketScanModelValues(dataset) {
  for (const fixture of dataset) {
    const modelRows = new Map((fixture.model_market_view || []).map((row) => [
      `${normalise(row.selection)}|${normalise(row.market)}`,
      row
    ]));

    for (const row of fixture.market_scan?.rows || []) {
      const modelRow = modelRows.get(`${normalise(row.selection)}|${normalise(row.market)}`);
      if (!modelRow || !Number.isFinite(Number(modelRow.fair_price))) continue;

      row.model_price = Number(modelRow.fair_price);
      row.model_probability = Number(modelRow.probability);

      const metrics = runVectorCalculations({
        true_price: row.model_price,
        current_odds: row.current_odds
      });
      const quality = buildBetQualityFromPrices(row.model_price, row.current_odds);

      row.ev = metrics.ev;
      row.qi = metrics.qi;
      row.price_qi = metrics.price_qi;
      row.edge_points = quality.edge;
      row.risk_rating = quality.risk;
    }
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
        devig_book_probability: devigBookProbability(h2hMarket, outcome),
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
  let learningCoefficients = await readLearningCoefficients();
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
  const lineupUpdates = await refreshLastHourLineups(dataset, getNow(), nowIso, espnEvents);
  const postMatchStatsUpdates = await refreshPostMatchStats(dataset, espnEvents, nowIso);

  for (const fixture of dataset) {
    const event = findEvent(allEvents, fixture);
    fixture.odds_last_checked = nowIso;
    fixture.odds_refresh_cadence = timing.cadence;
    const kickoff = parseAest(fixture.kickoff_time_aest);

    if (kickoff <= getNow()) {
      fixture.odds_refresh_note = 'Kickoff has passed; prices are frozen for CLV integrity.';
      continue;
    }

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
      marketItem.devig_book_probability = devigBookProbability(oddsMarket, outcome);
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

  const correctedOutlierPrices = sanitizePostKickoffMarketPrices(dataset);
  const prunedMarkets = pruneUnverifiedFutureMarkets(dataset);
  deriveFixtureModels(dataset, learningCoefficients);
  const learnedMatches = applyPostMatchLearning(dataset, espnEvents, fifaReports, getNow());
  learningCoefficients = buildLearningCoefficients(dataset, learningCoefficients, getNow());
  deriveFixtureModels(dataset, learningCoefficients);
  applyPostMatchLearning(dataset, espnEvents, fifaReports, getNow());
  reconcileMarketScanModelValues(dataset);

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(EMBEDDED_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  await writeFile(LEARNING_COEFFICIENTS_PATH, `${JSON.stringify(learningCoefficients, null, 2)}\n`);
  const { historyCount, settledResults } = await syncBetHistory(dataset, getNow(), espnEvents, fifaReports);

  console.log(`Odds refresh complete (${timing.cadence}). Updated ${updates} market prices. Corrected ${correctedOutlierPrices} stale/post-start outliers. Removed ${prunedMarkets} unverified future markets. Checked ${fifaReports.length} FIFA report rows. Verified ${refereeUpdates} referee assignments. Confirmed ${lineupUpdates} last-hour lineups. Added stats for ${postMatchStatsUpdates} completed matches. Learned from ${learnedMatches} completed matches. Learning confidence ${learningCoefficients.confidence} from ${learningCoefficients.sample_size} samples. Settled ${settledResults} results. Tracking ${historyCount} history rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
