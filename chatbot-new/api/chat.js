const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Sentry = require("@sentry/node");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Sentry Monitoring (optional) ---
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  app.use(Sentry.Handlers.requestHandler());
}

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,             // 10 req/min per IP
  message: { error: "⚠️ Too many requests, slow down." },
});
app.use("/api/", limiter);

// --- Firebase init ---
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

// --- Gemini init ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

/**
 * POST /api/chat
 */
app.post("/api/chat", async (req, res) => {
  try {
    let message = (req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: "Message too long (max 500 chars)." });
    }

    const parts = [{ text: message }];
    let aiReply = "🤖 No reply.";

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });
      aiReply = result?.response?.text?.() || aiReply;
    } catch (err) {
      console.error("Gemini error:", err);
      Sentry.captureException(err);
      return res.status(502).json({ error: "AI service failed." });
    }

    const docRef = await db.collection("messages").add({
      userMessage: message,
      aiReply,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ id: docRef.id, userMessage: message, aiReply });
  } catch (err) {
    console.error("❌ Server error:", err);
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * GET /api/chat
 */
app.get("/api/chat", async (req, res) => {
  try {
    const snapshot = await db.collection("messages").orderBy("createdAt", "asc").get();
    const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(messages);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    Sentry.captureException(err);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// --- Sentry error handler ---
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// --- ✅ Dual mode: Local & Vercel ---
if (require.main === module) {
  // running locally
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
} else {
  // running on Vercel
  module.exports = app;
}
