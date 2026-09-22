export interface ExtractionNotice {
  email: string;
  status: 'ready' | 'failed';
  downloadUrl?: string;
  detail?: string;
}
