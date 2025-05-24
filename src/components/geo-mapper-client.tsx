
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

  const [position, setPosition] = useState({ x: 16, y: 16 }); // Initial position
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ initialMouseX: 0, initialMouseY: 0, initialPanelX: 0, initialPanelY: 0 });
  const draggablePanelRef = useRef<HTMLDivElement>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null); // Ref for the map area to constrain dragging

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
    // Ensure layers are added to the new map instance if they were created before the map was ready
    layers.forEach(layer => {
      if (mapRef.current && layer.olLayer && !mapRef.current.getLayers().getArray().includes(layer.olLayer)) {
        mapRef.current.addLayer(layer.olLayer);
        layer.olLayer.setVisible(layer.visible);
      }
    });
  }, [layers]); // layers dependency

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggablePanelRef.current) {
      setIsDragging(true);
      // Record the mouse position relative to the viewport
      // and the panel's current position (which is relative to its offsetParent, mapAreaRef)
      dragStartRef.current = {
        initialMouseX: e.clientX,
        initialMouseY: e.clientY,
        initialPanelX: position.x, 
        initialPanelY: position.y, 
      };
      draggablePanelRef.current.classList.remove('cursor-grab');
      draggablePanelRef.current.classList.add('cursor-grabbing');
      e.preventDefault(); // Prevent text selection during drag
    }
  }, [position.x, position.y]); // Depend on position state

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggablePanelRef.current || !mapAreaRef.current || !isDragging) return;

      // Calculate the delta from the initial mouse position
      const dx = e.clientX - dragStartRef.current.initialMouseX;
      const dy = e.clientY - dragStartRef.current.initialMouseY;

      // Calculate new panel position based on its initial position and mouse delta
      let newX = dragStartRef.current.initialPanelX + dx;
      let newY = dragStartRef.current.initialPanelY + dy;
      
      // Constrain within mapAreaRef
      const mapAreaRect = mapAreaRef.current.getBoundingClientRect();
      const panelRect = draggablePanelRef.current.getBoundingClientRect();
      // The panel's getBoundingClientRect() width/height might be more reliable than offsetWidth/Height during transforms
      const panelWidth = panelRect.width; 
      const panelHeight = panelRect.height;
      
      // Ensure newX and newY are within the mapAreaRef boundaries
      // mapAreaRect.width and mapAreaRect.height are the dimensions of the container
      newX = Math.max(0, Math.min(newX, mapAreaRect.width - panelWidth));
      newY = Math.max(0, Math.min(newY, mapAreaRect.height - panelHeight));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (draggablePanelRef.current) {
        draggablePanelRef.current.classList.remove('cursor-grabbing');
        draggablePanelRef.current.classList.add('cursor-grab');
      }
    };

    if (isDragging) {
      // Add listeners to the document to capture mouse events outside the panel
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    // Cleanup: remove event listeners
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]); // Only re-run if isDragging changes


  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <MapView mapRef={mapRef} layers={layers} setMapInstance={setMapInstance} />
        
        <div
          ref={draggablePanelRef}
          className="absolute z-50 w-80 cursor-grab rounded-lg shadow-xl border border-black bg-blue-500 min-h-[100px]" // DEBUG: Changed to blue, added min-height
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            touchAction: 'none', 
          }}
          onMouseDown={handleMouseDown}
        >
          <p className="text-white p-2">PANEL DE PRUEBA AQUÍ</p> {/* DEBUG: Added direct text */}
          {/* The Card inside will inherit the blue background if it's transparent */}
          <Card className="p-0 flex flex-col bg-transparent shadow-none border-none max-h-[calc(100vh-130px)] overflow-y-auto">
            <MapControls onAddLayer={addLayer} layers={layers} onToggleLayerVisibility={toggleLayerVisibility} />
          </Card>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
