# WishDrop — Setup Guide

## Project Structure
```
wishdrop/
├── backend/
│   ├── server.js              ← Express server (all secrets here)
│   ├── package.json
│   ├── .env                   ← Your secret keys (NEVER commit this)
│   ├── serviceAccountKey.json ← Firebase Admin key (NEVER commit this)
│   └── firestore.rules        ← Deploy to Firebase
│
└── frontend/
    ├── js/
    │   └── api.js             ← All API calls + Firebase public config
    └── pages/
        ├── login.html         ← Google sign in
        ├── dashboard.html     ← BF's wish manager
        ├── edit.html          ← Wish creation/editing form
        ├── view.html          ← GF's share page
        ├── template-carousel-iframe.html  ← Template picker
        ├── wishdrop-template.html         ← Rose Petal
        ├── wishdrop-template-2.html       ← Midnight
        └── wishdrop-template-3.html       ← Pastel Dream
```

---

## Step 1 — Firebase Setup

1. Go to https://console.firebase.google.com
2. Create a new project called "wishdrop"
3. Enable **Google Authentication**:
   - Authentication → Sign-in method → Google → Enable
4. Create **Firestore Database**:
   - Firestore Database → Create database → Start in test mode
5. Get **Firebase public config**:
   - Project Settings → Your apps → Add web app
   - Copy the firebaseConfig object into `frontend/js/api.js`
6. Get **Firebase Admin SDK key**:
   - Project Settings → Service accounts → Generate new private key
   - Save as `backend/serviceAccountKey.json`
   - **NEVER commit this file to Git**

---

## Step 2 — Razorpay Setup

1. Sign up at https://razorpay.com
2. Dashboard → Settings → API Keys → Generate Key
3. Copy Key ID and Key Secret into `backend/.env`

---

## Step 3 — Cloudinary Setup

1. Sign up at https://cloudinary.com (free tier)
2. Dashboard → API Keys
3. Copy Cloud Name, API Key, API Secret into `backend/.env`

---

## Step 4 — Backend Setup

```bash
cd backend
npm install
```

Fill in `backend/.env`:
```
PORT=4000
FRONTEND_URL=http://localhost:5500
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
FIREBASE_DATABASE_URL=https://wishdrop-xxxxx.firebaseio.com
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
```

Start backend:
```bash
npm run dev    # development (with nodemon)
npm start      # production
```

---

## Step 5 — Frontend Setup

Update `frontend/js/api.js` with your Firebase public config:
```js
const firebaseConfig = {
  apiKey:            "YOUR_KEY",
  authDomain:        "wishdrop-xxx.firebaseapp.com",
  projectId:         "wishdrop-xxx",
  storageBucket:     "wishdrop-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc"
};
```

Serve frontend with Live Server (VS Code extension) on port 5500.

---

## Step 6 — Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

---

## Security Summary

| What | Where | Safe? |
|---|---|---|
| Firebase public config | frontend/js/api.js | ✅ Safe to expose |
| Firebase Admin key | backend/serviceAccountKey.json | 🔴 Server only |
| Razorpay Key ID | Sent from backend to frontend | ✅ Safe (public key) |
| Razorpay Key Secret | backend/.env | 🔴 Server only |
| Cloudinary API Secret | backend/.env | 🔴 Server only |
| Payment verification | Backend only | ✅ Cannot be faked |

---

## User Flow

```
1. BF visits wishdrop.in
2. Clicks "Create a Wish" → Google Login
3. Pays ₹10 via Razorpay (verified on backend)
4. Picks template → fills in details → uploads photos
5. Clicks Save → wish stored in Firestore
6. Gets a share link → sends to GF
7. GF opens link → backend checks expiry → serves wish data
8. GF sees the beautiful page
9. GF clicks "Download PDF" → pays ₹10 → PDF generated
10. Link auto-expires after 2 days (lazy deletion on open)
```

---

## Firestore Data Structure

```
users/{uid}
  uid: string
  email: string
  displayName: string
  photoURL: string
  totalWishes: number
  createdAt: timestamp

wishes/{wishId}
  uid: string              ← bf's uid
  bfName: string
  bfEmail: string
  templateNo: number       ← 1, 2, or 3
  templateName: string
  occasion: string         ← birthday | anniversary | valentines | random
  gfName: string
  gfAge: number
  gfDob: string
  wishMessage: string
  memories: [{emoji, date, title, body}]
  reasons: [string]
  tags: [string]
  photos: [cloudinary_url]
  photoCaptions: [string]
  sectionTitles: {wish, memories, reasons}
  closingTitle: string
  closingSubtitle: string
  shareToken: string       ← random hex, used in share URL
  shareUrl: string
  createdAt: timestamp
  expiresAt: timestamp     ← createdAt + 2 days
  paid: boolean            ← ₹10 creation paid
  pdfPaid: boolean         ← ₹10 PDF download paid
  pdfPaymentId: string
  isExpired: boolean
```

---

## Deployment

**Backend → Render.com:**
1. Push backend folder to GitHub
2. New Web Service on Render → connect repo
3. Add all .env variables in Render dashboard
4. Upload serviceAccountKey.json as a secret file

**Frontend → Vercel:**
1. Push frontend folder to GitHub
2. New project on Vercel → connect repo
3. Update `API_BASE` in api.js to your Render URL

---

## .gitignore
```
backend/.env
backend/serviceAccountKey.json
backend/node_modules/
```
