import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const PLAYER_PROPS_PATH = new URL('../data/player_props_watchlist.json', import.meta.url);
const EMBEDDED_PLAYER_PROPS_PATH = new URL('../src/embeddedPlayerProps.js', import.meta.url);

const seedProps = [
  ['Australia vs Turkiye', 'Hakan Calhanoglu', '1+ Shots on Target', 'Shots on Target', 54.9, 'Set pieces and long-range shooting keep Calhanoglu as Turkiye\'s strongest shot-on-target profile.'],
  ['Australia vs Turkiye', 'Arda Guler', 'Goal or Assist', 'Assists', 58.1, 'Guler is the main creative link when Turkiye break Australia\'s defensive block.'],
  ['Australia vs Turkiye', 'Baris Alper Yilmaz', 'Anytime Goal', 'Goals', 32.8, 'Direct running and central penalty-box touches give Yilmaz the best Turkiye goal profile.'],
  ['Australia vs Turkiye', 'Cristian Volpato', '1+ Shots on Target', 'Shots on Target', 65.8, 'Volpato projects well if he starts or plays advanced minutes; confirm role before treating as a bet.'],
  ['Australia vs Turkiye', 'Harry Souttar', 'To Get Carded', 'Cards', 30.3, 'Souttar can be exposed by Turkiye\'s quick central rotations and late recovery tackles.'],

  ['Germany vs Curaçao', 'Kai Havertz', 'Anytime Goal', 'Goals', 46.5, 'Germany\'s team total gives Havertz the clearest goal profile.'],
  ['Germany vs Curaçao', 'Jamal Musiala', '2+ Total Shots', 'Shots', 63.7, 'Musiala should receive high-volume touches around the box.'],
  ['Germany vs Curaçao', 'Florian Wirtz', 'Goal or Assist', 'Assists', 54.8, 'Wirtz carries the best final-pass and secondary-assist profile.'],
  ['Germany vs Curaçao', 'Joshua Kimmich', '1+ Shots on Target', 'Shots on Target', 31.5, 'Kimmich projects as a lower-probability edge through set pieces and late box entries.'],
  ['Germany vs Curaçao', 'Cuco Martina', 'To Get Carded', 'Cards', 26.8, 'Curaçao defenders face repeated pressure if Germany dominate territory.'],

  ['Netherlands vs Japan', 'Cody Gakpo', '2+ Total Shots', 'Shots', 60.4, 'Gakpo projects as the Netherlands forward most likely to generate shot volume.'],
  ['Netherlands vs Japan', 'Memphis Depay', 'Anytime Goal', 'Goals', 38.6, 'Depay remains the highest Dutch central finishing profile when selected.'],
  ['Netherlands vs Japan', 'Takefusa Kubo', '1+ Shots on Target', 'Shots on Target', 47.5, 'Kubo is Japan\'s best left-footed shot creation profile.'],
  ['Netherlands vs Japan', 'Xavi Simons', 'Goal or Assist', 'Assists', 42.2, 'Simons rates well for involvement without needing to score himself.'],
  ['Netherlands vs Japan', 'Wataru Endo', 'To Get Carded', 'Cards', 27.7, 'Endo can be forced into tactical fouls against Dutch transition runners.'],

  ['Ivory Coast vs Ecuador', 'Sebastien Haller', 'Anytime Goal', 'Goals', 34.9, 'Haller has the strongest Ivory Coast central goal share.'],
  ['Ivory Coast vs Ecuador', 'Enner Valencia', 'Anytime Goal', 'Goals', 31.6, 'Valencia remains Ecuador\'s main penalty-box finisher.'],
  ['Ivory Coast vs Ecuador', 'Moises Caicedo', 'To Get Carded', 'Cards', 29.9, 'Caicedo profiles as Ecuador\'s highest tactical-foul card risk.'],
  ['Ivory Coast vs Ecuador', 'Pervis Estupinan', 'Goal or Assist', 'Assists', 28.4, 'Estupinan creates enough wide service to stay on the assist watchlist.'],
  ['Ivory Coast vs Ecuador', 'Nicolas Pepe', '1+ Shots on Target', 'Shots on Target', 42.6, 'Pepe is the higher-variance Ivory Coast shot-on-target option.'],

  ['Sweden vs Tunisia', 'Alexander Isak', 'Anytime Goal', 'Goals', 42.7, 'Isak is Sweden\'s highest goal-probability player.'],
  ['Sweden vs Tunisia', 'Dejan Kulusevski', '2+ Total Shots', 'Shots', 57.3, 'Kulusevski carries strong shot volume from carries and cut-ins.'],
  ['Sweden vs Tunisia', 'Dejan Kulusevski', 'Goal or Assist', 'Assists', 44.9, 'Kulusevski is also Sweden\'s best creative prop profile.'],
  ['Sweden vs Tunisia', 'Alexander Isak', '1+ Shots on Target', 'Shots on Target', 56.5, 'Isak projects as Sweden\'s cleanest shot-on-target angle.'],
  ['Sweden vs Tunisia', 'Aissa Laidouni', 'To Get Carded', 'Cards', 30.1, 'Laidouni is Tunisia\'s most likely midfield card profile.'],

  ['Spain vs Cape Verde', 'Alvaro Morata', 'Anytime Goal', 'Goals', 45.9, 'Spain\'s expected territory gives Morata a strong goal profile if starting.'],
  ['Spain vs Cape Verde', 'Lamine Yamal', 'Goal or Assist', 'Assists', 52.2, 'Yamal projects as Spain\'s best wide creation angle.'],
  ['Spain vs Cape Verde', 'Dani Olmo', '1+ Shots on Target', 'Shots on Target', 49.4, 'Olmo gets central shooting positions against deep blocks.'],
  ['Spain vs Cape Verde', 'Lamine Yamal', '2+ Total Shots', 'Shots', 55.1, 'Yamal rates well for volume even when Spain spread chances around.'],
  ['Spain vs Cape Verde', 'Roberto Lopes', 'To Get Carded', 'Cards', 28.8, 'Cape Verde defenders face repeated wide isolation risk.'],

  ['Belgium vs Egypt', 'Romelu Lukaku', 'Anytime Goal', 'Goals', 42.4, 'Lukaku has the highest Belgium goal share if starting.'],
  ['Belgium vs Egypt', 'Mohamed Salah', '1+ Shots on Target', 'Shots on Target', 55.8, 'Salah is Egypt\'s highest-probability shot-on-target player.'],
  ['Belgium vs Egypt', 'Kevin De Bruyne', 'Goal or Assist', 'Assists', 50.6, 'De Bruyne owns Belgium\'s best assist probability.'],
  ['Belgium vs Egypt', 'Mohamed Salah', '2+ Total Shots', 'Shots', 66.2, 'Salah projects for high shot involvement regardless of match state.'],
  ['Belgium vs Egypt', 'Amadou Onana', 'To Get Carded', 'Cards', 26.5, 'Onana can be exposed defending Egypt counters.'],

  ['Saudi Arabia vs Uruguay', 'Darwin Nunez', 'Anytime Goal', 'Goals', 43.8, 'Nunez is Uruguay\'s highest goal-volume forward.'],
  ['Saudi Arabia vs Uruguay', 'Federico Valverde', '2+ Total Shots', 'Shots', 54.6, 'Valverde projects for shots from distance and second balls.'],
  ['Saudi Arabia vs Uruguay', 'Darwin Nunez', '1+ Shots on Target', 'Shots on Target', 58.7, 'Nunez has the best Uruguay shot-on-target profile.'],
  ['Saudi Arabia vs Uruguay', 'Giorgian de Arrascaeta', 'Goal or Assist', 'Assists', 37.5, 'De Arrascaeta rates as a creator if Uruguay control possession.'],
  ['Saudi Arabia vs Uruguay', 'Rodrigo Bentancur', 'To Get Carded', 'Cards', 27.3, 'Bentancur carries midfield challenge risk in transition.'],

  ['Iran vs New Zealand', 'Mehdi Taremi', 'Anytime Goal', 'Goals', 41.2, 'Taremi is Iran\'s clearest goal profile.'],
  ['Iran vs New Zealand', 'Chris Wood', 'Anytime Goal', 'Goals', 34.1, 'Wood owns New Zealand\'s main set-piece and crossing goal threat.'],
  ['Iran vs New Zealand', 'Sardar Azmoun', '1+ Shots on Target', 'Shots on Target', 49.2, 'Azmoun is a strong secondary Iran shot-on-target option.'],
  ['Iran vs New Zealand', 'Mehdi Taremi', '2+ Total Shots', 'Shots', 59.8, 'Taremi projects for the best shot volume in this game.'],
  ['Iran vs New Zealand', 'Winston Reid', 'To Get Carded', 'Cards', 25.4, 'New Zealand centre-backs can be stressed by Iran forwards.'],

  ['France vs Senegal', 'Kylian Mbappe', 'Anytime Goal', 'Goals', 47.6, 'Mbappe is France\'s highest goal-probability player.'],
  ['France vs Senegal', 'Kylian Mbappe', '2+ Total Shots', 'Shots', 70.4, 'Mbappe projects as the highest shot-volume player on the slate.'],
  ['France vs Senegal', 'Ousmane Dembele', 'Goal or Assist', 'Assists', 43.6, 'Dembele rates well for chance creation from wide areas.'],
  ['France vs Senegal', 'Ismaila Sarr', '1+ Shots on Target', 'Shots on Target', 34.7, 'Sarr is Senegal\'s main transition shot profile.'],
  ['France vs Senegal', 'Idrissa Gueye', 'To Get Carded', 'Cards', 31.2, 'Gueye profiles as Senegal\'s highest midfield card risk.'],

  ['Iraq vs Norway', 'Erling Haaland', 'Anytime Goal', 'Goals', 55.9, 'Haaland is the strongest goal-probability prop in the model.'],
  ['Iraq vs Norway', 'Erling Haaland', '1+ Shots on Target', 'Shots on Target', 70.1, 'Haaland projects as Norway\'s cleanest shot-on-target angle.'],
  ['Iraq vs Norway', 'Martin Odegaard', 'Goal or Assist', 'Assists', 50.3, 'Odegaard carries Norway\'s best creative involvement profile.'],
  ['Iraq vs Norway', 'Aymen Hussein', '1+ Shots on Target', 'Shots on Target', 32.7, 'Hussein is Iraq\'s strongest attacking watch profile.'],
  ['Iraq vs Norway', 'Zidane Iqbal', 'To Get Carded', 'Cards', 25.9, 'Iqbal can be drawn into midfield recovery fouls.'],

  ['Argentina vs Algeria', 'Julian Alvarez', 'Anytime Goal', 'Goals', 40.8, 'Alvarez projects as Argentina\'s safest forward goal profile.'],
  ['Argentina vs Algeria', 'Lautaro Martinez', '1+ Shots on Target', 'Shots on Target', 53.4, 'Lautaro rates strongly for central penalty-box shots.'],
  ['Argentina vs Algeria', 'Lionel Messi', 'Goal or Assist', 'Assists', 55.2, 'Messi is treated as watchlist only until selection is confirmed.'],
  ['Argentina vs Algeria', 'Riyad Mahrez', '2+ Total Shots', 'Shots', 43.8, 'Mahrez carries Algeria\'s strongest shot volume.'],
  ['Argentina vs Algeria', 'Ismael Bennacer', 'To Get Carded', 'Cards', 29.6, 'Bennacer profiles as Algeria\'s most likely tactical-foul card.'],

  ['Austria vs Jordan', 'Marko Arnautovic', 'Anytime Goal', 'Goals', 37.4, 'Arnautovic has Austria\'s strongest central finishing profile.'],
  ['Austria vs Jordan', 'Christoph Baumgartner', '1+ Shots on Target', 'Shots on Target', 46.2, 'Baumgartner gets strong advanced midfield shot positions.'],
  ['Austria vs Jordan', 'Marcel Sabitzer', '2+ Total Shots', 'Shots', 52.6, 'Sabitzer rates well for shots from midfield and set pieces.'],
  ['Austria vs Jordan', 'Mousa Al-Taamari', '1+ Shots on Target', 'Shots on Target', 35.4, 'Al-Taamari is Jordan\'s main attacking outlet.'],
  ['Austria vs Jordan', 'Xaver Schlager', 'To Get Carded', 'Cards', 27.1, 'Schlager carries pressing and recovery-foul card risk.'],

  ['Portugal vs DR Congo', 'Rafael Leao', 'Anytime Goal', 'Goals', 38.3, 'Leao is Portugal\'s most explosive goal profile if starting.'],
  ['Portugal vs DR Congo', 'Bruno Fernandes', 'Goal or Assist', 'Assists', 54.5, 'Bruno has Portugal\'s best chance-creation profile.'],
  ['Portugal vs DR Congo', 'Bruno Fernandes', '2+ Total Shots', 'Shots', 57.7, 'Bruno projects well for shots and set-piece attempts.'],
  ['Portugal vs DR Congo', 'Cedric Bakambu', '1+ Shots on Target', 'Shots on Target', 30.6, 'Bakambu is DR Congo\'s main goal outlet.'],
  ['Portugal vs DR Congo', 'Chancel Mbemba', 'To Get Carded', 'Cards', 26.8, 'Mbemba faces high defensive workload against Portugal attackers.'],

  ['England vs Croatia', 'Harry Kane', 'Anytime Goal', 'Goals', 44.6, 'Kane is England\'s highest goal-probability player.'],
  ['England vs Croatia', 'Jude Bellingham', '1+ Shots on Target', 'Shots on Target', 49.5, 'Bellingham carries strong box-entry and second-phase shot value.'],
  ['England vs Croatia', 'Phil Foden', '2+ Total Shots', 'Shots', 56.9, 'Foden rates well for shot volume from inside-right channels.'],
  ['England vs Croatia', 'Luka Modric', 'Goal or Assist', 'Assists', 28.6, 'Modric remains Croatia\'s key chance-creation profile.'],
  ['England vs Croatia', 'Mateo Kovacic', 'To Get Carded', 'Cards', 27.8, 'Kovacic can be forced into tactical fouls against England runners.'],

  ['Ghana vs Panama', 'Mohammed Kudus', '1+ Shots on Target', 'Shots on Target', 50.8, 'Kudus owns Ghana\'s strongest direct shot profile.'],
  ['Ghana vs Panama', 'Inaki Williams', 'Anytime Goal', 'Goals', 35.7, 'Williams is Ghana\'s leading central goal profile.'],
  ['Ghana vs Panama', 'Mohammed Kudus', 'Goal or Assist', 'Assists', 43.9, 'Kudus is also Ghana\'s best creative involvement angle.'],
  ['Ghana vs Panama', 'Jose Fajardo', '1+ Shots on Target', 'Shots on Target', 28.2, 'Fajardo is Panama\'s main forward target.'],
  ['Ghana vs Panama', 'Adalberto Carrasquilla', 'To Get Carded', 'Cards', 29.1, 'Carrasquilla carries Panama\'s highest midfield card risk.'],

  ['Uzbekistan vs Colombia', 'Luis Diaz', '1+ Shots on Target', 'Shots on Target', 55.5, 'Diaz is Colombia\'s strongest shot-on-target player.'],
  ['Uzbekistan vs Colombia', 'Jhon Duran', 'Anytime Goal', 'Goals', 38.9, 'Duran rates as Colombia\'s most direct goal threat.'],
  ['Uzbekistan vs Colombia', 'James Rodriguez', 'Goal or Assist', 'Assists', 45.3, 'James has Colombia\'s highest set-piece and assist profile.'],
  ['Uzbekistan vs Colombia', 'Jaloliddin Masharipov', '1+ Shots on Target', 'Shots on Target', 30.8, 'Masharipov is Uzbekistan\'s main creative shot profile.'],
  ['Uzbekistan vs Colombia', 'Wilmar Barrios', 'To Get Carded', 'Cards', 28.3, 'Barrios carries Colombia\'s highest ball-winning card risk.'],

  ['Czech Republic vs South Africa', 'Patrik Schick', 'Anytime Goal', 'Goals', 40.5, 'Schick is Czech Republic\'s highest goal share.'],
  ['Czech Republic vs South Africa', 'Adam Hlozek', '1+ Shots on Target', 'Shots on Target', 42.9, 'Hlozek projects as a strong secondary Czech shooter.'],
  ['Czech Republic vs South Africa', 'Tomas Soucek', '2+ Total Shots', 'Shots', 45.8, 'Soucek rates well from set pieces and second balls.'],
  ['Czech Republic vs South Africa', 'Percy Tau', '1+ Shots on Target', 'Shots on Target', 31.5, 'Tau is South Africa\'s main transition shot profile.'],
  ['Czech Republic vs South Africa', 'Tomas Soucek', 'To Get Carded', 'Cards', 23.7, 'Soucek has aerial-duel and midfield challenge card exposure.'],

  ['Switzerland vs Bosnia & Herzegovina', 'Breel Embolo', 'Anytime Goal', 'Goals', 36.6, 'Embolo has Switzerland\'s best central goal profile.'],
  ['Switzerland vs Bosnia & Herzegovina', 'Granit Xhaka', '1+ Shots on Target', 'Shots on Target', 44.3, 'Xhaka projects well if Switzerland control territory.'],
  ['Switzerland vs Bosnia & Herzegovina', 'Xherdan Shaqiri', 'Goal or Assist', 'Assists', 38.8, 'Shaqiri remains watchlist only until role is confirmed.'],
  ['Switzerland vs Bosnia & Herzegovina', 'Edin Dzeko', 'Anytime Goal', 'Goals', 31.9, 'Dzeko is Bosnia\'s strongest penalty-box goal profile.'],
  ['Switzerland vs Bosnia & Herzegovina', 'Sead Kolasinac', 'To Get Carded', 'Cards', 29.2, 'Kolasinac carries high duel and recovery-foul card risk.'],

  ['Canada vs Qatar', 'Jonathan David', 'Anytime Goal', 'Goals', 39.7, 'David is Canada\'s strongest goal-probability player.'],
  ['Canada vs Qatar', 'Jonathan David', '1+ Shots on Target', 'Shots on Target', 52.8, 'David projects as Canada\'s cleanest shot-on-target profile.'],
  ['Canada vs Qatar', 'Alphonso Davies', 'Goal or Assist', 'Assists', 41.7, 'Davies carries Canada\'s strongest wide creation angle.'],
  ['Canada vs Qatar', 'Akram Afif', '1+ Shots on Target', 'Shots on Target', 34.6, 'Afif is Qatar\'s main attacking prop profile.'],
  ['Canada vs Qatar', 'Assim Madibo', 'To Get Carded', 'Cards', 26.9, 'Madibo profiles as Qatar\'s highest midfield card risk.'],

  ['Mexico vs South Korea', 'Santiago Gimenez', 'Anytime Goal', 'Goals', 37.8, 'Gimenez is Mexico\'s strongest goal profile.'],
  ['Mexico vs South Korea', 'Son Heung-min', '1+ Shots on Target', 'Shots on Target', 56.1, 'Son is South Korea\'s best shot-on-target prop.'],
  ['Mexico vs South Korea', 'Lee Kang-in', 'Goal or Assist', 'Assists', 39.6, 'Lee projects as South Korea\'s best creator.'],
  ['Mexico vs South Korea', 'Hirving Lozano', '2+ Total Shots', 'Shots', 48.2, 'Lozano rates well for Mexico shot volume from wide areas.'],
  ['Mexico vs South Korea', 'Edson Alvarez', 'To Get Carded', 'Cards', 31.4, 'Alvarez carries Mexico\'s strongest card profile.']
];

