
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature as OLFeature } from 'ol';
import type VectorLayerType from 'ol/layer/Vector';
import type VectorSourceType from 'ol/source/Vector';
import type { Extent } from 'ol/extent';
import { ChevronDown, ChevronUp, Map as MapIcon, Plus } from 'lucide-react'; // Added MapIcon, Plus
import Draw from 'ol/interaction/Draw';
import { KML, GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import { transformExtent } from 'ol/proj';
import osmtogeojson from 'osmtogeojson';
import shpwrite from 'shp-write';

import MapView, { BASE_LAYER_DEFINITIONS } from '@/components/map-view';
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

const availableBaseLayersForSelect = BASE_LAYER_DEFINITIONS.map(def => ({
  id: def.id,
  name: def.name,
}));


const PANEL_WIDTH = 350; 
const PANEL_PADDING = 16; 

function triggerDownload(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function triggerDownloadArrayBuffer(content: ArrayBuffer, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export default function GeoMapperClient() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const mapRef = useRef<OLMap | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  
  const toolsPanelRef = useRef<HTMLDivElement>(null);
  const [isToolsPanelCollapsed, setIsToolsPanelCollapsed] = useState(false); 
  const [toolsPanelPosition, setToolsPanelPosition] = useState({ x: PANEL_PADDING, y: PANEL_PADDING });
  const [isToolsPanelDragging, setIsToolsPanelDragging] = useState(false);
  const toolsPanelDragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  const layersPanelRef = useRef<HTMLDivElement>(null);
  const [isLayersPanelCollapsed, setIsLayersPanelCollapsed] = useState(false); 
  const [layersPanelPosition, setLayersPanelPosition] = useState({ x: PANEL_PADDING, y: PANEL_PADDING });
  const [isLayersPanelDragging, setIsLayersPanelDragging] = useState(false);
  const layersPanelDragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  const [isInspectModeActive, setIsInspectModeActive] = useState(false);
  const [selectedFeatureAttributes, setSelectedFeatureAttributes] = useState<Record<string, any> | null>(null);

  const { toast } = useToast();

  const drawingSourceRef = useRef<VectorSourceType<OLFeature<any>> | null>(null);
  const drawingLayerRef = useRef<VectorLayerType<VectorSourceType<OLFeature<any>>> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);

  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);
  const [isFetchingOSM, setIsFetchingOSM] = useState(false);
  const [selectedOSMCategoryIds, setSelectedOSMCategoryIds] = useState<string[]>([]);
  
  const selectedOSMCategoryIdsRef = useRef(selectedOSMCategoryIds);
  useEffect(() => {
    selectedOSMCategoryIdsRef.current = selectedOSMCategoryIds;
  }, [selectedOSMCategoryIds]);

  const [downloadFormat, setDownloadFormat] = useState<string>('geojson');
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeBaseLayerId, setActiveBaseLayerId] = useState<string>(BASE_LAYER_DEFINITIONS[0].id);

  useEffect(() => {
    if (mapAreaRef.current && toolsPanelRef.current) {
      const mapRect = mapAreaRef.current.getBoundingClientRect();
      const panelWidth = toolsPanelRef.current.offsetWidth || PANEL_WIDTH;
      setToolsPanelPosition({
        x: mapRect.width - panelWidth - PANEL_PADDING,
        y: PANEL_PADDING,
      });
    }
     if (layersPanelRef.current) {
        setLayersPanelPosition({
            x: PANEL_PADDING,
            y: PANEL_PADDING,
        });
    }
  }, []); 

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

    if (!mapRef.current) {
      console.error("setMapInstance called but mapRef.current is null.");
      return;
    }

    // Critical check for ref variable validity
    if (typeof drawingSourceRef !== 'object' || drawingSourceRef === null || !('current' in drawingSourceRef)) {
        console.error("CRITICAL: drawingSourceRef is not a valid React ref object. Value:", drawingSourceRef, "Type:", typeof drawingSourceRef);
        toast({ title: "Error Crítico", description: "Referencia de capa de dibujo (source) corrupta.", variant: "destructive"});
        return; 
    }
    if (typeof drawingLayerRef !== 'object' || drawingLayerRef === null || !('current' in drawingLayerRef)) {
        console.error("CRITICAL: drawingLayerRef is not a valid React ref object. Value:", drawingLayerRef, "Type:", typeof drawingLayerRef);
        toast({ title: "Error Crítico", description: "Referencia de capa de dibujo (layer) corrupta.", variant: "destructive"});
        return; 
    }

    // Proceed with initialization only if the drawing layer's .current property is not already set
    if (!drawingLayerRef.current) { 
      try {
        // Initialize the source for the drawing layer if its .current property is null
        if (!drawingSourceRef.current) {
             drawingSourceRef.current = new VectorSource({ wrapX: false });
        }
        
        // Ensure drawingSourceRef.current is valid before using it
        if (!drawingSourceRef.current) {
            console.error("CRITICAL: drawingSourceRef.current is null after attempting initialization. Cannot create drawing layer.");
            toast({ title: "Error Crítico", description: "No se pudo inicializar la fuente de la capa de dibujo.", variant: "destructive"});
            return; 
        }
        
        // Create and add the drawing layer
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
        
      } catch (e: any) {
        // This catch handles errors during new VectorSource(), new VectorLayer(), or map.addLayer()
        console.error("Error during drawing layer/source INSTANTIATION or map ADDITION:", e.message, { 
          drawingSourceRef_current_value_exists: !!drawingSourceRef.current,
          drawingLayerRef_current_value_exists: !!drawingLayerRef.current,
        });
        toast({ title: "Error Crítico", description: "No se pudo inicializar la capa de dibujo (instantiation).", variant: "destructive"});
      }
    }
  }, [toast]);


 useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;

    const olMapVectorLayers = currentMap.getLayers().getArray()
      .filter(l => !l.get('isBaseLayer') && l !== drawingLayerRef.current) as VectorLayerType<VectorSourceType<OLFeature<any>>>[];
    
    olMapVectorLayers.forEach(olMapLayer => {
        currentMap.removeLayer(olMapLayer);
    });
    
    layers.forEach(appLayer => {
      if (!currentMap.getLayers().getArray().includes(appLayer.olLayer)) {
        currentMap.addLayer(appLayer.olLayer);
      }
      appLayer.olLayer.setVisible(appLayer.visible);
      appLayer.olLayer.setZIndex(100 + layers.indexOf(appLayer));
    });

    if (drawingLayerRef.current) {
      if (!currentMap.getLayers().getArray().includes(drawingLayerRef.current)) {
         currentMap.addLayer(drawingLayerRef.current);
      }
      drawingLayerRef.current.setZIndex(100 + layers.length + 100); 
    }

  }, [layers]); 


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

  const toggleToolsPanelCollapse = useCallback(() => setIsToolsPanelCollapsed(prev => !prev), []);
  const toggleLayersPanelCollapse = useCallback(() => setIsLayersPanelCollapsed(prev => !prev), []);

  const handlePanelMouseDown = useCallback((
    e: React.MouseEvent<HTMLDivElement>, 
    panelType: 'tools' | 'layers'
  ) => {
    const panelRef = panelType === 'tools' ? toolsPanelRef : layersPanelRef;
    const setDragging = panelType === 'tools' ? setIsToolsPanelDragging : setIsLayersPanelDragging;
    const dragStartRef = panelType === 'tools' ? toolsPanelDragStartRef : layersPanelDragStartRef;
    const position = panelType === 'tools' ? toolsPanelPosition : layersPanelPosition;

    if (!panelRef.current) return;
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault();
  }, [toolsPanelPosition, layersPanelPosition]);
  

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!mapAreaRef.current) return;
      const mapRect = mapAreaRef.current.getBoundingClientRect();

      if (isToolsPanelDragging && toolsPanelRef.current) {
        const dx = e.clientX - toolsPanelDragStartRef.current.x;
        const dy = e.clientY - toolsPanelDragStartRef.current.y;
        let newX = toolsPanelDragStartRef.current.panelX + dx;
        let newY = toolsPanelDragStartRef.current.panelY + dy;
        const panelRect = toolsPanelRef.current.getBoundingClientRect();
        if (panelRect.width > 0 && panelRect.height > 0 && mapRect.width > 0 && mapRect.height > 0) {
            newX = Math.max(0, Math.min(newX, mapRect.width - panelRect.width));
            newY = Math.max(0, Math.min(newY, mapRect.height - panelRect.height));
            if (!isNaN(newX) && !isNaN(newY)) setToolsPanelPosition({ x: newX, y: newY });
        }
      }

      if (isLayersPanelDragging && layersPanelRef.current) {
        const dx = e.clientX - layersPanelDragStartRef.current.x;
        const dy = e.clientY - layersPanelDragStartRef.current.y;
        let newX = layersPanelDragStartRef.current.panelX + dx;
        let newY = layersPanelDragStartRef.current.panelY + dy;
        const panelRect = layersPanelRef.current.getBoundingClientRect();
         if (panelRect.width > 0 && panelRect.height > 0 && mapRect.width > 0 && mapRect.height > 0) {
            newX = Math.max(0, Math.min(newX, mapRect.width - panelRect.width));
            newY = Math.max(0, Math.min(newY, mapRect.height - panelRect.height));
            if (!isNaN(newX) && !isNaN(newY)) setLayersPanelPosition({ x: newX, y: newY });
        }
      }
    };
    const handleMouseUp = () => {
        setIsToolsPanelDragging(false);
        setIsLayersPanelDragging(false);
    };

    if (isToolsPanelDragging || isLayersPanelDragging) {
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
  }, [isToolsPanelDragging, isLayersPanelDragging, toolsPanelDragStartRef, layersPanelDragStartRef]);

  const fetchOSMData = useCallback(async () => {
    if (!drawingSourceRef.current) {
        toast({ title: "Error de Dibujo", description: "La capa de dibujo no está inicializada.", variant: "destructive" });
        return;
    }
    const drawnFeatures = drawingSourceRef.current.getFeatures();
    if (drawnFeatures.length === 0) {
        toast({ title: "Sin Dibujos", description: "Por favor, dibuje una entidad en el mapa primero.", variant: "destructive" });
        return;
    }
    const lastDrawnFeature = drawnFeatures[drawnFeatures.length - 1];

    if (selectedOSMCategoryIdsRef.current.length === 0) {
        toast({ title: "Sin Categorías Seleccionadas", description: "Por favor, seleccione al menos una categoría OSM para descargar.", variant: "destructive" });
        return;
    }
    
    const geometry = lastDrawnFeature.getGeometry();
    if (!geometry || geometry.getType() !== 'Polygon') {
        toast({ title: "Geometría Inválida", description: "La descarga de datos OSM requiere un polígono dibujado. Por favor, dibuje un polígono.", variant: "destructive"});
        return;
    }
    
    setIsFetchingOSM(true);
    toast({ title: "Obteniendo Datos OSM", description: "Descargando datos de OpenStreetMap..." });

    try {
      const extent3857 = geometry.getExtent();
      console.log("Extent3857 (Source):", extent3857);

      if (!extent3857 || extent3857.some(val => !isFinite(val)) || (extent3857[2] - extent3857[0] <= 0 && extent3857[2] !== extent3857[0]) || (extent3857[3] - extent3857[1] <= 0 && extent3857[3] !== extent3857[1])) {
          throw new Error(`Área dibujada tiene una extensión inválida (inválida o puntos/líneas). Extent: ${extent3857.join(', ')}`);
      }

      const extent4326_transformed = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
      console.log("Extent4326 (Transformed, raw):", extent4326_transformed);
      
      if (!extent4326_transformed || extent4326_transformed.some(val => !isFinite(val))) {
          throw new Error("Fallo al transformar área dibujada a coordenadas geográficas válidas.");
      }
      
      const s_coord = parseFloat(extent4326_transformed[1].toFixed(6));
      const w_coord = parseFloat(extent4326_transformed[0].toFixed(6));
      const n_coord = parseFloat(extent4326_transformed[3].toFixed(6));
      const e_coord = parseFloat(extent4326_transformed[2].toFixed(6));
      console.log("Coordinates for Overpass (s,w,n,e - after toFixed(6)):", s_coord, w_coord, n_coord, e_coord);

      if (n_coord < s_coord) { 
          throw new Error(`Error de Bounding Box (N < S): Norte ${n_coord} es menor que Sur ${s_coord}. BBox original: ${extent4326_transformed.join(', ')}`);
      }
      if (e_coord < w_coord && Math.abs(e_coord - w_coord) < 180) { 
          throw new Error(`Error de Bounding Box (E < W): Este ${e_coord} es menor que Oeste ${w_coord} (sin cruzar anti-meridiano). BBox original: ${extent4326_transformed.join(', ')}`);
      }
            
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
      newDrawInteraction.on('drawend', () => {
        // No longer automatically fetching OSM data here
      });
      mapRef.current.addInteraction(newDrawInteraction);
      drawInteractionRef.current = newDrawInteraction;
      setActiveDrawTool(toolType);
    }
  }, [activeDrawTool, isInspectModeActive]);

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
      triggerDownload(kmlString, 'drawings.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8');
      toast({ title: "Dibujos Guardados", description: "Dibujos guardados como drawings.kml." });
    } catch (error) {
      console.error("Error guardando KML:", error);
      toast({ title: "Error Guardando KML", description: "No se pudieron guardar los dibujos.", variant: "destructive" });
    }
  }, [toast]);

  const handleDownloadOSMLayers = useCallback(async () => {
    setIsDownloading(true);
    toast({ title: "Procesando descarga...", description: `Formato: ${downloadFormat.toUpperCase()}` });

    const osmLayers = layers.filter(layer => layer.id.startsWith('osm-'));
    if (osmLayers.length === 0) {
      toast({ title: "Sin Capas OSM", description: "No hay capas OSM para descargar.", variant: "destructive" });
      setIsDownloading(false);
      return;
    }

    try {
      if (downloadFormat === 'geojson') {
        const allFeatures: OLFeature<any>[] = [];
        osmLayers.forEach(layer => {
          const source = layer.olLayer.getSource();
          if (source) {
            allFeatures.push(...source.getFeatures());
          }
        });
        if (allFeatures.length === 0) throw new Error("No hay entidades en las capas OSM seleccionadas.");
        const geojsonString = new GeoJSON().writeFeatures(allFeatures, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
          featureProperties: (feature: OLFeature<any>) => { 
            const props = { ...feature.getProperties() };
            delete props[feature.getGeometryName() as string]; 
            return props;
          }
        });
        triggerDownload(geojsonString, 'osm_data.geojson', 'application/geo+json;charset=utf-8');
        toast({ title: "Descarga Completa", description: "Entidades OSM descargadas como GeoJSON." });

      } else if (downloadFormat === 'kml') {
        const allFeatures: OLFeature<any>[] = [];
        osmLayers.forEach(layer => {
          const source = layer.olLayer.getSource();
          if (source) {
            allFeatures.push(...source.getFeatures());
          }
        });
        if (allFeatures.length === 0) throw new Error("No hay entidades en las capas OSM seleccionadas.");
        const kmlString = new KML().writeFeatures(allFeatures, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
        triggerDownload(kmlString, 'osm_data.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8');
        toast({ title: "Descarga Completa", description: "Entidades OSM descargadas como KML." });

      } else if (downloadFormat === 'shp') {
        const geoJsonDataPerLayer: { [key: string]: any } = {};
        let featuresFound = false;

        osmLayers.forEach(layer => {
          const source = layer.olLayer.getSource();
          const layerFeatures = source ? source.getFeatures() : [];
          if (layerFeatures.length > 0) {
            featuresFound = true;
            const featureCollection = new GeoJSON().writeFeaturesObject(layerFeatures, {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
              featureProperties: (feature: OLFeature<any>) => {
                const props = { ...feature.getProperties() };
                delete props[feature.getGeometryName() as string];
                const sanitizedProps: Record<string, any> = {};
                for (const key in props) {
                    let sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 10);
                    if(sanitizedKey.length === 0) sanitizedKey = `prop${Object.keys(sanitizedProps).length}`; 
                    
                    let counter = 0;
                    let finalKey = sanitizedKey;
                    while(finalKey in sanitizedProps) {
                        counter++;
                        finalKey = `${sanitizedKey.substring(0, 10 - String(counter).length)}${counter}`;
                    }
                    sanitizedProps[finalKey] = props[key];
                }
                return sanitizedProps;
              }
            });
            const fileName = layer.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/\s+/g, '_');
            geoJsonDataPerLayer[fileName] = featureCollection;
          }
        });

        if (!featuresFound) throw new Error("No hay entidades en las capas OSM para exportar como Shapefile.");
        
        const zipContentBase64 = await shpwrite.zip(geoJsonDataPerLayer);
        
        const byteString = atob(zipContentBase64);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
          uint8Array[i] = byteString.charCodeAt(i);
        }
        triggerDownloadArrayBuffer(arrayBuffer, 'osm_shapefiles.zip', 'application/zip');
        toast({ title: "Descarga Completa", description: "Entidades OSM descargadas como Shapefile (ZIP)." });
      }

    } catch (error: any) {
      console.error("Error descargando capas OSM:", error);
      toast({ title: "Error de Descarga", description: error.message || "No se pudieron descargar las capas.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  }, [layers, downloadFormat, toast]);

  const handleChangeBaseLayer = useCallback((newBaseLayerId: string) => {
    if (mapRef.current) {
      mapRef.current.getLayers().forEach(layer => {
        if (layer.get('isBaseLayer')) {
          layer.setVisible(layer.get('baseLayerId') === newBaseLayerId);
        }
      });
      setActiveBaseLayerId(newBaseLayerId);
    }
  }, []);

  const layersPanelRenderConfig = { 
    baseLayers: true,
    layers: true 
  };
  const toolsPanelRenderConfig = { 
    inspector: true, 
    osmCategories: true, 
    drawing: true, 
    download: true 
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-gray-800/60 backdrop-blur-md text-white p-4 shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
        <h1 className="text-2xl font-semibold">Visor DEAS</h1>
      </header>
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <MapView mapRef={mapRef} setMapInstance={setMapInstance} />

        {/* Layers Panel (Left) */}
        <div
          ref={layersPanelRef}
          className="absolute bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden z-30"
          style={{
             width: `${PANEL_WIDTH}px`,
             top: `${layersPanelPosition.y}px`,
             left: `${layersPanelPosition.x}px`,
          }}
        >
          <div
            className="p-2 bg-gray-700/80 flex items-center justify-between cursor-grab rounded-t-lg"
            onMouseDown={(e) => handlePanelMouseDown(e, 'layers')}
          >
            <h2 className="text-sm font-semibold">Capas</h2>
            <Button variant="ghost" size="icon" onClick={toggleLayersPanelCollapse} className="h-6 w-6 text-white hover:bg-gray-600/80">
              {isLayersPanelCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="sr-only">{isLayersPanelCollapsed ? 'Expandir' : 'Colapsar'}</span>
            </Button>
          </div>

          {!isLayersPanelCollapsed && (
            <div className="flex-1 min-h-0 bg-transparent" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <MapControls
                  renderConfig={layersPanelRenderConfig}
                  availableBaseLayers={availableBaseLayersForSelect}
                  activeBaseLayerId={activeBaseLayerId}
                  onChangeBaseLayer={handleChangeBaseLayer}
                  layers={layers}
                  onToggleLayerVisibility={toggleLayerVisibility}
                  onRemoveLayer={removeLayer}
                  onZoomToLayerExtent={zoomToLayerExtent}
                  onAddLayer={addLayer}
                  // Props not relevant to layers panel, pass defaults or empty functions
                  isInspectModeActive={false} 
                  onToggleInspectMode={() => {}} 
                  selectedFeatureAttributes={null} 
                  onClearSelectedFeature={() => {}} 
                  activeDrawTool={null} 
                  onToggleDrawingTool={() => {}} 
                  onStopDrawingTool={() => {}} 
                  onClearDrawnFeatures={() => {}} 
                  onSaveDrawnFeaturesAsKML={() => {}} 
                  isFetchingOSM={false} 
                  onFetchOSMDataTrigger={() => {}} 
                  osmCategoriesForSelection={[]} 
                  selectedOSMCategoryIds={[]} 
                  onSelectedOSMCategoriesChange={() => {}} 
                  downloadFormat={downloadFormat} 
                  onDownloadFormatChange={() => {}} 
                  onDownloadOSMLayers={() => {}} 
                  isDownloading={false} 
              />
            </div>
          )}
        </div>
        
        {/* Tools Panel (Right) */}
        <div
          ref={toolsPanelRef}
          className="absolute bg-gray-800/60 backdrop-blur-md rounded-lg shadow-xl flex flex-col text-white overflow-hidden z-30"
          style={{
             width: `${PANEL_WIDTH}px`,
             top: `${toolsPanelPosition.y}px`,
             left: `${toolsPanelPosition.x}px`,
          }}
        >
          <div
            className="p-2 bg-gray-700/80 flex items-center justify-between cursor-grab rounded-t-lg"
            onMouseDown={(e) => handlePanelMouseDown(e, 'tools')}
          >
            <h2 className="text-sm font-semibold">Herramientas</h2>
            <Button variant="ghost" size="icon" onClick={toggleToolsPanelCollapse} className="h-6 w-6 text-white hover:bg-gray-600/80">
              {isToolsPanelCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="sr-only">{isToolsPanelCollapsed ? 'Expandir' : 'Colapsar'}</span>
            </Button>
          </div>

          {!isToolsPanelCollapsed && (
            <div className="flex-1 min-h-0 bg-transparent" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <MapControls
                  renderConfig={toolsPanelRenderConfig}
                  onAddLayer={addLayer} 
                  isInspectModeActive={isInspectModeActive}
                  onToggleInspectMode={() => setIsInspectModeActive(!isInspectModeActive)}
                  selectedFeatureAttributes={selectedFeatureAttributes}
                  onClearSelectedFeature={clearSelectedFeature}
                  activeDrawTool={activeDrawTool}
                  onToggleDrawingTool={toggleDrawingTool}
                  onStopDrawingTool={stopDrawingTool}
                  onClearDrawnFeatures={clearDrawnFeatures}
                  onSaveDrawnFeaturesAsKML={saveDrawnFeaturesAsKML}
                  isFetchingOSM={isFetchingOSM}
                  onFetchOSMDataTrigger={fetchOSMData}
                  osmCategoriesForSelection={osmCategoriesForSelection}
                  selectedOSMCategoryIds={selectedOSMCategoryIds}
                  onSelectedOSMCategoriesChange={setSelectedOSMCategoryIds}
                  downloadFormat={downloadFormat}
                  onDownloadFormatChange={setDownloadFormat}
                  onDownloadOSMLayers={handleDownloadOSMLayers}
                  isDownloading={isDownloading}
                  // Props not relevant to tools panel, pass defaults or empty functions
                  availableBaseLayers={[]}
                  activeBaseLayerId={""}
                  onChangeBaseLayer={() => {}}
                  layers={[]} 
                  onToggleLayerVisibility={() => {}}
                  onRemoveLayer={() => {}}
                  onZoomToLayerExtent={() => {}}
              />
            </div>
          )}
        </div>

      </div>
      <Toaster />
    </div>
  );
}

      