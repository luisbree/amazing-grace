
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature as OLFeature } from 'ol';
import type VectorLayerType from 'ol/layer/Vector';
import type VectorSourceType from 'ol/source/Vector';
import type { Extent } from 'ol/extent';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import Draw from 'ol/interaction/Draw';
import {KML, GeoJSON} from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import { transformExtent } from 'ol/proj';
import osmtogeojson from 'osmtogeojson';

import MapView from '@/components/map-view';
import MapControls from '@/components/map-controls';
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';

export interface MapLayer {
  id: string;
  name: string;
  olLayer: VectorLayerType<VectorSourceType<OLFeature<any>>>;
  visible: boolean;
}

interface OSMCategoryConfig {
  id: string;
  name: string;
  overpassQueryFragment: (bboxStr: string) => string;
  matcher: (tags: any) => boolean;
  style: Style;
}


const osmCategoryConfig: OSMCategoryConfig[] = [
  {
    id: 'watercourses',
    name: 'OSM Cursos de Agua',
    overpassQueryFragment: (bboxStr) => `nwr[waterway~"^(river|stream)$"](${bboxStr});`,
    matcher: (tags) => tags && (tags.waterway === 'river' || tags.waterway === 'stream'),
    style: new Style({ stroke: new Stroke({ color: '#3a86ff', width: 2 }) })
  },
  {
    id: 'water_bodies',
    name: 'OSM Cuerpos de Agua',
    overpassQueryFragment: (bboxStr) => `nwr[natural="water"](${bboxStr});\nnwr[landuse="reservoir"](${bboxStr});`,
    matcher: (tags) => tags && (tags.natural === 'water' || tags.landuse === 'reservoir'),
    style: new Style({ fill: new Fill({ color: 'rgba(58,134,255,0.4)' }), stroke: new Stroke({ color: '#3a86ff', width: 1 }) })
  },
  {
    id: 'roads_paths',
    name: 'OSM Rutas y Caminos',
    overpassQueryFragment: (bboxStr) => `nwr[highway](${bboxStr});`,
    matcher: (tags) => tags && !!tags.highway,
    style: new Style({ stroke: new Stroke({ color: '#adb5bd', width: 3 }) })
  },
  {
    id: 'admin_boundaries',
    name: 'OSM Límites Admin.',
    overpassQueryFragment: (bboxStr) => `nwr[boundary="administrative"][admin_level](${bboxStr});`,
    matcher: (tags) => tags && tags.boundary === 'administrative' && tags.admin_level,
    style: new Style({ stroke: new Stroke({ color: '#ff006e', width: 2, lineDash: [4, 8] }) })
  },
  {
    id: 'green_areas',
    name: 'OSM Áreas Verdes',
    overpassQueryFragment: (bboxStr) => `nwr[leisure="park"](${bboxStr});\nnwr[landuse="forest"](${bboxStr});\nnwr[natural="wood"](${bboxStr});`,
    matcher: (tags) => tags && (tags.leisure === 'park' || tags.landuse === 'forest' || tags.natural === 'wood'),
    style: new Style({ fill: new Fill({ color: 'rgba(13,166,75,0.4)' }), stroke: new Stroke({ color: '#0da64b', width: 1 }) })
  },
  {
    id: 'health_centers',
    name: 'OSM Centros de Salud',
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(hospital|clinic|doctors|pharmacy)$"](${bboxStr});`,
    matcher: (tags) => tags && ['hospital', 'clinic', 'doctors', 'pharmacy'].includes(tags.amenity),
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#d90429'}), stroke: new Stroke({color: 'white', width: 1.5})})})
  },
  {
    id: 'educational',
    name: 'OSM Educacionales',
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(school|university|college|kindergarten)$"](${bboxStr});`,
    matcher: (tags) => tags && ['school', 'university', 'college', 'kindergarten'].includes(tags.amenity),
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#8338ec'}), stroke: new Stroke({color: 'white', width: 1.5})})})
  },
];

