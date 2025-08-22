const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase init
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// Gemini init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

/**
 * POST /api/chat
 * Accepts text only, asks Gemini for a response, and saves to Firestore.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message || "";

    if (!message) {
      return res.status(400).json({ aiReply: "⚠️ No message provided." });
    }

    // Build Gemini request
    const parts = [{ text: message }];

    // Call Gemini
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const aiReply = result?.response?.text?.() || "🤖 No reply.";

    // Save to Firestore
    const docRef = await db.collection("messages").add({
      userMessage: message,
      aiReply,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      id: docRef.id,
      userMessage: message,
      aiReply,
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ aiReply: "⚠️ Something went wrong." });
  }
});

/**
 * GET /api/chat
 * Fetch all previous messages from Firestore
 */
app.get("/api/chat", async (req, res) => {
  try {
    const snapshot = await db.collection("messages").orderBy("createdAt", "asc").get();
    const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(messages);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ aiReply: "⚠️ Failed to fetch messages." });
  }
});

// ⚠️ Export handler for Vercel
module.exports = app;
