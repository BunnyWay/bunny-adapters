import { defineAction } from "astro:actions";
import { z } from "astro:schema";

export const server = {
  greet: defineAction({
    input: z.object({ name: z.string().min(1) }),
    handler: ({ name }) => `Hello, ${name}!`,
  }),

  fromForm: defineAction({
    accept: "form",
    input: z.object({ name: z.string().min(1) }),
    handler: ({ name }) => ({ greeting: `Hello, ${name}!` }),
  }),
};
