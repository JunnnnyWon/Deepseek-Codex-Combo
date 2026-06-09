#!/usr/bin/env node

import { createServer } from "node:http";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex === -1 ? 0 : Number(args[portIndex + 1] ?? "0");

if (args[0] === "--once") {
  if (args[1] === "/healthz") {
    console.log("mock-deepseek ready");
    process.exit(0);
  }
  console.error("mock_route_unknown");
  process.exit(1);
}

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", (error) => reject(error));
  });

const writeJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
};

const writeStream = (response) => {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream",
  });
  response.write(
    'data: {"id":"chatcmpl_fixture","choices":[{"index":0,"delta":{"content":"fixture-stream"}}]}\n\n',
  );
  response.write(
    'data: {"id":"chatcmpl_fixture","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_fixture","type":"function","function":{"name":"fixture-tool","arguments":"{\\"id\\":\\"fixture\\"}"}}]}}]}\n\n',
  );
  response.end("data: [DONE]\n\n");
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const body = await readBody(request);
      if (body.includes('"stream":true')) {
        writeStream(response);
        return;
      }

      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "tool_calls",
            index: 0,
            message: {
              content: "fixture response",
              role: "assistant",
              tool_calls: [
                {
                  function: {
                    arguments: '{"id":"fixture"}',
                    name: "fixture-tool",
                  },
                  id: "call_fixture",
                  type: "function",
                },
              ],
            },
          },
        ],
        id: "chatcmpl_fixture",
        model: "deepseek-chat",
        object: "chat.completion",
      });
      return;
    }

    writeJson(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    writeJson(response, 500, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address === "object" && address !== null) {
    console.log(`mock-deepseek ready http://127.0.0.1:${address.port}`);
  }
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});
