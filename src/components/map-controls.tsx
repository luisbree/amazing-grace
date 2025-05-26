
"use client";

import React, { useState, useCallback } from 'react';
import type { Feature } from 'ol';
import { KML, GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Upload, Layers, Eye, EyeOff, FileText, Loader2 } from 'lucide-react';
import type { MapLayer } from '@/components/geo-mapper-client';
import { useToast } from "@/hooks/use-toast";

interface MapControlsProps {
  onAddLayer: (layer: MapLayer) => void;
  layers: MapLayer[];
  onToggleLayerVisibility: (layerId: string) => void;
}

const MapControls: React.FC<MapControlsProps> = ({ onAddLayer, layers, onToggleLayerVisibility }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputId = useId();
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleFileUpload = useCallback(async () => {
    if (!selectedFile) {
      toast({ title: "No file selected", description: "Please choose a file to upload.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const fileName = selectedFile.name;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          throw new Error("Failed to read file content.");
        }

        let features: Feature[] | undefined;
        const fileContent = event.target.result;

        const commonFormatOptions = {
          dataProjection: 'EPSG:4326', 
          featureProjection: 'EPSG:3857', 
        };

        if (fileExtension === 'kml') { 
          if (typeof fileContent !== 'string') {
            throw new Error("KML file content is not a string.");
          }
          features = new KML().readFeatures(fileContent, commonFormatOptions); 
        } else if (fileExtension === 'geojson' || fileExtension === 'json') {
          if (typeof fileContent !== 'string') {
            throw new Error("GeoJSON file content is not a string.");
          }
          features = new GeoJSON().readFeatures(fileContent, commonFormatOptions);
        } else {
          throw new Error(`Unsupported file type: ${fileExtension}. Please upload KML or GeoJSON.`);
        }

        if (features && features.length > 0) {
          const vectorSource = new VectorSource({ features });
          const vectorLayer = new VectorLayer({ source: vectorSource });
          
          const newLayerId = `${fileInputId}-${fileName}-${Date.now()}`;
          const newLayer: MapLayer = {
            id: newLayerId,
            name: fileName,
            olLayer: vectorLayer,
            visible: true,
          };
          onAddLayer(newLayer);
          toast({ title: "Layer Added", description: `Successfully added ${fileName} to the map.` });
        } else {
          throw new Error(`No features found in ${fileName} or file is empty.`);
        }
      } catch (parseError: any) {
        console.error("Error processing file:", parseError);
        toast({ title: "Processing Error", description: parseError.message || "An unknown error occurred.", variant: "destructive" });
      } finally {
        setIsLoading(false);
        setSelectedFile(null);
        const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
        if (fileInput) fileInput.value = ''; 
      }
    };

    reader.onerror = () => {
      toast({ title: "File Read Error", description: "Could not read the selected file.", variant: "destructive" });
      setIsLoading(false);
    };

    if (fileExtension === 'kml') { 
      reader.readAsText(selectedFile); 
    } else if (fileExtension === 'geojson' || fileExtension === 'json') {
      reader.readAsText(selectedFile);
    } else {
      toast({ title: "Unsupported File Type", description: `File type ".${fileExtension}" is not supported. Please use KML or GeoJSON.`, variant: "destructive" });
      setIsLoading(false);
      setSelectedFile(null); 
      const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      return;
    }
  }, [selectedFile, onAddLayer, fileInputId, toast]);

  return (
    <div className="flex flex-col h-full bg-transparent">
      <Card className="shadow-none border-0 border-b rounded-none bg-card/80"> 
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-lg font-semibold">
            <Upload className="mr-2 h-5 w-5 text-primary" /> Upload Layer
          </CardTitle>
          <CardDescription>Upload KML or GeoJSON files to display on the map.</CardDescription> 
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div>
            <Label htmlFor={fileInputId} className="text-sm font-medium">Choose file</Label>
            <Input 
              id={fileInputId} 
              type="file" 
              onChange={handleFileChange} 
              accept=".kml,.geojson,.json" 
              className="mt-1 file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>
          <Button onClick={handleFileUpload} disabled={!selectedFile || isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {isLoading ? 'Loading Layer...' : 'Add to Map'}
          </Button>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col min-h-0 shadow-none border-0 rounded-none bg-card/80">
        <CardHeader className="pb-4 pt-4">
          <CardTitle className="flex items-center text-lg font-semibold">
            <Layers className="mr-2 h-5 w-5 text-primary" /> Manage Layers
          </CardTitle>
           {layers.length > 0 && <CardDescription>Toggle visibility of uploaded layers.</CardDescription>}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-3 pt-0">
            {layers.length === 0 ? (
              <div className="text-center py-8">
                <Layers className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No layers uploaded yet.</p>
                <p className="text-xs text-muted-foreground/80">Use the uploader above to add data.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {layers.map((layer) => (
                  <li key={layer.id} className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-accent/10 transition-colors">
                    <Label htmlFor={`layer-toggle-${layer.id}`} className="flex-1 cursor-pointer truncate pr-2 text-sm font-medium text-foreground" title={layer.name}>
                      {layer.name}
                    </Label>
                    <div className="flex items-center">
                      <Checkbox
                        id={`layer-toggle-${layer.id}`}
                        checked={layer.visible}
                        onCheckedChange={() => onToggleLayerVisibility(layer.id)}
                        className="mr-2 data-[state=checked]:bg-accent data-[state=checked]:border-accent-foreground border-muted-foreground"
                        aria-label={`Toggle visibility for ${layer.name}`}
                      />
                      {layer.visible ? <Eye className="h-5 w-5 text-accent" /> : <EyeOff className="h-5 w-5 text-muted-foreground/70" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default MapControls;
