
"use client";

import React, { useState, useCallback } from 'react';
import type { Feature } from 'ol';
import { KML, GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { useId } from 'react';
import JSZip from 'jszip';
import shpjs from 'shpjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Upload, Layers, FileText, Loader2, MousePointerClick, XCircle, ZoomIn, Trash2,
  Square, PenLine, Dot, Ban, Eraser, Save, ListFilter, ChevronDown, Settings2 // Added ChevronDown for accordion, Settings2 as placeholder
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { MapLayer } from '@/components/geo-mapper-client';
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';

interface MapControlsProps {
  onAddLayer: (layer: MapLayer) => void;
  layers: MapLayer[];
  onToggleLayerVisibility: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  isInspectModeActive: boolean;
  onToggleInspectMode: () => void;
  selectedFeatureAttributes: Record<string, any> | null;
  onClearSelectedFeature: () => void;
  onZoomToLayerExtent: (layerId: string) => void;
  activeDrawTool: string | null;
  onToggleDrawingTool: (toolType: 'Polygon' | 'LineString' | 'Point') => void;
  onStopDrawingTool: () => void;
  onClearDrawnFeatures: () => void;
  onSaveDrawnFeaturesAsKML: () => void;
  isFetchingOSM: boolean;
  osmCategoriesForSelection: { id: string; name: string; }[];
  selectedOSMCategoryIds: string[];
  onSelectedOSMCategoriesChange: (ids: string[]) => void;
}

// Helper component for Accordion Triggers to keep styling consistent
const SectionHeader: React.FC<{ title: string; description?: string; icon: React.ElementType }> = ({ title, description, icon: Icon }) => (
  <div className="flex items-center w-full">
    <Icon className="mr-2 h-4 w-4 text-primary" />
    <div className="flex-1 text-left">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {description && <p className="text-xs text-gray-300/80">{description}</p>}
    </div>
  </div>
);


const MapControls: React.FC<MapControlsProps> = ({ 
  onAddLayer, 
  layers, 
  onToggleLayerVisibility,
  onRemoveLayer,
  isInspectModeActive,
  onToggleInspectMode,
  selectedFeatureAttributes,
  onClearSelectedFeature,
  onZoomToLayerExtent,
  activeDrawTool,
  onToggleDrawingTool,
  onStopDrawingTool,
  onClearDrawnFeatures,
  onSaveDrawnFeaturesAsKML,
  isFetchingOSM,
  osmCategoriesForSelection,
  selectedOSMCategoryIds,
  onSelectedOSMCategoriesChange,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMultipleFiles, setSelectedMultipleFiles] = useState<FileList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputId = useId();
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      if (event.target.files.length > 1) {
        setSelectedMultipleFiles(event.target.files);
        setSelectedFile(null); 
      } else if (event.target.files.length === 1) {
        setSelectedFile(event.target.files[0]);
        setSelectedMultipleFiles(null); 
      } else {
        setSelectedFile(null);
        setSelectedMultipleFiles(null);
      }
    }
  };

  const resetFileInput = () => {
    setSelectedFile(null);
    setSelectedMultipleFiles(null);
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleFileUpload = useCallback(async () => {
    if (!selectedFile && !selectedMultipleFiles) {
      toast({ title: "Ningún archivo seleccionado", description: "Por favor, elija un archivo o archivos para cargar.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      if (selectedMultipleFiles && selectedMultipleFiles.length > 0) {
        let shpFileBuffer: ArrayBuffer | null = null;
        let dbfFileBuffer: ArrayBuffer | null = null;
        let shapeFileName = "Shapefile";

        for (let i = 0; i < selectedMultipleFiles.length; i++) {
          const file = selectedMultipleFiles[i];
          const fileNameLower = file.name.toLowerCase();
          if (fileNameLower.endsWith('.shp')) {
            shpFileBuffer = await file.arrayBuffer();
            shapeFileName = file.name.substring(0, file.name.lastIndexOf('.'));
          } else if (fileNameLower.endsWith('.dbf')) {
            dbfFileBuffer = await file.arrayBuffer();
          }
        }

        if (shpFileBuffer && dbfFileBuffer) {
          const geojson = shpjs.combine([shpjs.parseShp(shpFileBuffer), shpjs.parseDbf(dbfFileBuffer)]);
          const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });

          if (features && features.length > 0) {
            const vectorSource = new VectorSource({ features });
            const vectorLayer = new VectorLayer({ source: vectorSource });
            const newLayerId = `${fileInputId}-${shapeFileName}-${Date.now()}`;
            onAddLayer({ id: newLayerId, name: shapeFileName, olLayer: vectorLayer, visible: true });
            toast({ title: "Capa Añadida", description: `${shapeFileName} añadido exitosamente al mapa.` });
          } else {
            throw new Error(`No se encontraron entidades en Shapefile ${shapeFileName} o los archivos están vacíos.`);
          }
        } else {
          throw new Error("Un Shapefile requiere al menos archivos .shp y .dbf. Por favor, seleccione ambos.");
        }
      } else if (selectedFile) {
        const fileName = selectedFile.name;
        const fileBaseName = fileName.substring(0, fileName.lastIndexOf('.'));
        const fileExtension = fileName.split('.').pop()?.toLowerCase();

        if (fileExtension === 'zip') {
          const zip = await JSZip.loadAsync(await selectedFile.arrayBuffer());
          let shpFile: JSZip.JSZipObject | null = null;
          let dbfFile: JSZip.JSZipObject | null = null;
          let shpFileNameInZip = fileBaseName;


          zip.forEach((relativePath, file) => {
            if (relativePath.toLowerCase().endsWith('.shp')) {
               shpFile = file;
               shpFileNameInZip = relativePath.substring(0, relativePath.lastIndexOf('.'));
            }
            if (relativePath.toLowerCase().endsWith('.dbf')) dbfFile = file;
          });

          if (shpFile && dbfFile) {
            const shpBuffer = await shpFile.async('arraybuffer');
            const dbfBuffer = await dbfFile.async('arraybuffer');
            const geojson = shpjs.combine([shpjs.parseShp(shpBuffer), shpjs.parseDbf(dbfBuffer)]);
            const features = new GeoJSON().readFeatures(geojson, {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
            });
            if (features && features.length > 0) {
              const vectorSource = new VectorSource({ features });
              const vectorLayer = new VectorLayer({ source: vectorSource });
              const newLayerId = `${fileInputId}-${shpFileNameInZip}-${Date.now()}`;
              onAddLayer({ id: newLayerId, name: shpFileNameInZip, olLayer: vectorLayer, visible: true });
              toast({ title: "Capa Añadida", description: `${shpFileNameInZip} (Shapefile de ZIP) añadido exitosamente.` });
            } else {
              throw new Error(`No se encontraron entidades en el Shapefile dentro de ${fileName}.`);
            }
          } else {
            throw new Error(`Archivo ZIP ${fileName} no contiene los archivos .shp y .dbf requeridos.`);
          }
        } else {
          const fileContent = await selectedFile.text();
          let features: Feature[] | undefined;
          const commonFormatOptions = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' };

          if (fileExtension === 'kml') {
            features = new KML().readFeatures(fileContent, commonFormatOptions);
          } else if (fileExtension === 'geojson' || fileExtension === 'json') {
            features = new GeoJSON().readFeatures(fileContent, commonFormatOptions);
          } else {
            throw new Error(`Tipo de archivo no soportado: .${fileExtension}. Por favor, cargue KML, GeoJSON, o un ZIP conteniendo un Shapefile.`);
          }

          if (features && features.length > 0) {
            const vectorSource = new VectorSource({ features });
            const vectorLayer = new VectorLayer({ source: vectorSource });
            const newLayerId = `${fileInputId}-${fileBaseName}-${Date.now()}`;
            onAddLayer({ id: newLayerId, name: fileBaseName, olLayer: vectorLayer, visible: true });
            toast({ title: "Capa Añadida", description: `${fileBaseName} añadido exitosamente al mapa.` });
          } else {
            throw new Error(`No se encontraron entidades en ${fileName} o el archivo está vacío.`);
          }
        }
      }
    } catch (parseError: any) {
      console.error("Error procesando archivo:", parseError);
      toast({ title: "Error de Procesamiento", description: parseError.message || "Ocurrió un error desconocido.", variant: "destructive" });
    } finally {
      setIsLoading(false);
      resetFileInput();
    }
  }, [selectedFile, selectedMultipleFiles, onAddLayer, fileInputId, toast]);

  const getButtonVariant = (toolName: string) => {
    return activeDrawTool === toolName ? "secondary" : "outline";
  };

  const handleOSMCategoryChange = (categoryId: string, checked: boolean) => {
    const newSelectedIds = checked
      ? [...selectedOSMCategoryIds, categoryId]
      : selectedOSMCategoryIds.filter(id => id !== categoryId);
    onSelectedOSMCategoriesChange(newSelectedIds);
  };

  return (
    <ScrollArea className="h-full bg-transparent text-white">
      <Accordion type="multiple" defaultValue={['upload-section', 'layers-section']} className="w-full p-2 space-y-1">
        
        <AccordionItem value="upload-section" className="border-b-0 bg-white/5 rounded-md">
          <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
            <SectionHeader 
              title="Cargar Capa" 
              description="KML, GeoJSON, Shapefile"
              icon={Upload} 
            />
          </AccordionTrigger>
          <AccordionContent className="p-3 pt-2 border-t border-white/10 bg-black/10 rounded-b-md">
            <div className="space-y-2">
              <div>
                <Label htmlFor={fileInputId} className="text-xs font-medium text-white/90">Elegir archivo(s)</Label>
                <Input
                  id={fileInputId}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  accept=".kml,.geojson,.json,.zip,.shp,.dbf"
                  className="mt-1 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 text-white/90 border-white/30 placeholder-gray-400 text-xs h-8"
                />
              </div>
              <Button onClick={handleFileUpload} disabled={(!selectedFile && !selectedMultipleFiles) || isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8">
                {isLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <FileText className="mr-2 h-3 w-3" />}
                {isLoading ? 'Cargando...' : 'Añadir al Mapa'}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="layers-section" className="border-b-0 bg-white/5 rounded-md">
          <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
             <SectionHeader 
              title="Administrar Capas" 
              description={layers.length > 0 ? "Alternar visibilidad y acciones" : "No hay capas cargadas"}
              icon={Layers} 
            />
          </AccordionTrigger>
          <AccordionContent className="p-0 pt-0 border-t border-white/10 bg-black/10 rounded-b-md">
            {layers.length === 0 ? (
              <div className="text-center py-6 px-3">
                <Layers className="mx-auto h-10 w-10 text-gray-400/40" />
                <p className="mt-1.5 text-xs text-gray-300/90">No hay capas cargadas.</p>
                <p className="text-xs text-gray-400/70">Use el cargador de arriba.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-48 p-2"> {/* Max height for layer list */}
                <ul className="space-y-1.5">
                  {layers.map((layer) => (
                    <li key={layer.id} className="flex items-center justify-between p-2 rounded-md border border-white/15 hover:bg-white/10 transition-colors">
                      <Checkbox
                          id={`layer-toggle-${layer.id}`}
                          checked={layer.visible}
                          onCheckedChange={() => onToggleLayerVisibility(layer.id)}
                          className="data-[state=checked]:bg-accent data-[state=checked]:border-accent-foreground border-muted-foreground/70 mr-2"
                          aria-label={`Alternar visibilidad para ${layer.name}`}
                        />
                      <Label htmlFor={`layer-toggle-${layer.id}`} className="flex-1 cursor-default truncate pr-1 text-xs font-medium text-white" title={layer.name}>
                        {layer.name}
                      </Label>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onZoomToLayerExtent(layer.id)}
                          className="h-6 w-6 text-white hover:bg-gray-600/80 p-0"
                          aria-label={`Zoom a ${layer.name}`}
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveLayer(layer.id)}
                          className="h-6 w-6 text-white hover:bg-red-500/30 hover:text-red-400 p-0"
                          aria-label={`Eliminar ${layer.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="inspector-section" className="border-b-0 bg-white/5 rounded-md">
          <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
            <SectionHeader 
              title="Inspector de Entidades"
              icon={MousePointerClick} 
            />
          </AccordionTrigger>
          <AccordionContent className="p-3 pt-2 space-y-2 border-t border-white/10 bg-black/10 rounded-b-md">
            <Button 
              onClick={onToggleInspectMode} 
              variant={isInspectModeActive ? "secondary" : "outline"} 
              className={`w-full text-xs h-8 ${isInspectModeActive ? 'bg-accent/30 hover:bg-accent/40 text-white' : 'border-white/30 hover:bg-white/10 text-white/90'}`}
              disabled={!!activeDrawTool} 
            >
              {isInspectModeActive ? 'Modo Inspector Activo' : 'Activar Modo Inspector'}
            </Button>

            {selectedFeatureAttributes ? (
              <>
                <Button onClick={onClearSelectedFeature} variant="outline" className="w-full text-xs h-8 border-white/30 hover:bg-white/10 text-white/90">
                  <XCircle className="mr-2 h-3 w-3" /> Limpiar Selección
                </Button>
                <Card className="bg-black/20 border-white/10 max-h-32">
                  <CardHeader className="p-1.5">
                    <CardTitle className="text-xs font-medium text-white/90">Atributos de Entidad</CardTitle>
                  </CardHeader>
                  <CardContent className="p-1.5 pt-0">
                    <ScrollArea className="h-24">
                      <ul className="text-xs text-white/80 space-y-1">
                        {Object.entries(selectedFeatureAttributes).map(([key, value]) => (
                          <li key={key} className="truncate">
                            <span className="font-semibold">{key}:</span> {String(value)}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </>
            ) : (
              isInspectModeActive && (
                <p className="text-xs text-center text-gray-300/80 py-2">Haga clic en una entidad del mapa para ver sus atributos.</p>
              )
            )}
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="osm-categories-section" className="border-b-0 bg-white/5 rounded-md">
          <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
            <SectionHeader 
              title="Categorías OSM a Descargar"
              description="Seleccione qué tipos de entidades OSM desea obtener."
              icon={ListFilter} 
            />
          </AccordionTrigger>
          <AccordionContent className="p-3 pt-2 border-t border-white/10 bg-black/10 rounded-b-md">
             <ScrollArea className="h-32"> 
              <div className="space-y-1.5">
                {osmCategoriesForSelection.map(category => (
                  <div key={category.id} className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-white/5">
                    <Checkbox
                      id={`osm-cat-${category.id}`}
                      checked={selectedOSMCategoryIds.includes(category.id)}
                      onCheckedChange={(checked) => handleOSMCategoryChange(category.id, !!checked)}
                      className="data-[state=checked]:bg-accent data-[state=checked]:border-accent-foreground border-muted-foreground/70"
                    />
                    <Label htmlFor={`osm-cat-${category.id}`} className="text-xs font-medium text-white/90 cursor-pointer">
                      {category.name}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="drawing-tools-section" className="border-b-0 bg-white/5 rounded-md">
          <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
             <SectionHeader 
              title="Herramientas de Dibujo"
              description="Dibuje un polígono para obtener datos OSM."
              icon={PenLine} 
            />
          </AccordionTrigger>
          <AccordionContent className="p-3 pt-2 space-y-2 border-t border-white/10 bg-black/10 rounded-b-md">
            <div className="grid grid-cols-3 gap-2">
              <Button 
                onClick={() => onToggleDrawingTool('Polygon')} 
                variant={getButtonVariant('Polygon')} 
                className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
                data-state={activeDrawTool === 'Polygon' ? 'active' : 'inactive'}
                title="Dibujar Polígono (para obtener datos OSM)"
              >
                <Square className="mr-1 h-3 w-3" /> Polígono
              </Button>
              <Button 
                onClick={() => onToggleDrawingTool('LineString')} 
                variant={getButtonVariant('LineString')}
                className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
                data-state={activeDrawTool === 'LineString' ? 'active' : 'inactive'}
                title="Dibujar Línea"
              >
                <PenLine className="mr-1 h-3 w-3" /> Línea
              </Button>
              <Button 
                onClick={() => onToggleDrawingTool('Point')} 
                variant={getButtonVariant('Point')}
                className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
                data-state={activeDrawTool === 'Point' ? 'active' : 'inactive'}
                title="Dibujar Punto"
              >
                <Dot className="mr-1 h-3 w-3" /> Punto
              </Button>
            </div>
            {activeDrawTool && (
              <Button 
                onClick={onStopDrawingTool} 
                variant="outline" 
                className="w-full text-xs h-8 border-white/30 hover:bg-white/10 text-white/90"
              >
                <Ban className="mr-2 h-3 w-3" /> Detener Dibujo
              </Button>
            )}
            <Separator className="my-2 bg-white/20" />
            <Button 
              onClick={onClearDrawnFeatures} 
              variant="outline" 
              className="w-full text-xs h-8 border-white/30 hover:bg-red-500/20 hover:text-red-300 text-white/90"
              disabled={isFetchingOSM}
            >
              <Eraser className="mr-2 h-3 w-3" /> Limpiar Dibujos
            </Button>
            <Button 
              onClick={onSaveDrawnFeaturesAsKML} 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 mt-2"
              disabled={isFetchingOSM}
            >
              <Save className="mr-2 h-3 w-3" /> Guardar Dibujos (KML)
            </Button>
            {isFetchingOSM && (
              <div className="flex items-center justify-center text-xs text-primary mt-2">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Obteniendo Datos OSM...
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </ScrollArea>
  );
};

export default MapControls;
