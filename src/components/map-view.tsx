
"use client";

import React, { useEffect, useRef } from 'react';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {defaults as defaultControls} from 'ol/control';
import { fromLonLat } from 'ol/proj';
import type { MapLayer } from '@/components/geo-mapper-client';

interface MapViewProps {
  mapRef: React.MutableRefObject<OLMap | null>;
  layers: MapLayer[]; 
  setMapInstance: (map: OLMap) => void;
}

const MapView: React.FC<MapViewProps> = ({ mapRef, layers, setMapInstance }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: fromLonLat([-60.0, -36.5], 'EPSG:3857'), // Center on Buenos Aires Province
        zoom: 7, // Adjusted zoom level for a province
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

    layers.forEach(layer => {
        if (layer.olLayer && !map.getLayers().getArray().includes(layer.olLayer)) {
            map.addLayer(layer.olLayer);
            layer.olLayer.setVisible(layer.visible);
        }
    });
    
    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
      }
    };
  }, [setMapInstance, layers, mapRef]); 

  return <div ref={mapElementRef} className="w-full h-full bg-gray-200" />;
};

export default MapView;

