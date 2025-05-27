
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Extent } from 'ol/extent'; // Import Extent type
// import { transformExtent } from 'ol/proj'; // Not strictly needed if extent is already in view projection

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
  // const panelRef = useRef<HTMLDivElement>(null); // Drag logic temporarily removed

  // Drag logic temporarily removed
  // const [position, setPosition] = useState({ x: 16, y: 16 });
  // const [isDragging, setIsDragging] = useState(false);
  // const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  
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
    // Layer synchronization is handled by the useEffect below
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;
  
    // Get OpenLayers layers currently on the map, excluding the base layer (usually the first one)
    const existingOlLayersOnMap = currentMap.getLayers().getArray().slice(1);
  
    // Add layers from React state to map if not already present
    layers.forEach(appLayer => {
      const olLayer = appLayer.olLayer;
      if (!existingOlLayersOnMap.some(mapOlLayer => mapOlLayer === olLayer)) {
        currentMap.addLayer(olLayer);
      }
      olLayer.setVisible(appLayer.visible); // Ensure visibility is synced
    });
  
    // Remove layers from map if they are no longer in React state
    existingOlLayersOnMap.forEach(olLayerOnMap => {
      if (!layers.find(appLayer => appLayer.olLayer === olLayerOnMap)) {
        currentMap.removeLayer(olLayerOnMap);
      }
    });
  }, [layers]); // Rerun when layers state changes


  const handleMapClick = useCallback((event: any) => {
    if (!isInspectModeActive || !mapRef.current) return;

    const clickedPixel = mapRef.current.getEventPixel(event.originalEvent);
    let featureFound = false;

    mapRef.current.forEachFeatureAtPixel(clickedPixel, (feature) => {
      if (featureFound) return; // Process only the first feature

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
      return true; // stop iteration
    });

    if (!featureFound) {
      setSelectedFeatureAttributes(null);
      // toast({ title: "Ninguna Entidad Encontrada", description: "Haz clic sobre una entidad para ver sus atributos.", variant: "default" });
    }
  }, [isInspectModeActive, toast]);

  useEffect(() => {
    if (mapRef.current) {
      if (isInspectModeActive) {
        mapRef.current.on('singleclick', handleMapClick);
      } else {
        mapRef.current.un('singleclick', handleMapClick);
        setSelectedFeatureAttributes(null); // Clear attributes when inspect mode is off
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
        // Check if extent is valid and not infinite
        if (extent && extent.every(isFinite) && (extent[2] - extent[0] > 0) && (extent[3] - extent[1] > 0)) {
          mapRef.current.getView().fit(extent, {
            padding: [50, 50, 50, 50], 
            duration: 1000, 
            maxZoom: 18, 
          });
           toast({ title: "Zoom a la Capa", description: `Mostrando la extensión de ${layer.name}.` });
        } else {
           toast({ title: "Extensión no Válida", description: `La capa "${layer.name}" podría estar vacía o no tener una extensión válida.`, variant: "destructive" });
        }
      }
    }
  }, [layers, toast]);

  // Drag logic temporarily removed
  // const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  //   // ...
  // }, [position.x, position.y]);

  // useEffect(() => {
  //   // ... drag listeners ...
  // }, [isDragging]);

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
          // ref={panelRef} // Drag logic temporarily removed
          className="absolute z-[50] bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden"
          style={{
            // transform: `translate(${position.x}px, ${position.y}px)`, // Drag logic temporarily removed
            top: '16px', // Fixed position for debugging
            left: '16px', // Fixed position for debugging
            width: '350px',
            // maxHeight is implicitly handled by collapse
          }}
        >
          <div 
            className="p-3 bg-gray-700/50 flex justify-between items-center" // Removed cursor-grab as drag is off
            // onMouseDown={handleMouseDown} // Drag logic temporarily removed
          >
            <span className="font-semibold text-sm">Herramientas del Mapa</span>
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="text-white hover:bg-gray-600/50 h-7 w-7">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[calc(100vh-160px)]'}`}>
            {!isCollapsed && (
                 <div className="flex-1 min-h-0">
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

