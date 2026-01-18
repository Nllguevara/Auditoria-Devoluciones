
export interface ImageFile {
  id: string;
  url: string;
  base64: string;
  type: 'client' | 'return';
}

export interface ClientValidationResult {
  isValid: boolean;
  missingFields: string[];
  detectedData: {
    shippingNumber?: string;
    ean?: string;
    ql?: string;
    brand?: string;
    color?: string;
    size?: string;
    vendorSize?: string;
    description?: string;
  };
}

export interface VerificationReport {
  eanMatch: 'OK' | 'WARNING';
  visualMatch: 'OK' | 'WARNING';
  damageDetected: 'OK' | 'WARNING';
  eanDetails: string;
  visualDetails: string;
  damageDetails: string;
  summary: string;
  clientEan: string;
  returnEan: string;
  shippingNumber: string;
}

export interface DashboardRecord {
  date: string;
  shippingNumber: string;
  ean: string;
  ql: string;
  description: string;
  status: 'OK' | 'Warning';
  link: string;
}

export type Step = 'client-photo' | 'return-photos' | 'verification' | 'report';
