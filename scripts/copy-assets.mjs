import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/skill", import.meta.url), { recursive: true });
await cp(
  new URL("../skill/uivoid/SKILL.md", import.meta.url),
  new URL("../dist/skill/SKILL.md", import.meta.url),
);
