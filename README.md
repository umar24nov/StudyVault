# 📚 StudyVault

> A self-hosted study resource vault powered by Node.js, Firebase, and Cloudinary.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1 — Clone the Repository](#step-1--clone-the-repository)
- [Step 2 — Install Dependencies](#step-2--install-dependencies)
- [Step 3 — Firebase Setup](#step-3--firebase-setup)
- [Step 4 — Cloudinary Setup](#step-4--cloudinary-setup)
- [Step 5 — Create the .env File](#step-5--create-the-env-file)
- [Step 6 — Run the App](#step-6--run-the-app)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

StudyVault is an open-source study resource management platform. It allows users to upload, organize, and access study materials with Firebase as the backend database and Cloudinary for file/media storage.

---

## Prerequisites

Before you begin, make sure you have the following installed and ready:

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | v18 or higher | Download from nodejs.org |
| [Git](https://git-scm.com/) | Any recent version | For cloning the repo |
| [Firebase Account](https://console.firebase.google.com/) | Free tier works | For database |
| [Cloudinary Account](https://cloudinary.com/) | Free tier (25 GB) | For file storage |

To verify your Node.js and Git versions, run:

```bash
node -v
git --version
```

---

## Step 1 — Clone the Repository

Open your terminal and run the following commands:

```bash
git clone https://github.com/umar24nov/StudyVault.git
cd StudyVault
```

This will create a local copy of the project and navigate you into the project folder.

---

## Step 2 — Install Dependencies

Inside the project folder, install all required Node.js packages:

```bash
npm install
```

This reads the `package.json` file and downloads all necessary dependencies into a `node_modules/` folder. This may take a minute or two.

---

## Step 3 — Firebase Setup

StudyVault uses **Firebase Firestore** as its database. Follow these steps carefully:

### 3.1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **"Add Project"**
3. Enter a project name (e.g., `studyvault`) and follow the setup wizard
4. Once created, click **"Continue"** to reach the project dashboard

### 3.2 — Enable Firestore Database

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (you can add security rules later)
4. Select a Cloud Firestore location closest to you and click **"Enable"**

### 3.3 — Generate a Service Account Key

1. In the Firebase console, click the **gear icon ⚙️** next to "Project Overview"
2. Select **"Project Settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"**
5. A `.json` file will be downloaded — **keep this file secure and do not commit it to Git**

### 3.4 — Copy Firebase Credentials

Open the downloaded `.json` file and note the following fields — you'll need them for your `.env` file:

- `project_id` → goes into `FIREBASE_PROJECT_ID`
- `client_email` → goes into `FIREBASE_CLIENT_EMAIL`
- `private_key` → goes into `FIREBASE_PRIVATE_KEY`

> **Important:** The `private_key` value includes `\n` characters. When pasting into your `.env` file, wrap the entire value in double quotes, e.g.:
> ```
> FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
> ```

---

## Step 4 — Cloudinary Setup

StudyVault uses **Cloudinary** to store and serve uploaded files and media.

### 4.1 — Create a Cloudinary Account

1. Go to [cloudinary.com](https://cloudinary.com/) and sign up for a free account
2. Verify your email address to activate the account

### 4.2 — Get Your Cloudinary Credentials

1. Log in and go to your **Cloudinary Dashboard**
2. You will see your credentials displayed at the top:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. Copy all three values — you'll need them for your `.env` file

---

## Step 5 — Create the .env File

In the root of the project folder, create a new file called `.env`:

```bash
# On macOS/Linux
touch .env

# On Windows (Command Prompt)
type nul > .env

# Or simply create it manually in your text editor
```

Open `.env` and paste in the following, replacing the placeholder values with your actual credentials:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

> **Security reminder:** The `.env` file contains sensitive credentials. Make sure it is listed in your `.gitignore` file and **never** committed to a public repository.

To confirm `.env` is ignored by Git, check `.gitignore` contains:
```
.env
```

---

## Step 6 — Run the App

Once your `.env` file is configured, start the server:

```bash
node server.js
```

You should see output in the terminal indicating the server has started. Open your browser and navigate to:

```
http://localhost:3000
```

StudyVault is now running locally. 🎉

---

## Project Structure

```
iStudyVault/
├── server.js           # Main entry point
├── package.json        # Dependencies and scripts
├── .env                # Your local environment variables (not committed)
├── .gitignore          # Files excluded from Git
├── public/             # Static frontend assets
│   ├── index.html
│   ├── style.css
│   └── script.js
└── routes/             # Server-side route handlers
```

---

## Troubleshooting

### `Error: Cannot find module '...'`
Run `npm install` again to make sure all dependencies are installed.

### Firebase authentication errors
- Double-check that `FIREBASE_PRIVATE_KEY` is wrapped in double quotes in your `.env` file
- Make sure Firestore is enabled in your Firebase project (not just Realtime Database)
- Verify the `client_email` matches exactly what's in the downloaded service account `.json`

### Cloudinary upload failures
- Confirm your `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are correct
- Check that your Cloudinary account is active and not over the free tier storage limit

### Port already in use
If port 3000 is taken, you can run the app on a different port:
```bash
PORT=4000 node server.js
```
Then visit `http://localhost:4000`.

### `.env` file not being read
Make sure the `.env` file is in the **root** of the project folder (same level as `server.js`), not inside a subfolder.

---

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit: `git commit -m "Add your feature"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a Pull Request on GitHub

Please make sure your code is clean and well-commented before submitting.

---

> ⭐ If StudyVault helps you, consider giving it a star on [GitHub](https://github.com/umar24nov/StudyVault) or mentioning it when you use it. Your support keeps the project alive!
