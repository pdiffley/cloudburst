import { Cloudburst } from ".";

export class QueryBuilder {
  private cloudburstClient: Cloudburst;
  private schemaValue: string | null = null;
  private table: string;
  private whereClauses: [string, string, unknown][];

  constructor(cloudburstClient: Cloudburst, table: string) {
    this.cloudburstClient = cloudburstClient;
    this.table = table;
    this.whereClauses = [];
  }

  inSchema(schema: string): this {
    this.schemaValue = schema;
    return this;
  }

  where(column: string, operator: string, parameter: unknown): this {
    this.whereClauses.push([column, operator, parameter]);
    return this;
  }

  onQueryResultChange(
    callback: (newRows: readonly Record<string, unknown>[]) => void,
    errorCallback?: (error: Error) => void,
  ) {
    let qualifiedTableName;
    if (this.schemaValue) {
      qualifiedTableName = `${this.schemaValue}.${this.table}`;
    } else {
      qualifiedTableName = `public.${this.table}`;
    }

    const conditions = [] as [string, string][];
    const parameters = {} as Record<string, unknown>;
    const usedFields = new Set();
    let inequalityFilterUsed = false;
    for (const [column, operator, parameter] of this.whereClauses) {
      if (usedFields.has(column)) {
        throw new Error(
          "invalid parameter provided to subscription: duplicate column filter",
        );
      }
      if (operator !== "=") {
        if (inequalityFilterUsed) {
          throw new Error(
            "invalid parameter provided to subscription: multiple inequality filters are not currently allowed",
          );
        }
        inequalityFilterUsed = true;
      }
      conditions.push([column, operator]);
      parameters[column] = parameter;
    }

    return this.cloudburstClient.subscribeQuery(
      { activeTableName: qualifiedTableName, conditions },
      parameters,
      callback,
      errorCallback,
    );
  }
}
