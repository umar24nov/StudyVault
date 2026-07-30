# StudyVault

A self-hosted study resource vault — upload, browse, bookmark, and review study materials. Built with Node.js, Firebase Firestore, and Cloudinary.

## Features

- Upload & browse study papers (PDFs, images, docs)
- Bookmark papers for quick access
- Star ratings & reviews
- Admin panel for managing papers
- Responsive design (works on mobile)

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Backend  | Node.js + Express                 |
| Database | Firebase Firestore                |
| Auth     | Firebase Auth (Google sign-in)    |
| Storage  | Cloudinary (files & images)       |
| Hosting  | Vercel (frontend) + Render (API)  |

## Prerequisites

- Node.js v18+
- [Firebase account](https://console.firebase.google.com/) (free tier)
- [Cloudinary account](https://cloudinary.com/) (free — 25 GB storage)

## Local Setup

### 1. Clone & Install

```bash
git clone https://github.com/umar24nov/StudyVault.git
cd StudyVault
npm install
```

### 2. Firebase Setup (Server-side)

1. Go to [Firebase Console](https://console.firebase.google.com/) → create a project
2. **Build → Firestore Database** → Create database (start in test mode)
3. **Project Settings → Service accounts** → Generate new private key
4. Download the JSON file — you'll need `project_id`, `client_email`, `private_key`

### 3. Firebase Setup (Web — client-side)

1. **Project Settings → General → Your apps** → Add web app
2. Copy the `firebaseConfig` object — you'll need `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`
3. Open `public/index.html` and `public/admin.html`, find the `firebaseConfig` object, and replace the placeholder values with your real ones

### 4. Cloudinary Setup

1. Sign up at [cloudinary.com](https://cloudinary.com/)
2. From Dashboard, copy: **Cloud Name**, **API Key**, **API Secret**

### 5. Environment File

Create `.env` in the project root:

```env
# Server-side Firebase (from service account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Resend (optional — for contact form email notifications)
# Sign up at https://resend.com, verify your domain, and paste your API key
RESEND_API_KEY=re_xxxxxxxxxxxx
```

> **Important for `FIREBASE_PRIVATE_KEY`:** Wrap in double quotes and keep `\n` as literal characters. The server normalizes them automatically.

### 6. Run

```bash
node server.js
```

Open **http://localhost:3000** in your browser.

## Firestore Indexes

After your app is running, create these composite indexes in **Firebase Console → Firestore → Indexes**:

| Collection   | Fields                                         |
| ------------ | ---------------------------------------------- |
| `papers`     | `status` Asc, `createdAt` Desc                 |
| `bookmarks`  | `userId` Asc, `createdAt` Desc                 |
| `bookmarks`  | `userId` Asc, `paperId` Asc                    |

Without these indexes, queries will fail with a 500 error.

## Making an Admin

1. In Firebase Console → Firestore, create a collection called `admins`
2. Create a document with the user's Firebase **UID** as the document ID
3. Add a field `role: "admin"`
4. That user will now see the **Admin** link in the navbar and can access `/admin.html`

## Tests

```bash
node --test __tests__/api.test.js
```

The test suite validates all API endpoints (upload, search, bookmarks, reviews, admin auth).

## Deployment

### Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set **Root Directory** to `public`
3. Deploy — no build step needed for static files

### API Server (Render)

1. Create a **Web Service** on Render, connected to your GitHub repo
2. **Build Command:** (leave empty)
3. **Start Command:** `node server.js`
4. **Add environment variables** from your `.env` file
5. **Required:** Add `NODE_OPTIONS=--openssl-legacy-provider` (needed for OpenSSL 3.x / Node 22 compatibility with `firebase-admin`)
6. Set `app.set('trust proxy', 1)` — already in `server.js` (needed behind Render's reverse proxy)

## Project Structure

```
StudyVault/
├── server.js              # Express server (entry point)
├── config/
│   └── firebase.js        # Firebase Admin SDK init
├── middleware/
│   └── auth.js            # Auth middleware (requireAdminAuth)
├── routes/
│   ├── papers.js          # Paper CRUD
│   ├── bookmarks.js       # Bookmark toggle / list
│   ├── reviews.js         # Ratings & reviews
│   ├── feedback.js        # Contact form submissions
│   └── admin.js           # Admin-only endpoints
├── __tests__/
│   └── api.test.js        # API integration tests
├── public/
│   ├── index.html         # Main frontend
│   ├── admin.html         # Admin panel
│   ├── style.css          # All styles
│   └── app.js             # Frontend logic
├── .env                   # Local env vars (not committed)
├── package.json
└── .gitignore
```

## Contact / Feedback

Contact form submissions are saved to Firestore (`contacts` collection). There is no email notification — check Firestore manually or add an SMTP service (SendGrid, Resend, etc.) to `routes/feedback.js`.

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

## License

This project is open source and free for everyone.
