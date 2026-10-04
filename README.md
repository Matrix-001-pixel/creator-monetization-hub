# Matrix Créations Backend

This backend powers the Matrix Créations creator monetization platform MVP.

## What it includes

- User signup and login
- JWT auth flow
- Social account linking for creator verification
- Follower threshold checks for 1000+ users
- Monetization offer listing
- Payment intent generation with Stripe-ready integration
- Transaction recording for creators
- Admin overview endpoints

## Important payment note

This app does not store personal card numbers or raw Visa data. The secure payment flow should be connected to a business Stripe account using your own Visa payment method in Stripe. The code expects a Stripe secret key in environment variables.

## Quick start

1. Install dependencies:

   npm install

2. Add your environment file:

   cp .env.example .env

3. Start the server:

   npm run dev

4. Test the health route:

   http://localhost:4000/api/health

## Environment variables

Set the following values in `.env`:

```env
PORT=4000
JWT_SECRET=replace_with_a_strong_secret
STRIPE_SECRET_KEY=sk_test_your_key_here
```

## Example API flow

- Register a creator: `POST /api/auth/register`
- Log in: `POST /api/auth/login`
- Connect social accounts: `POST /api/social/connect`
- Create a payment intent: `POST /api/payments/create-intent`
- Record a payout/transaction: `POST /api/payments/record`
- View transaction history: `GET /api/payments/history`

## Production deployment notes

- Use a managed PostgreSQL database instead of SQLite for production
- Store secrets in Vercel/Render/Railway env settings
- Connect your own business Stripe account and Visa in Stripe Dashboard
- Add HTTPS and domain settings for live public access

## Suggested next step

The next module should connect this backend to the front-end dashboard, add OAuth for TikTok/Instagram/YouTube, and wire real Stripe Checkout for payouts.
