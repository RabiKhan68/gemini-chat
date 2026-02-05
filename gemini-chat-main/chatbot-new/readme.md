1) HTML: the structure

<!DOCTYPE html> ... <html lang="en">
Standard HTML5 doc with English language setting.

<head> … </head>
Holds metadata (character set, viewport for mobile) and the <style> block where all CSS lives. The <title> sets the browser tab text (“Robo-bot”).

<body>
Contains the actual UI:

.chat-container — the rounded, glowing card that floats in the middle.

Inside it:

<h1> — the animated header (“Hey There! How can I help you?”).

#chat-box — a scrollable column where messages appear.

.input-box — a row with the text field and the Send button.

Everything is intentionally minimal so the CSS can drive the futuristic look.

<!-- End of html -->

2) CSS: the look, layout, and animations
Page background and centering
body {
  font-family: ...;
  background: radial-gradient(...);
  display: flex; justify-content: center; align-items: center;
  height: 100vh; margin: 0; overflow: hidden; color: #fff;
}


Full-screen gradient background.

Flexbox centers the chat container both horizontally and vertically.

Chat container
.chat-container {
  width: 420px; height: 620px;
  background: rgba(15,20,35,0.9);
  border-radius: 20px;
  box-shadow: 0 0 25px rgba(0,200,255,.6), ...;
  border: 1px solid rgba(0,200,255,.4);
  display: flex; flex-direction: column; overflow: hidden;
  animation: floatUp 3s ease-in-out infinite alternate;
}


A translucent, rounded card with a neon glow.

Uses display: flex so the header, chat area, and input row stack vertically.

floatUp makes the whole card gently bob up and down.

Header
.chat-container h1 {
  background: linear-gradient(90deg, #00c6ff, #0072ff);
  animation: glowPulse 2s infinite;
}


Gradient bar with a pulsing text glow.

Chat area
.chat-box { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }


flex: 1 makes it expand to fill leftover vertical space.

overflow-y: auto adds scrolling when there are many messages.

Messages
.message {
  margin: 8px 0; padding: 12px 16px; border-radius: 18px;
  max-width: 75%;
  animation: fadeIn .5s ease, slideUp .4s ease;
  transition: transform .3s;
}
.message:hover { transform: scale(1.05); }
.user { background: linear-gradient(135deg,#00c6ff,#0072ff); margin-left: auto; }
.bot  { background: linear-gradient(135deg,#4facfe,#00f2fe); margin-right: auto; color: #0a0a0a; }


Bubbles are limited to 75% width.

User messages align right (margin-left: auto), bot messages align left.

Each bubble fades/slides in and slightly enlarges on hover.

Input row
.input-box { display: flex; align-items: center; }
input[type="text"] { flex: 1; border-radius: 20px; transition: all .3s; }
input[type="text"]:focus { background: rgba(0,200,255,.1); box-shadow: 0 0 8px rgba(0,200,255,.5); }
button { border-radius: 20px; transition: all .3s; }
button:hover { transform: scale(1.1); box-shadow: 0 0 20px rgba(0,200,255,.8); }


Text field expands to fill available space.

Both input and button get animated focus/hover effects.

Custom scrollbar (WebKit)

Slim, gradient scrollbar thumb for the chat area.

Keyframe animations

fadeIn and slideUp for message entry.

glowPulse for header text glow.

floatUp for subtle container bobbing.

<!-- End of css -->

3) JavaScript: the behavior

All logic is at the bottom in a <script> tag.

Helper
function getCurrentDate() {
  return new Date().toLocaleString();
}


Used for the local “date/time” response.

sendMessage() — the main flow

Triggered by clicking Send or pressing Enter.

Grab DOM elements

const input = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");


Ignore empty submissions

if (!input.value.trim()) return;


Show the user’s message immediately

const userMessage = input.value;
chatBox.insertAdjacentHTML("beforeend", `<div class="message user">${userMessage}</div>`);
chatBox.scrollTop = chatBox.scrollHeight;
input.value = "";


Adds a right-aligned bubble and scrolls to the bottom.

Clears the input field.

⚠️ Note: Using innerHTML/insertAdjacentHTML is quick but can insert raw HTML. If messages could contain </>, consider sanitizing or inserting with textContent instead for safety.

Shortcut replies (handled locally)

const lowerMsg = userMessage.toLowerCase();
if (lowerMsg.includes("your name") || lowerMsg.includes("who are you")) {
  // add a bot bubble and return early
}
if (lowerMsg.includes("date") || lowerMsg.includes("time")) {
  // add current date/time and return
}


Quick answers without calling the backend.

Send the message to your backend

const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: userMessage }),
});
const data = await res.json();


Sends a JSON body { message: "..." } to /api/chat.

Assumes your serverless function responds with { aiReply: "..." }.

Show the AI reply

