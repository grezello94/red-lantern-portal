# Red Lantern Supply Portal

React/Vite supply management app backed by Firebase Firestore.

The workspace is organized around suppliers and their item catalogs in a compact, mobile-first layout. Select quantities, add a note, use the green **Review & send** button to review the exact order message, then open WhatsApp to send it. Hold the quantity buttons to adjust faster, or enter exact quantities directly. Optional supplier phone numbers route the message to the supplier's conversation. Opening WhatsApp does not mark an order as sent or clear its draft.

Use **Explore the demo** on the sign-in screen to try supplier management and ordering with sample data. Demo changes stay in the browser and do not write to Firebase; WhatsApp handoff is disabled in demo mode.

Supplier quantities sync to the existing Firestore `stores/{storeId}/vendors` records. Unsynced edits are backed up locally, and optional order notes are saved per supplier in the browser. Dark and light themes, staff/admin views, and mobile layouts are supported.

In Admin Mode, open **Store settings → Order units** to add labels such as CASE, BOTTLE, or PACK. The original KG, PIECES, and BUNDLE options remain available. Custom units are saved in the store's `itemUnits` field and shared across its suppliers, item dropdowns, and order messages. Staff see the unit assigned by an admin and cannot edit units through the staff interface. Roles currently follow the app's existing store-code/local-storage model; server-enforced roles require Firebase Authentication and corresponding Firestore rules.

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
