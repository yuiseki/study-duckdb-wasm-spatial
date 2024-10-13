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

import type { Table, StructRowProxy } from "apache-arrow";

import Map, {
  Layer,
  LngLatBoundsLike,
  MapProvider,
  Source,
  useMap,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import * as turf from "@turf/turf";

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

const CountryByNameSourceLayer: React.FC<{
  result: any;
}> = ({ result }) => {
  const map = useMap();

  useEffect(() => {
    // 地図を中心に移動する
    if (result && map) {
      const [minLng, minLat, maxLng, maxLat] = turf.bbox(result);
      const bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as LngLatBoundsLike;
      map.current?.fitBounds(bounds, {
        padding: 10,
        duration: 500,
      });
    }
  }, [result, map]);
  return (
    <Source type="geojson" data={result}>
      <Layer
        id="result"
        type="fill"
        paint={{ "fill-color": "red", "fill-opacity": 0.5 }}
      />
    </Source>
  );
};

const CountryByName: React.FC<{ db: duckdb.AsyncDuckDB }> = ({ db }) => {
  const [countryName, setCountryName] = useState<string>("Japan");
  const [result, setResult] = useState<any | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    // 国名を指定して国の情報を取得するクエリ
    // AsGeoJson関数を使ってGeoJSON形式で取得
    setQuery(`
      LOAD json;
      LOAD spatial;
      SELECT name as name, ST_AsGeoJSON(geom) as geom FROM countries WHERE name = '${countryName}';
    `);
  }, [countryName]);

  useEffect(() => {
    const fetch = async () => {
      if (!query) return;
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results.toArray();
      if (resultRows.length === 0) {
        setResult(null);
        return;
      }
      // geojsonにする
      const resultGeoJson = {
        type: "Feature",
        properties: { name: resultRows[0].name },
        geometry: JSON.parse(resultRows[0].geom),
      };
      setResult(resultGeoJson);
      await conn.close();
    };
    fetch();
  }, [db, query]);

  return (
    <div>
      <h2>Country by name</h2>
      <input
        type="text"
        value={countryName}
        onChange={(e) => setCountryName(e.target.value)}
      />
      <pre>{query}</pre>
      {!result && <p>Loading...</p>}

      <MapProvider>
        <Map
          style={{ width: 600, height: 400 }}
          initialViewState={{
            latitude: 0,
            longitude: 0,
            zoom: 1,
          }}
          mapStyle="https://tile.openstreetmap.jp/styles/osm-bright/style.json"
        >
          {result && <CountryByNameSourceLayer result={result} />}
        </Map>
      </MapProvider>
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
              <CountryByName db={myDuckDB} />
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
