/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { Layer, LngLatBoundsLike, Source, useMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";

export const CountryByNameSourceLayer: React.FC<{
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