if (data.aiReply) {
  chatBox.insertAdjacentHTML("beforeend", `<div class="message bot">${data.aiReply}</div>`);
}


Error handling

} catch (err) {
  chatBox.insertAdjacentHTML("beforeend", `<div class="message bot">⚠️ Error: Could not connect to server.</div>`);
}


Displays a friendly error bubble if the request fails.

Enter key support

document.getElementById("user-input").addEventListener("keypress", function (event) {
  if (event.key === "Enter") { event.preventDefault(); sendMessage(); }
});


Lets users press Enter to send messages.

4) What your backend must provide

Your frontend expects /api/chat to:

Accept POST with JSON: { "message": "..." }

Return JSON: { "aiReply": "..." }

Since you deployed on Vercel, /api/chat is typically a serverless function (e.g., api/chat.js) that uses your Gemini and Firebase logic. The frontend uses a relative path (/api/chat), so it works consistently in local dev and on Vercel.

<!-- end of js -->

1) Top imports & config
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();


express: HTTP server/framework (routes, middleware).

cors: enables Cross-Origin Resource Sharing so browsers can call your API.

firebase-admin: server SDK to read/write Firestore (and other Firebase admin tasks).

@google/generative-ai: Gemini client to call the model.

dotenv: loads .env into process.env when running locally.

2) Express app + middleware
const app = express();
app.use(cors());
app.use(express.json());


app is your Express application.

cors() lets frontend from other origins call /api/... (use restrictive options if needed).

express.json() parses JSON request bodies and sets req.body.

3) Firebase admin init
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


Initializes Admin SDK once (important in serverless environments).

Credentials come from environment variables.
replace(/\\n/g, "\n") converts escaped \n sequences in .env into real newlines (how private keys are often stored).

db is the Firestore handle used later.

Gotchas

Make sure the env vars are set on Vercel (Project → Settings → Environment Variables).

Never commit your private key to GitHub.

4) Gemini client + model handle
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });


Creates a Gemini API client with your API key.

getGenerativeModel(...) returns a model instance you call for responses.

Gotchas

If the key is invalid or quota exhausted, calls will fail (watch for 401 / 429 / insufficient_quota errors).

Model names can change; swap to a stable model if you get a name error.

5) POST /api/chat — send message, get AI reply, save to Firestore
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message || "";
    if (!message) return res.status(400).json({ aiReply: "⚠️ No message provided." });

    const parts = [{ text: message }];

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });
    const aiReply = result?.response?.text?.() || "🤖 No reply.";

    const docRef = await db.collection("messages").add({
      userMessage: message,
      aiReply,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ id: docRef.id, userMessage: message, aiReply });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ aiReply: "⚠️ Something went wrong." });
  }
});


Flow

Read message from req.body.

Validate (400 if empty).

Build parts with your message and call Gemini (model.generateContent(...)).

Extract AI text via result.response.text() (safe guard with ?.).

Save { userMessage, aiReply, createdAt } to Firestore.

Return JSON with id, userMessage, aiReply.

Edge cases / errors

model.generateContent may throw network or API errors — caught by catch.

createdAt uses Firestore server timestamp — immediately after write it might be null until Firestore resolves it.

The AI reply may contain special characters or long text; consider length limits.

6) GET /api/chat — read chat history
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


Queries Firestore for all messages ordered by createdAt.

Returns an array of message objects. Each message contains Firestore timestamp object — frontend must convert ._seconds to ms if needed.

7) Export for Vercel
module.exports = app;


Do not call app.listen() when using Vercel serverless functions. Exporting the Express app lets Vercel host it under /api/....

For local testing you can create a small wrapper file that imports this app and app.listen(PORT).

8) Example requests & quick tests

POST (send message):

curl -X POST "https://your-app.vercel.app/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello Robo-bot!"}'


Example response:

{
  "id":"abc123",
  "userMessage":"Hello Robo-bot!",
  "aiReply":"Hi there! How can I help you today?"
}


GET (history):

curl "https://your-app.vercel.app/api/chat"


Returns an array of messages.

9) Important checks & debugging tips

Environment variables: verify GEMINI_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set in Vercel. Private key should preserve \n (or use replace as you do).

Vercel logs: check Vercel Dashboard → Deployments → Logs for runtime errors.

Local dev: use a local .env and a small dev-server.js that does const app = require('./api/chat.js'); app.listen(5000) to run locally.

Firestore permissions: Admin SDK bypasses rules but the service account must be correct.

Quota & errors: monitor Gemini quota and handle API errors (400/401/429/500).

Sanitize & limit: limit message length (e.g., 2000 chars) and consider rate limiting to prevent abuse.

Timeouts: consider a request timeout for the Gemini call to avoid hanging functions.

Logging: keep useful logs (request id, errors) but avoid logging secrets.

<!-- End of server.js -->