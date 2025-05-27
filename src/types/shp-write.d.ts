
// Minimal type declarations for shp-write
// This is a basic representation. For full accuracy, refer to the library's own types or generate them.
declare module 'shp-write' {
  interface ShpWriteOptions {
    folder?: string;
    types?: {
      point?: string;
      polygon?: string;
      line?: string;
      multipolygon?: string;
      multilinestring?: string;
    };
  }

  // GeoJSON FeatureCollection type (simplified)
  interface GeoJSONFeatureCollection {
    type: 'FeatureCollection';
    features: Array<GeoJSONFeature>;
  }

  interface GeoJSONFeature {
    type: 'Feature';
    geometry: GeoJSONGeometry;
    properties: object | null;
  }

  interface GeoJSONGeometry {
    type: string; // e.g., 'Point', 'LineString', 'Polygon'
    coordinates: any;
  }

  // This function is used to create a zip file with shapefiles.
  // It takes an object where keys are desired filenames (without extension) 
  // and values are GeoJSON FeatureCollection objects.
  // It returns a Promise that resolves to a base64 encoded string of the ZIP file.
  export function zip(
    data: { [key: string]: GeoJSONFeatureCollection },
    options?: ShpWriteOptions
  ): Promise<string>;

  // This function directly triggers a download.
  // It can take multiple GeoJSON FeatureCollections as arguments.
  export function download(
    ...geojsonFeatureCollections: (GeoJSONFeatureCollection | ShpWriteOptions)[]
  ): void;

  // Other functions might exist, but zip and download are common for usage.
}
