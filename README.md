# audiolab-api

## Getting Started

This project requires a D1 database and an R2 bucket. You can use the provided initialization script to set them up.

1. **Initialize Cloudflare Resources**

   Run the following script to create the D1 database and the R2 bucket:

   ```bash
   ./init_resources.sh
   ```

   This will also print the `database_id` for your D1 database. Make sure to update your `wrangler.jsonc` with this ID.

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run locally**

   The `dev` command will automatically apply the necessary D1 migrations.

   ```bash
   npm run dev
   ```

4. **Deploy**

   ```bash
   npx wrangler deploy
   ```

## Cloudflare Services

This worker uses the following Cloudflare services:

- **D1 Database:** For storing script metadata.
- **R2 Bucket:** For storing the generated script files.
- **Workers AI:** For generating the scripts using an LLM.

Make sure the bindings for these services in `wrangler.jsonc` are correct.


## Testing

This template includes integration tests using [Vitest](https://vitest.dev/). To run the tests locally:

```bash
npm run test
```

Test files are located in the `tests/` directory, with examples demonstrating how to test your endpoints and database interactions.

## Project structure

1. Your main router is defined in `src/index.ts`.
2. Each endpoint has its own file in `src/endpoints/`.
3. Integration tests are located in the `tests/` directory.
4. For more information read the [chanfana documentation](https://chanfana.com/), [Hono documentation](https://hono.dev/docs), and [Vitest documentation](https://vitest.dev/guide/).
