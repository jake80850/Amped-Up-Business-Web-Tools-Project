import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema({
  name: String,
  email: String,
  ticketType: String,
  quantity: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Ticket", TicketSchema);x