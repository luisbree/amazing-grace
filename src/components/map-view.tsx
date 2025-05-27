
"use client";

import React, { useEffect, useRef } from 'react';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {defaults as defaultControls} from 'ol/control';
import { fromLonLat } from 'ol/proj';

interface MapViewProps {
  mapRef: React.MutableRefObject<OLMap | null>;
  setMapInstance: (map: OLMap) => void;
}

const MapView: React.FC<MapViewProps> = ({ mapRef, setMapInstance }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) { 
      return;
    }

    const osmLayer = new TileLayer({
      source: new OSM(),
    });
    // Give the base layer a name for easier identification if needed
    osmLayer.set('name', 'OSMBaseLayer');

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [osmLayer],
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

    mapRef.current = map; 
    setMapInstance(map); 

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined); 
      }
    };
  }, [mapRef, setMapInstance]); 

  return <div ref={mapElementRef} className="w-full h-full bg-gray-200" />;
};

export default MapView;

