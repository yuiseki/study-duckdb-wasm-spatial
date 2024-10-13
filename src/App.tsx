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
import osmtogeojson from "osmtogeojson";

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

const LargestCountries: React.FC<{ db: duckdb.AsyncDuckDB }> = ({ db }) => {
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

const CountryByNameSourceLayer: React.FC<{
  result: any;
}> = ({ result }) => {
  const { countryByNameMap: map } = useMap();

  useEffect(() => {
    // 地図をresultの中心に移動する
    if (result && map) {
      const [minLng, minLat, maxLng, maxLat] = turf.bbox(result);
      const bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as LngLatBoundsLike;
      map?.fitBounds(bounds, {
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
    // ST_AsGeoJson関数を使ってGeoJSON形式で取得
    setQuery(`
      LOAD json;
      LOAD spatial;
      SELECT name as name, ST_AsGeoJSON(geom) as geom FROM countries WHERE name = '${countryName}';
    `);
  }, [countryName]);

  useEffect(() => {
    const doit = async () => {
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
    doit();
  }, [db, query]);

  return (
    <div>
      <h2>
        Country by name (Using ST_AsGeoJSON and render one result on the map)
      </h2>
      <input
        type="text"
        value={countryName}
        onChange={(e) => setCountryName(e.target.value)}
      />
      <pre>{query}</pre>
      {!result && <p>Loading...</p>}
      <MapProvider>
        <Map
          id="countryByNameMap"
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

const CountryByPopulationSourceLayer: React.FC<{
  results: any;
}> = ({ results }) => {
  const { countryByPopulationMap: map } = useMap();

  useEffect(() => {
    if (results && map) {
      const [minLng, minLat, maxLng, maxLat] = turf.bbox({
        type: "FeatureCollection",
        features: results,
      });
      const bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as LngLatBoundsLike;
      map?.fitBounds(bounds, {
        padding: 10,
        duration: 500,
      });
    }
  }, [results, map]);

  return (
    <>
      {results.map((result: any, i: number) => (
        <Source key={i} type="geojson" data={result}>
          <Layer
            id={`result-${i}`}
            type="fill"
            paint={{ "fill-color": "red", "fill-opacity": 0.5 }}
          />
        </Source>
      ))}
    </>
  );
};

const CountryByPopulation: React.FC<{ db: duckdb.AsyncDuckDB }> = ({ db }) => {
  const [minPopulation, setMinPopulation] = useState<number>(20000000);
  const [results, setResults] = useState<any[] | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    // 人口が指定値以上の国の情報を取得するクエリ
    // ST_AsGeoJson関数を使ってGeoJSON形式で取得
    setQuery(`
      LOAD json;
      LOAD spatial;
      SELECT name as name, POP_EST as population, ST_AsGeoJSON(geom) as geom FROM countries WHERE POP_EST > ${minPopulation};
    `);
  }, [minPopulation]);

  useEffect(() => {
    const doit = async () => {
      if (!query) return;
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results.toArray();
      if (resultRows.length === 0) {
        setResults(null);
        return;
      }
      // geojsonにする
      const resultGeoJson = resultRows.map((row) => ({
        type: "Feature",
        properties: { name: row.name, population: row.population },
        geometry: JSON.parse(row.geom),
      }));
      setResults(resultGeoJson);
      await conn.close();
    };
    doit();
  }, [db, query]);

  return (
    <div>
      <h2>
        Country by population (Using ST_AsGeoJSON and render multiple results on
        the map)
      </h2>
      <input
        style={{
          width: "60%",
        }}
        type="range"
        min={1}
        max={1600000000}
        step={1000000}
        value={minPopulation}
        onChange={(e) => setMinPopulation(Number(e.target.value))}
      />
      <pre>{query}</pre>
      {!results && <p>Loading...</p>}
      <MapProvider>
        <Map
          id="countryByPopulationMap"
          style={{ width: 600, height: 400 }}
          initialViewState={{
            latitude: 0,
            longitude: 0,
            zoom: 1,
          }}
          mapStyle="https://tile.openstreetmap.jp/styles/osm-bright/style.json"
        >
          {results && <CountryByPopulationSourceLayer results={results} />}
        </Map>
      </MapProvider>
    </div>
  );
};

// ここからは、日本の祠の都道府県別のコロプレスマップを作成するデモ
const OverpassAPIHokoraChoroplethMapSourceLayer: React.FC<{
  results: any;
}> = ({ results }) => {
  const { overpassAPIHokoraChoroplethMap: map } = useMap();

  useEffect(() => {
    if (results && map) {
      const [minLng, minLat, maxLng, maxLat] = turf.bbox(results);
      const bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as LngLatBoundsLike;
      map?.fitBounds(bounds, {
        padding: 10,
        duration: 500,
      });
    }
  }, [results, map]);

  console.log("results", results);

  return (
    <>
      <Source type="geojson" data={results}>
        <Layer
          id={`result-hokora`}
          type="fill"
          paint={{
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              0,
              "#f7f7f7",
              10,
              "#fee5d9",
              100,
              "#fcbba1",
              200,
              "#fc9272",
              300,
              "#fb6a4a",
              400,
              "#de2d26",
              500,
              "#a50f15",
            ],
            "fill-opacity": 0.8,
          }}
        />
      </Source>
    </>
  );
};

const OverpassAPIHokoraChoroplethMap: React.FC<{ db: duckdb.AsyncDuckDB }> = ({
  db,
}) => {
  const [results, setResults] = useState<any | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [overpassQueryHokora, setOverpassQueryHokora] = useState<string | null>(
    null
  );
  const [loadingOverpassHokora, setLoadingOverpassHokora] =
    useState<boolean>(false);
  const [overpassQueryPref, setOverpassQueryPref] = useState<string | null>(
    null
  );
  const [loadingOverpassPref, setLoadingOverpassPref] =
    useState<boolean>(false);

  useEffect(() => {
    // Overpass API で日本の都道府県を取得するクエリ
    setOverpassQueryPref(`
        [out:json];
        area["ISO3166-1"="JP"][admin_level=2];
        relation["boundary"="administrative"]["admin_level"="4"](area);
        out geom;
    `);
  }, []);

  useEffect(() => {
    // Overpass API で日本の祠を取得するクエリ
    setOverpassQueryHokora(`
        [out:json];
        area["ISO3166-1"="JP"][admin_level=2];
        node["historic"="wayside_shrine"](area);
        out;
    `);
  }, []);

  // 日本の都道府県と祠をDuckDBに保存
  // まず、日本の都道府県
  useEffect(() => {
    const doit = async () => {
      if (!overpassQueryPref) return;
      setLoadingOverpassPref(true);
      const response = await fetch(
        `https://z.overpass-api.de/api/interpreter?data=${encodeURIComponent(
          overpassQueryPref
        )}`
      );
      const resjson = await response.json();
      const geojsonData = osmtogeojson(resjson);
      const conn = await db.connect();
      // jp_prefという空のテーブルを作成
      await conn.query(`
        CREATE TABLE jp_pref (name TEXT, geom GEOMETRY);
      `);
      // jp_prefにgeojsonDataのfeaturesを挿入
      for (const feature of geojsonData.features) {
        // feature.propertiesとfeature.properties.nameがないものはスキップ
        if (!feature.properties?.name) continue;
        // エスケープする
        const name = feature.properties.name.replace(/'/g, "''");
        await conn.query(`
          INSERT INTO jp_pref VALUES ('${
            name || "NoName"
          }', ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'));
        `);
      }
      await conn.close();
      setLoadingOverpassPref(false);
    };
    doit();
  }, [db, overpassQueryPref]);
  // 次に、日本の祠
  useEffect(() => {
    const doit = async () => {
      if (!overpassQueryHokora) return;
      setLoadingOverpassHokora(true);
      const response = await fetch(
        `https://z.overpass-api.de/api/interpreter?data=${encodeURIComponent(
          overpassQueryHokora
        )}`
      );
      const resjson = await response.json();
      const geojsonData = osmtogeojson(resjson);
      const conn = await db.connect();
      // jp_hokoraという空のテーブルを作成
      await conn.query(`
        CREATE TABLE jp_hokora (name TEXT, geom GEOMETRY);
      `);
      // jp_hokoraにgeojsonDataのfeaturesを挿入
      for (const feature of geojsonData.features) {
        // feature.propertiesとfeature.properties.nameがないものはスキップ
        if (!feature.properties?.name) continue;
        // エスケープする
        const name = feature.properties.name.replace(/'/g, "''");
        await conn.query(`
          INSERT INTO jp_hokora VALUES ('${
            name || "NoName"
          }', ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'));
        `);
      }
      await conn.close();
      setLoadingOverpassHokora(false);
    };
    doit();
  }, [db, overpassQueryHokora]);

  // 都道府県ごとの祠の数を取得するクエリ
  // ST_Contains関数を使って都道府県ごとに含まれる祠の数を取得
  // ST_AsGeoJson関数を使って都道府県をGeoJSON形式で取得
  useEffect(() => {
    setQuery(`
      LOAD json;
      LOAD spatial;
      SELECT pref.name as name, COUNT(hokora.name) as count, ST_AsGeoJSON(pref.geom) as geom FROM jp_pref as pref LEFT JOIN jp_hokora as hokora ON ST_Contains(pref.geom, hokora.geom) GROUP BY pref.name, pref.geom;
    `);
  }, []);

  // 都道府県と祠のロードが終わったら、都道府県ごとの祠の数を取得し、resultsにセット
  useEffect(() => {
    const doit = async () => {
      if (loadingOverpassPref || loadingOverpassHokora) return;
      if (!query) return;
      const conn = await db.connect();
      const results: Table = await conn.query(query);
      const resultRows: StructRowProxy<any>[] = results.toArray();
      console.log("result!!!", resultRows);
      if (resultRows.length === 0) {
        setResults(null);
        return;
      }
      // geojsonにする
      const resultGeoJson = resultRows.map((row) => ({
        type: "Feature",
        properties: { name: row.name, count: Number(row.count) },
        geometry: JSON.parse(row.geom),
      }));
      setResults({
        type: "FeatureCollection",
        features: resultGeoJson,
      });
      await conn.close();
    };
    doit();
  }, [db, loadingOverpassPref, loadingOverpassHokora, query]);

  return (
    <div>
      <h2>
        Overpass API demo (Using OpenStreetMap Overpass API and ST_AsGeoJSON,
        render multiple results on the map)
      </h2>
      <pre>{overpassQueryPref}</pre>
      <pre>{overpassQueryHokora}</pre>
      <pre>{query}</pre>
      {!results && <p>Loading...</p>}
      <MapProvider>
        <Map
          id="overpassAPIHokoraChoroplethMap"
          style={{ width: 600, height: 400 }}
          initialViewState={{
            latitude: 0,
            longitude: 0,
            zoom: 1,
          }}
          mapStyle="https://tile.openstreetmap.jp/styles/osm-bright/style.json"
        >
          {results && (
            <OverpassAPIHokoraChoroplethMapSourceLayer results={results} />
          )}
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
              <CountryByName db={myDuckDB} />
              <hr />
              <CountryByPopulation db={myDuckDB} />
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
