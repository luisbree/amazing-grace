
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
  Square, PenLine, Dot, Ban, Eraser, Save, DownloadCloud // Drawing icons & OSM
} from 'lucide-react';
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
}

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
      toast({ title: "No file selected", description: "Please choose a file or files to upload.", variant: "destructive" });
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
            toast({ title: "Layer Added", description: `${shapeFileName} successfully added to the map.` });
          } else {
            throw new Error(`No features found in Shapefile ${shapeFileName} or files are empty.`);
          }
        } else {
          throw new Error("A Shapefile requires at least .shp and .dbf files. Please select both.");
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
              toast({ title: "Layer Added", description: `${shpFileNameInZip} (Shapefile from ZIP) successfully added.` });
            } else {
              throw new Error(`No features found in the Shapefile within ${fileName}.`);
            }
          } else {
            throw new Error(`ZIP file ${fileName} does not contain required .shp and .dbf files.`);
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
            throw new Error(`Unsupported file type: .${fileExtension}. Please upload KML, GeoJSON, or a ZIP containing a Shapefile.`);
          }

          if (features && features.length > 0) {
            const vectorSource = new VectorSource({ features });
            const vectorLayer = new VectorLayer({ source: vectorSource });
            const newLayerId = `${fileInputId}-${fileBaseName}-${Date.now()}`;
            onAddLayer({ id: newLayerId, name: fileBaseName, olLayer: vectorLayer, visible: true });
            toast({ title: "Layer Added", description: `${fileBaseName} successfully added to the map.` });
          } else {
            throw new Error(`No features found in ${fileName} or file is empty.`);
          }
        }
      }
    } catch (parseError: any) {
      console.error("Error processing file:", parseError);
      toast({ title: "Processing Error", description: parseError.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsLoading(false);
      resetFileInput();
    }
  }, [selectedFile, selectedMultipleFiles, onAddLayer, fileInputId, toast]);

  const getButtonVariant = (toolName: string) => {
    return activeDrawTool === toolName ? "secondary" : "outline";
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-white">
      {/* File Upload Section */}
      <Card className="bg-transparent shadow-none border-0 border-b border-white/20 rounded-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-base font-semibold text-white">
            <Upload className="mr-2 h-4 w-4 text-primary" /> Upload Layer
          </CardTitle>
          <CardDescription className="text-xs text-gray-300/80">KML, GeoJSON, Shapefile (.shp + .dbf or in .zip)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pb-3">
          <div>
            <Label htmlFor={fileInputId} className="text-xs font-medium text-white/90">Choose file(s)</Label>
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
            {isLoading ? 'Loading...' : 'Add to Map'}
          </Button>
        </CardContent>
      </Card>
      
      {/* Layer Management Section */}
      <Card className="flex-1 flex flex-col min-h-0 bg-transparent shadow-none border-0 border-b border-white/20 rounded-none">
        <CardHeader className="pb-3 pt-3">
          <CardTitle className="flex items-center text-base font-semibold text-white">
            <Layers className="mr-2 h-4 w-4 text-primary" /> Manage Layers
          </CardTitle>
          {layers.length > 0 && <CardDescription className="text-xs text-gray-300/80">Toggle visibility and actions.</CardDescription>}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-2 pt-0">
            {layers.length === 0 ? (
              <div className="text-center py-6">
                <Layers className="mx-auto h-10 w-10 text-gray-400/40" />
                <p className="mt-1.5 text-xs text-gray-300/90">No layers loaded.</p>
                <p className="text-xs text-gray-400/70">Use the uploader above.</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {layers.map((layer) => (
                  <li key={layer.id} className="flex items-center justify-between p-2 rounded-md border border-white/15 hover:bg-white/10 transition-colors">
                    <Label htmlFor={`layer-toggle-${layer.id}`} className="flex-1 cursor-default truncate pr-2 text-xs font-medium text-white" title={layer.name}>
                      {layer.name}
                    </Label>
                    <div className="flex items-center space-x-1">
                      <Checkbox
                        id={`layer-toggle-${layer.id}`}
                        checked={layer.visible}
                        onCheckedChange={() => onToggleLayerVisibility(layer.id)}
                        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent-foreground border-muted-foreground/70"
                        aria-label={`Toggle visibility for ${layer.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onZoomToLayerExtent(layer.id)}
                        className="h-6 w-6 text-white hover:bg-gray-600/80 p-0"
                        aria-label={`Zoom to ${layer.name}`}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveLayer(layer.id)}
                        className="h-6 w-6 text-white hover:bg-red-500/30 hover:text-red-400 p-0"
                        aria-label={`Remove ${layer.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Feature Inspector Section */}
      <Card className="flex-1 flex flex-col min-h-0 bg-transparent shadow-none border-0 border-b border-white/20 rounded-none">
        <CardHeader className="pb-3 pt-3">
          <CardTitle className="flex items-center text-base font-semibold text-white">
            <MousePointerClick className="mr-2 h-4 w-4 text-primary" /> Feature Inspector
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-2 pt-0 space-y-2">
          <Button 
            onClick={onToggleInspectMode} 
            variant={isInspectModeActive ? "secondary" : "outline"} 
            className={`w-full text-xs h-8 ${isInspectModeActive ? 'bg-accent/30 hover:bg-accent/40 text-white' : 'border-white/30 hover:bg-white/10 text-white/90'}`}
            disabled={!!activeDrawTool} // Disable if a draw tool is active
          >
            {isInspectModeActive ? 'Inspector Mode Active' : 'Activate Inspector Mode'}
          </Button>

          {selectedFeatureAttributes ? (
            <>
              <Button onClick={onClearSelectedFeature} variant="outline" className="w-full text-xs h-8 border-white/30 hover:bg-white/10 text-white/90">
                <XCircle className="mr-2 h-3 w-3" /> Clear Selection
              </Button>
              <Card className="bg-black/20 border-white/10 max-h-32">
                <CardHeader className="p-1.5">
                  <CardTitle className="text-xs font-medium text-white/90">Feature Attributes</CardTitle>
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
              <p className="text-xs text-center text-gray-300/80 py-2">Click a feature on the map to see its attributes.</p>
            )
          )}
        </CardContent>
      </Card>

      {/* Drawing Tools Section */}
      <Card className="bg-transparent shadow-none border-0 rounded-none">
        <CardHeader className="pb-3 pt-3">
          <CardTitle className="flex items-center text-base font-semibold text-white">
            <PenLine className="mr-2 h-4 w-4 text-primary" /> Drawing Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Button 
              onClick={() => onToggleDrawingTool('Polygon')} 
              variant={getButtonVariant('Polygon')} 
              className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
              data-state={activeDrawTool === 'Polygon' ? 'active' : 'inactive'}
            >
              <Square className="mr-1 h-3 w-3" /> Polygon
            </Button>
            <Button 
              onClick={() => onToggleDrawingTool('LineString')} 
              variant={getButtonVariant('LineString')}
              className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
              data-state={activeDrawTool === 'LineString' ? 'active' : 'inactive'}
            >
              <PenLine className="mr-1 h-3 w-3" /> Line
            </Button>
            <Button 
              onClick={() => onToggleDrawingTool('Point')} 
              variant={getButtonVariant('Point')}
              className="text-xs h-8 border-white/30 hover:bg-white/10 text-white/90 data-[state=active]:bg-accent/30 data-[state=active]:text-white"
              data-state={activeDrawTool === 'Point' ? 'active' : 'inactive'}
            >
              <Dot className="mr-1 h-3 w-3" /> Point
            </Button>
          </div>
          {activeDrawTool && (
            <Button 
              onClick={onStopDrawingTool} 
              variant="outline" 
              className="w-full text-xs h-8 border-white/30 hover:bg-white/10 text-white/90"
            >
              <Ban className="mr-2 h-3 w-3" /> Stop Drawing
            </Button>
          )}
          <Separator className="my-2 bg-white/20" />
          <Button 
            onClick={onClearDrawnFeatures} 
            variant="outline" 
            className="w-full text-xs h-8 border-white/30 hover:bg-red-500/20 hover:text-red-300 text-white/90"
            disabled={isFetchingOSM}
          >
            <Eraser className="mr-2 h-3 w-3" /> Clear Drawings
          </Button>
          <Button 
            onClick={onSaveDrawnFeaturesAsKML} 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 mt-2"
            disabled={isFetchingOSM}
          >
            <Save className="mr-2 h-3 w-3" /> Save Drawings (KML)
          </Button>
          {isFetchingOSM && (
            <div className="flex items-center justify-center text-xs text-primary mt-2">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching OSM Data...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MapControls;
    
