import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";

import type { BrowserCommand } from "../lib/types";
import type { MiniSession } from "./tabs";

const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 256 * 1024;

type AgentCommand = Extract<BrowserCommand, { type: "navigate" | "newTab" | "closeTab" | "switchTab" | "back" | "forward" | "reload" | "stop" | "resetSession" }>;

export class AgentServer {
  private server: ReturnType<typeof createServer> | null = null;
  private token = process.env.MINIMAL_AGENT_TOKEN ?? randomBytes(32).toString("hex");

  constructor(private readonly session: MiniSession) {}

  async start(port: number): Promise<number> {
    if (this.server) throw new Error("Agent control server is already running.");

    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, HOST, () => resolve());
    });

    const address = this.server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    await this.writeAgentFile(actualPort);
    console.log(`Agent control API listening on http://${HOST}:${actualPort}`);
    return actualPort;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.headers(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (!this.authorized(request)) {
      this.json(response, 401, { error: "Unauthorized" });
      return;
    }

    const url = new URL(request.url ?? "/", `http://${HOST}`);
    try {
      if (request.method === "GET" && url.pathname === "/v1/health") {
        this.json(response, 200, { ok: true, version: app.getVersion() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/state") {
        this.json(response, 200, this.session.getState());
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/page") {
        const page = await this.session.agentSnapshot(url.searchParams.get("tabId") ?? undefined);
        this.json(response, 200, page);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/screenshot") {
        const image = await this.session.agentScreenshot(url.searchParams.get("tabId") ?? undefined);
        response.writeHead(200, { "Content-Type": "image/png", "Content-Length": image.length });
        response.end(image);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/command") {
        const command = await this.readCommand(request);
        const state = await this.session.handle(command);
        this.json(response, 200, state);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/evaluate") {
        const body = await this.readJson(request);
        if (typeof body.expression !== "string") throw new Error("expression must be a string");
        const result = await this.session.agentEvaluate(
          body.expression,
          typeof body.tabId === "string" ? body.tabId : undefined,
        );
        this.json(response, 200, { result });
        return;
      }

      this.json(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent request failed.";
      this.json(response, 400, { error: message });
    }
  }

  private async readCommand(request: IncomingMessage): Promise<AgentCommand> {
    const body = await this.readJson(request);
    if (!body || typeof body.type !== "string") throw new Error("command.type is required");
    const type = body.type;
    const allowed = new Set([
      "navigate",
      "newTab",
      "closeTab",
      "switchTab",
      "back",
      "forward",
      "reload",
      "stop",
      "resetSession",
    ]);
    if (!allowed.has(type)) throw new Error("Unsupported browser command");
    if (type === "navigate" && typeof body.url !== "string") throw new Error("navigate.url is required");
    if ((type === "closeTab" || type === "switchTab") && typeof body.id !== "string") {
      throw new Error(`${type}.id is required`);
    }
    return body as AgentCommand;
  }

  private async readJson(request: IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
      chunks.push(buffer);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Request body must be a JSON object");
      }
      return value as Record<string, any>;
    } catch (error) {
      if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
      throw new Error("Request body must be valid JSON");
    }
  }

  private authorized(request: IncomingMessage): boolean {
    const value = request.headers.authorization ?? "";
    const supplied = value.startsWith("Bearer ") ? value.slice(7) : "";
    const expected = Buffer.from(this.token);
    const actual = Buffer.from(supplied);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private headers(response: ServerResponse): void {
    response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Cache-Control", "no-store");
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(value);
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(body);
  }

  private async writeAgentFile(port: number): Promise<void> {
    const directory = app.getPath("userData");
    const path = join(directory, "agent.json");
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${JSON.stringify({ host: HOST, port, token: this.token }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(path, 0o600);
  }
}
