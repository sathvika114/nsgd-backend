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
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
  credentials: true
}));

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
  return res.sendStatus(200);
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================= STATIC =======================
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/auth", authRouter);

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ======================= FILE UPLOAD =======================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uid = req.body.uid || "general";
    const dir = path.join(__dirname, "uploads", uid);
    fse.ensureDirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// ======================= PAGES =======================
const allowedPages = [
  "dashboard.html",
  "entry.html",
  "ledger.html",
  "customer.html",
  "expenses.html",
  "analysis.html",
  "index.html",
  "login.html"
];

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "login.html")));

app.get("/:page", (req, res) => {
  const page = req.params.page;
  if (!allowedPages.includes(page)) return res.status(404).send("Page not found");
  res.sendFile(path.join(__dirname, page));
});

// ======================= API ROUTES =======================
// ===========================================================
//                     🔥 ENTRY SYSTEM 🔥
// ===========================================================

// -------- GET ALL ENTRIES --------
app.get("/api/get-entries", auth, async (req, res) => {
  try {
    const entries = await Entry.find().sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    console.error("GET ENTRIES ERROR:", err);
    res.status(500).json([]);
  }
});

// -------- SAVE ENTRY (ADD / EDIT) --------
app.post("/api/save-entry", auth, async (req, res) => {
  try {
    const data = req.body || {};

    // Find existing entry first
    let existing = await Entry.findOne({ uniqueID: data.uniqueID });

    // FIX: DO NOT OVERWRITE name/contact/agent if missing
    if (existing) {
      data.name = data.name ?? existing.name;
      data.contact = data.contact ?? existing.contact;
      data.agent = data.agent ?? existing.agent;
      data.agentPhone = data.agentPhone ?? existing.agentPhone;
    } else {
      // For NEW entry: normalize name fields
      data.name =
        data.name ||
        data.customerName ||
        data.customer ||
        "Unnamed";

      data.contact =
        data.contact ||
        data.customerContact ||
        "";
    }

    // Normalize payments
    const payments = Array.isArray(data.payments)
      ? data.payments.map((p) => ({
          date: p.date || new Date().toLocaleDateString("en-GB"),
          paid: Number(p.paid || 0),
          expenditure: Number(p.expenditure || 0),
          mode: p.mode || "Cash"
        }))
      : [];

    const totalPaid = payments.reduce((s, p) => s + p.paid, 0);
    const totalExp = payments.reduce((s, p) => s + p.expenditure, 0);

    data.payments = payments;
    data.paid = totalPaid;
    data.expenditure = totalExp;
    data.due = Number(data.amount || 0) - totalPaid;
    data.balance = totalPaid - totalExp;
    data.date = data.date || new Date().toLocaleDateString("en-GB");

    // Generate UID if new entry
    if (!data.uniqueID) {
      data.uniqueID = `NSGD-${Math.floor(Math.random() * 90000) + 10000}`;
    }

    if (existing) {
      await Entry.updateOne({ uniqueID: data.uniqueID }, { $set: data });
      return res.json({ success: true, entry: data });
    }

    const entry = new Entry(data);
    await entry.save();
    res.json({ success: true, entry });

  } catch (err) {
    console.error("SAVE ENTRY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// -------- UPDATE PAYMENT HISTORY --------
app.post("/api/update-history", auth, async (req, res) => {
  try {
    const { uniqueID, payments } = req.body;

    const entry = await Entry.findOne({ uniqueID });
    if (!entry) return res.json({ success: false, msg: "Entry not found" });

    const normalized = (payments || []).map((p) => ({
      date: p.date || new Date().toLocaleDateString("en-GB"),
      paid: Number(p.paid || 0),
      expenditure: Number(p.expenditure || 0),
      mode: p.mode || "Cash"
    }));

    entry.payments = normalized;
    entry.paid = normalized.reduce((s, p) => s + p.paid, 0);
    entry.expenditure = normalized.reduce((s, p) => s + p.expenditure, 0);
    entry.due = entry.amount - entry.paid;
    entry.balance = entry.paid - entry.expenditure;

    await entry.save();
    res.json({ success: true, entry });

  } catch (err) {
    console.error("UPDATE HISTORY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// -------- DELETE ENTRY --------
app.delete("/api/delete-entry/:uid", auth, async (req, res) => {
  try {
    const uid = req.params.uid;

    const deleted = await Entry.findOneAndDelete({ uniqueID: uid });
    if (!deleted) return res.json({ success: false });

    const dir = path.join(__dirname, "uploads", uid);
    if (fs.existsSync(dir)) fse.removeSync(dir);

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE ENTRY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ===========================================================
//                     EXPENSE SYSTEM
// ===========================================================
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
      description: (req.body.description || "").trim(),
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

// ===========================================================
//                  EXCEL EXPORT
// ===========================================================
app.get("/api/export-excel", auth, async (req, res) => {
  try {
    const entries = await Entry.find();
    const sheetData = entries.map((e) => ({
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

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ===========================================================
app.post("/api/upload", auth, upload.single("file"), (req, res) => {
  res.json({ success: true, file: req.file });
});

// ======================= START SERVER =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

