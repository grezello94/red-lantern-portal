# Red Lantern Supply Portal

React/Vite supply management app backed by Firebase Firestore.

## Local Development

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` and set the Firebase values from Firebase Console > Project settings > General > Your apps.

## Production Build

```sh
npm run build
```

## Coolify Deployment

Use the included `Dockerfile`.

Coolify settings:

- Build Pack: Dockerfile
- Dockerfile Location: `/Dockerfile`
- Port: `80`
- Domain: your production domain

Build variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

After the Coolify deployment is live, move your DNS record from Vercel to the Contabo server IP used by Coolify. In Firebase, add the new production domain to the authorized domains list if authentication is enabled later.
