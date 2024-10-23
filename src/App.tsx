/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import "maplibre-gl/dist/maplibre-gl.css";

import { CountryByNameMap } from "./components/CountryByNameMap";
import { CountryByPopulationMap } from "./components/CountryByPopulationMap";
import { NumberOfCountries } from "./components/NumberOfCountries";
import { LargestCountries } from "./components/LargestCountries";
import { OverpassAPIHokoraChoroplethMap } from "./components/OverpassAPIHokoraChoroplethMap";

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
    CREATE TABLE countries AS SELECT * FROM ST_Read('${basename}ne_110m_admin_0_countries.json');
  `;

  useEffect(() => {
    if (!duckdbInitialized) {
      initDuckDB(setMyDuckDB);
      setDuckDBInitialized(true);
    }
  }, [duckdbInitialized]);

  useEffect(() => {
    const loadDuckDB = async (db: duckdb.AsyncDuckDB) => {
      const conn = await db.connect();
      await conn.query(loadQuery);
      await conn.close();
      setDuckDBLoaded(true);
    };
    if (myDuckDB) {
      loadDuckDB(myDuckDB);
    }
  }, [loadQuery, myDuckDB]);

  return (
    <>
      {myDuckDB ? (
        <div className="App">
          <header className="App-header">
            <img src={viteLogo} className="logo" alt="viteLogo" />
            <img src={reactLogo} className="logo" alt="reactLogo" />
            <img
              src="./duckdb.jpg"
              className="logo logo-circle"
              alt="duckdbLogo"
            />
            <p>DuckDB-Wasm has initialized.</p>
          </header>
          {duckdbLoaded ? (
            <>
              <p>Data loaded.</p>
              <pre>{loadQuery}</pre>
              <hr />
              <NumberOfCountries db={myDuckDB} />
              <hr />
              <LargestCountries db={myDuckDB} />
              <hr />
              <CountryByNameMap db={myDuckDB} />
              <hr />
              <CountryByPopulationMap db={myDuckDB} />
              <hr />
              <OverpassAPIHokoraChoroplethMap db={myDuckDB} />
              <hr />
            </>
          ) : (
            <p>Loading data...</p>
          )}
        </div>
      ) : (
        <div className="App">
          <header className="App-header">
            <img src={viteLogo} className="logo" alt="viteLogo" />
            <img src={reactLogo} className="logo" alt="reactLogo" />
            <img
              src="./duckdb.jpg"
              className="logo logo-circle"
              alt="duckdbLogo"
            />
            <p>Initializing DuckDB-Wasm...</p>
          </header>
        </div>
      )}
    </>
  );
}

export default App;
