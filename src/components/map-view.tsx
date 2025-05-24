"use client";

import React, { useEffect, useRef } from 'react';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {defaults as defaultControls} from 'ol/control';
import type { MapLayer } from '@/components/geo-mapper-client';

interface MapViewProps {
  mapRef: React.MutableRefObject<OLMap | null>;
  layers: MapLayer[]; // Though not directly used for rendering here, useful for potential future effects
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
        center: [0, 0],
        zoom: 2,
        projection: 'EPSG:3857', // Standard projection for OSM
        constrainResolution: true, // Prevents zooming too far
      }),
      controls: defaultControls({
        attributionOptions: {
          collapsible: false,
        },
        zoom: true,
        rotate: false, // Typically not needed for 2D web maps
      }),
    });

    mapRef.current = map;
    setMapInstance(map);

    // Add any pre-existing layers (e.g., if state was restored or layers added before map init)
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
      // Do not nullify mapRef.current here as it might be accessed during cleanup or by other effects
    };
  }, [setMapInstance, layers, mapRef]); // layers in dependency to re-apply if map re-initializes with existing layers

  return <div ref={mapElementRef} className="w-full h-full bg-gray-200" />;
};

export default MapView;
