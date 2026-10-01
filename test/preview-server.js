const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    let u = decodeURIComponent((req.url || "/").split("?")[0]);
    if (u === "/") u = "/src/popup.html";
    const file = path.resolve(root, u.replace(/^[/\\]+/, ""));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(8767, "127.0.0.1", () => {
    console.log("preview http://127.0.0.1:8767/src/popup.html");
  });
