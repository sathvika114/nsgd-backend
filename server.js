// ======================= SERVER SETUP =======================
const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const XLSX = require("xlsx");
const multer = require("multer");

const { router: authRouter, auth } = require("./auth");
require("./db");

// Models
const Entry = require("./models/Entry");
const Expense = require("./models/Expense");

// ======================= CORS =======================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================= FILE UPLOADS =======================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uid = req.body.uid || "general";
    const dir = path.join(__dirname, "uploads", uid);
    fse.ensureDirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ======================= AUTH =======================
app.use("/auth", authRouter);

// ======================= API ROUTES =======================

// -------- GET ALL ENTRIES --------
app.get("/api/get-entries", auth, async (req, res) => {
  try {
    const entries = await Entry.find().sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.json([]);
  }
});

// -------- SAVE ENTRY --------
app.post("/api/save-entry", auth, async (req, res) => {
  try {
    const data = req.body || {};
    let existing = await Entry.findOne({ uniqueID: data.uniqueID });

    if (existing) {
      data.name = data.name ?? existing.name;
      data.contact = data.contact ?? existing.contact;
      data.agent = data.agent ?? existing.agent;
      data.agentPhone = data.agentPhone ?? existing.agentPhone;
    } else {
      data.name = data.name || "Unnamed";
      data.contact = data.contact || "";
    }

    const payments = (data.payments || []).map(p => ({
      date: p.date || new Date().toLocaleDateString("en-GB"),
      paid: Number(p.paid || 0),
      expenditure: Number(p.expenditure || 0),
      mode: p.mode || "Cash"
    }));

    const totalPaid = payments.reduce((a,b)=>a+b.paid,0);
    const totalExp = payments.reduce((a,b)=>a+b.expenditure,0);

    data.payments = payments;
    data.paid = totalPaid;
    data.expenditure = totalExp;
    data.due = Number(data.amount||0) - totalPaid;
    data.balance = totalPaid - totalExp;
    data.date = data.date || new Date().toLocaleDateString("en-GB");

    if (!data.uniqueID)
      data.uniqueID = "NSGD-" + (Math.floor(Math.random()*90000)+10000);

    if (existing) {
      await Entry.updateOne({ uniqueID: data.uniqueID }, { $set: data });
      return res.json({ success: true, entry: data });
    }

    const entry = new Entry(data);
    await entry.save();
    res.json({ success: true, entry });

  } catch (err) {
    res.json({ success: false });
  }
});

// -------- UPDATE HISTORY --------
app.post("/api/update-history", auth, async (req, res) => {
  try {
    const { uniqueID, payments } = req.body;
    const entry = await Entry.findOne({ uniqueID });
    if (!entry) return res.json({ success: false });

    const normalized = payments.map(p => ({
      date: p.date || new Date().toLocaleDateString("en-GB"),
      paid: Number(p.paid || 0),
      expenditure: Number(p.expenditure || 0),
      mode: p.mode || "Cash"
    }));

    entry.payments = normalized;
    entry.paid = normalized.reduce((a,b)=>a+b.paid,0);
    entry.expenditure = normalized.reduce((a,b)=>a+b.expenditure,0);
    entry.due = entry.amount - entry.paid;
    entry.balance = entry.paid - entry.expenditure;

    await entry.save();
    res.json({ success: true, entry });

  } catch {
    res.json({ success: false });
  }
});

// -------- DELETE ENTRY --------
app.delete("/api/delete-entry/:uid", auth, async (req, res) => {
  try {
    const uid = req.params.uid;
    await Entry.findOneAndDelete({ uniqueID: uid });
    const dir = path.join(__dirname, "uploads", uid);
    if (fs.existsSync(dir)) fse.removeSync(dir);
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// -------- EXPENSE ROUTES --------
app.get("/api/get-expenses", auth, async (req, res) => {
  try {
    res.json(await Expense.find().sort({ createdAt: -1 }));
  } catch {
    res.json([]);
  }
});

app.post("/api/save-expense", auth, async (req, res) => {
  try {
    const doc = {
      date: req.body.date || new Date().toLocaleDateString("en-GB"),
      description: req.body.description,
      amount: Number(req.body.amount || 0)
    };
    res.json({ success: true, expense: await Expense.create(doc) });
  } catch {
    res.json({ success: false });
  }
});

app.delete("/api/delete-expense/:id", auth, async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// -------- EXCEL EXPORT --------
app.get("/api/export-excel", auth, async (req, res) => {
  try {
    const entries = await Entry.find();
    const sheetData = entries.map(e => ({
      Date: e.date,
      Name: e.name,
      UID: e.uniqueID,
      Amount: e.amount,
      Paid: e.paid,
      Due: e.due,
      Expenditure: e.expenditure,
      Balance: e.balance
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");

    const filePath = path.join(__dirname, "ledger.xlsx");
    XLSX.writeFile(wb, filePath);
    res.download(filePath);
  } catch {
    res.json({ success: false });
  }
});

// ======================= START SERVER =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("API Server running on port " + PORT));
