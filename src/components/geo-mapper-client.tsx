
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature } from 'ol';
import type VectorLayerType from 'ol/layer/Vector';
import type VectorSourceType from 'ol/source/Vector';
import type { Extent } from 'ol/extent';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Draw from 'ol/interaction/Draw';
import {KML} from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';


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
  const panelRef = useRef<HTMLDivElement>(null);

  const [isInspectModeActive, setIsInspectModeActive] = useState(false);
  const [selectedFeatureAttributes, setSelectedFeatureAttributes] = useState<Record<string, any> | null>(null);
  
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  const { toast } = useToast();

  // Drawing related state and refs
  const drawingLayerRef = useRef<VectorLayerType<VectorSourceType<Feature<any>>> | null>(null);
  const drawingSourceRef = useRef<VectorSourceType<Feature<any>> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);


  const addLayer = useCallback((newLayer: MapLayer) => {
    setLayers(prevLayers => [...prevLayers, newLayer]);
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
    toast({ title: "Capa Eliminada", description: "La capa ha sido eliminada del mapa." });
  }, [toast]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        if (layer.id === layerId) {
          const newVisibility = !layer.visible;
          // Directly update OL layer visibility here as well,
          // though the useEffect for layers will also handle it.
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
    // Initialize drawing layer once map is available
    if (mapRef.current && !drawingLayerRef.current) {
      drawingSourceRef.current = new VectorSource({ wrapX: false });
      drawingLayerRef.current = new VectorLayer({
        source: drawingSourceRef.current,
        style: new Style({
          fill: new Fill({
            color: 'rgba(0, 150, 255, 0.3)', // Light blue fill
          }),
          stroke: new Stroke({
            color: '#007bff', // Blue stroke
            width: 2,
          }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: '#007bff',
            }),
            stroke: new Stroke({
              color: '#ffffff',
              width: 1.5
            })
          }),
        }),
        zIndex: 10 // Ensure drawing layer is on top of other vector layers
      });
      mapRef.current.addLayer(drawingLayerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;
    
    // Handle file-uploaded layers
    const baseLayer = currentMap.getLayers().getArray().find(l => l.get('name') === 'OSMBaseLayer' || l === currentMap.getLayers().item(0));
    const olMapVectorLayers = currentMap.getLayers().getArray().filter(
      l => l !== baseLayer && l !== drawingLayerRef.current // Exclude base and drawing layer
    ) as VectorLayerType<VectorSourceType<Feature<any>>>[];

    // Remove vector layers that are not in the current `layers` state or are not the drawing layer
    olMapVectorLayers.forEach(olMapLayer => {
      if (!layers.some(appLayer => appLayer.olLayer === olMapLayer)) {
        currentMap.removeLayer(olMapLayer);
      }
    });

    // Add/update layers from the `layers` state
    layers.forEach(appLayer => {
      // Check if layer is already on map
      const existingLayer = currentMap.getLayers().getArray().includes(appLayer.olLayer);
      if (!existingLayer) {
        currentMap.addLayer(appLayer.olLayer);
      }
      appLayer.olLayer.setVisible(appLayer.visible);
    });

  }, [layers]);


  const handleMapClick = useCallback((event: any) => {
    if (!isInspectModeActive || !mapRef.current) return;

    // If a drawing tool is active, don't inspect features on click
    if (activeDrawTool) return;

    const clickedPixel = mapRef.current.getEventPixel(event.originalEvent);
    let featureFound = false;
    mapRef.current.forEachFeatureAtPixel(clickedPixel, (feature, layer) => {
      if (featureFound) return; 
      // Don't inspect features from the drawing layer itself in this inspector
      if (layer === drawingLayerRef.current) return;

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
  }, [isInspectModeActive, activeDrawTool, toast]);

  useEffect(() => {
    if (mapRef.current) {
      if (isInspectModeActive && !activeDrawTool) { // Only inspect if no draw tool is active
        mapRef.current.on('singleclick', handleMapClick);
      } else {
        mapRef.current.un('singleclick', handleMapClick);
        // Optionally clear selection when inspect mode is turned off or drawing starts
        // setSelectedFeatureAttributes(null); 
      }
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.un('singleclick', handleMapClick);
      }
    };
  }, [isInspectModeActive, activeDrawTool, handleMapClick]);

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeatureAttributes(null);
    toast({ title: "Selección Limpiada", description: "Ya no hay ninguna entidad seleccionada." });
  }, [toast]);

  const zoomToLayerExtent = useCallback((layerId: string) => {
    if (!mapRef.current) return;
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.olLayer) {
      const source = layer.olLayer.getSource();
      if (source && source.getFeatures().length > 0) {
        const extent: Extent = source.getExtent();
        if (extent && extent.every(isFinite) && (extent[2] - extent[0] > 0) && (extent[3] - extent[1] > 0)) {
          mapRef.current.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000, maxZoom: 18 });
          toast({ title: "Zoom a la Capa", description: `Mostrando la extensión de ${layer.name}.` });
        } else {
          toast({ title: "Extensión no Válida", description: `La capa "${layer.name}" podría estar vacía, no tener una extensión válida o las coordenadas podrían ser inválidas.`, variant: "destructive" });
        }
      } else {
        toast({ title: "Capa Vacía", description: `La capa "${layer.name}" no contiene entidades para calcular una extensión.`, variant: "destructive" });
      }
    }
  }, [layers, toast]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault(); 
  }, [position.x, position.y]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !mapAreaRef.current || !panelRef.current) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      let newX = dragStartRef.current.panelX + dx;
      let newY = dragStartRef.current.panelY + dy;

      const mapRect = mapAreaRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();
      
      if (panelRect.width === 0 || panelRect.height === 0 || mapRect.width === 0 || mapRect.height === 0) {
        return; 
      }
      
      newX = Math.max(0, Math.min(newX, mapRect.width - panelRect.width));
      newY = Math.max(0, Math.min(newY, mapRect.height - panelRect.height));

      if (isNaN(newX) || isNaN(newY)) {
        return;
      }
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


  // Drawing functions
  const toggleDrawingTool = useCallback((toolType: 'Polygon' | 'LineString' | 'Point') => {
    if (!mapRef.current || !drawingSourceRef.current) return;
    
    // If inspect mode is active, deactivate it
    if (isInspectModeActive) setIsInspectModeActive(false);

    if (drawInteractionRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }

    if (activeDrawTool === toolType) {
      setActiveDrawTool(null); // Deactivate if clicking the same tool
    } else {
      const newDrawInteraction = new Draw({
        source: drawingSourceRef.current,
        type: toolType,
      });
      mapRef.current.addInteraction(newDrawInteraction);
      drawInteractionRef.current = newDrawInteraction;
      setActiveDrawTool(toolType);
    }
  }, [activeDrawTool, isInspectModeActive]);

  const stopDrawingTool = useCallback(() => {
    if (mapRef.current && drawInteractionRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }
    setActiveDrawTool(null);
  }, []);

  const clearDrawnFeatures = useCallback(() => {
    if (drawingSourceRef.current) {
      drawingSourceRef.current.clear();
      toast({ title: "Dibujos Borrados", description: "Se han eliminado todos los dibujos del mapa." });
    }
  }, [toast]);

  const saveDrawnFeaturesAsKML = useCallback(() => {
    if (!drawingSourceRef.current || drawingSourceRef.current.getFeatures().length === 0) {
      toast({ title: "Sin Dibujos", description: "No hay nada dibujado para guardar.", variant: "destructive" });
      return;
    }
    const features = drawingSourceRef.current.getFeatures();
    const kmlFormat = new KML();
    try {
      const kmlString = kmlFormat.writeFeatures(features, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857', 
      });

      const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'drawings.kml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast({ title: "Dibujos Guardados", description: "Los dibujos se han guardado como drawings.kml." });
    } catch (error) {
      console.error("Error saving KML:", error);
      toast({ title: "Error al Guardar", description: "No se pudieron guardar los dibujos como KML.", variant: "destructive" });
    }
  }, [toast]);


  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-primary text-primary-foreground p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Geo Mapper</h1>
      </header>
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <MapView mapRef={mapRef} setMapInstance={setMapInstance} />
        
        <div
          ref={panelRef}
          className="absolute bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden z-30"
          style={{
            width: '350px',
            top: `${position.y}px`,
            left: `${position.x}px`,
          }}
        >
          <div 
            className="p-2 bg-gray-700/80 flex items-center justify-between cursor-grab rounded-t-lg"
            onMouseDown={handleMouseDown}
          >
            <h2 className="text-sm font-semibold">Herramientas del Mapa</h2>
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-6 w-6 text-white hover:bg-gray-600/80">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="sr-only">{isCollapsed ? 'Expandir' : 'Colapsar'}</span>
            </Button>
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto bg-transparent" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <MapControls 
                  onAddLayer={addLayer}
                  layers={layers}
                  onToggleLayerVisibility={toggleLayerVisibility}
                  onRemoveLayer={removeLayer}
                  isInspectModeActive={isInspectModeActive}
                  onToggleInspectMode={() => setIsInspectModeActive(!isInspectModeActive)}
                  selectedFeatureAttributes={selectedFeatureAttributes}
                  onClearSelectedFeature={clearSelectedFeature}
                  onZoomToLayerExtent={zoomToLayerExtent}
                  // Drawing props
                  activeDrawTool={activeDrawTool}
                  onToggleDrawingTool={toggleDrawingTool}
                  onStopDrawingTool={stopDrawingTool}
                  onClearDrawnFeatures={clearDrawnFeatures}
                  onSaveDrawnFeaturesAsKML={saveDrawnFeaturesAsKML}
              />
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
    
