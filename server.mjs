import { createServer } from "node:http";
import { connect } from "node:net";
import next from "next";
import { WebSocketServer } from "ws";
import { residentDesktops } from "./src/lib/ai/remote-desktop.ts";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const app = next({ dev, hostname: "0.0.0.0", port });
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  handler(request, response);
});
const sockets = new WebSocketServer({
  noServer: true,
  maxPayload: 256 * 1024,
  perMessageDeflate: false,
});
server.on("upgrade", (request, socket, head) => {
  if (request.url?.split("?")[0] !== `${basePath}/api/city-browser/socket`) {
    if (dev) app.getUpgradeHandler()(request, socket, head);
    else socket.destroy();
    return;
  }
  const origin = request.headers.origin;
  const allowedOrigin = process.env.PUBLIC_ORIGIN ?? `http://${request.headers.host}`;
  const owner = request.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("toronto-one-agent="))
    ?.slice("toronto-one-agent=".length);
  const desktop = owner ? residentDesktops.get(owner) : undefined;
  if (
    origin !== allowedOrigin ||
    !desktop?.interactive ||
    desktop.expiresAt <= Date.now()
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (websocket) => {
    const upstream = connect(desktop.port, "127.0.0.1");
    const close = () => {
      upstream.destroy();
      websocket.close();
      clearInterval(guard);
    };
    const guard = setInterval(() => {
      if (
        !desktop.interactive ||
        desktop.expiresAt <= Date.now() ||
        residentDesktops.get(owner) !== desktop
      )
        close();
    }, 500);
    guard.unref();
    upstream.on("data", (data) => {
      if (websocket.readyState === 1) websocket.send(data);
    });
    upstream.on("error", close);
    upstream.on("close", close);
    websocket.on("message", (data) => {
      if (!desktop.interactive || desktop.expiresAt <= Date.now()) {
        close();
        return;
      }
      // Bytes are forwarded only: never parse, store or log credential input.
      upstream.write(data);
    });
    websocket.on("error", close);
    websocket.on("close", close);
  });
});
server.listen(port, "0.0.0.0", () => console.info("Toronto One server ready"));
