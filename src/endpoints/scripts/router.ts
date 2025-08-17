import { Hono } from "hono";
import { fromHono } from "chanfana";
import { ScriptList } from "./scriptList";
import { ScriptCreate } from "./scriptCreate";

export const scriptsRouter = fromHono(new Hono());

scriptsRouter.get("/", ScriptList);
scriptsRouter.post("/", ScriptCreate);
