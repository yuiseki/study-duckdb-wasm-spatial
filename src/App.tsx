/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import type { Table, StructRowProxy } from "apache-arrow";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

const initDuckDB = async (
  setMyDuckDB: React.Dispatch<React.SetStateAction<duckdb.AsyncDuckDB | null>>
) => {
  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  // Instantiate the asynchronous version of DuckDB-wasm
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  setMyDuckDB(db);
  const c = await db.connect();
  await c.query(`
    INSTALL json;
    INSTALL spatial;
  `);
};

const NumberOfCountries: React.FC<{ db: duckdb.AsyncDuckDB }> = ({ db }) => {
  // 国の数を取得するクエリ
  const query = `
    SELECT COUNT(*) FROM countries;
  `;
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results
        .toArray()
        .map((row: any) => JSON.parse(row));
      const values = Object.values(resultRows[0]);
      setResult(values[0]);
      await conn.close();
    };
    fetch();
  }, [db, query]);

  return (
    <div>
      <h2>Number of countries</h2>
      <pre>{query}</pre>
      <p>{result ? <span>{result}</span> : <span>Loading...</span>}</p>
    </div>
  );
};

const LargestCountries: React.FC<{ db: duckdb.AsyncDuckDB }> = ({ db }) => {
  // 最も広い国を5件取得するクエリ
  const query = `
    LOAD json;
    LOAD spatial;
    SELECT name as name, ST_Area(geom) as area FROM countries ORDER BY area DESC LIMIT 5;
  `;
  const [result, setResult] = useState<StructRowProxy<any>[] | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results
        .toArray()
        .map((row: any) => JSON.parse(row));
      setResult(resultRows);
      console.log(resultRows);
      await conn.close();
    };
    fetch();
  }, [db, query]);

  return (
    <div>
      <h2>Largest countries</h2>
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

function App() {
  const [duckdbInitialized, setDuckDBInitialized] = useState(false);
  const [duckdbLoaded, setDuckDBLoaded] = useState(false);
  const [myDuckDB, setMyDuckDB] = useState<duckdb.AsyncDuckDB | null>(null);
  const origin = window.location.origin;
  const path = window.location.pathname;
  let basename = origin;
  if (path !== "/") {
    basename = origin + path;
  }

  const loadQuery = `
    LOAD json;
    LOAD spatial;
    CREATE TABLE countries AS SELECT * FROM ST_Read('${basename}/ne_110m_admin_0_countries.json');
  `;

  useEffect(() => {
    if (!duckdbInitialized) {
      initDuckDB(setMyDuckDB);
      setDuckDBInitialized(true);
    }
  }, [duckdbInitialized]);

  useEffect(() => {
    const loadDuckDB = async (db: duckdb.AsyncDuckDB) => {
      const c = await db.connect();
      await c.query(loadQuery);
      await c.close();
    };
    if (myDuckDB) {
      loadDuckDB(myDuckDB);
      setDuckDBLoaded(true);
    }
  }, [loadQuery, myDuckDB]);

  return (
    <>
      {myDuckDB ? (
        <div className="App">
          <header className="App-header">
            <img src={reactLogo} className="logo" alt="reactLogo" />
            <img src={viteLogo} className="logo" alt="viteLogo" />
            <img
              src="./duckdb.jpg"
              className="logo logo-circle"
              alt="duckdbLogo"
            />
            <p>DuckDB-wasm has initialized.</p>
          </header>
          {duckdbLoaded ? (
            <>
              <p>Data loaded.</p>
              <pre>{loadQuery}</pre>
              <hr />
              <NumberOfCountries db={myDuckDB} />
              <LargestCountries db={myDuckDB} />
            </>
          ) : (
            <p>Data loading...</p>
          )}
        </div>
      ) : (
        <div className="App">
          <header className="App-header">
            <img src={reactLogo} className="logo" alt="reactLogo" />
            <img src={viteLogo} className="logo" alt="viteLogo" />
            <img
              src="./duckdb.jpg"
              className="logo logo-circle"
              alt="duckdbLogo"
            />
            <p>DuckDB-wasm is initializing...</p>
          </header>
        </div>
      )}
    </>
  );
}

export default App;
