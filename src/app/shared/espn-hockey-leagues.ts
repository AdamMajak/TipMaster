export interface HockeyLeagueOption {
  id: string;
  label: string;
}

// ESPN hockey league slugs (site.api.espn.com).
export const ESPN_HOCKEY_LEAGUES: HockeyLeagueOption[] = [
  { id: 'nhl', label: 'NHL' },
  { id: 'mens-college-hockey', label: "NCAA Men's Ice Hockey" },
  { id: 'womens-college-hockey', label: "NCAA Women's Hockey" },
  { id: 'hockey-world-cup', label: 'World Cup of Hockey' },
  { id: 'olympics-mens-ice-hockey', label: "Olympics Men's Ice Hockey" },
  { id: 'olympics-womens-ice-hockey', label: "Olympics Women's Ice Hockey" },
];

