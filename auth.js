const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET_KEY = "nsgd_super_secret_key_2025";

// TEMP ADMIN
const ADMIN = {
  username: "admin",
  passwordHash: bcrypt.hashSync("1234", 10)
};

// ----------------- LOGIN -----------------
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN.username) {
    return res.json({ success: false, msg: "Invalid username" });
  }

  const match = await bcrypt.compare(password, ADMIN.passwordHash);

  if (!match) {
    return res.json({ success: false, msg: "Invalid password" });
  }

  const token = jwt.sign({ user: "admin" }, SECRET_KEY, { expiresIn: "7d" });

  return res.json({ success: true, token });
});

// ----------------- AUTH MIDDLEWARE -----------------
function auth(req, res, next) {
  let authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ msg: "No token provided" });
  }

  // Accept both:
  // "Bearer token"  AND  "token"
  let token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!token) {
    return res.status(401).json({ msg: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ msg: "Invalid or expired token" });
  }
}

module.exports = { router, auth };
