const express = require("express");
const cors = require("cors");
const multer = require("multer");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Multer memory storage (so files stay in RAM, not disk)
const upload = multer({ storage: multer.memoryStorage() });

// Firebase init
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Gemini init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

/**
 * POST /api/chat
 * Accepts text + optional image, uploads image to Firebase Storage,
 * asks Gemini for a response, and saves to Firestore.
 */
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const message = req.body?.message || "";
    const imageFile = req.file;

    if (!message && !imageFile) {
      return res.status(400).json({ aiReply: "⚠️ No message or image provided." });
    }

    // Build Gemini request parts
    const parts = [];
    if (message) parts.push({ text: message });
    if (imageFile) {
      parts.push({
        inlineData: {
          data: imageFile.buffer.toString("base64"),
          mimeType: imageFile.mimetype,
        },
      });
    }

    // Call Gemini
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const aiReply = result?.response?.text?.() || "🤖 No reply.";

    // Upload image to Firebase Storage (if any)
    let imageURL = null;
    if (imageFile) {
      const fileName = `images/${Date.now()}_${imageFile.originalname}`;
      const file = bucket.file(fileName);

      await file.save(imageFile.buffer, {
        metadata: { contentType: imageFile.mimetype },
        resumable: false,
      });

      // Make file public
      await file.makePublic();
      imageURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      console.log("✅ Uploaded image:", imageURL);
    }

    // Save to Firestore
    const docRef = await db.collection("messages").add({
      userMessage: message,
      image: imageURL,
      aiReply,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      id: docRef.id,
      userMessage: message,
      image: imageURL,
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
