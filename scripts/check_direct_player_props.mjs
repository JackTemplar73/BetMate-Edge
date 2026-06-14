import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const PLAYER_PROPS_PATH = new URL('../data/player_props_watchlist.json', import.meta.url);
const EMBEDDED_DATA_PATH = new URL('../src/embeddedData.js', import.meta.url);
const EMBEDDED_PLAYER_PROPS_PATH = new URL('../src/embeddedPlayerProps.js', import.meta.url);

const SPORTSBET_WORLD_CUP_URL = 'https://www.sportsbet.com.au/betting/soccer/world-cup-2026';
const SPORTSBET_EVENT_URL = (eventId) => `https://www.sportsbet.com.au/apigw/sportsbook-sports/Sportsbook/Sports/Events/${eventId}/SportCard?displayWinnersPriceMkt=true&includeLiveMarketGroupings=true&includeFirstMarketGroupingDetails=true&includeCollection=true`;

const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  accept: 'application/json,text/html,*/*',
  'accept-language': 'en-AU,en;q=0.9',
  referer: SPORTSBET_WORLD_CUP_URL
};

const TEAM_ALIASES = new Map([
  ['usa', 'united states'],
  ['us', 'united states'],
  ['curacao', 'curaçao'],
  ['czechia', 'czech republic'],
  ['turkiye', 'türkiye'],
  ['turkey', 'türkiye'],
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

function splitTeams(matchName) {
  const parts = String(matchName || '').split(/\s+vs\s+/i);
  if (parts.length !== 2) return null;
  return parts.map(normalise);
}

function eventMatchesFixture(event, fixture) {
  const fixtureTeams = splitTeams(fixture.match_name);
  if (!fixtureTeams) return false;

  const eventTeams = [normalise(event.participant1), normalise(event.participant2)];
  return fixtureTeams.every((team) => eventTeams.includes(team));
}

function extractJsonObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;

  const equalsIndex = text.indexOf('=', markerIndex);
  let start = text.indexOf('{', equalsIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadSportsbetEvents() {
  const page = await fetchText(SPORTSBET_WORLD_CUP_URL);
  const stateJson = extractJsonObject(page, 'window.__PRELOADED_STATE__');
  if (!stateJson) throw new Error('Sportsbet page state was not found.');

  const state = JSON.parse(stateJson);
  return Object.values(state.entities?.sportsbook?.events || {})
    .filter((event) => event.id && event.participant1 && event.participant2);
}

function collectMarkets(value, markets = []) {
  if (!value || typeof value !== 'object') return markets;
  if (Array.isArray(value)) {
    value.forEach((item) => collectMarkets(item, markets));
    return markets;
  }

  if (value.id && value.name && Array.isArray(value.selections)) markets.push(value);
  Object.values(value).forEach((item) => collectMarkets(item, markets));
  return markets;
}

function sportsbetMarketMatcher(prop) {
  const market = normalise(prop.market);

  if (market.includes('shots on target')) {
    const threshold = Number.parseInt(market.match(/\d+/)?.[0] || '1', 10);
    return {
      names: [`player to have ${threshold} or more shots on target`],
      label: `${threshold}+ shots on target`
    };
  }

  if (market.includes('total shots') || market.includes('shots')) {
    const threshold = Number.parseInt(market.match(/\d+/)?.[0] || '1', 10);
    return {
      names: [`player to have ${threshold} or more shots`],
      label: `${threshold}+ total shots`
    };
  }

  if (market.includes('goal or assist') || market.includes('score or assist')) {
    return {
      names: ['to score or assist'],
      label: 'score or assist'
    };
  }

  if (market.includes('card') || market.includes('booked')) {
    return {
      names: ['to be booked'],
      label: 'to be booked'
    };
  }

  if (market.includes('anytime') || market.includes('goal')) {
    return {
      names: ['anytime goalscorer'],
      label: 'anytime goalscorer'
    };
  }

  return null;
}

function findSportsbetPrice(markets, prop) {
  const matcher = sportsbetMarketMatcher(prop);
  if (!matcher) return null;

  const player = normalise(prop.player);
  const candidates = markets.filter((market) => matcher.names.some((name) => normalise(market.name) === name));

  for (const market of candidates) {
    const selection = (market.selections || []).find((item) => {
      const selectionName = normalise(item.name);
      return selectionName === player || selectionName.includes(player) || player.includes(selectionName);
    });

    const odds = Number(selection?.price?.winPrice);
    if (selection && Number.isFinite(odds)) {
      return {
        au_bookie: 'Sportsbet',
        bookmaker_key: 'sportsbet',
        source: 'Sportsbet direct site',
        market_name: market.name,
        selection_id: selection.id,
        current_odds: Number(odds.toFixed(2))
      };
    }
  }

  const nearby = markets
    .filter((market) => /goal|score|assist|shot|target|booked|card/i.test(market.name))
    .flatMap((market) => (market.selections || [])
      .filter((selection) => normalise(selection.name).includes(player) || player.includes(normalise(selection.name)))
      .map((selection) => ({
        market_name: market.name,
        current_odds: Number(selection.price?.winPrice),
        au_bookie: 'Sportsbet'
      })))
    .filter((item) => Number.isFinite(item.current_odds))
    .slice(0, 6);

  return { nearby };
}

function runVectorCalculations(fairPrice, currentOdds) {
  const truePrice = Number.parseFloat(fairPrice);
  const odds = Number.parseFloat(currentOdds);
  if (!Number.isFinite(truePrice) || !Number.isFinite(odds) || truePrice <= 1 || odds <= 1) {
    return { ev: 0, qi: 0, price_qi: 0 };
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

function makeRow(prop, price, checkedAt) {
  const metrics = runVectorCalculations(prop.model_price, price.current_odds);
  const modelProbability = Number(Number(prop.model_probability || (100 / Number(prop.model_price))).toFixed(1));

  return {
    selection: `${prop.player}: ${prop.market}`,
    category: 'Player Prop',
    market: prop.market,
    source: price.source,
    oddsapi_market: price.market_name,
    model_probability: modelProbability,
    model_price: Number(prop.model_price),
    current_odds: price.current_odds,
    au_bookie: price.au_bookie,
    bookmaker_key: price.bookmaker_key,
    ev: metrics.ev,
    qi: metrics.qi,
    price_qi: metrics.price_qi,
    checked_at: price.checked_at || checkedAt
  };
}

function samePrice(existing, price) {
  return existing
    && existing.source === price.source
    && existing.market_name === price.market_name
    && Number(existing.current_odds) === Number(price.current_odds);
}

function sameNearbyMarkets(a = [], b = []) {
  return JSON.stringify(a.map((item) => ({
    market_name: item.market_name,
    current_odds: Number(item.current_odds)
  }))) === JSON.stringify(b.map((item) => ({
    market_name: item.market_name,
    current_odds: Number(item.current_odds)
  })));
}

async function main() {
  const checkedAt = new Date().toISOString();
  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const props = JSON.parse(await readFile(PLAYER_PROPS_PATH, 'utf8'));
  const sportsbetEvents = await loadSportsbetEvents();
  const eventCache = new Map();
  let exactSportsbetPrices = 0;
  let sportsbetEventsChecked = 0;

  for (const fixture of dataset) {
    const sportsbetEvent = sportsbetEvents.find((event) => eventMatchesFixture(event, fixture));
    const fixtureProps = props.filter((prop) => prop.match_name === fixture.match_name);
    if (fixtureProps.length === 0) continue;

    const scan = fixture.market_scan || {};
    scan.rows = (scan.rows || []).filter((row) => row.source !== 'Sportsbet direct site');
    fixture.market_scan = scan;

    let markets = [];
    let eventStatus = 'event_not_found';
    if (sportsbetEvent) {
      try {
        let eventCard = eventCache.get(sportsbetEvent.id);
        if (!eventCard) {
          eventCard = await fetchJson(SPORTSBET_EVENT_URL(sportsbetEvent.id));
          eventCache.set(sportsbetEvent.id, eventCard);
          sportsbetEventsChecked += 1;
        }
        markets = collectMarkets(eventCard);
        eventStatus = 'checked';
      } catch (error) {
        eventStatus = `fetch_failed: ${error.message}`;
      }
    }

    for (const prop of fixtureProps) {
      const oldSportsbetCheck = prop.direct_checks?.sportsbet;
      const oldTabCheck = prop.direct_checks?.tab;
      const oldDirectPrice = (prop.live_prices || []).find((price) => price.source === 'Sportsbet direct site');
      prop.live_prices = (prop.live_prices || []).filter((price) => price.source !== 'Sportsbet direct site');
      prop.direct_checks = {
        ...(prop.direct_checks || {}),
        sportsbet: {
          checked_at: oldSportsbetCheck?.status === eventStatus ? oldSportsbetCheck.checked_at : checkedAt,
          status: eventStatus,
          exact_market_found: false,
          comparable_for_qi: false,
          event_id: sportsbetEvent?.id || null,
          market: null,
          nearby_markets: []
        },
        tab: {
          checked_at: oldTabCheck?.checked_at || checkedAt,
          status: 'direct_site_endpoint_not_confirmed',
          exact_market_found: false,
          comparable_for_qi: false,
          note: 'TAB is still checked through OddsAPI in the scheduled scan; no direct TAB prop endpoint has been confirmed in this workspace yet.'
        },
        pointsbet: {
          checked_at: prop.direct_checks?.pointsbet?.checked_at || checkedAt,
          status: 'direct_site_endpoint_not_confirmed',
          exact_market_found: false,
          comparable_for_qi: false,
          note: 'PointsBet is still checked through OddsAPI in the scheduled scan; no direct PointsBet prop endpoint has been confirmed in this workspace yet.'
        },
        neds: {
          checked_at: prop.direct_checks?.neds?.checked_at || checkedAt,
          status: 'direct_site_endpoint_not_confirmed',
          exact_market_found: false,
          comparable_for_qi: false,
          note: 'Neds is still checked through OddsAPI in the scheduled scan; no direct Neds prop endpoint has been confirmed in this workspace yet.'
        }
      };

      if (eventStatus !== 'checked') continue;

      const price = findSportsbetPrice(markets, prop);
      if (!price) continue;

      if (price.current_odds) {
        const priceCheckedAt = samePrice(oldDirectPrice, price) ? oldDirectPrice.checked_at : checkedAt;
        const checkedPrice = { ...price, checked_at: priceCheckedAt };
        const row = makeRow(prop, checkedPrice, checkedAt);
        prop.live_prices.push({
          au_bookie: row.au_bookie,
          bookmaker_key: row.bookmaker_key,
          source: row.source,
          market_name: price.market_name,
          current_odds: row.current_odds,
          ev: row.ev,
          qi: row.qi,
          price_qi: row.price_qi,
          checked_at: priceCheckedAt
        });
        prop.direct_checks.sportsbet = {
          checked_at: priceCheckedAt,
          status: 'exact_market_found',
          exact_market_found: true,
          comparable_for_qi: true,
          event_id: sportsbetEvent.id,
          market: price.market_name,
          current_odds: price.current_odds,
          qi: row.qi,
          ev: row.ev,
          nearby_markets: []
        };
        prop.last_checked = priceCheckedAt;
        fixture.market_scan.rows.push(row);
        exactSportsbetPrices += 1;
      } else {
        const nearbyCheckedAt = oldSportsbetCheck?.status === 'nearby_markets_only'
          && sameNearbyMarkets(oldSportsbetCheck.nearby_markets, price.nearby)
          ? oldSportsbetCheck.checked_at
          : checkedAt;
        prop.direct_checks.sportsbet.nearby_markets = price.nearby || [];
        prop.direct_checks.sportsbet.status = price.nearby?.length ? 'nearby_markets_only' : 'exact_market_not_found';
        prop.direct_checks.sportsbet.checked_at = nearbyCheckedAt;
        prop.last_checked = nearbyCheckedAt;
      }
    }

    fixture.market_scan = {
      ...fixture.market_scan,
      rows: fixture.market_scan.rows.sort((a, b) => Number(b.qi || 0) - Number(a.qi || 0) || Number(b.ev || 0) - Number(a.ev || 0))
    };
  }

  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(PLAYER_PROPS_PATH, `${JSON.stringify(props, null, 2)}\n`);
  await writeFile(EMBEDDED_DATA_PATH, `window.embeddedDataset = ${JSON.stringify(dataset, null, 2)};\n`);
  await writeFile(EMBEDDED_PLAYER_PROPS_PATH, `window.embeddedPlayerProps = ${JSON.stringify(props, null, 2)};\n`);

  console.log(JSON.stringify({
    sportsbet_events_checked: sportsbetEventsChecked,
    exact_sportsbet_player_prop_prices: exactSportsbetPrices,
    tab_direct_status: 'direct_site_endpoint_not_confirmed'
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
