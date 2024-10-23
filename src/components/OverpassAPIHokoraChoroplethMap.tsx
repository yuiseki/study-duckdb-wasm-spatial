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
import osmtogeojson from "osmtogeojson";

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

export const OverpassAPIHokoraChoroplethMap: React.FC<{
  db: duckdb.AsyncDuckDB;
}> = ({ db }) => {
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
