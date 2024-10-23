/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table, StructRowProxy } from "apache-arrow";

export const LargestCountries: React.FC<{ db: duckdb.AsyncDuckDB }> = ({
  db,
}) => {
  // 最も広い国を5件取得するクエリ
  const query = `
    LOAD json;
    LOAD spatial;
    SELECT name as name, ST_Area(geom) as area FROM countries ORDER BY area DESC LIMIT 5;
  `;
  const [result, setResult] = useState<StructRowProxy<any>[] | null>(null);

  useEffect(() => {
    const doit = async () => {
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results
        .toArray()
        .map((row: any) => JSON.parse(row));
      setResult(resultRows);
      await conn.close();
    };
    doit();
  }, [db, query]);

  return (
    <div>
      <h2>
        Largest countries (Using ST_Area, most simple Spatial Function from
        DuckDB-Spatial, on DuckDB-Wasm)
      </h2>
      <pre>{query}</pre>
      {result ? (
        result.map((row, i) => (
          <p key={i}>
            {row.name}: {row.area}
          </p>
        ))
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};
