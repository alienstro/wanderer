import "reflect-metadata";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv(process.env);
const app = await createApp(env);
app.enableShutdownHooks();
await app.listen(env.PORT);
