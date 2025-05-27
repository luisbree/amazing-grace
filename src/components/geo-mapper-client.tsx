
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Map as OLMap, Feature as OLFeature } from 'ol';
import type VectorLayerType from 'ol/layer/Vector';
import type VectorSourceType from 'ol/source/Vector';
import type { Extent } from 'ol/extent';
import { ChevronDown, ChevronUp, ZoomIn, Trash2, Square, PenLine, Dot, Ban, Eraser, Save, Loader2 } from 'lucide-react';
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
  namePrefix: string;
  overpassQueryFragment: (bboxStr: string) => string;
  matcher: (tags: any) => boolean;
  style: Style;
}


const osmCategoryConfig: OSMCategoryConfig[] = [
  {
    id: 'watercourses',
    namePrefix: 'OSM Watercourses',
    overpassQueryFragment: (bboxStr) => `nwr[waterway~"^(river|stream)$"](bbox:${bboxStr});`,
    matcher: (tags) => tags && (tags.waterway === 'river' || tags.waterway === 'stream'),
    style: new Style({ stroke: new Stroke({ color: '#3a86ff', width: 2 }) })
  },
  {
    id: 'water_bodies',
    namePrefix: 'OSM Water Bodies',
    overpassQueryFragment: (bboxStr) => `nwr[natural="water"](bbox:${bboxStr});\nnwr[landuse="reservoir"](bbox:${bboxStr});`,
    matcher: (tags) => tags && (tags.natural === 'water' || tags.landuse === 'reservoir'),
    style: new Style({ fill: new Fill({ color: 'rgba(58,134,255,0.4)' }), stroke: new Stroke({ color: '#3a86ff', width: 1 }) })
  },
  {
    id: 'roads_paths',
    namePrefix: 'OSM Roads & Paths',
    overpassQueryFragment: (bboxStr) => `nwr[highway](bbox:${bboxStr});`,
    matcher: (tags) => tags && !!tags.highway,
    style: new Style({ stroke: new Stroke({ color: '#adb5bd', width: 3 }) })
  },
  {
    id: 'admin_boundaries',
    namePrefix: 'OSM Admin Boundaries',
    overpassQueryFragment: (bboxStr) => `nwr[boundary="administrative"][admin_level](bbox:${bboxStr});`,
    matcher: (tags) => tags && tags.boundary === 'administrative' && tags.admin_level,
    style: new Style({ stroke: new Stroke({ color: '#ff006e', width: 2, lineDash: [4, 8] }) })
  },
  {
    id: 'green_areas',
    namePrefix: 'OSM Green Areas',
    overpassQueryFragment: (bboxStr) => `nwr[leisure="park"](bbox:${bboxStr});\nnwr[landuse="forest"](bbox:${bboxStr});\nnwr[natural="wood"](bbox:${bboxStr});`,
    matcher: (tags) => tags && (tags.leisure === 'park' || tags.landuse === 'forest' || tags.natural === 'wood'),
    style: new Style({ fill: new Fill({ color: 'rgba(13,166,75,0.4)' }), stroke: new Stroke({ color: '#0da64b', width: 1 }) })
  },
  {
    id: 'health_centers',
    namePrefix: 'OSM Health Centers',
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(hospital|clinic|doctors|pharmacy)$"](bbox:${bboxStr});`,
    matcher: (tags) => tags && ['hospital', 'clinic', 'doctors', 'pharmacy'].includes(tags.amenity),
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#d90429'}), stroke: new Stroke({color: 'white', width: 1.5})})})
  },
  {
    id: 'educational',
    namePrefix: 'OSM Educational',
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(school|university|college|kindergarten)$"](bbox:${bboxStr});`,
    matcher: (tags) => tags && ['school', 'university', 'college', 'kindergarten'].includes(tags.amenity),
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#8338ec'}), stroke: new Stroke({color: 'white', width: 1.5})})})
  },
];


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


  const addLayer = useCallback((newLayer: MapLayer) => {
    setLayers(prevLayers => [...prevLayers, newLayer]);
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
    toast({ title: "Layer Removed", description: "The layer has been removed from the map." });
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

    if (mapRef.current && !drawingLayerRef.current) { // Initialize drawing layer only once
      // First, verify that our ref objects are indeed ref objects.
      if (!drawingSourceRef || typeof drawingSourceRef !== 'object' || !('current' in drawingSourceRef)) {
        console.error("CRITICAL: drawingSourceRef is not a valid React ref object. Drawing layer cannot be initialized.");
        return; 
      }
      if (!drawingLayerRef || typeof drawingLayerRef !== 'object' || !('current' in drawingLayerRef)) {
        console.error("CRITICAL: drawingLayerRef is not a valid React ref object. Drawing layer cannot be initialized.");
        return; 
      }

      // At this point, drawingSourceRef and drawingLayerRef are known to be valid ref objects.
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
        zIndex: 1000 // Ensure drawing layer is on top
      });
      
      mapRef.current.addLayer(drawingLayerRef.current);
    }
  }, []);


 useEffect(() => {
    if (!mapRef.current) return;
    const currentMap = mapRef.current;

    // Get the base OSM layer
    const baseLayer = currentMap.getLayers().getArray().find(l => l.get('name') === 'OSMBaseLayer');
    
    // Get all vector layers currently on the map, excluding the drawing layer
    const olMapVectorLayers = currentMap.getLayers().getArray()
      .filter(l => l !== baseLayer && l !== drawingLayerRef.current) as VectorLayerType<VectorSourceType<OLFeature<any>>>[];

    // Remove existing vector layers (excluding drawing layer)
    olMapVectorLayers.forEach(olMapLayer => {
        currentMap.removeLayer(olMapLayer);
    });
    
    // Add/update layers from state
    layers.forEach(appLayer => {
      currentMap.addLayer(appLayer.olLayer);
      appLayer.olLayer.setVisible(appLayer.visible);
    });

    // Ensure drawing layer is on top of other vector layers if it exists
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
      toast({ title: "Feature Selected", description: "Attributes shown in panel." });
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
    toast({ title: "Selection Cleared", description: "No feature is selected." });
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
          toast({ title: "Zoom to Layer", description: `Showing extent of ${layer.name}.` });
        } else {
          toast({ title: "Invalid Extent", description: `Layer "${layer.name}" might be empty or have an invalid extent.`, variant: "destructive" });
        }
      } else {
        toast({ title: "Empty Layer", description: `Layer "${layer.name}" contains no features.`, variant: "destructive" });
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
        // console.warn("Panel or map dimensions are zero, cannot restrict drag.");
        return;
      }

      newX = Math.max(0, Math.min(newX, mapRect.width - panelRect.width));
      newY = Math.max(0, Math.min(newY, mapRect.height - panelRect.height));

      if (isNaN(newX) || isNaN(newY)) {
        // console.error("Calculated panel position is NaN.");
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

  // OSM Data Fetching
  const fetchOSMData = useCallback(async (drawnFeature: OLFeature<any>) => {
    if (!mapRef.current) return;
    const geometry = drawnFeature.getGeometry();
    if (!geometry || geometry.getType() !== 'Polygon') {
      toast({ title: "Invalid Geometry", description: "Please draw a polygon to fetch OSM data.", variant: "destructive" });
      return;
    }

    setIsFetchingOSM(true);
    toast({ title: "Fetching OSM Data", description: "Downloading data from OpenStreetMap..." });

    try {
      const extent3857 = geometry.getExtent();
      const extent4326 = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
      
      if (!extent4326 || extent4326.some(val => !isFinite(val))) {
          console.error("Failed to transform drawn area to valid geographic coordinates. Extent4326:", extent4326);
          throw new Error("Failed to transform drawn area to valid geographic coordinates.");
      }

      const s_coord = parseFloat(extent4326[1].toFixed(6));
      const w_coord = parseFloat(extent4326[0].toFixed(6));
      const n_coord = parseFloat(extent4326[3].toFixed(6));
      const e_coord = parseFloat(extent4326[2].toFixed(6));

      if (n_coord < s_coord) { 
          console.error(`Invalid bbox: North (${n_coord}) is South of South (${s_coord}). Original extent4326:`, extent4326, "Drawn feature extent3857:", extent3857);
          throw new Error("Drawn area resulted in an invalid bounding box: North coordinate is south of the South coordinate.");
      }
      if (e_coord < w_coord) { 
          console.error(`Invalid bbox: East (${e_coord}) is West of West (${w_coord}). Original extent4326:`, extent4326, "Drawn feature extent3857:", extent3857);
          throw new Error("Drawn area resulted in an invalid bounding box: East coordinate is west of the West coordinate.");
      }
      
      console.log("Extent4326 after checks and formatting:", {s: s_coord, w: w_coord, n: n_coord, e: e_coord});
      
      const bboxStr = `${s_coord},${w_coord},${n_coord},${e_coord}`; // s,w,n,e
      console.log("Constructed bboxStr for Overpass API:", bboxStr);


      let queryParts: string[] = [];
      osmCategoryConfig.forEach(cat => {
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
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const osmData = await response.json();
      const geojsonData = osmtogeojson(osmData) as any; 

      let featuresAddedCount = 0;
      osmCategoryConfig.forEach(category => {
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
            addLayer({ id: layerId, name: `${category.namePrefix} (${olFeatures.length})`, olLayer: vectorLayer, visible: true });
            featuresAddedCount += olFeatures.length;
          }
        }
      });

      if (featuresAddedCount > 0) {
        toast({ title: "OSM Data Loaded", description: `${featuresAddedCount} features added to the map.` });
      } else {
        toast({ title: "No OSM Data Found", description: "No features matched your criteria in the selected area." });
      }

    } catch (error: any) {
      console.error("Error fetching OSM data:", error);
      toast({ title: "Error Fetching OSM Data", description: error.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsFetchingOSM(false);
      if (drawingSourceRef.current && drawnFeature) {
        const drawnFeatures = drawingSourceRef.current.getFeatures();
        if (drawnFeatures.includes(drawnFeature)) {
            drawingSourceRef.current.removeFeature(drawnFeature);
        }
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
      toast({ title: "Drawings Cleared", description: "All drawings have been removed." });
    }
  }, [toast]);

  const saveDrawnFeaturesAsKML = useCallback(() => {
    if (!drawingSourceRef.current || drawingSourceRef.current.getFeatures().length === 0) {
      toast({ title: "No Drawings", description: "Nothing drawn to save.", variant: "destructive" });
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
      toast({ title: "Drawings Saved", description: "Drawings saved as drawings.kml." });
    } catch (error) {
      console.error("Error saving KML:", error);
      toast({ title: "Error Saving KML", description: "Could not save drawings.", variant: "destructive" });
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
            <h2 className="text-sm font-semibold">Map Tools</h2>
            <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-6 w-6 text-white hover:bg-gray-600/80">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="sr-only">{isCollapsed ? 'Expand' : 'Collapse'}</span>
            </Button>
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-h-0 bg-transparent" style={{ maxHeight: 'calc(100vh - 120px)' }}>
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
              />
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
    

    
