function runVectorCalculations(marketItem) {
  const truePrice = Number.parseFloat(marketItem.true_price);
  const currentOdds = Number.parseFloat(marketItem.current_odds);

  if (!Number.isFinite(truePrice) || !Number.isFinite(currentOdds) || truePrice <= 1 || currentOdds <= 1) {
    return { ev: 0, qi: 0, bet_size: 0, expected_growth: 0 };
  }

  const ev = ((currentOdds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = currentOdds - 1;
  const standardBet = 100;
  const betSize = Math.ceil((standardBet / Math.sqrt(b)) / 5) * 5;
  const fractionalFaction = betSize / 10000;

  const expectedGrowth = (
    p * Math.log(1 + fractionalFaction * b) +
    (1 - p) * Math.log(1 - fractionalFaction)
  ) * 100;

  const termEg = Math.tanh(expectedGrowth / 0.25);
  const termEv = Math.tanh(ev / 5);
  const rawPriceQi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * termEg + 0.5 * termEv)))));
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
    qi: Number.parseInt(qi, 10),
    price_qi: rawPriceQi,
    bet_size: betSize,
    expected_growth: Number.parseFloat(expectedGrowth.toFixed(4))
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function buildBetQuality(marketItem) {
  return buildBetQualityFromPrices(marketItem.true_price, marketItem.current_odds);
}

function compareBetQuality(a, b) {
  const aQuality = a.quality || buildBetQuality(a);
  const bQuality = b.quality || buildBetQuality(b);
  const qiDiff = Number(b.metrics?.qi || b.qi || 0) - Number(a.metrics?.qi || a.qi || 0);
  if (qiDiff !== 0) return qiDiff;

  const edgeDiff = Number(bQuality.edge || 0) - Number(aQuality.edge || 0);
  if (edgeDiff !== 0) return edgeDiff;

  return Number(b.metrics?.ev || b.ev || 0) - Number(a.metrics?.ev || a.ev || 0);
}

function flattenMarkets(dataset) {
  return dataset.flatMap((fixture, fixtureIndex) =>
    fixture.markets
      .filter((market) => {
        const status = market.odds_refresh_status;
        return status === 'checked_current'
          || status === 'updated'
          || status === 'added_from_oddsapi'
          || status === 'confirmed_rendered_site'
          || status === 'model_only';
      })
      .map((market, marketIndex) => ({
        ...market,
        fixture_index: fixtureIndex,
        market_index: marketIndex,
        match_name: fixture.match_name,
        kickoff_time_aest: fixture.kickoff_time_aest,
        metrics: runVectorCalculations(market),
        quality: buildBetQuality(market)
      }))
  );
}

window.runVectorCalculations = runVectorCalculations;
window.buildBetQuality = buildBetQuality;
window.buildBetQualityFromPrices = buildBetQualityFromPrices;
window.compareBetQuality = compareBetQuality;
window.flattenMarkets = flattenMarkets;
