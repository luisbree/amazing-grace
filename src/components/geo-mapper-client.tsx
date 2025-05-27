
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Extent } from 'ol/extent';

import MapView from '@/components/map-view';
import MapControls from '@/components/map-controls';
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
  const [isInspectModeActive, setIsInspectModeActive] = useState(false);
  const [selectedFeatureAttributes, setSelectedFeatureAttributes] = useState<Record<string, any> | null>(null);
  const { toast } = useToast();

  const addLayer = useCallback((newLayer: MapLayer) => {
    setLayers(prevLayers => [...prevLayers, newLayer]);
  }, []);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        if (layer.id === layerId) {
          const newVisibility = !layer.visible;
          // Visibility on olLayer will be handled by the useEffect synchronizing layers
          return { ...layer, visible: newVisibility };
        }
        return layer;
      })
    );
  }, []);

  const setMapInstance = useCallback((mapInstance: OLMap) => {
    mapRef.current = mapInstance;
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;
    const baseLayer = currentMap.getLayers().item(0); // Preserve base layer

    // Remove all existing vector layers (all layers except the base map)
    const existingLayers = currentMap.getLayers().getArray();
    for (let i = existingLayers.length - 1; i > 0; i--) { // Iterate backwards to avoid issues with changing array length
        currentMap.removeLayer(existingLayers[i]);
    }
    
    // Re-add layers from the current state
    layers.forEach(appLayer => {
      currentMap.addLayer(appLayer.olLayer);
      appLayer.olLayer.setVisible(appLayer.visible);
    });

    // Sanity check: ensure base layer is still at index 0
    if (currentMap.getLayers().item(0) !== baseLayer) {
        console.error("Base map layer was unexpectedly changed or removed!");
        // Potentially re-insert baseLayer at 0 if necessary, though this indicates a deeper issue.
        // currentMap.getLayers().insertAt(0, baseLayer);
    }

  }, [layers]); // Only re-run when 'layers' state changes

  const handleMapClick = useCallback((event: any) => {
    if (!isInspectModeActive || !mapRef.current) return;
    const clickedPixel = mapRef.current.getEventPixel(event.originalEvent);
    let featureFound = false;
    mapRef.current.forEachFeatureAtPixel(clickedPixel, (feature) => {
      if (featureFound) return;
      const properties = feature.getProperties();
      const attributesToShow: Record<string, any> = {};
      for (const key in properties) {
        if (key !== 'geometry' && key !== feature.getGeometryName()) {
          attributesToShow[key] = properties[key];
        }
      }
      setSelectedFeatureAttributes(attributesToShow);
      featureFound = true;
      toast({ title: "Entidad Seleccionada", description: "Atributos mostrados en el panel." });
      return true;
    });
    if (!featureFound) {
      setSelectedFeatureAttributes(null);
    }
  }, [isInspectModeActive, toast]);

  useEffect(() => {
    if (mapRef.current) {
      if (isInspectModeActive) {
        mapRef.current.on('singleclick', handleMapClick);
      } else {
        mapRef.current.un('singleclick', handleMapClick);
        setSelectedFeatureAttributes(null);
      }
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.un('singleclick', handleMapClick);
      }
    };
  }, [isInspectModeActive, handleMapClick]);

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeatureAttributes(null);
    toast({ title: "Selección Limpiada", description: "Ya no hay ninguna entidad seleccionada." });
  }, [toast]);

  const zoomToLayerExtent = useCallback((layerId: string) => {
    if (!mapRef.current) return;
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.olLayer) {
      const source = layer.olLayer.getSource();
      if (source) {
        const extent: Extent = source.getExtent();
        if (extent && extent.every(isFinite) && (extent[2] - extent[0] > 0) && (extent[3] - extent[1] > 0)) {
          mapRef.current.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000, maxZoom: 18 });
          toast({ title: "Zoom a la Capa", description: `Mostrando la extensión de ${layer.name}.` });
        } else {
          toast({ title: "Extensión no Válida", description: `La capa "${layer.name}" podría estar vacía o no tener una extensión válida.`, variant: "destructive" });
        }
      }
    }
  }, [layers, toast]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current || !mapAreaRef.current) return;
    // Check if the click is on the drag handle (title bar)
    if (!(e.target as HTMLElement).closest('[data-drag-handle="true"]')) {
        return;
    }
    e.preventDefault();
    setIsDragging(true);
    const panelRect = panelRef.current.getBoundingClientRect();
    const mapAreaRect = mapAreaRef.current.getBoundingClientRect();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x, // Use current state position
      panelY: position.y,  // Use current state position
    };
  }, [position.x, position.y]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !panelRef.current || !mapAreaRef.current) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      let newX = dragStartRef.current.panelX + dx;
      let newY = dragStartRef.current.panelY + dy;

      const panelRect = panelRef.current.getBoundingClientRect();
      const mapAreaRect = mapAreaRef.current.getBoundingClientRect();
      
      // Restrict within mapAreaRef boundaries
      newX = Math.max(0, Math.min(newX, mapAreaRect.width - panelRect.width));
      newY = Math.max(0, Math.min(newY, mapAreaRect.height - panelRect.height));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
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

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden border-2 border-transparent"> {/* Removed debug border */}
        <MapView mapRef={mapRef} setMapInstance={setMapInstance} />
        
        <div
          ref={panelRef}
          className="absolute z-[50] bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            width: '350px',
            // Max height is handled by collapsible content
          }}
        >
          <div 
            data-drag-handle="true"
            className="p-3 bg-gray-700/50 flex justify-between items-center cursor-grab"
            onMouseDown={handleMouseDown}
          >
            <span className="font-semibold text-sm pointer-events-none">Herramientas del Mapa</span> {/* pointer-events-none to ensure drag handle works */}
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="text-white hover:bg-gray-600/50 h-7 w-7">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[calc(100vh-200px)]'}`}> {/* Adjusted max-h */}
            {!isCollapsed && (
                 <div className="flex-1 min-h-0"> {/* min-h-0 for flex child to scroll */}
                    <MapControls 
                        onAddLayer={addLayer}
                        layers={layers}
                        onToggleLayerVisibility={toggleLayerVisibility}
                        isInspectModeActive={isInspectModeActive}
                        onToggleInspectMode={() => setIsInspectModeActive(!isInspectModeActive)}
                        selectedFeatureAttributes={selectedFeatureAttributes}
                        onClearSelectedFeature={clearSelectedFeature}
                        onZoomToLayerExtent={zoomToLayerExtent}
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
