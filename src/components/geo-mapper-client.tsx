
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';

import MapView from '@/components/map-view';
import MapControls from '@/components/map-controls';
import { Card } from '@/components/ui/card';
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

  // Draggable panel state
  const [position, setPosition] = useState({ x: 16, y: 16 }); // Initial position (like top-4 left-4)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ offsetX: 0, offsetY: 0 });
  const draggablePanelRef = useRef<HTMLDivElement>(null);

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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggablePanelRef.current) {
      setIsDragging(true);
      // Calculate offset from the element's top-left corner to the mouse click point
      const panelRect = draggablePanelRef.current.getBoundingClientRect();
      dragStartRef.current = {
        offsetX: e.clientX - panelRect.left,
        offsetY: e.clientY - panelRect.top,
      };
      // Change cursor to grabbing
      draggablePanelRef.current.classList.remove('cursor-grab');
      draggablePanelRef.current.classList.add('cursor-grabbing');
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !draggablePanelRef.current) return;

      let newX = e.clientX - dragStartRef.current.offsetX;
      let newY = e.clientY - dragStartRef.current.offsetY;

      // Constrain to viewport
      const panelWidth = draggablePanelRef.current.offsetWidth;
      const panelHeight = draggablePanelRef.current.offsetHeight;
      
      newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (draggablePanelRef.current) {
        draggablePanelRef.current.classList.remove('cursor-grabbing');
        draggablePanelRef.current.classList.add('cursor-grab');
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);


  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <MapView mapRef={mapRef} layers={layers} setMapInstance={setMapInstance} />
        
        <div
          ref={draggablePanelRef}
          className="absolute z-10 w-80 cursor-grab rounded-lg shadow-xl border border-gray-400/50 bg-gray-500/40 backdrop-blur-md"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            touchAction: 'none', // Prevent page scroll on touch devices when dragging
          }}
          onMouseDown={handleMouseDown}
        >
          <Card className="p-0 flex flex-col bg-transparent shadow-none border-none max-h-[calc(100vh-64px)] overflow-hidden"> 
            <MapControls onAddLayer={addLayer} layers={layers} onToggleLayerVisibility={toggleLayerVisibility} />
          </Card>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
