import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp: tunnels TCP over a WebSocket so the browser-side transport can make real requests.
logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  // Block requests to private/internal networks from the proxy.
  // Set WISP_ALLOW_LOCAL=1 only for local testing.
  allow_private_ips: process.env.WISP_ALLOW_LOCAL === "1",
  allow_loopback_ips: process.env.WISP_ALLOW_LOCAL === "1",
  dns_servers: (process.env.DNS_SERVERS || "1.1.1.3,1.0.0.3").split(","),
});

const fastify = Fastify({
  serverFactory: (handler) =>
    createServer()
      .on("request", (req, res) => {
        // Cross-origin isolation is needed for SharedArrayBuffer used by the transports.
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
        else socket.end();
      }),
});

fastify.register(fastifyStatic, { root: publicPath, decorateReply: true });
fastify.register(fastifyStatic, { root: scramjetPath, prefix: "/scram/", decorateReply: false });
fastify.register(fastifyStatic, { root: libcurlPath, prefix: "/libcurl/", decorateReply: false });
fastify.register(fastifyStatic, { root: baremuxPath, prefix: "/baremux/", decorateReply: false });

fastify.setNotFoundHandler((req, reply) =>
  reply.code(404).type("text/html").sendFile("404.html")
);

const port = parseInt(process.env.PORT || "8080", 10);
fastify.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`Web proxy listening on http://localhost:${port}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await fastify.close();
    process.exit(0);
  });
}
