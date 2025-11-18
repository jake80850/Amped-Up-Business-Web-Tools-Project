// server.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();

// --- Security & parsing ---
app.use(helmet());
app.use(express.json());

// If frontend is served from the same origin, you can remove cors().
// If not, set the origin(s) you use (e.g., http://localhost:5173)
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Simple rate limit for the ticket POST endpoint
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 requests/minute per IP
});
app.use('/api/', limiter);

// --- Mongo connection ---
if (!process.env.MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI, {
  // options are optional on modern drivers
});
console.log('✅ MongoDB connected');

// --- Schema & Model ---
const allowedTickets = [
  'GA Pass',
  'GA Pass + Parking',
  'VIP Pass',
  '1st Day Ticket',
  '2nd Day Ticket',
  'Weekend Parking Pass',
  'Single Day Parking',
];

const ticketSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName:  { type: String, required: true, trim: true, maxlength: 80 },
  email:     { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
  ticketType:{ type: String, required: true, enum: allowedTickets },
  quantity:  { type: Number, required: true, min: 1, max: 20 },
  notes:     { type: String, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now }
});

// Basic email index (optional but useful)
ticketSchema.index({ email: 1, createdAt: -1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mongo: mongoose.connection.readyState === 1 });
});

// --- Create ticket ---
app.post('/api/tickets', async (req, res) => {
  try {
    const { firstName, lastName, email, ticketType, quantity, notes } = req.body;

    // Minimal validation before hitting Mongo
    const errors = [];
    if (!firstName || typeof firstName !== 'string') errors.push('firstName is required');
    if (!lastName  || typeof lastName !== 'string') errors.push('lastName is required');
    if (!email     || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('valid email is required');
    if (!ticketType || !allowedTickets.includes(ticketType)) errors.push('invalid ticketType');
    if (!(Number.isFinite(quantity) && quantity >= 1 && quantity <= 20)) errors.push('quantity must be 1–20');

    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const ticket = await Ticket.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      ticketType,
      quantity: Number(quantity),
      notes: (notes ?? '').trim(),
    });

    return res.status(201).json({ message: 'Saved', id: ticket._id });
  } catch (err) {
    console.error('POST /api/tickets error:', err);
    return res.status(500).json({ message: 'Error saving ticket' });
  }
});

// --- (Optional) Admin read: list last 50 reservations ---
app.get('/api/tickets', async (req, res) => {
  try {
    const docs = await Ticket.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(docs);
  } catch (err) {
    console.error('GET /api/tickets error:', err);
    res.status(500).json({ message: 'Error fetching tickets' });
  }
});

// --- Serve static site (put your HTML files in /public) ---
app.use(express.static('public')); // e.g., public/tickets.html

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
