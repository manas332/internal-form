export const shadowfaxService = {
  async download(start: string, end: string): Promise<Blob> {
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`/api/shadowfax/download?${params.toString()}`);
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  },

  async downloadOuter(start: string, end: string): Promise<Blob> {
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`/api/shadowfax/download-outer?${params.toString()}`);
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  },

  track(awbNumber: string) {
    return fetch(`/api/shadowfax-future-integration/track/${awbNumber}`).then(r => r.json());
  },
};
