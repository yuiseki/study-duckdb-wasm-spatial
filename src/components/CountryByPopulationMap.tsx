/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import * as turf from "@turf/turf";
import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table, StructRowProxy } from "apache-arrow";
import Map, {
  Layer,
  LngLatBoundsLike,
  MapProvider,
  Source,
  useMap,
} from "react-map-gl/maplibre";

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

export const CountryByPopulationMap: React.FC<{ db: duckdb.AsyncDuckDB }> = ({
  db,
}) => {
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
