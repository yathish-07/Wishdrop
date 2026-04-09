const express    = require('express');
const cors       = require('cors');
const Razorpay   = require('razorpay');
const crypto     = require('crypto');
const admin      = require('firebase-admin');
const path       = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:4000'
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  }
}));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── FIREBASE ADMIN INIT ──
// Firebase service account comes from env in production, local file in development
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// ── RAZORPAY INIT ──
// Secret key stays on server ONLY
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ────────────────────────────────────────────
// MIDDLEWARE — verify Firebase ID token
// All protected routes call this first
// ────────────────────────────────────────────
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ────────────────────────────────────────────
// USER ROUTES
// ────────────────────────────────────────────

// POST /api/users/sync
// Called after Google login — creates user doc if first time
app.post('/api/users/sync', verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const email = req.user.email || null;
    const displayName = req.user.name || req.user.displayName || null;
    const photoURL = req.user.picture || req.user.photoURL || null;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      await userRef.set({
        uid,
        email,
        displayName,
        photoURL,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalWishes: 0
      });
    } else {
      const updates = {};
      if (email !== null) updates.email = email;
      if (displayName !== null) updates.displayName = displayName;
      if (photoURL !== null) updates.photoURL = photoURL;
      if (Object.keys(updates).length) {
        await userRef.set(updates, { merge: true });
      }
    }

    const freshSnap = await userRef.get();
    const userData = freshSnap.exists ? freshSnap.data() : { uid, email, displayName, photoURL, totalWishes: 0 };
    res.json({ success: true, user: userData });
  } catch (err) {
    console.error('User sync error:', err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// GET /api/users/me
// Get current user profile + all their wishes
app.get('/api/users/me', verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const wishesSnap = await db.collection('wishes')
      .where('uid', '==', uid)
      .get();

    const wishes = wishesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aMs = a.createdAt?.toDate?.()?.getTime?.() || new Date(a.createdAt || 0).getTime() || 0;
        const bMs = b.createdAt?.toDate?.()?.getTime?.() || new Date(b.createdAt || 0).getTime() || 0;
        return bMs - aMs;
      });

    res.json({ user: userSnap.data(), wishes });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ────────────────────────────────────────────
// PAYMENT ROUTES
// ────────────────────────────────────────────

// POST /api/payment/create-order
// Creates a Razorpay order — ₹10 to create wish OR ₹10 for PDF
app.post('/api/payment/create-order', verifyToken, async (req, res) => {
  try {
    const { type, wishId } = req.body;
    // type: 'create_wish' | 'download_pdf'

    const amount = 1000; // ₹10 in paise

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt:  `${type}_${req.user.uid}_${Date.now()}`,
      notes: {
        uid:    req.user.uid,
        type,
        wishId: wishId || ''
      }
    });

    res.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  order.currency,
      keyId:     process.env.RAZORPAY_KEY_ID // Only key_id (public) is sent to frontend
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// POST /api/payment/verify
// Verifies Razorpay signature — NEVER trust frontend payment status
app.post('/api/payment/verify', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, type, wishId } = req.body;

    // Verify signature using secret key (server only)
    const body      = razorpay_order_id + '|' + razorpay_payment_id;
    const expected  = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Payment is genuine — update DB
    if (type === 'create_wish') {
      // Mark user as paid — they can now proceed to create
      await db.collection('users').doc(req.user.uid).update({
        pendingWishPayment: true,
        lastPaymentId: razorpay_payment_id
      });
    } else if (type === 'download_pdf' && wishId) {
      // Mark this specific wish as PDF-paid
      await db.collection('wishes').doc(wishId).update({
        pdfPaid:          true,
        pdfPaymentId:     razorpay_payment_id,
        pdfPaidAt:        admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Payment verification error' });
  }
});

// ────────────────────────────────────────────
// WISH ROUTES
// ────────────────────────────────────────────

// POST /api/wishes
// Create a new wish — only if user has paid
app.post('/api/wishes', verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;

    // Check if user paid for this wish
    // In development, bypass payment check by setting DEV_MODE=true in .env
    const userSnap = await db.collection('users').doc(uid).get();
    const userData  = userSnap.data();

    const isDev = process.env.DEV_MODE === 'true';
    if (!isDev && !userData.pendingWishPayment) {
      return res.status(403).json({ error: 'Payment required to create a wish' });
    }

    const {
      // Wish details
      templateNo,
      templateName,
      occasion,

      // Girlfriend info
      gfName,
      gfAge,
      gfDob,

      // Wish content
      wishes,
      wishMessage,
      memories,
      reasons,
      tags,

      // Photo captions
      photos,
      photoCaptions,

      // Closing
      closingTitle,
      closingSubtitle,

      // Extras
      sectionTitles,
    } = req.body;

    // Template file map
    const templateFiles = {
      1: 'wishdrop-template.html',
      2: 'wishdrop-template-2.html',
      3: 'wishdrop-template-3.html'
    };
    const templateFile = templateFiles[templateNo] || 'wishdrop-template.html';

    // Generate unique share token
    const shareToken = crypto.randomBytes(16).toString('hex');

    // Expiry = 2 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 2);

    // Share URL points directly to the template with token
    // GF opens this → template loads in read-only mode → fetches data from backend
    const shareUrl = `${process.env.FRONTEND_URL}/view.html?token=${shareToken}`;

    const wishData = {
      // Owner
      uid,
      bfName:       userData.displayName,
      bfEmail:      userData.email,

      // Template
      templateNo,
      templateName,
      templateFile,
      occasion:     occasion || 'birthday',

      // Girlfriend
      gfName,
      gfAge:        gfAge || null,
      gfDob:        gfDob || null,

      // Wish content
      wishes:        wishes        || '',
      wishMessage:   wishMessage   || '',
      memories:      memories      || [],
      reasons:       reasons       || [],
      tags:          tags          || [],
      photos:        photos        || [],
      photoCaptions: photoCaptions || [],
      sectionTitles: sectionTitles || {},
      closingTitle:    closingTitle    || `Happy Birthday, ${gfName}`,
      closingSubtitle: closingSubtitle || 'This page was made just for you.',

      // Meta
      shareToken,
      shareUrl,
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      expiresAt:  admin.firestore.Timestamp.fromDate(expiresAt),
      paid:       true,
      pdfPaid:    false,
      isExpired:  false
    };

    // Save wish
    const wishRef  = await db.collection('wishes').add(wishData);

    // Update user — clear pending payment, increment count
    await db.collection('users').doc(uid).update({
      pendingWishPayment: false,
      totalWishes: admin.firestore.FieldValue.increment(1),
      lastPaymentId: admin.firestore.FieldValue.delete()
    });

    res.json({
      success:    true,
      wishId:     wishRef.id,
      shareToken,
      shareUrl:   wishData.shareUrl
    });
  } catch (err) {
    console.error('Create wish error:', err);
    res.status(500).json({ error: 'Failed to create wish' });
  }
});

