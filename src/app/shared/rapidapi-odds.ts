import { rapidApiKey } from './rapidapi.config.local';

export const RAPIDAPI_ODDS_HOST = 'betfair-orbitexch-data.p.rapidapi.com';
export const RAPIDAPI_ODDS_BASE_URL = 'https://betfair-orbitexch-data.p.rapidapi.com';
export const RAPIDAPI_ODDS_KEY = rapidApiKey;

export const SPORT_KEYS = {
  soccer: 'soccer',
  football: 'soccer',
  hockey: 'hockey',
  tennis: 'tennis',
  basketball: 'basketball',
  baseball: 'baseball',
  mma: 'mma',
} as const;
