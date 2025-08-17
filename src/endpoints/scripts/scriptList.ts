
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { contentJson } from "chanfana";

const ScriptSchema = z.object({
  id: z.number(),
  name: z.string(),
  r2_file_link: z.string(),
  created_at: z.string(),
  personas: z.string().nullable(),
});

export class ScriptList extends OpenAPIRoute {
  public schema = {
    tags: ["Scripts"],
    summary: "List all Scripts",
    responses: {
      "200": {
        description: "Returns a list of scripts",
        ...contentJson({
          success: z.boolean(),
          result: z.array(ScriptSchema),
        }),
      },
    },
  };

  public async handle(c: AppContext) {
    const { results } = await c.env.DB.prepare(
      "SELECT id, name, r2_file_link, created_at, personas FROM scripts",
    ).all();

    return {
      success: true,
      result: results,
    };
  }
}
