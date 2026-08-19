import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let index = 1; index <= 5; index++) {
        controller.enqueue(encoder.encode(`chunk-${index}\n`));
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
