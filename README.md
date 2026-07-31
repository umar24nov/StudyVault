# 📚 StudyVault

**Built by students, for students across India.**

A study resource vault — upload, browse, bookmark, and review previous year papers, notes, and guides. Built with Node.js, Express, Firebase Firestore, and Cloudinary.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Status](https://img.shields.io/badge/status-live-brightgreen)

## ✨ Features

- **Browse & search** — server-side search with debounce, filters by course/type, 12 papers per page with Load More + infinite scroll
- **Upload resources** — papers, notes, PYQs, booklets (PDFs, images, docs) — new uploads are moderated before going live
- **Bookmarks** — save papers for quick access (requires sign-in)
- **Reviews & ratings** — star ratings and reviews, top 3 highest-rated shown on the homepage (requires sign-in)
- **Admin panel** — manage papers (edit title, type, course, university, year), moderate uploads, view reviews
- **Email notifications** — for new uploads, reviews, and contact messages (via Resend)
- **Security** — Firestore rules lock down client writes, rate limiting, input sanitization, XSS-safe rendering, approved-only serving
- **Responsive design** — works on mobile

## 🛠 Tech Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Frontend  | Vanilla HTML/CSS/JS (no framework) |
| Backend   | Node.js + Express                  |
| Database  | Firebase Firestore                 |
| Auth      | Firebase Auth (Google sign-in)     |
| Storage   | Cloudinary (files & images)        |
| Email     | Resend                             |
| Hosting   | Vercel (frontend) + Render (API)   |

## ✅ Prerequisites

- Node.js v18+
- [Firebase account](https://console.firebase.google.com/)
- [Cloudinary account](https://cloudinary.com/)

## 🚀 Local Setup

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
3. Open `frontend/index.html` and `frontend/admin/index.html`, find the `firebaseConfig` object, and replace the placeholder values with your real ones

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

# Resend (optional — for email notifications)
# Sign up at https://resend.com. Sends emails for contact form, new uploads, and new reviews.
RESEND_API_KEY=re_xxxxxxxxxxxx
```

> **Important for `FIREBASE_PRIVATE_KEY`:** Wrap in double quotes and keep `\n` as literal characters. The server normalizes them automatically.

### 6. Run

```bash
node backend/server.js
# or: npm start / npm run dev
```

Open **http://localhost:3000** in your browser.

## 🗄 Firestore Rules

Deploy the locked-down rules before going to production:

```bash
firebase deploy --only firestore:rules
```

All writes go through the API (Firebase Admin SDK), so clients can only read approved data and manage their own bookmarks/profile.

## 🔍 Firestore Indexes

After your app is running, create these composite indexes in **Firebase Console → Firestore → Indexes**:

| Collection  | Fields                         |
| ----------- | ------------------------------ |
| `papers`    | `status` Asc, `createdAt` Desc |
| `bookmarks` | `userId` Asc, `createdAt` Desc |
| `bookmarks` | `userId` Asc, `paperId` Asc    |

Without these indexes, queries will fail with a 500 error.

## 🛡 Making an Admin

1. In Firebase Console → Firestore, create a collection called `admins`
2. Create a document with the user's Firebase **UID** as the document ID
3. Add a field `role: "admin"`
4. That user will now see the **Admin** link in the navbar and can access `/admin/`

## 🧪 Tests

```bash
npm test
```

The test suite validates all API endpoints (papers, search, downloads, bookmarks, reviews, feedback, contact, admin auth) — 14 tests passing. A GitHub Actions CI workflow runs tests and syntax checks on Node 18/20/22.

## 🌍 Deployment

### Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set **Root Directory** to `frontend`
3. Deploy — no build step needed for static files

### API Server (Render)

1. Create a **Web Service** on Render, connected to your GitHub repo
2. **Build Command:** (leave empty)
3. **Start Command:** `node backend/server.js`
4. **Add environment variables** from your `.env` file
5. **Required:** Add `NODE_OPTIONS=--openssl-legacy-provider` (needed for OpenSSL 3.x / Node 22 compatibility with `firebase-admin`)
6. Set `app.set('trust proxy', 1)` — already in `server.js` (needed behind Render's reverse proxy)

## 📁 Project Structure

```
StudyVault/
├── backend/                # All server-side code
│   ├── server.js           # Express server (entry point)
│   ├── firestore.rules     # Firestore security rules
│   ├── config/
│   │   ├── env.js          # Environment variable validation (Zod)
│   │   ├── firebase.js     # Firebase Admin SDK init
│   │   ├── cloudinary.js   # Cloudinary init
│   │   └── email.js        # Resend email helper
│   ├── middleware/
│   │   ├── auth.js         # Auth middleware (verifyToken, requireAdminAuth)
│   │   ├── rateLimit.js    # Rate limiters
│   │   ├── upload.js       # Multer file upload config
│   │   ├── sanitize.js     # Input sanitization (stripDangerous, validation)
│   │   └── errorHandler.js # Global error handler
│   ├── routes/
│   │   ├── papers.js       # Paper browse/search/download
│   │   ├── bookmarks.js    # Bookmark toggle / list
│   │   ├── reviews.js      # Ratings & reviews (requires auth)
│   │   ├── feedback.js     # Feedback & contact form submissions
│   │   ├── admin.js        # Admin-only endpoints (incl. paper editing)
│   │   └── users.js        # User profile data
│   ├── scripts/
│   │   └── migrate-status.js # Legacy record migration
│   ├── utils/
│   └── __tests__/
│       └── api.test.js     # API integration tests (14 tests)
├── frontend/               # All client-side code (Vercel root = frontend)
│   ├── index.html          # Main frontend
│   ├── admin/              # Admin panel (served at /admin/)
│   │   ├── index.html
│   │   ├── admin.js
│   │   └── admin.css
│   ├── css/
│   │   └── style.css       # All frontend styles
│   ├── js/
│   │   └── app.js          # Frontend logic
│   ├── assets/
│   │   ├── logo.svg        # Brand logo
│   │   └── favicon.ico     # Browser favicon
│   ├── robots.txt
│   └── sitemap.xml
├── .github/workflows/
│   └── ci.yml              # CI — syntax checks + tests on Node 18/20/22
├── firebase.json           # Points firestore rules → backend/firestore.rules
├── .env                    # Local env vars (not committed)
├── package.json
├── LICENSE
└── .gitignore
```

## 📧 Email Notifications

When `RESEND_API_KEY` is set, email notifications are sent to `studyvaultapp@gmail.com` for:
- **New uploads** — title, course, type, uploader name
- **New reviews** — name, star rating, review text
- **Contact form** — name, email, message

Without the key, notifications are silently skipped (data is still saved to Firestore).

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

## 📄 License

[MIT](LICENSE) © Mohammad Umar
