
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import { ChevronUp, ChevronDown } from 'lucide-react';

import MapView from '@/components/map-view';
import MapControls from '@/components/map-controls';
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

export interface MapLayer {
  id: string;
  name: string;
  olLayer: VectorLayer<VectorSource<Feature<any>>>;
  visible: boolean;
}

export default function GeoMapperClient() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const mapRef = useRef<OLMap | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (panelRef.current) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panelX: position.x,
        panelY: position.y,
      };
      // Prevent text selection during drag
      e.preventDefault();
    }
  }, [position.x, position.y]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !panelRef.current || !mapAreaRef.current) return;

      const mapAreaRect = mapAreaRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();

      let newX = e.clientX - dragStartRef.current.x + dragStartRef.current.panelX;
      let newY = e.clientY - dragStartRef.current.y + dragStartRef.current.panelY;

      // Constrain within mapAreaRef boundaries
      newX = Math.min(Math.max(0, newX), mapAreaRect.width - panelRect.width);
      newY = Math.min(Math.max(0, newY), mapAreaRect.height - panelRect.height);
      
      // Prevent panel from going too far up if mapAreaRect.top is not 0 (e.g. due to header)
      // This might need adjustment if header height changes or if mapAreaRef itself is scrolled
      const headerHeight = document.querySelector('header')?.offsetHeight || 0;
      newY = Math.max(newY, -mapAreaRect.top + headerHeight + 16); // 16 for some padding
      // Ensure panel doesn't go below bottom edge of mapAreaRef
      newY = Math.min(newY, mapAreaRect.height - panelRect.height);


      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <MapView mapRef={mapRef} layers={layers} setMapInstance={setMapInstance} />
        
        <div
          ref={panelRef}
          className="absolute z-[50] bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            width: '350px',
            // maxHeight: isCollapsed ? 'auto' : 'calc(100vh - 116px)', // Height of header + some margin
            // minHeight: isCollapsed ? 'auto' : '100px',
          }}
        >
          <div 
            className="p-3 bg-gray-700/50 flex justify-between items-center cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
          >
            <span className="font-semibold text-sm">Herramientas del Mapa</span>
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="text-white hover:bg-gray-600/50 h-7 w-7">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[calc(100vh-160px)]'}`}>
            {!isCollapsed && (
                 <div className="flex-1 min-h-0"> {/* This div will contain MapControls and allow it to scroll if needed */}
                    <MapControls 
                        onAddLayer={addLayer}
                        layers={layers}
                        onToggleLayerVisibility={toggleLayerVisibility}
                    />
                 </div>
            )}
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
