const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  date: String,
  paid: Number,
  expenditure: Number,
  mode: String
});

const EntrySchema = new mongoose.Schema({
  date: String,
  uniqueID: { type: String, required: true },
  name: String,
  contact: String,
  agent: String,
  agentPhone: String,
  amount: Number,
  paid: Number,
  expenditure: Number,
  due: Number,
  balance: Number,
  payments: [PaymentSchema]
});

module.exports = mongoose.model("Entry", EntrySchema);
