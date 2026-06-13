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
  const rawQi = Math.round(50 * (1 + (0.5 * termEg + 0.5 * termEv)));
  const qi = Math.max(0, Math.min(100, rawQi));

  return {
    ev: Number.parseFloat(ev.toFixed(2)),
    qi: Number.parseInt(qi, 10),
    bet_size: betSize,
    expected_growth: Number.parseFloat(expectedGrowth.toFixed(4))
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
      risk: 'No price',
      grade: 'Watch',
      grade_rank: 0
    };
  }

  const modelProbability = 100 / truePrice;
  const bookProbability = 100 / currentOdds;
  const edge = modelProbability - bookProbability;
  const ev = ((currentOdds / truePrice) - 1) * 100;

  let risk = 'Low';
  if (currentOdds >= 8) risk = 'Very high';
  else if (currentOdds >= 4) risk = 'High';
  else if (currentOdds >= 2.2) risk = 'Medium';

  let grade = 'No bet';
  let gradeRank = 0;

  if (ev > 0 && edge >= 7 && modelProbability >= 55 && currentOdds <= 3.25) {
    grade = 'A+';
    gradeRank = 5;
  } else if (ev > 0 && edge >= 5 && modelProbability >= 45 && currentOdds <= 4) {
    grade = 'A';
    gradeRank = 4;
  } else if (ev > 0 && edge >= 3.5 && modelProbability >= 35 && currentOdds <= 6) {
    grade = 'B';
    gradeRank = 3;
  } else if (ev > 0 && edge >= 2) {
    grade = currentOdds >= 8 ? 'Speculative' : 'C';
    gradeRank = currentOdds >= 8 ? 1 : 2;
  }

  return {
    model_probability: Number.parseFloat(modelProbability.toFixed(2)),
    book_probability: Number.parseFloat(bookProbability.toFixed(2)),
    edge: Number.parseFloat(edge.toFixed(2)),
    risk,
    grade,
    grade_rank: gradeRank
  };
}

function buildBetQuality(marketItem) {
  return buildBetQualityFromPrices(marketItem.true_price, marketItem.current_odds);
}

function compareBetQuality(a, b) {
  const aQuality = a.quality || buildBetQuality(a);
  const bQuality = b.quality || buildBetQuality(b);
  const gradeDiff = Number(bQuality.grade_rank || 0) - Number(aQuality.grade_rank || 0);
  if (gradeDiff !== 0) return gradeDiff;

  const edgeDiff = Number(bQuality.edge || 0) - Number(aQuality.edge || 0);
  if (edgeDiff !== 0) return edgeDiff;

  const qiDiff = Number(b.metrics?.qi || b.qi || 0) - Number(a.metrics?.qi || a.qi || 0);
  if (qiDiff !== 0) return qiDiff;

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
