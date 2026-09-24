import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { UivoidApi } from "./api.js";
import type { Config, DatabaseToolInput, HostedTable } from "./types.js";

interface Options {
  project: string; token?: string; db?: string; schema?: string;
  operation?: string; path?: string; description?: string; name?: string;
  file?: string; args?: string; json?: boolean;
}

export function parseArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Arguments must be a JSON object");
  return parsed as Record<string, unknown>;
}

export function registerDatabaseCommands(program: Command, authenticatedConfig: (token?: string) => Promise<Config>): void {
  const db = program.command("db").description("Create hosted databases, tables and MCP/HTTP operations (500 MB per database)");
  function common(command: Command): Command {
    return command.requiredOption("--project <project>", "project subdomain or UUID")
      .option("--token <token>", "account token (or UIVOID_TOKEN)")
      .option("--json", "JSON output (also the default for database commands)");
  }
  async function context(options: Options) {
    const api = new UivoidApi(await authenticatedConfig(options.token));
    const { projects } = await api.listProjects();
    const project = projects.find(p => p.id === options.project || p.subdomain === options.project);
    if (!project) throw new Error("Project not found; create it first with `uivoid create <name> --no-discover`");
    return { api, project };
  }
  async function databaseContext(options: Options, name: string) {
    const { api, project } = await context(options);
    const { databases } = await api.listDatabases(project.id);
    const database = databases.find(d => d.id === name || d.name === name);
    if (!database) throw new Error("Database not found in this project");
    return { api, project, database };
  }
  const output = (value: unknown) => console.log(JSON.stringify(value));

  common(db.command("create <name>").description("Create a database; repeating its name resumes provisioning"))
    .action(async (name: string, options: Options) => {
      const { api, project } = await context(options);
      output(await api.createDatabase(project.id, name));
    });
  common(db.command("list").description("List project databases"))
    .action(async (options: Options) => {
      const { api, project } = await context(options);
      output(await api.listDatabases(project.id));
    });
  common(db.command("size <database>").description("Measure physical bytes and the hardcoded 500 MB limit"))
    .action(async (name: string, options: Options) => {
      const { api, project, database } = await databaseContext(options, name);
      output(await api.databaseSize(project.id, database.id));
    });
  const table = db.command("table").description("Manage typed tables; an id UUID column is generated automatically");
  common(table.command("create <name>")).requiredOption("--db <database>", "database name or UUID")
    .requiredOption("--schema <file>", "JSON column definitions")
    .action(async (name: string, options: Options) => {
      const columns = parseArguments(await readFile(options.schema!, "utf8")) as HostedTable["columns"];
      const { api, project, database } = await databaseContext(options, options.db!);
      output(await api.createTable(project.id, database.id, name, columns));
    });
  common(table.command("list")).requiredOption("--db <database>", "database name or UUID")
    .action(async (options: Options) => {
      const { api, project, database } = await databaseContext(options, options.db!);
      output(await api.listTables(project.id, database.id));
    });
  common(db.command("expose <table>").description("Register one described HTTP endpoint and MCP tool"))
    .requiredOption("--db <database>", "database name or UUID")
    .requiredOption("--operation <operation>", "list, get, insert, update or delete")
    .requiredOption("--name <name>", "unique MCP tool name")
    .requiredOption("--description <description>", "explain when and how the tool should be used")
    .requiredOption("--path <path>", "static HTTP route, e.g. /products")
    .action(async (tableName: string, options: Options) => {
      if (!["list", "get", "insert", "update", "delete"].includes(options.operation!)) throw new Error("Unsupported database operation");
      const { api, project, database } = await databaseContext(options, options.db!);
      const { tables } = await api.listTables(project.id, database.id);
      const selected = tables.find(t => t.name === tableName || t.id === tableName);
      if (!selected) throw new Error("Table not found in this database");
      output(await api.createTool(project.id, {
        kind: "database", name: options.name!, description: options.description!,
        hosted_table_id: selected.id, operation: options.operation as DatabaseToolInput["operation"], route: options.path!,
      }));
    });
  common(db.command("call <endpoint>").description("Execute a hosted endpoint using your current organization role"))
    .option("--file <file>", "JSON arguments file")
    .option("--args <json>", "JSON arguments; prefer --file for sensitive row values")
    .action(async (name: string, options: Options) => {
      if (options.file && options.args) throw new Error("Use --file or --args, not both");
      const args = parseArguments(options.file ? await readFile(options.file, "utf8") : options.args ?? "{}");
      const { api, project } = await context(options);
      const { tools } = await api.listTools(project.id);
      const endpoint = tools.find(t => (t.id === name || t.name === name) && t.kind === "database");
      if (!endpoint) throw new Error("Hosted endpoint not found; register it with `uivoid db expose` first");
      output(await api.runDatabaseTool(project.id, endpoint.id, args));
    });
}
