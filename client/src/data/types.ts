
export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  status: 'normal' | 'warning' | 'critical';
  avatar: string;
  room?: string;
  condition?: string;
  additionalInfo?: string;
  location?: {
    city?: string;
    state?: string;
    zipCode?: string;
    address: string;
    coordinates: { lat: number; lng: number };
    inHospital: boolean;
  };
  recentVisits?: {
    date: string;
    reason: string;
    doctor: string;
  }[]

  
}

export interface VitalSign {
  timestamp: string;
  value: number;
}

export interface PatientVitals {
  patientId: string;
  temperature: {
    current: number;
    unit: string;
    history: VitalSign[];
    status: 'normal' | 'warning' | 'critical';
    min: number;
    max: number;
  };
  oxygenLevel: {
    current: number;
    unit: string;
    history: VitalSign[];
    status: 'normal' | 'warning' | 'critical';
    min: number;
    max: number;
  };
  pulse: {
    current: number;
    unit: string;
    history: VitalSign[];
    status: 'normal' | 'warning' | 'critical';
    min: number;
    max: number;
  };
  respirationRate: {
    current: number;
    unit: string;
    history: VitalSign[];
    status: 'normal' | 'warning' | 'critical';
    min: number;
    max: number;
  };
  ecg: {
    history: VitalSign[];
    status: 'normal' | 'warning' | 'critical';
  };
}
