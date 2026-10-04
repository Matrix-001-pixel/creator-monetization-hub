const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'matrix-creator-secret';
const DATABASE_PATH = path.join(process.cwd(), 'data', 'matrix.db');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      business_name TEXT,
      is_creator INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      follower_count INTEGER DEFAULT 0,
      verification_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      url TEXT,
      follower_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'connected',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      platform_fee REAL NOT NULL,
      payout REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      payout_amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const offersCount = db.prepare('SELECT COUNT(*) AS count FROM offers').get().count;
  if (offersCount === 0) {
    const insertOffer = db.prepare(`
      INSERT INTO offers (title, category, description, payout_amount)
      VALUES (?, ?, ?, ?)
    `);

    const defaultOffers = [
      ['TikTok Brand Collab', 'Sponsorship', 'High-converting brand partnership for creators with strong engagement.', 1800],
      ['Instagram Affiliate Bundle', 'Affiliate', 'Commission-based product promotion system for lifestyle creators.', 950],
      ['Members-Only Access', 'Subscription', 'Recurring subscription access to premium content and private communities.', 1200],
      ['Fan Support Drive', 'Tips', 'One-time supporter contributions and paid shoutouts for dedicated followers.', 420]
    ];

    for (const offer of defaultOffers) {
      insertOffer.run(...offer);
    }
  }
}

initDb();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.options('*', cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.is_admin ? 'admin' : 'creator',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Matrix Créations backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName, businessName, isCreator } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ message: 'Email, password, and display name are required.' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ message: 'A user with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const insert = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, business_name, is_creator)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = insert.run(email.toLowerCase(), passwordHash, displayName, businessName || '', Number(Boolean(isCreator)));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = issueToken(user);

  res.status(201).json({
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = issueToken(user);
  res.json({
    token,
    user: sanitizeUser(user),
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/social/connect', authMiddleware, (req, res) => {
  const { platform, username, url, followerCount } = req.body;

  if (!platform || !username) {
    return res.status(400).json({ message: 'Platform and username are required.' });
  }

  const insert = db.prepare(`
    INSERT INTO social_accounts (user_id, platform, username, url, follower_count, status)
    VALUES (?, ?, ?, ?, ?, 'connected')
  `);

  insert.run(req.user.id, platform, username, url || '', Number(followerCount || 0));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const followerTotal = db.prepare(`
    SELECT COALESCE(SUM(follower_count), 0) AS total
    FROM social_accounts
    WHERE user_id = ?
  `).get(req.user.id).total;

  db.prepare('UPDATE users SET follower_count = ?, verification_status = ? WHERE id = ?').run(
    followerTotal,
    followerTotal >= 1000 ? 'verified' : 'pending',
    req.user.id
  );

  res.status(201).json({
    message: 'Social account connected successfully.',
    followerTotal,
    verificationStatus: followerTotal >= 1000 ? 'verified' : 'pending',
  });
});

app.get('/api/social/accounts', authMiddleware, (req, res) => {
  const accounts = db.prepare('SELECT * FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ accounts });
});

app.get('/api/dashboard/overview', authMiddleware, (req, res) => {
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'brand_deal' THEN amount ELSE 0 END), 0) AS brandRevenue,
      COALESCE(SUM(CASE WHEN type = 'affiliate' THEN amount ELSE 0 END), 0) AS affiliateRevenue,
      COALESCE(SUM(CASE WHEN type = 'tip' THEN amount ELSE 0 END), 0) AS tipRevenue,
      COALESCE(SUM(CASE WHEN type = 'subscription' THEN amount ELSE 0 END), 0) AS subscriptionRevenue,
      COALESCE(SUM(amount), 0) AS totalRevenue,
      COUNT(*) AS totalTransactions
    FROM transactions
    WHERE user_id = ?
  `).get(req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  res.json({
    user: sanitizeUser(user),
    summary,
  });
});

app.get('/api/offers', (req, res) => {
  const offers = db.prepare('SELECT * FROM offers ORDER BY created_at DESC').all();
  res.json({ offers });
});

app.post('/api/payments/create-intent', authMiddleware, async (req, res) => {
  const { amount, currency = 'usd', source = 'brand_deal' } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'A valid amount is required.' });
  }

  const commissionRate = 0.1;
  const platformFee = Number(amount) * commissionRate;
  const payout = Number(amount) - platformFee;

  if (stripe) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
      });

      return res.json({
        provider: 'stripe',
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        platformFee,
        payout,
        commissionRate,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Stripe setup failed. Check Stripe keys and configuration.',
        error: error.message,
      });
    }
  }

  res.json({
    provider: 'mock',
    paymentIntentId: `mock_${Date.now()}`,
    platformFee,
    payout,
    commissionRate,
    message: 'Stripe key not configured. This is a mock payment intent for local development only.',
  });
});

app.post('/api/payments/record', authMiddleware, (req, res) => {
  const { type, source, amount, platformFee, payout, currency = 'USD', status = 'pending' } = req.body;

  if (!type || !amount) {
    return res.status(400).json({ message: 'Type and amount are required.' });
  }

  const insert = db.prepare(`
    INSERT INTO transactions (user_id, type, source, amount, platform_fee, payout, currency, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(req.user.id, type, source, Number(amount), Number(platformFee || 0), Number(payout || amount), currency, status);

  res.status(201).json({ message: 'Transaction recorded successfully.' });
});

app.get('/api/payments/history', authMiddleware, (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ transactions });
});

app.get('/api/admin/overview', authMiddleware, (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS creators,
      COALESCE(SUM(follower_count), 0) AS totalFollowers,
      COALESCE(SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END), 0) AS verifiedCreators,
      COALESCE(SUM(CASE WHEN type = 'brand_deal' THEN amount ELSE 0 END), 0) AS totalBrandRevenue,
      COALESCE(SUM(CASE WHEN type = 'affiliate' THEN amount ELSE 0 END), 0) AS totalAffiliateRevenue
    FROM users u
    LEFT JOIN transactions t ON t.user_id = u.id
  `).get();

  res.json({ totals });
});

app.post('/api/admin/seed', authMiddleware, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@matrixcreations.com');
  if (!adminUser) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    db.prepare(`
      INSERT INTO users (email, password_hash, display_name, business_name, is_creator, is_admin, follower_count, verification_status)
      VALUES (?, ?, ?, ?, 1, 1, 25000, 'verified')
    `).run('admin@matrixcreations.com', passwordHash, 'Matrix Admin', 'Matrix Créations', 25000, 'verified');
  }

  res.json({ message: 'Starter admin account created.' });
});

app.listen(PORT, () => {
  console.log(`Matrix Créations backend listening on http://localhost:${PORT}`);
});
