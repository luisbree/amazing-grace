
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayerType from 'ol/layer/Vector';
import type VectorSourceType from 'ol/source/Vector';
import type { Extent } from 'ol/extent';
import { ChevronDown, ChevronUp } from 'lucide-react';

import MapView from '@/components/map-view';
import MapControls from '@/components/map-controls';
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';

export interface MapLayer {
  id: string;
  name: string;
  olLayer: VectorLayerType<VectorSourceType<Feature<any>>>;
  visible: boolean;
}

export default function GeoMapperClient() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const mapRef = useRef<OLMap | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);

  const [isInspectModeActive, setIsInspectModeActive] = useState(false);
  const [selectedFeatureAttributes, setSelectedFeatureAttributes] = useState<Record<string, any> | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false); // State for panel collapse

  const { toast } = useToast();

  const addLayer = useCallback((newLayer: MapLayer) => {
    setLayers(prevLayers => [...prevLayers, newLayer]);
  }, []);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        if (layer.id === layerId) {
          const newVisibility = !layer.visible;
          layer.olLayer.setVisible(newVisibility); // Directly update OL layer visibility
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

    // Get the base layer (OSM)
    const baseLayer = currentMap.getLayers().item(0);
    if (!baseLayer) {
        console.error("Base map layer not found!");
        return;
    }

    // Get current vector layers on the map (all layers except the first one)
    const olMapVectorLayers = currentMap.getLayers().getArray().slice(1) as VectorLayerType<VectorSourceType<Feature<any>>>[];

    // Remove vector layers from map that are no longer in the state
    olMapVectorLayers.forEach(olMapLayer => {
        const appLayerExists = layers.find(appLyr => appLyr.olLayer === olMapLayer);
        if (!appLayerExists) {
            currentMap.removeLayer(olMapLayer);
        }
    });

    // Add/update layers from state
    layers.forEach(appLayer => {
        // Check if the OpenLayers layer instance is already on the map
        const olLayerOnMap = olMapVectorLayers.find(olLyr => olLyr === appLayer.olLayer);
        if (!olLayerOnMap) {
            currentMap.addLayer(appLayer.olLayer);
        }
        appLayer.olLayer.setVisible(appLayer.visible);
    });

  }, [layers]);


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
        <MapView mapRef={mapRef} setMapInstance={setMapInstance} />
        
        <div
          className="absolute z-[50] bg-blue-700/70 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden"
          style={{
            top: '16px',
            left: '16px',
            width: '350px',
            // Max height is handled by the inner content div
          }}
        >
          {/* Title Bar for Collapse/Expand and Drag */}
          <div 
            className="p-2 bg-gray-700/80 flex items-center justify-between cursor-grab rounded-t-lg"
            // onMouseDown will be added here later for drag
          >
            <h2 className="text-sm font-semibold">Herramientas del Mapa</h2>
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-6 w-6 text-white hover:bg-gray-600/80">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="sr-only">{isCollapsed ? 'Expandir' : 'Colapsar'}</span>
            </Button>
          </div>

          {/* Collapsible Content */}
          {!isCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' /* Adjust as needed */ }}>
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
      <Toaster />
    </div>
  );
}
