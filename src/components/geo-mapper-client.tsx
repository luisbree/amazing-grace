
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';

import MapView from '@/components/map-view';
// MapControls and Card are not directly used in this extremely simplified debug version
// import MapControls from '@/components/map-controls';
// import { Card } from '@/components/ui/card';
import { Toaster } from "@/components/ui/toaster";

export interface MapLayer {
  id: string;
  name: string;
  olLayer: VectorLayer<VectorSource<Feature<any>>>;
  visible: boolean;
}

export default function GeoMapperClient() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const mapRef = useRef<OLMap | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null); // Keep for border and as context for absolute positioning

  // Layer and map instance logic remains
  const addLayer = useCallback((newLayer: MapLayer) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers, newLayer];
      if (mapRef.current) {
        mapRef.current.addLayer(newLayer.olLayer);
        newLayer.olLayer.setVisible(newLayer.visible);
      }
      return updatedLayers;
    });
  }, []);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        if (layer.id === layerId) {
          const newVisibility = !layer.visible;
          if (layer.olLayer) {
            layer.olLayer.setVisible(newVisibility);
          }
          return { ...layer, visible: newVisibility };
        }
        return layer;
      })
    );
  }, []);
  
  const setMapInstance = useCallback((mapInstance: OLMap) => {
    mapRef.current = mapInstance;
    layers.forEach(layer => {
      if (mapRef.current && layer.olLayer && !mapRef.current.getLayers().getArray().includes(layer.olLayer)) {
        mapRef.current.addLayer(layer.olLayer);
        layer.olLayer.setVisible(layer.visible);
      }
    });
  }, [layers]);

  // All dragging state, refs (draggablePanelRef), and event handlers (handleMouseDown, useEffect for mousemove/up)
  // have been removed for this basic visibility test.
  // The panel will be static.

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      {/* mapAreaRef now has a green border to confirm its bounds and relative positioning context */}
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden border-2 border-green-500">
        <MapView mapRef={mapRef} layers={layers} setMapInstance={setMapInstance} />
        
        {/* Ultra-simplified panel for visibility test. No JS logic for position/drag. */}
        <div
          className="absolute z-[9999] bg-red-500 text-white font-bold flex items-center justify-center" // Extremely high z-index
          style={{
            top: '16px', // Hardcoded position from top
            left: '16px', // Hardcoded position from left
            width: '200px', // Hardcoded width
            height: '100px', // Hardcoded height
          }}
        >
           PANEL TEST
        </div>
      </div>
      <Toaster />
    </div>
  );
}
