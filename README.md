# TipMaster

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Firebase Auth setup (required for login/register)

This repo expects a local Firebase web config file that is gitignored:

1. Copy `src/app/shared/firebase.config.local.example.ts` to `src/app/shared/firebase.config.local.ts`.
2. Fill in `apiKey`, `authDomain`, `projectId`, `appId` from your Firebase Console → Project settings → Your apps → Web app config.
3. In Firebase Console → Authentication → Sign-in method, enable **Email/Password**.

## Odds API key setup (required for real odds)

This repo expects keys in `src/app/shared/rapidapi.config.local.ts`:

1. Copy `src/app/shared/rapidapi.config.local.example.ts` to `src/app/shared/rapidapi.config.local.ts`.
2. Put your The Odds API key into `oddsApiKey` (used by real odds widgets).
3. (Optional) Put your RapidAPI key into `rapidApiKey` (used by Bet365 widgets if you use them).

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Match detail (ESPN summary)

ESPN `summary?event=...` is often blocked by CORS in the browser. Locally we use `proxy.conf.json` to proxy `/espn -> https://site.api.espn.com`.

On Firebase Hosting (static-only / Spark plan), match detail falls back to a **basic** view built from the public scoreboard data if the `summary` request is blocked.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
