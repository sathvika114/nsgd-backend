const mongoose = require("mongoose");

const MONGO_URL =
  "mongodb+srv://sathvikasanju114_db_user:Sathvika0301@cluster0.ndqhynu.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URL)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("MongoDB Connection Error:", err));
