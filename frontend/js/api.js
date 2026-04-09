// api.js — all backend communication in one place
// Only the Firebase public config lives here (safe to expose)
// All secrets stay on the backend server

const API_BASE = '${window.location.origin}/api';

// ── FIREBASE PUBLIC CONFIG ──
// These are safe to expose — Firebase Security Rules protect your data
const firebaseConfig = {
  apiKey: "AIzaSyAKq0cH9IbBAAOjmV3z7ZtndvQRqxOoC64",
  authDomain: "wishapp-66789.firebaseapp.com",
  projectId: "wishapp-66789",
  storageBucket: "wishapp-66789.appspot.com",
  messagingSenderId: "272411577633",
  appId: "1:272411577633:web:5764904f54b5a64eaf8260"
};

// ── INIT FIREBASE ──
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// ── GET ID TOKEN ──
// Attached to every request so backend can verify who's calling
async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');
  return user.getIdToken();
}

// ── AUTH HEADERS ──
async function authHeaders() {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// ────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────
const Auth = {
  // Sign in with Google popup
  async signInWithGoogle() {
    const result = await auth.signInWithPopup(provider);
    await API.Users.sync(); // create user doc if first time
    return result.user;
  },

  // Sign out
  async signOut() {
    await auth.signOut();
    window.location.href = '/index.html';
  },

  // Listen to auth state changes
  onAuthChanged(callback) {
    return auth.onAuthStateChanged(callback);
  },

  // Get current user
  currentUser() {
    return auth.currentUser;
  }
};

// ────────────────────────────────────────────
// API CALLS
// ────────────────────────────────────────────
const API = {

  // ── USERS ──
  Users: {
    async sync() {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/users/sync`, { method: 'POST', headers });
      return parseJsonResponse(res);
    },

    async getMe() {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/users/me`, { headers });
      return parseJsonResponse(res);
    }
  },

  // ── PAYMENTS ──
  Payments: {
    // Create a Razorpay order
    async createOrder(type, wishId = null) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/payment/create-order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type, wishId })
      });
      return res.json();
    },

    // Verify payment after Razorpay callback
    async verify(paymentData, type, wishId = null) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/payment/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...paymentData, type, wishId })
      });
      return res.json();
    },

    // Open Razorpay checkout UI
    async openCheckout({ orderId, amount, currency, keyId, name, description, onSuccess, onFailure }) {
      return new Promise((resolve, reject) => {
        const options = {
          key:         keyId,
          amount,
          currency,
          name:        'WishDrop',
          description,
          order_id:    orderId,
          prefill: {
            name:  Auth.currentUser()?.displayName || '',
            email: Auth.currentUser()?.email || ''
          },
          theme: { color: '#e63070' },
          handler: (response) => resolve(response),
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) }
        };
        const rzp = new Razorpay(options);
        rzp.open();
      });
    }
  },

  // ── WISHES ──
  Wishes: {
    async create(wishData) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/wishes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(wishData)
      });
      return parseJsonResponse(res);
    },

    async get(wishId) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/wishes/${wishId}`, { headers });
      return parseJsonResponse(res);
    },

    async update(wishId, updates) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/wishes/${wishId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      return parseJsonResponse(res);
    },

    async delete(wishId) {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/wishes/${wishId}`, {
        method: 'DELETE',
        headers
      });
      return parseJsonResponse(res);
    }
  },

  // ── SHARE (public — no auth) ──
  Share: {
    async getWish(token) {
      const res = await fetch(`${API_BASE}/share/${token}`);
      return res.json();
    },

    async createPdfOrder(token) {
      const res = await fetch(`${API_BASE}/share/${token}/pdf-payment`, { method: 'POST' });
      return res.json();
    },

    async verifyPdfPayment(token, paymentData) {
      const res = await fetch(`${API_BASE}/share/${token}/pdf-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });
      return res.json();
    }
  },

  // ── UPLOAD ──
  Upload: {
    // Get Cloudinary signature from backend
    async getSignature() {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/upload/signature`, { method: 'POST', headers });
      return parseJsonResponse(res);
    },

    // Upload photo to Cloudinary using signed request
    async uploadPhoto(file, onProgress) {
      const sig = await API.Upload.getSignature();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key',   sig.apiKey);
      formData.append('timestamp', sig.timestamp);
      formData.append('signature', sig.signature);
      formData.append('folder',    sig.folder);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status === 200) resolve(data);
          else reject(new Error(data.error?.message || data.error || 'Cloudinary upload failed'));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading photo'));
        xhr.send(formData);
      });
    }
  }
};

// ── UTILS ──
const Utils = {
  // Save wish data to localStorage while editing (temporary)
  saveWishDraft(data) {
    localStorage.setItem('wishdrop_draft', JSON.stringify(data));
  },

  getWishDraft() {
    const d = localStorage.getItem('wishdrop_draft');
    return d ? JSON.parse(d) : null;
  },

  clearWishDraft() {
    localStorage.removeItem('wishdrop_draft');
  },

  // Check if a share page is expired
  isExpired(expiresAt) {
    return new Date(expiresAt) < new Date();
  },

  // Format date nicely
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }
};
