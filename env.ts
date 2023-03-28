import { z, ZodFormattedError } from "zod";

// This file takes heavy inspiration and implementation from how `create-t3-app`
// handles environment variables.

export const environmentSchema = z.object({
  NOTION_TOKEN: z.string().startsWith("secret_"),
});

export type Environment = z.infer<typeof environmentSchema>;

const environment: Partial<Environment> = {
  NOTION_TOKEN: process.env.NOTION_TOKEN,
};

const formatErrors = (errors: ZodFormattedError<Map<string, string>, string>) =>
  Object.entries(errors)
    .map(([name, value]) => {
      if (value && "_errors" in value)
        return `${name}: ${value._errors.join(", ")}\n`;
    })
    .filter(Boolean);

const parsedEnv = environmentSchema.safeParse(environment);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:\n",
    ...formatErrors(parsedEnv.error.format())
  );

  throw new Error("Invalid environment variables.");
}

export const env = parsedEnv.data;