const categoryPriority = {
  Goals: 1,
  Shots: 2,
  'Shots on Target': 3,
  Assists: 4,
  Cards: 5
};

const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const fixturesByName = new Map(dataset.map((fixture) => [fixture.match_name, fixture]));

const props = seedProps
  .filter(([matchName]) => fixturesByName.has(matchName))
  .map(([match_name, player, market, category, probability, model_note]) => {
    const fixture = fixturesByName.get(match_name);
    return {
      match_name,
      kickoff_time_aest: fixture.kickoff_time_aest,
      player,
      market,
      category,
      model_probability: probability,
      model_price: Number((100 / probability).toFixed(2)),
      model_note,
      live_prices: [],
      last_checked: null
    };
  })
  .sort((a, b) => {
    const timeDiff = new Date(`${a.kickoff_time_aest}+10:00`) - new Date(`${b.kickoff_time_aest}+10:00`);
    if (timeDiff !== 0) return timeDiff;
    const categoryDiff = (categoryPriority[a.category] || 99) - (categoryPriority[b.category] || 99);
    if (categoryDiff !== 0) return categoryDiff;
    return b.model_probability - a.model_probability;
  });

await writeFile(PLAYER_PROPS_PATH, `${JSON.stringify(props, null, 2)}\n`);
await writeFile(EMBEDDED_PLAYER_PROPS_PATH, `window.embeddedPlayerProps = ${JSON.stringify(props, null, 2)};\n`);

console.log(JSON.stringify({
  player_props: props.length,
  categories: props.reduce((acc, prop) => {
    acc[prop.category] = (acc[prop.category] || 0) + 1;
    return acc;
  }, {})
}, null, 2));
