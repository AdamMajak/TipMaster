export interface SoccerLeagueOption {
  id: string;
  label: string;
}

// ESPN soccer league slugs (site.api.espn.com).
// Curated list focused on common competitions; add more as needed.
export const ESPN_SOCCER_LEAGUES: SoccerLeagueOption[] = [
  // England
  { id: 'eng.1', label: 'Premier League (England)' },
  { id: 'eng.2', label: 'Championship (England)' },
  { id: 'eng.3', label: 'League One (England)' },
  { id: 'eng.4', label: 'League Two (England)' },
  { id: 'eng.5', label: 'National League (England)' },
  { id: 'eng.fa', label: 'FA Cup (England)' },
  { id: 'eng.league_cup', label: 'EFL Cup (England)' },

  // Spain
  { id: 'esp.1', label: 'LaLiga (Spain)' },
  { id: 'esp.2', label: 'LaLiga 2 (Spain)' },
  { id: 'esp.copa_del_rey', label: 'Copa del Rey (Spain)' },
  { id: 'esp.super_cup', label: 'Supercopa (Spain)' },

  // Germany
  { id: 'ger.1', label: 'Bundesliga (Germany)' },
  { id: 'ger.2', label: '2. Bundesliga (Germany)' },
  { id: 'ger.dfb_pokal', label: 'DFB Pokal (Germany)' },

  // Italy
  { id: 'ita.1', label: 'Serie A (Italy)' },
  { id: 'ita.2', label: 'Serie B (Italy)' },
  { id: 'ita.coppa_italia', label: 'Coppa Italia (Italy)' },
  { id: 'ita.super_cup', label: 'Supercoppa (Italy)' },

  // France
  { id: 'fra.1', label: 'Ligue 1 (France)' },
  { id: 'fra.2', label: 'Ligue 2 (France)' },
  { id: 'fra.coupe_de_france', label: 'Coupe de France (France)' },
  { id: 'fra.super_cup', label: 'Trophee des Champions (France)' },

  // Other Europe
  { id: 'por.1', label: 'Primeira Liga (Portugal)' },
  { id: 'por.taca.portugal', label: 'Taca de Portugal (Portugal)' },
  { id: 'ned.1', label: 'Eredivisie (Netherlands)' },
  { id: 'ned.cup', label: 'KNVB Beker (Netherlands)' },
  { id: 'bel.1', label: 'Pro League (Belgium)' },
  { id: 'aut.1', label: 'Bundesliga (Austria)' },
  { id: 'tur.1', label: 'Super Lig (Turkey)' },
  { id: 'gre.1', label: 'Super League (Greece)' },
  { id: 'den.1', label: 'Superliga (Denmark)' },
  { id: 'nor.1', label: 'Eliteserien (Norway)' },
  { id: 'swe.1', label: 'Allsvenskan (Sweden)' },
  { id: 'sco.1', label: 'Premiership (Scotland)' },
  { id: 'sco.cis', label: 'League Cup (Scotland)' },
  { id: 'sco.tennents', label: 'Scottish Cup' },

  // USA / CONCACAF
  { id: 'usa.1', label: 'MLS (USA)' },
  { id: 'usa.open', label: 'US Open Cup' },
  { id: 'concacaf.champions', label: 'Concacaf Champions Cup' },
  { id: 'concacaf.gold', label: 'Concacaf Gold Cup' },
  { id: 'concacaf.nations.league', label: 'Concacaf Nations League' },

  // UEFA
  { id: 'uefa.champions', label: 'UEFA Champions League' },
  { id: 'uefa.champions_qual', label: 'UCL Qualifying' },
  { id: 'uefa.europa', label: 'UEFA Europa League' },
  { id: 'uefa.europa_qual', label: 'UEL Qualifying' },
  { id: 'uefa.europa.conf', label: 'UEFA Conference League' },
  { id: 'uefa.europa.conf_qual', label: 'UECL Qualifying' },
  { id: 'uefa.super_cup', label: 'UEFA Super Cup' },
  { id: 'uefa.euro', label: 'UEFA European Championship' },
  { id: 'uefa.euroq', label: 'UEFA Euro Qualifying' },
  { id: 'uefa.nations', label: 'UEFA Nations League' },

  // FIFA / International
  { id: 'fifa.world', label: 'FIFA World Cup' },
  { id: 'fifa.friendly', label: 'International Friendly' },
  { id: 'fifa.worldq', label: 'World Cup Qualifying' },
  { id: 'fifa.worldq.uefa', label: 'World Cup Qualifying (UEFA)' },
  { id: 'fifa.worldq.concacaf', label: 'World Cup Qualifying (CONCACAF)' },
  { id: 'fifa.worldq.conmebol', label: 'World Cup Qualifying (CONMEBOL)' },
];

