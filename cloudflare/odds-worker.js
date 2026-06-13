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

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://fifaworldcup.betmateedge.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(payload, env, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(env),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

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

async function fetchSavedJson(env, path) {
  const baseUrl = env.ASSET_BASE_URL || 'https://fifaworldcup.betmateedge.com';
  const url = new URL(path, baseUrl);
  url.searchParams.set('workerRefresh', Date.now().toString());

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Saved ${path} could not be loaded: ${response.status}`);
  }

  return response.json();
}

function refreshDataset(dataset, events, nowIso) {
  let updated = 0;
  let checked = 0;
  let matchedFixtures = 0;

  for (const fixture of dataset) {
    const event = findEvent(events, fixture);
    fixture.odds_last_checked = nowIso;
    fixture.odds_refresh_cadence = 'live-worker-button';

    if (!event) {
      fixture.odds_refresh_note = 'No matching Odds API event found during live refresh.';
      continue;
    }

    matchedFixtures += 1;
    fixture.odds_refresh_note = `Live Odds API refresh matched event ${event.id || event.commence_time}.`;

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

      checked += 1;
      const nextPrice = Number(Number(outcome.price).toFixed(2));
      const priceChanged = nextPrice !== Number(marketItem.current_odds);
      if (priceChanged) {
        marketItem.previous_odds = marketItem.current_odds;
        marketItem.current_odds = nextPrice;
        marketItem.odds_updated_at = nowIso;
        updated += 1;
      }

      marketItem.odds_refresh_status = priceChanged ? 'updated' : 'checked_current';
      marketItem.odds_refresh_note = `Live checked ${marketItem.au_bookie} via Odds API.`;
    }
  }

  return { updated, checked, matchedFixtures };
}

async function handleRefresh(request, env) {
  if (!env.ODDS_API_KEY) {
    return jsonResponse({ error: 'ODDS_API_KEY is not configured on the Worker.' }, env, 500);
  }

  const dataset = await fetchSavedJson(env, '/data/weekend_payload.json');
  let history = [];
  try {
    history = await fetchSavedJson(env, '/data/bet_history.json');
  } catch {
    history = [];
  }

  const sportKeys = (env.ODDS_API_SPORT_KEYS || DEFAULT_SPORT_KEYS.join(','))
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  const events = [];
  const errors = [];
  for (const sportKey of sportKeys) {
    try {
      events.push(...await fetchOddsForSport(sportKey, env.ODDS_API_KEY));
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!events.length && errors.length) {
    return jsonResponse({ error: 'Odds API refresh failed.', errors }, env, 502);
  }

  const refreshedAt = new Date().toISOString();
  const summary = refreshDataset(dataset, events, refreshedAt);

  return jsonResponse({
    refreshed_at: refreshedAt,
    summary,
    errors,
    dataset,
    bet_history: history
  }, env);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'betmate-edge-odds-worker' }, env);
    }

    if (url.pathname === '/refresh') {
      return handleRefresh(request, env);
    }

    return jsonResponse({ error: 'Not found' }, env, 404);
  }
};
