import { EventEmitter } from "node:events";
import { Client } from "pg";

export interface AppEvent {
  kind: "notification" | "list";
  recipientId?: string;
  listId?: string;
}

const globalForSse = globalThis as unknown as {
  sseEmitter?: EventEmitter;
  sseListener?: Promise<void>;
};

export function getSseEmitter(): EventEmitter {
  if (!globalForSse.sseEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalForSse.sseEmitter = emitter;
  }
  if (!globalForSse.sseListener) {
    globalForSse.sseListener = startListener(globalForSse.sseEmitter);
  }
  return globalForSse.sseEmitter;
}

async function startListener(emitter: EventEmitter): Promise<void> {
  const connect = async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.channel !== "app_events" || !msg.payload) return;
      try {
        emitter.emit("event", JSON.parse(msg.payload) as AppEvent);
      } catch {
        // ignore malformed payloads
      }
    });
    client.on("error", () => {
      client.end().catch(() => {});
      setTimeout(connect, 3000);
    });
    await client.connect();
    await client.query("LISTEN app_events");
  };
  await connect().catch((err) => {
    console.error("SSE pg listener failed to start", err);
    globalForSse.sseListener = undefined;
  });
}
