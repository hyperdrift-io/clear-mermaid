export interface ClearMermaidHandlerOptions {
  publicOrigin?: string;
  rendererBaseUrl?: string;
  fallbackUrl?: string;
  allowedOrigins?: string[];
}
export declare const RESOURCE_URI: string;
export declare function createClearMermaidHandler(options?: ClearMermaidHandlerOptions): (request: Request) => Promise<Response>;
