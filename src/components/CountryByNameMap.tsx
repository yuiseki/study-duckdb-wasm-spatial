/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table, StructRowProxy } from "apache-arrow";
import Map, { MapProvider } from "react-map-gl/maplibre";
import { CountryByNameSourceLayer } from "./CountryByNameSourceLayer";

export const CountryByNameMap: React.FC<{ db: duckdb.AsyncDuckDB }> = ({
  db,
}) => {
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