const osmCategoriesForSelection = osmCategoryConfig.map(({ id, name }) => ({ id, name }));


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

  const drawingLayerRef = useRef<VectorLayerType<VectorSourceType<OLFeature<any>>> | null>(null);
  const drawingSourceRef = useRef<VectorSourceType<OLFeature<any>> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);

  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);
  const [isFetchingOSM, setIsFetchingOSM] = useState(false);
  const [selectedOSMCategoryIds, setSelectedOSMCategoryIds] = useState<string[]>([]);
  
  const selectedOSMCategoryIdsRef = useRef(selectedOSMCategoryIds);
  useEffect(() => {
    selectedOSMCategoryIdsRef.current = selectedOSMCategoryIds;
  }, [selectedOSMCategoryIds]);


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
          return { ...layer, visible: newVisibility };
        }
        return layer;
      })
    );
  }, []);

 const setMapInstance = useCallback((mapInstance: OLMap) => {
    mapRef.current = mapInstance;

    if (mapRef.current && !drawingLayerRef.current) { 
      if (!drawingSourceRef || typeof drawingSourceRef !== 'object' || !('current' in drawingSourceRef)) {
        console.error("CRITICAL: drawingSourceRef is not a valid React ref object. Drawing layer cannot be initialized.");
        return; 
      }
      if (!drawingLayerRef || typeof drawingLayerRef !== 'object' || !('current' in drawingLayerRef)) {
        console.error("CRITICAL: drawingLayerRef is not a valid React ref object. Drawing layer cannot be initialized.");
        return; 
      }
      
      drawingSourceRef.current = new VectorSource({ wrapX: false });
      drawingLayerRef.current = new VectorLayer({
        source: drawingSourceRef.current,
        style: new Style({
          fill: new Fill({ color: 'rgba(0, 150, 255, 0.2)' }),
          stroke: new Stroke({ color: '#007bff', width: 2 }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: '#007bff' }),
            stroke: new Stroke({ color: '#ffffff', width: 1.5 })
          }),
        }),
        zIndex: 1000 
      });
      mapRef.current.addLayer(drawingLayerRef.current);
    }
  }, []);


 useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;

    const baseLayer = currentMap.getLayers().getArray().find(l => l.get('name') === 'OSMBaseLayer');
    
    const olMapVectorLayers = currentMap.getLayers().getArray()
      .filter(l => l !== baseLayer && l !== drawingLayerRef.current) as VectorLayerType<VectorSourceType<OLFeature<any>>>[];

    olMapVectorLayers.forEach(olMapLayer => {
        currentMap.removeLayer(olMapLayer);
    });
    
    layers.forEach(appLayer => {
      currentMap.addLayer(appLayer.olLayer);
      appLayer.olLayer.setVisible(appLayer.visible);
    });

    if (drawingLayerRef.current) {
      drawingLayerRef.current.setZIndex(layers.length + 1); 
    }

  }, [layers, mapRef]);


  const handleMapClick = useCallback((event: any) => {
    if (!isInspectModeActive || !mapRef.current || activeDrawTool) return;

    const clickedPixel = mapRef.current.getEventPixel(event.originalEvent);
    let featureFound = false;
    mapRef.current.forEachFeatureAtPixel(clickedPixel, (feature, layer) => {
      if (featureFound || layer === drawingLayerRef.current) return; 
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
    if (!featureFound) setSelectedFeatureAttributes(null);
  }, [isInspectModeActive, activeDrawTool, toast]);

  useEffect(() => {
    if (mapRef.current) {
      if (isInspectModeActive && !activeDrawTool) {
        mapRef.current.on('singleclick', handleMapClick);
      } else {
        mapRef.current.un('singleclick', handleMapClick);
      }
    }
    return () => {
      if (mapRef.current) mapRef.current.un('singleclick', handleMapClick);
    };
  }, [isInspectModeActive, activeDrawTool, handleMapClick]);

  const clearSelectedFeature = useCallback(() => {
    setSelectedFeatureAttributes(null);
    toast({ title: "Selección Limpiada", description: "Ninguna entidad seleccionada." });
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
          toast({ title: "Zoom a Capa", description: `Mostrando extensión de ${layer.name}.` });
        } else {
          toast({ title: "Extensión Inválida", description: `Capa "${layer.name}" podría estar vacía o tener una extensión inválida.`, variant: "destructive" });
        }
      } else {
        toast({ title: "Capa Vacía", description: `Capa "${layer.name}" no contiene entidades.`, variant: "destructive" });
      }
    }
  }, [layers, toast]);

  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

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
        // console.warn("Map or Panel dimensions are zero, skipping drag update.");
        return;
      }

      newX = Math.max(0, Math.min(newX, mapRect.width - panelRect.width));
      newY = Math.max(0, Math.min(newY, mapRect.height - panelRect.height));

      if (isNaN(newX) || isNaN(newY)) {
        // console.error("Calculated NaN position, skipping drag update:", {newX, newY});
        return;
      }
      setPosition({ x: newX, y: newY });
    };
    const handleMouseUp = () => setIsDragging(false);

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

  const fetchOSMData = useCallback(async (drawnFeature: OLFeature<any>) => {
    const featureToClear = drawnFeature; 

    if (selectedOSMCategoryIdsRef.current.length === 0) {
      toast({ title: "Sin Categorías Seleccionadas", description: "Por favor, seleccione al menos una categoría OSM para descargar.", variant: "destructive" });
      if (drawingSourceRef.current && featureToClear && drawingSourceRef.current.getFeatures().includes(featureToClear)) {
         drawingSourceRef.current.removeFeature(featureToClear);
      }
      return;
    }

    const geometry = featureToClear.getGeometry();
    if (!geometry || geometry.getType() !== 'Polygon') {
      toast({ title: "Geometría Inválida", description: "Por favor, dibuje un polígono para obtener datos OSM.", variant: "destructive" });
      if (drawingSourceRef.current && featureToClear && drawingSourceRef.current.getFeatures().includes(featureToClear)) {
         drawingSourceRef.current.removeFeature(featureToClear);
      }
      return;
    }
    
    setIsFetchingOSM(true);
    toast({ title: "Obteniendo Datos OSM", description: "Descargando datos de OpenStreetMap..." });

    try {
      const extent3857 = geometry.getExtent();
      console.log("Extent3857 (Source):", extent3857);
      if (!extent3857 || extent3857.some(val => !isFinite(val)) || (extent3857[2] - extent3857[0] <= 0 && extent3857[2] !== extent3857[0]) || (extent3857[3] - extent3857[1] <= 0 && extent3857[3] !== extent3857[1])) {
          console.error("Invalid extent in EPSG:3857:", extent3857);
          throw new Error("Área dibujada tiene una extensión inválida antes de la transformación (inválida o puntos/líneas).");
      }

      const extent4326_transformed = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
      console.log("Extent4326 (Transformed, raw):", extent4326_transformed);
      
      if (!extent4326_transformed || extent4326_transformed.some(val => !isFinite(val))) {
          console.error("Fallo al transformar extent. Extent3857:", extent3857, "Extent4326_transformed:", extent4326_transformed);
          throw new Error("Fallo al transformar área dibujada a coordenadas geográficas válidas.");
      }
      
      const s_coord = parseFloat(extent4326_transformed[1].toFixed(6));
      const w_coord = parseFloat(extent4326_transformed[0].toFixed(6));
      const n_coord = parseFloat(extent4326_transformed[3].toFixed(6));
      const e_coord = parseFloat(extent4326_transformed[2].toFixed(6));

      console.log("Coordinates for Overpass (s,w,n,e - after toFixed(6)):", { s_coord, w_coord, n_coord, e_coord });

      if (n_coord < s_coord) { 
          const message = `Error de Bounding Box (N < S): Norte ${n_coord} es menor que Sur ${s_coord}. Extent4326_raw: ${extent4326_transformed.join(',')}`;
          console.error(message, {n_coord, s_coord, extent4326_transformed});
          throw new Error(message);
      }
      if (e_coord < w_coord && Math.abs(e_coord - w_coord) < 180) { // Check for normal case, ignore dateline crossing for now
          const message = `Error de Bounding Box (E < W): Este ${e_coord} es menor que Oeste ${w_coord}. Extent4326_raw: ${extent4326_transformed.join(',')}`;
          console.error(message, {e_coord, w_coord, extent4326_transformed});
          throw new Error(message);
      }
      console.log("Extent4326 after checks:", {s_coord, w_coord, n_coord, e_coord});
            
      const bboxStr = `${s_coord},${w_coord},${n_coord},${e_coord}`;
      console.log("Constructed bboxStr for Overpass API:", bboxStr);
      
      let queryParts: string[] = [];
      const categoriesToFetch = osmCategoryConfig.filter(cat => selectedOSMCategoryIdsRef.current.includes(cat.id));

      categoriesToFetch.forEach(cat => {
        queryParts.push(cat.overpassQueryFragment(bboxStr));
      });

      const overpassQuery = `
        [out:json][timeout:90];
        (
          ${queryParts.join('\n          ')}
        );
        out geom;
      `;
      console.log("Overpass Query:", overpassQuery); 

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Overpass API error details:", errorBody);
        throw new Error(`Error Overpass API: ${response.status} ${response.statusText}`);
      }

      const osmData = await response.json();
      const geojsonData = osmtogeojson(osmData) as any; 

      let featuresAddedCount = 0;
      categoriesToFetch.forEach(category => {
        const categoryFeaturesGeoJSON = {
          type: "FeatureCollection",
          features: geojsonData.features.filter((feature: any) => category.matcher(feature.properties))
        };

        if (categoryFeaturesGeoJSON.features.length > 0) {
          const olFeatures = new GeoJSON().readFeatures(categoryFeaturesGeoJSON, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });

          if (olFeatures && olFeatures.length > 0) {
            const vectorSource = new VectorSource({ features: olFeatures });
            const vectorLayer = new VectorLayer({
              source: vectorSource,
              style: category.style
            });
            const layerId = `osm-${category.id}-${Date.now()}`;
            addLayer({ id: layerId, name: `${category.name} (${olFeatures.length})`, olLayer: vectorLayer, visible: true });
            featuresAddedCount += olFeatures.length;
          }
        }
      });

      if (featuresAddedCount > 0) {
        toast({ title: "Datos OSM Cargados", description: `${featuresAddedCount} entidades añadidas al mapa.` });
      } else {
        toast({ title: "Sin Datos OSM Encontrados", description: "Ninguna entidad coincidió con sus criterios en el área seleccionada." });
      }

    } catch (error: any) {
      console.error("Error en fetchOSMData (procesamiento o API):", error);
      toast({ title: "Error Obteniendo Datos OSM", description: error.message || "Ocurrió un error desconocido.", variant: "destructive" });
    } finally {
      setIsFetchingOSM(false);
      if (drawingSourceRef.current && featureToClear && drawingSourceRef.current.getFeatures().includes(featureToClear)) {
        drawingSourceRef.current.removeFeature(featureToClear);
      }
    }
  }, [toast, addLayer]);


  const toggleDrawingTool = useCallback((toolType: 'Polygon' | 'LineString' | 'Point') => {
    if (!mapRef.current || !drawingSourceRef.current) return;
    if (isInspectModeActive) setIsInspectModeActive(false); 

    if (drawInteractionRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current.dispose(); 
      drawInteractionRef.current = null;
    }

    if (activeDrawTool === toolType) {
      setActiveDrawTool(null); 
    } else {
      const newDrawInteraction = new Draw({
        source: drawingSourceRef.current,
        type: toolType,
      });

      newDrawInteraction.on('drawend', (event) => {
        if (toolType === 'Polygon') { 
           fetchOSMData(event.feature);
        }
      });

      mapRef.current.addInteraction(newDrawInteraction);
      drawInteractionRef.current = newDrawInteraction;
      setActiveDrawTool(toolType);
    }
  }, [activeDrawTool, isInspectModeActive, fetchOSMData]);

  const stopDrawingTool = useCallback(() => {
    if (mapRef.current && drawInteractionRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current.dispose();
      drawInteractionRef.current = null;
    }
    setActiveDrawTool(null);
  }, []);

  const clearDrawnFeatures = useCallback(() => {
    if (drawingSourceRef.current) {
      drawingSourceRef.current.clear();
      toast({ title: "Dibujos Limpiados", description: "Todos los dibujos han sido eliminados." });
    }
  }, [toast]);

  const saveDrawnFeaturesAsKML = useCallback(() => {
    if (!drawingSourceRef.current || drawingSourceRef.current.getFeatures().length === 0) {
      toast({ title: "Sin Dibujos", description: "Nada dibujado para guardar.", variant: "destructive" });
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
      toast({ title: "Dibujos Guardados", description: "Dibujos guardados como drawings.kml." });
    } catch (error) {
      console.error("Error guardando KML:", error);
      toast({ title: "Error Guardando KML", description: "No se pudieron guardar los dibujos.", variant: "destructive" });
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
            <div className="flex-1 min-h-0 bg-transparent" style={{ maxHeight: 'calc(100vh - 120px)' }}> {/* Adjusted max-height */}
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
                  activeDrawTool={activeDrawTool}
                  onToggleDrawingTool={toggleDrawingTool}
                  onStopDrawingTool={stopDrawingTool}
                  onClearDrawnFeatures={clearDrawnFeatures}
                  onSaveDrawnFeaturesAsKML={saveDrawnFeaturesAsKML}
                  isFetchingOSM={isFetchingOSM}
                  osmCategoriesForSelection={osmCategoriesForSelection}
                  selectedOSMCategoryIds={selectedOSMCategoryIds}
                  onSelectedOSMCategoriesChange={setSelectedOSMCategoryIds}
              />
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}

