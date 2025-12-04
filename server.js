// server.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();

// Security & parsing
app.use(helmet());
app.use(express.json());

// CORS (same-origin is fine; if you use a different frontend origin, set CORS_ORIGINS in .env)
app.use(
  cors({
    origin:
      process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// Rate limit API
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', limiter);

// --- Mongo connect ---
if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI in .env');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// --- Model ---
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
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 160,
  },
  ticketType: { type: String, required: true, enum: allowedTickets },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  notes: { type: String, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

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

    const errors = [];

    if (!firstName) errors.push('firstName is required');
    if (!lastName) errors.push('lastName is required');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push('valid email is required');
    if (!allowedTickets.includes(ticketType))
      errors.push('invalid ticketType');

    const qtyNum = Number(quantity);
    if (!Number.isFinite(qtyNum) || qtyNum < 1 || qtyNum > 20)
      errors.push('quantity must be 1–20');

    if (errors.length) {
      return res
        .status(400)
        .json({ message: 'Validation failed', errors });
    }

    const ticket = await Ticket.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      ticketType,
      quantity: qtyNum,
      notes: (notes ?? '').trim(),
    });

    return res.status(201).json({ message: 'Saved', id: ticket._id });
  } catch (err) {
    console.error('POST /api/tickets error:', err);
    res.status(500).json({ message: 'Error saving ticket' });
  }
});

// --- Optional: list recent tickets ---
app.get('/api/tickets', async (req, res) => {
  try {
    const docs = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(docs);
  } catch (err) {
    console.error('GET /api/tickets error:', err);
    res.status(500).json({ message: 'Error fetching tickets' });
  }
});

// --- Serve your static site ---
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));