// GET /api/wishes/:wishId
// Get a specific wish (bf's dashboard view)
app.get('/api/wishes/:wishId', verifyToken, async (req, res) => {
  try {
    const wishSnap = await db.collection('wishes').doc(req.params.wishId).get();
    if (!wishSnap.exists) return res.status(404).json({ error: 'Wish not found' });

    const wish = wishSnap.data();
    if (wish.uid !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    res.json({ wish: { id: wishSnap.id, ...wish } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get wish' });
  }
});

// PUT /api/wishes/:wishId
// Update wish content (bf editing)
app.put('/api/wishes/:wishId', verifyToken, async (req, res) => {
  try {
    const wishRef  = db.collection('wishes').doc(req.params.wishId);
    const wishSnap = await wishRef.get();

    if (!wishSnap.exists) return res.status(404).json({ error: 'Not found' });
    if (wishSnap.data().uid !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    // Check not expired
    const wish = wishSnap.data();
    if (wish.expiresAt.toDate() < new Date()) {
      return res.status(400).json({ error: 'Wish has expired' });
    }

    const allowed = [
      'gfName','gfAge','gfDob','occasion',
      'wishes','wishMessage','memories','reasons','tags',
      'photoCaptions','sectionTitles','closingTitle','closingSubtitle',
      'photos','templateNo','templateName'
    ];

    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await wishRef.update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update wish' });
  }
});

// DELETE /api/wishes/:wishId
app.delete('/api/wishes/:wishId', verifyToken, async (req, res) => {
  try {
    const wishRef  = db.collection('wishes').doc(req.params.wishId);
    const wishSnap = await wishRef.get();

    if (!wishSnap.exists) return res.status(404).json({ error: 'Not found' });
    if (wishSnap.data().uid !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    await wishRef.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete wish' });
  }
});

// ────────────────────────────────────────────
// PUBLIC ROUTE — no auth needed
// GF opens the shared link
// ────────────────────────────────────────────

// GET /api/share/:token
// Called when girlfriend opens the share link
app.get('/api/share/:token', async (req, res) => {
  try {
    const snap = await db.collection('wishes')
      .where('shareToken', '==', req.params.token)
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ error: 'Wish not found or expired' });

    const wish = snap.docs[0].data();
    const wishId = snap.docs[0].id;

    // Lazy deletion — check expiry on open
    if (wish.expiresAt.toDate() < new Date()) {
      await db.collection('wishes').doc(wishId).update({ isExpired: true });
      return res.status(410).json({ error: 'This wish has expired' });
    }

    // Return only what GF needs — do NOT send uid, payment info etc.
    res.json({
      wish: {
        id:              wishId,
        templateNo:      wish.templateNo,
        templateName:    wish.templateName,
        occasion:        wish.occasion,
        bfName:          wish.bfName,
        gfName:          wish.gfName,
        gfAge:           wish.gfAge,
        wishes:          wish.wishes,
        wishMessage:     wish.wishMessage,
        memories:        wish.memories,
        reasons:         wish.reasons,
        tags:            wish.tags,
        photos:          wish.photos,
        photoCaptions:   wish.photoCaptions,
        sectionTitles:   wish.sectionTitles,
        closingTitle:    wish.closingTitle,
        closingSubtitle: wish.closingSubtitle,
        pdfPaid:         wish.pdfPaid,
        expiresAt:       wish.expiresAt.toDate().toISOString()
      }
    });
  } catch (err) {
    console.error('Share route error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/share/:token/pdf-payment
// GF initiates PDF download payment
app.post('/api/share/:token/pdf-payment', async (req, res) => {
  try {
    const snap = await db.collection('wishes')
      .where('shareToken', '==', req.params.token)
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ error: 'Wish not found' });

    const wishId = snap.docs[0].id;
    const wish   = snap.docs[0].data();

    if (wish.pdfPaid) return res.json({ alreadyPaid: true, wishId });

    const order = await razorpay.orders.create({
      amount:   1000,
      currency: 'INR',
      receipt:  `pdf_${wishId}_${Date.now()}`,
      notes:    { type: 'download_pdf', wishId }
    });

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
      wishId
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create PDF payment' });
  }
});

// POST /api/share/:token/pdf-verify
// Verify GF's PDF payment
app.post('/api/share/:token/pdf-verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, wishId } = req.body;

    const body     = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    await db.collection('wishes').doc(wishId).update({
      pdfPaid:      true,
      pdfPaymentId: razorpay_payment_id,
      pdfPaidAt:    admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'PDF payment verification error' });
  }
});

// ── CLOUDINARY UPLOAD SIGNATURE ──
// Frontend requests a signature, uses it to upload directly to Cloudinary
// This keeps Cloudinary API secret on the server
app.post('/api/upload/signature', verifyToken, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder    = `wishdrop/${req.user.uid}`;
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      signature,
      timestamp,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey:    process.env.CLOUDINARY_API_KEY
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
});

// ── START SERVER ──
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`WishDrop server running on port ${PORT}`));
