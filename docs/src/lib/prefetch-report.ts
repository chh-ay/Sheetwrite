export interface RendererPrefetchRepetition {
  repetition: number;
  residencyRatio: number;
  p95VisibleWaitMs: number;
  measuredFrames: number;
  residentFrames: number;
  requests: number;
  requestedRows: number;
  rowsServed: number;
  bytesServed: number;
  requestedRowMultiplier: number;
  servedByteMultiplier: number;
  reversalAborts: number;
  jumpAborts: number;
  cacheAllocatedBytes: number;
  cacheChunks: number;
  peakActiveRequests: number;
  jumpVisibleResidentBeforeResponse: boolean;
  jumpVisibleResidentAfterResponse: boolean;
}

export interface RendererPrefetchReport {
  policy: {
    sourceLatencyMs: number;
    frameMs: number;
    viewportRows: number;
    velocityWindowsPerFrame: number;
    requestMultiplierLimit: number;
    activeRequestLimit: number;
    cacheBytes: number;
    devicePixelRatio: number;
  };
  repetitions: RendererPrefetchRepetition[];
  medianResidencyRatio: number;
  medianP95VisibleWaitMs: number;
}
