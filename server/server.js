// Локальний сервер застосунку «Список бажань» (практикум 14).
// Обрано Express: він сам розбирає параметри шляху (:id), ставить Content-Type для JSON
// і роздає статичні файли, тож код коротший, ніж на чистому модулі http.

const path = require("path");
const express = require("express");
const wishes = require("./data/wishes.json");

const app = express();
const PORT = 3000;

// Клієнтська частина (index.html, script.js, css/) лежить на рівень вище за теку server/
const CLIENT_DIR = path.join(__dirname, "..");

/* ===================== API ===================== */

// GET /api/wishes — весь локальний список бажаних товарів (Content-Type: application/json)
app.get("/api/wishes", (req, res) => {
  res.json(wishes);
});

// GET /api/wishes/:id — один товар за id або 404 з JSON-повідомленням
app.get("/api/wishes/:id", (req, res) => {
  const wish = wishes.find((w) => String(w.id) === req.params.id);
  if (!wish) {
    return res.status(404).json({ error: `Бажання з id ${req.params.id} не знайдено` });
  }
  res.json(wish);
});

// Будь-який інший шлях /api/... — теж 404 у форматі JSON, а не порожня відповідь
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Ендпоінт не знайдено" });
});

/* ===================== Статичні файли клієнта ===================== */
// Роздаємо лише файли застосунку, а не всю теку проєкту
// (щоб назовні не потрапили server/, node_modules/, .git/ чи звіт).
// Сторінка й API на одному порту — один origin, тому CORS не потрібен.

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "script.js"));
});

app.use("/css", express.static(path.join(CLIENT_DIR, "css")));

// Решта адрес — 404
app.use((req, res) => {
  res.status(404).type("text/plain; charset=utf-8").send("Сторінку не знайдено");
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
});
