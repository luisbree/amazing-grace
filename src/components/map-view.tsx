
"use client";

import React, { useEffect, useRef } from 'react';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import {defaults as defaultControls} from 'ol/control';
import { fromLonLat } from 'ol/proj';

interface MapViewProps {
  mapRef: React.MutableRefObject<OLMap | null>;
  setMapInstance: (map: OLMap) => void;
}

export const BASE_LAYER_DEFINITIONS = [
  {
    id: 'osm-standard',
    name: 'OpenStreetMap',
    createLayer: () => new TileLayer({
      source: new OSM(),
      properties: { baseLayerId: 'osm-standard', isBaseLayer: true, name: 'OSMBaseLayer' },
    }),
  },
  {
    id: 'carto-light',
    name: 'OSM Gris (Carto)',
    createLayer: () => new TileLayer({
      source: new XYZ({ 
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: 'Map tiles by <a href="https://carto.com/attributions">Carto</a>, under CC BY 3.0. Data by <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, under ODbL.',
        maxZoom: 20, // Carto maps generally support up to zoom 20 or more
      }),
      visible: false, 
      properties: { baseLayerId: 'carto-light', isBaseLayer: true, name: 'CartoGrayscaleBaseLayer' },
    }),
  },
  {
    id: 'esri-satellite',
    name: 'ESRI Satelital',
    createLayer: () => new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      }),
      visible: false, 
      properties: { baseLayerId: 'esri-satellite', isBaseLayer: true, name: 'ESRISatelliteBaseLayer' },
    }),
  },
] as const;


const MapView: React.FC<MapViewProps> = ({ mapRef, setMapInstance }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) { 
      return;
    }

    const initialBaseLayers = BASE_LAYER_DEFINITIONS.map(def => def.createLayer());

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [...initialBaseLayers], 
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

    // No direct layer manipulation here, GeoMapperClient handles synchronization
    
    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined); 
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mapRef and setMapInstance are stable from useCallback

  return <div ref={mapElementRef} className="w-full h-full bg-gray-200" />;
};

export default MapView;
