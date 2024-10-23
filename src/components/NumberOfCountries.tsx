/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table, StructRowProxy } from "apache-arrow";

export const NumberOfCountries: React.FC<{ db: duckdb.AsyncDuckDB }> = ({
  db,
}) => {
  // 国の数を取得するクエリ
  const query = `
    SELECT COUNT(*) FROM countries;
  `;
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    const doit = async () => {
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results
        .toArray()
        .map((row: any) => JSON.parse(row));
      const values = Object.values(resultRows[0]);
      setResult(values[0]);
      await conn.close();
    };
    doit();
  }, [db, query]);

  return (
    <div>
      <h2>Number of countries (Most simple query for DuckDB-Wasm)</h2>
      <pre>{query}</pre>
      <p>{result ? <span>{result}</span> : <span>Loading...</span>}</p>
    </div>
  );
};
