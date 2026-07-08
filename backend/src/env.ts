// Centralised env loading for the backend (a plain Node process, not Next.js).
// dotenv only reads `.env` by default, so we explicitly load `.env.local` first
// (matching the Next.js frontends' convention), then fall back to `.env`.
// With an array path, the first file to define a key wins — so `.env.local` takes
// precedence. Paths are resolved relative to the process cwd (the backend dir for
// every npm script: dev, db:*, seed, create-cpo).
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });
