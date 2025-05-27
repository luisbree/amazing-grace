
"use client";

import React, { useEffect, useRef } from 'react';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {defaults as defaultControls} from 'ol/control';
import { fromLonLat } from 'ol/proj';
// MapLayer interface is defined in geo-mapper-client and not directly used here for layer addition

interface MapViewProps {
  mapRef: React.MutableRefObject<OLMap | null>;
  setMapInstance: (map: OLMap) => void;
}

const MapView: React.FC<MapViewProps> = ({ mapRef, setMapInstance }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) { // If map already initialized, do nothing
      return;
    }

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        new TileLayer({
          source: new OSM(), // Base OSM layer
        }),
      ],
      view: new View({
        center: fromLonLat([-60.0, -36.5], 'EPSG:3857'),
        zoom: 7,
        projection: 'EPSG:3857', 
        constrainResolution: true, 
      }),
      controls: defaultControls({
        attributionOptions: {
          collapsible: false,
        },
        zoom: true,
        rotate: false, 
      }),
    });

    mapRef.current = map; // Set the ref in the parent component
    setMapInstance(map); // Notify parent about the map instance

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined); // Clean up map target on unmount
        // mapRef.current = null; // Avoid setting parent's ref to null here, parent manages its lifecycle
      }
    };
  // mapRef is a ref from parent, setMapInstance is a callback.
  // These should be stable or correctly memoized by the parent.
  // Adding them to dependency array ensures effect runs if they were to change,
  // though for refs and typical callbacks this isn't always necessary if parent guarantees stability.
  }, [mapRef, setMapInstance]); 

  return <div ref={mapElementRef} className="w-full h-full bg-gray-200" />;
};

export default MapView;
